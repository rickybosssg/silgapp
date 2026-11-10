// INACTIVE MIGRATION PREPARATION: not wired to the UI or deployed.
// Pure authorization/field policy. No relational RLS syntax is assumed.
/** @typedef {Readonly<{user_id:string,scope:'global'|'pays',country_code:string|null,expires_at:string|null,until_revoked?:boolean}>} CommerceAdminScope */
export function deny(code, status = 403) { throw Object.assign(new Error(code), { code, status }); }
export function country(value) { if (!/^[A-Z]{2}$/.test(value || '')) deny('COUNTRY_REQUIRED'); return value; }
/** @param {CommerceAdminScope|null} [trustedScope] */
export function adminFor(user, code, trustedScope=null) {
  if (user?.role !== 'admin' || user.enterprise_id) deny('ADMIN_REQUIRED');
  if (!trustedScope || trustedScope.user_id !== user.id) deny('TRUSTED_ADMIN_SCOPE_REQUIRED');
  const untilRevoked = trustedScope.expires_at === null && trustedScope.until_revoked === true;
  const finiteExpiry = typeof trustedScope.expires_at === 'string'
    && (trustedScope.until_revoked === undefined || trustedScope.until_revoked === false)
    && Number.isFinite(Date.parse(trustedScope.expires_at)) && Date.parse(trustedScope.expires_at) > Date.now();
  if (!untilRevoked && !finiteExpiry) deny('TRUSTED_ADMIN_SCOPE_REQUIRED');
  if (trustedScope.scope === 'global') return;
  if (trustedScope.scope === 'pays' && country(trustedScope.country_code) === country(code)) return;
  deny('ADMIN_COUNTRY_FORBIDDEN');
}
export function ownerProfile(user, profile) {
  if (!user?.id || !user?.email) deny('AUTH_REQUIRED', 401);
  if (!profile?.id) deny('OWNER_COUNTRY_REQUIRED');
  if (profile.user_email !== user.email || profile.actif === false || profile.enterprise_id || user.enterprise_id) deny('OWNER_PROFILE_REQUIRED');
  return country(profile.country_code);
}
/**
 * @param {*} user
 * @param {*} shop
 * @param {*} profile
 * @param {{catalogue?:boolean,adminScope?:CommerceAdminScope|null}} [options]
 */
