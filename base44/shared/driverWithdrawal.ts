import { isTerminalCourse } from './courseTerminalGuard.ts';
import { normalizeEnterpriseId } from './enterpriseFinance.ts';
import { DRIVER_ACTIVE_STATUSES, DRIVER_PRE_PICKUP_STATUSES, DRIVER_WITHDRAWAL_REASONS, driverHasCustody } from './driverWithdrawalPolicy.js';

const version = (row: any) => row.updated_date ? {updated_date: row.updated_date} : {};
const cas = async (entity: any, filter: any, patch: any) => Number((await entity.updateMany(filter, {$set: patch}))?.updated) === 1;
const sameScope = (a: any, b: any) => !!a?.country_code && a.country_code === b?.country_code && normalizeEnterpriseId(a.enterprise_id) === normalizeEnterpriseId(b.enterprise_id);
const price = (c: any) => Number(c.prix_final || c.prix_propose_client || c.prix_propose_admin || c.prix_estimate || 0) || 0;
const failure = (code: string, error: string, httpStatus = 409) => ({success:false, code, error, httpStatus});

async function reconcileMission(api: any, course: any, driver: any) {
  const entities = api.asServiceRole.entities;
  const missionId = course.livreur_retrait_mission_id;
  if (!missionId) return;
  let settled: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const mission = await entities.EcoMission.get(missionId);
    if (!mission || mission.livreur_id !== driver.id || !sameScope(mission, course)) throw Error('MISSION_SCOPE');
    const ids = Array.isArray(mission.course_ids) ? mission.course_ids : [];
    const rows = await Promise.all(ids.map((id: string) => entities.CourseExterne.get(id)));
    if (rows.some((row: any) => !row || !sameScope(row, course))) throw Error('MISSION_SCOPE');
    if (rows.some((row: any) => row.id !== course.id && !isTerminalCourse(row) && row.livreur_id && row.livreur_id !== driver.id)) throw Error('MISSION_OWNER');
    const active = rows.filter((row: any) => row.id !== course.id && row.livreur_id === driver.id && !isTerminalCourse(row) && !row.client_decision_attendue && DRIVER_ACTIVE_STATUSES.includes(row.statut));
    if (['completed','cancelled','invalidated'].includes(mission.status)) { settled = {mission, active}; break; }
    let route: any[];
    let audit: any[];
    try { route = JSON.parse(mission.route_plan_json || '[]'); audit = JSON.parse(mission.withdrawal_audit_json || '[]'); } catch { throw Error('MISSION_ROUTE'); }
    if (!Array.isArray(route) || !Array.isArray(audit)) throw Error('MISSION_ROUTE');
    const remaining = route.filter(step => active.some((row: any) => row.id === step.course_id)).map((step, index) => {
      const row = active.find((c: any) => c.id === step.course_id);
      return {...step, order:index+1, status:step.status === 'completed' || step.type === 'pickup' && driverHasCustody(row) ? 'completed' : step.status};
    });
    if (!audit.some(item => item.operation_id === course.livreur_retrait_operation_id)) audit.push({operation_id:course.livreur_retrait_operation_id,course_id:course.id,at:course.livreur_retrait_at,course_ids:ids,route_plan_json:mission.route_plan_json,total_price:mission.total_price});
    const pending = remaining.findIndex(step => !['completed','cancelled'].includes(step.status));
    const status = active.length > 1 ? mission.status : active.length === 1 ? 'invalidated' : 'cancelled';
    const patch = {course_ids:active.map((row: any) => row.id),route_plan_json:JSON.stringify(remaining),active_step_index:pending < 0 ? remaining.length : pending,total_price:active.reduce((sum: number, row: any) => sum+price(row),0),status,withdrawal_audit_json:JSON.stringify(audit)};
    if (await cas(entities.EcoMission,{id:mission.id,status:mission.status,...version(mission)},patch)) { settled = {mission:{...mission,...patch}, active}; break; }
  }
  if (!settled) throw Error('MISSION_CONCURRENT');
  if (settled.mission.status === 'invalidated') {
    for (const row of settled.active) {
      if (row.eco_mission_id !== missionId) continue;
      if (!await cas(entities.CourseExterne,{id:row.id,livreur_id:driver.id,eco_mission_id:missionId,statut:row.statut,annulation_user_id:{$in:[null,'']},...version(row)},{eco_mission_id:null})) throw Error('MISSION_LINK_CONCURRENT');
    }
  }
  const fresh = await entities.CourseExterne.get(course.id);
  if (!isTerminalCourse(fresh) && fresh.eco_mission_id === missionId && fresh.livreur_retrait_operation_id === course.livreur_retrait_operation_id) {
    if (!await cas(entities.CourseExterne,{id:fresh.id,statut:fresh.statut,eco_mission_id:missionId,...version(fresh)},{eco_mission_id:null})) throw Error('MISSION_LINK_CONCURRENT');
  }
}

