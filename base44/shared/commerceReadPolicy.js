import { adminFor } from './commerceAccess.js';
// INACTIVE migration preparation. No UI wiring, deployment or entity rule change.
// Existing client screens require a ClientExterne profile: no anonymous catalogue.
const kinds = Object.freeze({
  boutique: ['Boutique', 'ProduitBoutique', 'CommandeBoutique', 'boutique_id'],
  restaurant: ['Restaurant', 'PlatRestaurant', 'CommandeRestaurant', 'restaurant_id'],
});
function fail(code, status = 403) { throw Object.assign(new Error(code), { code, status }); }
function id(value) { if (typeof value !== 'string' || !value.trim() || value.length > 200) fail('INVALID_ID', 400); return value; }
function country(value) { if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) fail('COUNTRY_REQUIRED'); return value; }
function pick(row, keys) {
  const out = {};
  for (const key of keys) if (Object.hasOwn(row, key) && ['string','number','boolean'].includes(typeof row[key])) out[key] = row[key];
  return out;
}
const shopKeys = ['id','nom','logo_url','description','categorie','specialite','pays_code','ville','quartier','adresse','latitude','longitude','telephone','telephone_depot','horaires','ouvert','actif','temps_preparation_min'];
const productKeys = ['id','boutique_id','restaurant_id','nom','description','photo_url','photos_urls','video_url','prix','devise','categorie','disponible','actif'];
const orderKeys = ['id','boutique_id','restaurant_id','boutique_nom','restaurant_nom','pays_code','total','statut','course_id','created_date','adresse_livraison','quartier_livraison','gps_lat','gps_lng','note_client','motif_annulation','preparation_time_minutes','estimated_ready_at'];
const itemKeys = ['id','nom','prix','quantite','photo_url'];
function orderView(row, audience) {
  const out = pick(row, orderKeys);
  out.has_private_payment_proof = typeof row.commerce_payment_proof_id === 'string' && !!row.commerce_payment_proof_id.trim();
  out.has_payment_proof = out.has_private_payment_proof || (typeof row.preuve_paiement_url === 'string' && !!row.preuve_paiement_url.trim());
  // Do not relay arbitrary serialized object fields through the allowlist.
  let items;
  try { items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items; } catch { fail('INVALID_STORED_ITEMS', 503); }
  if (!Array.isArray(items) || items.length > 200 || items.some(x => !x || typeof x !== 'object' || Array.isArray(x))) fail('INVALID_STORED_ITEMS', 503);
  out.items = JSON.stringify(items.map(x => pick(x, itemKeys)));
  if (audience !== 'client') Object.assign(out, pick(row, ['client_nom','client_telephone']));
  return out;
}
function rows(value) { if (!Array.isArray(value)) fail('INVALID_READ_RESPONSE', 503); return value; }
function adminCountry(user, requested, trustedScope) {
  const code = country(requested);
  adminFor(user, code, trustedScope);
  return code;
}
const moderationKeys = ['validation','statut_validation','motif_refus','created_date','updated_date','nb_visites','derniere_visite_at'];
const adminShopKeys = ['partenaire_id','user_email','valide_par','valide_at','creation_directe','creation_admin_notifiee'];
function matches(row, filter) { return row && Object.entries(filter).every(([key,value]) => row[key] === value); }
function page(found, limit, offset, project) {
  const hasMore = found.length > limit;
  return { rows: found.slice(0,limit).map(project), has_more: hasMore, next_offset: hasMore ? offset + limit : null };
}
async function clientProfile(api, user, profileId) {
  // This must remain the caller's normal RLS SDK, never asServiceRole.
  const profile = await api.entities.ClientExterne.get(id(profileId));
  if (!profile?.id || profile.id !== profileId || profile.user_email !== user.email || profile.enterprise_id || user.enterprise_id || profile.actif === false) fail('OWNER_PROFILE_REQUIRED');
  return { profile, code: country(profile.country_code) };
}
/** @param {import('./commerceAccess.js').CommerceAdminScope|null} [trustedScope] */
export async function readCommerce(api, user, body, trustedScope = null) {
  if (!user?.id || !user?.email) fail('AUTH_REQUIRED', 401);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_REQUEST', 400);
  const allowed = ['type','action','audience','profile_id','parent_id','country_code','limit','offset','validation','creation_directe','creation_admin_notifiee','order_id'];
  if (Object.keys(body).some(k => !allowed.includes(k))) fail('INVALID_REQUEST', 400);
  if (!Object.hasOwn(kinds, body.type)) fail('INVALID_TYPE', 400);
  const [parentName, productName, orderName, parentKey] = kinds[body.type];
  const action = body.action;
  const audience = body.audience || 'client';
  if (!['catalogue','products','orders','order','finance_establishment','finance_orders','payments'].includes(action) || !['client','partner','admin'].includes(audience)) fail('INVALID_REQUEST', 400);
  if (Object.hasOwn(body,'order_id') && action !== 'order') fail('INVALID_REQUEST',400);
  if (action === 'order') { id(body.order_id); id(body.parent_id); if ((body.offset ?? 0) !== 0) fail('INVALID_PAGINATION',400); }
  const financial = ['finance_establishment','finance_orders','payments'].includes(action);
  if (financial && audience === 'client') fail('FINANCE_FORBIDDEN');
  if (financial) id(body.parent_id);
  const limit = body.limit ?? (action === 'products' ? 200 : 100);
  const offset = body.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) fail('INVALID_PAGINATION', 400);
  const moderationFilter = {};
  for (const key of ['validation','creation_directe','creation_admin_notifiee']) {
    if (!Object.hasOwn(body,key)) continue;
    if (audience !== 'admin' || action !== 'catalogue') fail('INVALID_REQUEST',400);
    if (key === 'validation' ? !['en_attente','valide','refuse','suspendu'].includes(body[key]) : typeof body[key] !== 'boolean') fail('INVALID_REQUEST',400);
    moderationFilter[key] = body[key];
  }
  const entities = api.asServiceRole.entities;
  let code, profile, parent;
  if (audience === 'client') ({ profile, code } = await clientProfile(api, user, body.profile_id));
  else if (audience === 'admin') code = adminCountry(user, body.country_code, trustedScope);
  else {
    if (user.enterprise_id) fail('PARTNER_FORBIDDEN');
    if (action === 'catalogue' && !body.parent_id) code = body.country_code ? country(body.country_code) : null;
    else {
      parent = await entities[parentName].get(id(body.parent_id));
      if (!parent?.id || parent.id !== body.parent_id || parent.partenaire_id !== user.id) fail('PARTNER_FORBIDDEN');
      code = country(parent.pays_code);
    }
  }
  if (body.country_code && body.country_code !== code) fail('COUNTRY_MISMATCH');
  if (action === 'catalogue') {
    const filter = { ...moderationFilter };
    if (code) filter.pays_code = code;
    if (audience === 'client') filter.actif = true;
    if (audience === 'partner') filter.partenaire_id = user.id;
    if (body.parent_id) filter.id = id(body.parent_id);
    const found = rows(await entities[parentName].filter(filter, '-created_date', limit + 1, offset));
    if (found.some(r => !matches(r,filter))) fail('SCOPE_MISMATCH', 503);
    found.forEach(r => country(r.pays_code));
    const keys = [...shopKeys, ...(audience !== 'client' ? moderationKeys : []), ...(audience === 'admin' ? adminShopKeys : [])];
    return page(found, limit, offset, r => pick(r, keys));
  }
  if (action === 'products') {
    parent = parent || await entities[parentName].get(id(body.parent_id));
    if (!parent?.id || parent.id !== body.parent_id || parent.pays_code !== code || (audience === 'client' && parent.actif !== true)) fail('CATALOGUE_FORBIDDEN');
    const filter = { [parentKey]: parent.id };
    if (audience === 'client') Object.assign(filter,{ disponible: true, actif: true });
    const found = rows(await entities[productName].filter(filter, '-created_date', limit + 1, offset));
    if (found.some(r => !matches(r,filter))) fail('SCOPE_MISMATCH', 503);
    const keys = [...productKeys, ...(audience !== 'client' ? moderationKeys : []), ...(audience === 'admin' ? ['valide_par','valide_at'] : [])];
    return page(found, limit, offset, r => pick(r, keys));
  }
  if (financial) {
    // Exact parent authorization remains mandatory even for country admins.
    parent = parent || await entities[parentName].get(id(body.parent_id));
    if (!parent?.id || parent.id !== body.parent_id || parent.pays_code !== code) fail('FINANCE_FORBIDDEN');
    if (action === 'finance_establishment') {
      if (offset !== 0) fail('INVALID_PAGINATION',400);
      const view = pick(parent,['id','nom','pays_code','commission_pct','montant_du_silga','nb_visites','derniere_visite_at','updated_date']);
      // Missing/null stored accounting stays missing/null, never fabricated as zero.
      for (const key of ['commission_pct','montant_du_silga']) if (Object.hasOwn(parent,key) && parent[key] === null) view[key] = null;
      return { rows:[view], has_more:false, next_offset:null };
    }
    if (action === 'payments') {
      id(parent.partenaire_id);
      const filter = { etablissement_id:parent.id, partenaire_id:parent.partenaire_id, type:body.type, pays_code:code };
      const found = rows(await entities.PaiementPartenaire.filter(filter,'-created_date',limit+1,offset));
      if (found.some(r=>!matches(r,filter))) fail('SCOPE_MISMATCH',503);
      return page(found,limit,offset,r=>{
        const view=pick(r,['id','etablissement_id','type','pays_code','montant','statut','created_date','traite_at','motif_refus']);
        view.has_payment_proof=typeof r.preuve_url==='string' && !!r.preuve_url.trim();
        return view;
      });
    }
    const filter = { [parentKey]:parent.id, pays_code:code };
    const found = rows(await entities[orderName].filter(filter,'-created_date',limit+1,offset));
    if (found.some(r=>!matches(r,filter))) fail('SCOPE_MISMATCH',503);
    return page(found,limit,offset,r=>{
      const view=pick(r,['id',parentKey,'pays_code','created_date','statut','total','commission_pct','commission_montant']);
      for (const key of ['total','commission_pct','commission_montant']) if (Object.hasOwn(r,key) && r[key] === null) view[key]=null;
      return view;
    });
  }
  if (action === 'order') {
    parent = parent || await entities[parentName].get(id(body.parent_id));
    if (!parent?.id || parent.id !== body.parent_id || parent.pays_code !== code) fail('ORDER_NOT_FOUND',404);
    const order = await entities[orderName].get(id(body.order_id));
    if (!order?.id || order.id !== body.order_id || order[parentKey] !== parent.id || order.pays_code !== code
      || (audience === 'client' && order.client_id !== profile.id)) fail('ORDER_NOT_FOUND',404);
    const view = orderView(order,audience);
    view.delivery_verification = order.course_id ? 'unavailable' : 'not_linked';
    // Never expose delivery tokens, PINs, arbitrary URLs or driver/customer records.
    if (typeof order.course_id === 'string' && order.course_id) {
      try {
        const course = await entities.CourseExterne.get(id(order.course_id));
        const link = body.type === 'boutique' ? 'commande_boutique_id' : 'commande_restaurant_id';
        if (course?.id === order.course_id && course[link] === order.id && course.country_code === code
          && order.client_id && course.destinataire_client_id === order.client_id) {
          if (typeof course.statut === 'string') view.course_status = course.statut;
          if (typeof course.dispatch_status === 'string') view.dispatch_status = course.dispatch_status;
          view.delivery_verification = 'verified';
        }
      } catch { /* An unavailable link is not evidence that no delivery exists. */ }
    }
    return {rows:[view],has_more:false,next_offset:null};
  }
  const filter = { pays_code: code };
  if (audience === 'client') filter.client_id = profile.id; // NOT user.id.
  if (audience === 'partner') filter[parentKey] = parent.id; // Never trust order.partenaire_id.
  if (body.parent_id) filter[parentKey] = id(body.parent_id);
  const found = rows(await entities[orderName].filter(filter, '-created_date', limit + 1, offset));
  if (found.some(r => !r || Object.entries(filter).some(([key,value]) => r[key] !== value))) fail('SCOPE_MISMATCH', 503);
  return page(found, limit, offset, r => orderView(r, audience));
}