export function accessShop(user, shop, profile, { catalogue = false, adminScope = null } = {}) {
  if (!shop?.id) deny('ESTABLISHMENT_NOT_FOUND', 404);
  country(shop.pays_code);
  if (user?.role === 'admin') { adminFor(user, shop.pays_code, adminScope); return 'admin'; }
  if (!user?.id || !user?.email || user.enterprise_id || shop.partenaire_id !== user.id) deny('OWNER_COUNTRY_FORBIDDEN');
  if (profile && ownerProfile(user, profile) !== shop.pays_code) deny('OWNER_COUNTRY_FORBIDDEN');
  if (['refuse', 'suspendu'].includes(shop.validation)) deny('ESTABLISHMENT_SUSPENDED');
  return 'owner';
}
const sharedShop = ['nom','logo_url','description','ville','quartier','adresse','latitude','longitude','telephone','telephone_depot','horaires','ouvert'];
const productFields = ['nom','description','photo_url','photos_urls','video_url','prix','categorie','disponible'];
function objectPatch(data, allowed) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) deny('INVALID_PATCH', 400);
  for (const k of Object.keys(data)) if (!allowed.includes(k)) deny('FORBIDDEN_FIELD', 400);
  return { ...data };
}
function url(v) { if (v === '') return; try { const u = new URL(v); if (!['https:','http:'].includes(u.protocol) || u.username || u.password) deny('INVALID_MEDIA_URL', 400); } catch { deny('INVALID_MEDIA_URL', 400); } }
function validate(patch) {
  for (const [key,value] of Object.entries(patch)) {
    if (['ouvert','disponible'].includes(key)) { if (typeof value !== 'boolean') deny('INVALID_BOOLEAN',400); }
    else if (['prix','latitude','longitude','temps_preparation_min'].includes(key)) {
      if (!Number.isFinite(value)) deny('INVALID_NUMBER',400);
      if (key === 'prix' && (value < 0 || value > Number.MAX_SAFE_INTEGER)) deny('INVALID_PRICE',400);
      if (key === 'latitude' && Math.abs(value)>90 || key === 'longitude' && Math.abs(value)>180 || key === 'temps_preparation_min' && value<0) deny('INVALID_NUMBER',400);
    } else if (typeof value !== 'string' || value.length > 20000) deny('INVALID_TEXT',400);
    if (key === 'nom') { if (!value.trim()) deny('NAME_REQUIRED',400); patch.nom=value.trim(); }
    if (['logo_url','photo_url','video_url'].includes(key)) url(value);
    if (key === 'photos_urls' && value) {
      let list; try { list=JSON.parse(value); } catch { deny('INVALID_PHOTOS',400); }
      if (!Array.isArray(list) || list.some(v=>typeof v!=='string')) deny('INVALID_PHOTOS',400);
      list.forEach(url);
    }
  }
  return patch;
}
export function shopPatch(type, data, creating=false) {
  const patch=validate(objectPatch(data,[...sharedShop,...(type==='restaurant'?['specialite','temps_preparation_min']:['categorie'])]));
  if(creating && !patch.nom) deny('NAME_REQUIRED',400);
  return patch;
}
export function productPatch(data, creating=false) {
  const patch=validate(objectPatch(data,productFields));
  if(creating && (!patch.nom || !Object.hasOwn(patch,'prix'))) deny('PRODUCT_FIELDS_REQUIRED',400);
  return patch;
}
export function creationFields(type,user,profile,data) {
  if(!user?.id||!user?.email||user.enterprise_id) deny('OWNER_REQUIRED');
  if(!data||typeof data!=='object'||Array.isArray(data)) deny('INVALID_PATCH',400);
  const code=type==='boutique'?country(data.pays_code):ownerProfile(user,profile);
  const editable=type==='boutique'?Object.fromEntries(Object.entries(data).filter(([key])=>key!=='pays_code')):data;
  if(user.role==='admin') deny('ADMIN_OWNER_CREATION_NOT_SUPPORTED',400);
  return {...shopPatch(type,editable,true),pays_code:code,partenaire_id:user.id,user_email:user.email,ouvert:data.ouvert??true,
    actif:type==='boutique',validation:type==='boutique'?'valide':'en_attente',statut_validation:type==='boutique'?'valide':'en_attente',
    commission_pct:null,...(type==='boutique'?{creation_directe:true,creation_admin_notifiee:false}:{})};
}
/** @param {CommerceAdminScope|null} [adminScope] */
export function commissionPatch(user,shop,data,adminScope=null) {
  adminFor(user,shop.pays_code,adminScope);const p=objectPatch(data,['commission_pct']);
  if(!Object.hasOwn(p,'commission_pct') || p.commission_pct!==null && (!Number.isFinite(p.commission_pct)||p.commission_pct<0||p.commission_pct>100)) deny('INVALID_COMMISSION',400);
  return p;
}
/** @param {CommerceAdminScope|null} [adminScope] */
export function moderationPatch(user,shop,data,now,product=false,adminScope=null) {
  adminFor(user,shop.pays_code,adminScope);const p=objectPatch(data,['action','motif']);
  const map={valider:'valide',refuser:'refuse',suspendre:'suspendu',reactiver:'valide'};
  if(!Object.hasOwn(map,p.action) || product && p.action==='suspendre') deny('INVALID_MODERATION',400);
  if(p.motif!==undefined && (typeof p.motif!=='string'||p.motif.length>20000)) deny('INVALID_TEXT',400);
  const validation=map[p.action];
  return {validation,actif:validation==='valide',motif_refus:validation==='valide'?'':p.motif||'',valide_par:user.email,valide_at:now,...(!product?{statut_validation:validation==='suspendu'?'refuse':validation}:{})};
}

/** @param {CommerceAdminScope|null} [adminScope] */
export function countryChangeRequest(user,shop,type,data,adminScope=null) {
  if(type!=='boutique') deny('COUNTRY_CHANGE_NOT_SUPPORTED',400);
  adminFor(user,shop.pays_code,adminScope);
  const p=objectPatch(data,['pays_code']);const next=country(p.pays_code);
  adminFor(user,next,adminScope);
  return next;
}