export async function synchronizeDriverCourseStatus(api: any, driverId: string) {
  const entities = api.asServiceRole.entities;
  const active = () => entities.CourseExterne.filter({livreur_id:driverId,statut:{$in:DRIVER_ACTIVE_STATUSES}},'-created_date',1);
  const driver = await entities.Livreur.get(driverId);
  const others = await active();
  const target = others.length ? 'en_course' : driver.manual_hors_ligne || driver.admin_hors_ligne || driver.bloque_encours ? 'hors_ligne' : 'disponible';
  if (driver.statut !== target && !await cas(entities.Livreur,{id:driverId,statut:driver.statut,...version(driver)},{statut:target})) return {pending:true};
  // Cross-entity compensation, not a claimed transaction with course assignment.
  const recheck = await active();
  if (recheck.length) {
    const fresh = await entities.Livreur.get(driverId);
    if (fresh.statut !== 'en_course' && !await cas(entities.Livreur,{id:driverId,statut:fresh.statut,...version(fresh)},{statut:'en_course'})) return {pending:true};
    return {statut:'en_course'};
  }
  return {statut:target};
}

export async function withdrawDriverCourse(api: any, user: any, courseId: string, input: any) {
  if (!user?.id || !user.email) return failure('AUTH_REQUIRED','Authentification requise',401);
  if (!Object.hasOwn(DRIVER_WITHDRAWAL_REASONS,input.motif) || input.motif === 'autre' && !String(input.motif_detail || '').trim()) return failure('MOTIF_REQUIRED','Choisissez un motif et précisez Autre.',400);
  const entities = api.asServiceRole.entities;
  const before = await entities.CourseExterne.get(courseId);
  if (!before || isTerminalCourse(before)) return failure('COURSE_TERMINAL','Course terminée ou annulée : aucun retrait possible.');
  const repeat = !before.livreur_id && before.client_decision_attendue === true && before.livreur_retrait_user_id === user.id;
  const driverId = repeat ? before.livreur_retrait_livreur_id : before.livreur_id;
  const driver = driverId ? await api.entities.Livreur.get(driverId) : null;
  const userEnterprise = normalizeEnterpriseId(user.enterprise_id ?? user.data?.enterprise_id);
  if (!driver || driver.user_email !== user.email || !sameScope(driver,before) || userEnterprise && userEnterprise !== normalizeEnterpriseId(before.enterprise_id)) return failure('FORBIDDEN','Cette course ne vous est pas affectée dans ce périmètre.',403);
  if (!repeat) {
    if (input.expected_livreur_id !== undefined && input.expected_livreur_id !== driverId || input.expected_acceptance_at !== undefined && input.expected_acceptance_at !== (before.heure_acceptation || before.accepted_at || '')) return failure('ASSIGNMENT_CHANGED','Cette prise en charge a changé. Fermez puis actualisez la course.');
    if (driverHasCustody(before) || !DRIVER_PRE_PICKUP_STATUSES.includes(before.statut)) return failure('CUSTODY_INCIDENT_REQUIRED','Colis ou passager déjà pris en charge : contactez un administrateur. La course reste sous votre responsabilité.');
    const parcels = await entities.ColisExterne.filter({course_id:courseId});
    if (parcels.some((parcel: any) => parcel.heure_recuperation || ['recupere','en_livraison','livre'].includes(parcel.statut))) return failure('CUSTODY_INCIDENT_REQUIRED','Un colis est déjà récupéré. Un administrateur doit traiter cet incident.');
    // Legacy multi-parcel clients write children before the parent pickup CAS.
    // Refuse release until those writers participate in a shared custody guard.
    if (before.is_multi_colis === true || parcels.length > 1) return failure('MULTIPARCEL_REVIEW_REQUIRED','Le retrait de cette course multi-colis nécessite un administrateur. Elle reste affectée ; vos autres courses ne changent pas.');
    let refused: string[];
    try { refused = JSON.parse(before.dispatch_refused_ids || '[]'); } catch { return failure('COURSE_STATE_INVALID','Actualisez la course avant de réessayer.'); }
    if (!Array.isArray(refused)) return failure('COURSE_STATE_INVALID','Actualisez la course avant de réessayer.');
    const operation = /^[a-zA-Z0-9_-]{16,100}$/.test(input.request_id || '') ? input.request_id : crypto.randomUUID();
    const patch = {statut:'en_attente',dispatch_status:'en_attente',client_decision_attendue:true,client_decision_action:null,client_decision_at:null,
      livreur_annulation_motif:input.motif === 'autre' ? String(input.motif_detail).trim() : DRIVER_WITHDRAWAL_REASONS[input.motif],
      livreur_id:null,livreur_nom:'',livreur_telephone:'',livreur_photo_url:null,livreur_vehicule:null,livreur_user_email:null,livreur_note_moyenne:0,livreur_nombre_avis:0,
      accepted_by_livreur_id:null,accepted_at:null,heure_acceptation:null,dispatch_wave:0,dispatch_notified_ids:'[]',dispatch_refused_ids:JSON.stringify([...new Set([...refused,driverId])]),timeout_expires_at:null,heure_sollicitation:null,dispatch_next_wave_at:null,dispatch_locked_until:null,
      livreur_retrait_user_id:user.id,livreur_retrait_livreur_id:driverId,livreur_retrait_operation_id:operation,livreur_retrait_at:new Date().toISOString(),livreur_retrait_mission_id:before.eco_mission_id || null,
      notes:`${before.notes || ''} | [RETRAIT LIVREUR - ATTENTE DECISION CLIENT] ${input.motif}`};
    if (!await cas(entities.CourseExterne,{id:courseId,statut:before.statut,livreur_id:driverId,annulation_user_id:{$in:[null,'']},heure_acceptation:before.heure_acceptation || {$in:[null,'']},accepted_at:before.accepted_at || {$in:[null,'']},heure_recuperation:before.heure_recuperation || {$in:[null,'']},pickup_confirmed_at:before.pickup_confirmed_at || {$in:[null,'']},...version(before)},patch)) return failure('COURSE_CONCURRENT','Course modifiée simultanément. Actualisez avant de réessayer.');
  }
  const current = await entities.CourseExterne.get(courseId);
  if (isTerminalCourse(current) || current.livreur_id || !current.client_decision_attendue) return failure('COURSE_CONCURRENT','Le statut a changé. Actualisez la course.');
  try { await reconcileMission(api,current,driver); } catch {
    return {...failure('MISSION_SYNC_PENDING','Retrait enregistré. Synchronisation de mission à terminer : réessayez le même retrait.'),withdrawal_committed:true};
  }
  let status: any;
  try { status = await synchronizeDriverCourseStatus(api,driverId); } catch { status = {pending:true}; }
  const finalCourse = await entities.CourseExterne.get(courseId);
  if (isTerminalCourse(finalCourse) || finalCourse.livreur_id || !finalCourse.client_decision_attendue) return failure('COURSE_CONCURRENT','Le statut a changé. Actualisez la course.');
  return {success:true,withdrawn:true,already_withdrawn:repeat,client_decision_attendue:true,course_id:courseId,statut:'en_attente',course_redispatch:false,withdrawn_at:finalCourse.livreur_retrait_at,operation_id:finalCourse.livreur_retrait_operation_id,livreur_libere:status.statut !== 'en_course' && !status.pending,livreur_statut:status.statut || null,status_sync_pending:!!status.pending,before};
}
