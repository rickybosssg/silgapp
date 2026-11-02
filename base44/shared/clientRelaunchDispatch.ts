import { publierCourseDansFil } from './dispatchV2.ts';
import { processEcoCourseCreated, prepareEcoCreationFields, loadEcoConfig } from './ecoOptimizationEngine.ts';
import { failGuest } from './guestOrderPolicy.js';

export function relaunchDependencies(api: any) {
  const entities = api.asServiceRole.entities;
  return { entities, prepare: async (course: any, price: number) => {
    if (course.delivery_mode !== 'eco') return {};
    const config = await loadEcoConfig(api, course.country_code);
    if (!config.enabled || !config.groupingEnabled || course.enterprise_id) failGuest('SERVICE_UNAVAILABLE', 'Le service Eco est momentanement indisponible dans ce perimetre.', 409);
    const fields = await prepareEcoCreationFields(api, { ...course, prix_propose_client: price });
    if (fields.delivery_mode !== 'eco') failGuest('SERVICE_UNAVAILABLE', 'Service Eco indisponible.', 409);
    return { eco_status: fields.eco_status, eco_convert_after_at: fields.eco_convert_after_at };
  }, publish: async (course: any) => {
    const flags = await entities.AppConfig.filter({ cle: 'DISPATCH_V2_ENABLED' }, undefined, 2);
    if (flags.length !== 1 || flags[0].valeur !== 'true') failGuest('DISPATCH_UNAVAILABLE', 'Dispatch V2 indisponible.', 503);
    if (course.delivery_mode !== 'eco') return publierCourseDansFil(api, course);
    const before = await entities.CourseExterne.get(course.id);
    let grouped = false;
    if (before.eco_status === 'grouped' && before.eco_mission_id) {
      const mission = await entities.EcoMission.get(before.eco_mission_id);
      grouped = mission?.status === 'available' && !mission.livreur_id && mission.country_code === before.country_code &&
        !mission.enterprise_id && Array.isArray(mission.course_ids) && mission.course_ids.includes(before.id);
      if (!grouped) failGuest('STATE_CONFLICT', 'Mission Eco modifiee. Actualisez.', 409);
    }
    const outcome = grouped ? { success: true, handled: true } : await processEcoCourseCreated(api, course.id);
    const fresh = await entities.CourseExterne.get(course.id);
    if (outcome?.success === true && outcome?.handled === true && !fresh.livreur_id && !fresh.annulation_user_id && ['isolated', 'grouped'].includes(fresh.eco_status)) {
      await entities.CourseExterne.updateMany({ id: course.id, updated_date: fresh.updated_date, client_relaunch_operation_id: course.client_relaunch_operation_id,
        statut: { $nin: ['annulee', 'livree', 'terminee'] }, annulation_user_id: { $in: [null, ''] } },
        { $set: { client_relaunch_eco_ready: course.client_relaunch_operation_id, statut: 'recherche_livreur' } });
    }
    return outcome;
  } };
}
