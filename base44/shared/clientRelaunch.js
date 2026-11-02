import { courseQuotedPrice, priceSnapshotFilter } from './coursePriceQuote.js';
import { failGuest } from './guestOrderPolicy.js';

const terminal = c => !c || ['annulee', 'livree', 'terminee'].includes(c.statut) || !!c.annulation_user_id;
const scope = value => value == null || value === '' ? null : String(value);
const empty = { $in: [null, ''] };
const operationValid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(id);
export const canEditSearchPrice = c => !terminal(c) && ['nouvelle', 'recherche_livreur'].includes(c.statut)
  && c.dispatch_status === 'disponible_push' && !c.client_decision_attendue
  && !c.livreur_id && !c.accepted_by_livreur_id && !c.eco_mission_id
  && !c.heure_recuperation && !c.pickup_confirmed_at && !c.encours_comptabilise_at
  && !c.delivery_confirmed_at && c.manual_price_status !== 'pending_client_validation'
  && !['pending', 'publishing'].includes(c.client_relaunch_state);
export async function authorizeClientDecision(entities, user, c) {
  if (!user?.id || !user.email) failGuest('AUTH_REQUIRED', 'Connexion requise.', 401);
  // Guests use the separate private action-token route, never an email fallback.
  if (String(c?.request_id || '').startsWith('guest-v1:')) failGuest('FORBIDDEN', 'Acces prive requis.', 403);
  const tenant = scope(user.enterprise_id ?? user.data?.enterprise_id);
  if (tenant !== scope(c.enterprise_id) || (user.country_code && user.country_code !== c.country_code)) failGuest('FORBIDDEN', 'Perimetre non autorise.', 403);
  if (c.client_user_email === user.email || c.created_by_id === user.id || c.created_by === user.email) return;
  for (const id of [c.expediteur_client_id, c.destinataire_client_id].filter(Boolean)) {
    const client = await entities.ClientExterne.get(id);
    if (client?.user_email === user.email && client.country_code === c.country_code && scope(client.enterprise_id) === scope(c.enterprise_id)) return;
  }
  failGuest('FORBIDDEN', 'Cette course ne vous appartient pas.', 403);
}
export function relaunchView(c) {
  return { operation_id: c.client_relaunch_operation_id || null, state: c.client_relaunch_state || null, mode: c.client_relaunch_mode || null,
    price: courseQuotedPrice(c), revision: c.updated_date || null, price_revision: Number(c.client_price_revision || 0) };
}
// One durable operation on the existing course. Publication is recoverable, not
// a claimed cross-entity transaction. Only the publication CAS winner may notify.
export async function relaunchClientCourse({ entities, publish, prepare = async () => ({}), now = () => Date.now() }, c, input) {
  if (!operationValid(input.operation_id)) failGuest('INVALID_OPERATION', 'Identifiant de tentative invalide.');
  const id = c.id, op = input.operation_id;
  const matching = c.client_relaunch_operation_id === op;
  if (matching && input.mode && (input.mode !== c.client_relaunch_mode || (input.mode === 'new_price' && input.new_price !== c.client_relaunch_price))) failGuest('OPERATION_CONFLICT', 'Cette tentative correspond deja a un autre choix.', 409);
  const result = current => ({ success: true, course_id: id, operation_id: op, statut: current.statut, dispatch_status: current.dispatch_status, relaunch: relaunchView(current) });
  if (matching && c.client_relaunch_state === 'confirmed') {
    if (c.client_decision_attendue) failGuest('NEW_DECISION', 'Une nouvelle decision est attendue. Actualisez.', 409);
    return { ...result(c), already_relaunched: true };
  }
  if (terminal(c) || c.livreur_id || c.accepted_by_livreur_id || c.heure_recuperation || c.pickup_confirmed_at || c.encours_comptabilise_at || c.delivery_confirmed_at) failGuest('STATE_CONFLICT', 'Course deja prise en charge ou terminee. Actualisez.', 409);
  if (!matching) {
    const editingSearch = input.search_price_change === true;
    if ((editingSearch ? !canEditSearchPrice(c) || input.mode !== 'new_price' : !c.client_decision_attendue) || ['pending', 'publishing'].includes(c.client_relaunch_state) || c.eco_mission_id || c.manual_price_status === 'pending_client_validation') failGuest('STATE_CONFLICT', 'Cette course ne peut pas etre relancee dans son etat actuel.', 409);
    if (!c.updated_date || input.expected_revision !== c.updated_date) failGuest('STALE_COURSE', 'La course a change. Actualisez avant de confirmer.', 409);
    if (!['same_price', 'new_price'].includes(input.mode)) failGuest('INVALID_ACTION', 'Choix de relance invalide.');
    const oldPrice = courseQuotedPrice(c);
    if (!Number.isFinite(oldPrice) || oldPrice <= 0) failGuest('PRICE_MISSING', 'Prix confirme indisponible.', 409);
    const country = await entities.Country.filter({ code: c.country_code, actif: true }, undefined, 2);
    if (country.length !== 1 || !country[0].devise) failGuest('COUNTRY_CONFIG', 'Configuration du pays indisponible.', 503);
    const eco = c.delivery_mode === 'eco';
    const minimum = eco ? 1 : Number(country[0].prix_minimum);
    if (!eco && (country[0].prix_minimum == null || !Number.isFinite(minimum) || minimum < 0)) failGuest('TARIFF_CONFIG', 'Configuration tarifaire indisponible.', 503);
    const price = input.mode === 'same_price' ? oldPrice : input.new_price;
    if (!Number.isSafeInteger(price) || price <= 0 || price < minimum) failGuest('PRICE_INVALID', 'Le prix ne respecte pas les regles du pays et du service.');
    const changed = price !== oldPrice;
    const serviceFields = await prepare(c, price);
    const stamp = new Date(now()).toISOString();
    const patch = { ...serviceFields, client_relaunch_operation_id: op, client_relaunch_mode: input.mode, client_relaunch_state: 'pending', client_relaunch_lease_until: null, client_relaunch_publish_ready: null,
      client_relaunch_old_price: oldPrice, client_relaunch_price: price, client_relaunch_at: stamp,
      client_decision_attendue: false, client_decision_action: 'chercher_autre_livreur', client_decision_at: stamp,
      statut: 'nouvelle', dispatch_status: 'en_attente', timeout_expires_at: null, dispatch_next_wave_at: null, dispatch_locked_until: null,
      notes: `${c.notes || ''} | [CLIENT RELAUNCH ${op}] ${input.mode} ${oldPrice} -> ${price} ${stamp}`,
      ...(changed ? { prix_propose_client: price, ...(c.source === 'admin' || c.pricing_mode === 'admin_manuel' ? { prix_propose_admin: price } : {}), prix_final: null, manual_price: null, manual_price_status: null, client_price_revision: Number(c.client_price_revision || 0) + 1 } : {}),
    };
    const claim = await entities.CourseExterne.updateMany({ id, updated_date: c.updated_date, statut: c.statut,
      client_decision_attendue: editingSearch ? c.client_decision_attendue ?? null : true, dispatch_status: c.dispatch_status,
      manual_price_status: c.manual_price_status ?? null, livreur_id: empty, accepted_by_livreur_id: empty, annulation_user_id: empty,
      heure_recuperation: empty, pickup_confirmed_at: empty, eco_mission_id: empty, ...priceSnapshotFilter(c) }, { $set: patch });
    c = await entities.CourseExterne.get(id);
    if (Number(claim?.updated) !== 1 && c.client_relaunch_operation_id !== op) failGuest('CONCURRENT_UPDATE', 'Une autre action a modifie la course. Actualisez.', 409);
  } else if (input.mode && (input.mode === 'new_price' ? input.new_price : c.client_relaunch_old_price) !== c.client_relaunch_price) {
    failGuest('OPERATION_CONFLICT', 'Cette tentative correspond deja a un autre prix.', 409);
  }
  const visible = row => !terminal(row) && (row.dispatch_status === 'disponible_push' || !!row.livreur_id || (row.delivery_mode === 'eco' && ['isolated', 'grouped'].includes(row.eco_status) && row.client_relaunch_eco_ready === op));
  async function confirm(row) {
    if (row.client_relaunch_operation_id !== op || terminal(row)) failGuest('STATE_CONFLICT', 'La course a change.', 409);
    await entities.CourseExterne.updateMany({ id, client_relaunch_operation_id: op, client_relaunch_state: { $in: ['pending', 'publishing'] },
      annulation_user_id: empty, statut: { $nin: ['annulee', 'livree', 'terminee'] } }, { $set: { client_relaunch_state: 'confirmed', client_relaunch_lease_until: null } });
    const fresh = await entities.CourseExterne.get(id);
    if (fresh.client_relaunch_state !== 'confirmed' || terminal(fresh)) failGuest('STATE_CONFLICT', 'Confirmation indisponible. Actualisez.', 409);
    return result(fresh);
  }
  if (visible(c)) return confirm(c);
  const pending = () => ({ success: false, pending: true, operation_id: op, code: 'RELAUNCH_PENDING', retry_after: 120, message: 'Demande conservee. Diffusion non confirmee : actualisez le suivi puis reprenez cette tentative.' });
  if (c.client_relaunch_state === 'publishing' && Date.parse(c.client_relaunch_lease_until) > now()) return pending();
  const lease = await entities.CourseExterne.updateMany({ id, updated_date: c.updated_date, client_relaunch_operation_id: op,
    client_relaunch_state: c.client_relaunch_state, annulation_user_id: empty, livreur_id: empty, accepted_by_livreur_id: empty },
    { $set: { client_relaunch_state: 'publishing', client_relaunch_lease_until: new Date(now() + 120000).toISOString() } });
  if (Number(lease?.updated) !== 1) return pending();
  try {
    // Keep refusals/exclusions and historical accepted offers. Only obsolete open
    // proposals are retired, before exposing the new search to an acceptance.
    await entities.DispatchNotification.updateMany({ course_id: id, statut: { $in: ['notifie', 'envoye', 'pending', 'en_attente', 'vu'] } }, { $set: { statut: 'expire' } });
    await entities.EcoProposal.updateMany({ course_id: id, status: 'pending' }, { $set: { status: 'invalidated' } });
    const beforePublish = await entities.CourseExterne.get(id);
    if (terminal(beforePublish) || beforePublish.client_relaunch_operation_id !== op) failGuest('STATE_CONFLICT', 'La course a change.', 409);
    const ready = await entities.CourseExterne.updateMany({ id, updated_date: beforePublish.updated_date, client_relaunch_operation_id: op, client_relaunch_state: 'publishing', annulation_user_id: empty }, { $set: { client_relaunch_publish_ready: op } });
    if (Number(ready?.updated) !== 1) return pending();
    await publish(await entities.CourseExterne.get(id));
  } catch (error) {
    if (error?.guest_public && error.code === 'STATE_CONFLICT') throw error;
    // No automatic resend after an uncertain side effect. The next action reads
    // the persisted publication first and keeps the same operation identifier.
  }
  const fresh = await entities.CourseExterne.get(id);
  return visible(fresh) ? confirm(fresh) : pending();
}
