// Presentation only: CourseExterne owns delivery mode and money.
const TERMINAL = new Set(['livree', 'annulee', 'completed', 'delivered', 'canceled']);
const enterprise = value => value == null || value === '' ? null : String(value).trim();
export const isEcoDeliveryCourse = course => String(course?.delivery_mode || '').toLowerCase() === 'eco';
const modifiedAt = record => Date.parse(record?.updated_date || record?.created_date || '') || 0;
function currentRecord(visible, member) {
  if (!visible) return member;
  if (!member) return visible;
  const a = modifiedAt(visible), b = modifiedAt(member);
  if (a !== b) return a > b ? visible : member;
  // Keep an explicit Standard observation when conflicting versions are unknown.
  if (isEcoDeliveryCourse(visible) !== isEcoDeliveryCourse(member)) return isEcoDeliveryCourse(visible) ? member : visible;
  return member;
}
export function selectAvailableCourseOffers({ courses = [], missions = [], countryCode,
  enterpriseId = null, refusedIds = [] }) {
  const blocked = new Set(refusedIds);
  const byId = new Map();
  for (const course of courses) if (course?.id && course.country_code === countryCode &&
      enterprise(course.enterprise_id) === enterprise(enterpriseId) && !blocked.has(course.id)) {
    byId.set(course.id, currentRecord(byId.get(course.id), course));
  }
  const missionById = new Map();
  for (const mission of missions) if (mission?.id) {
    const previous = missionById.get(mission.id);
    if (!previous || modifiedAt(mission) > modifiedAt(previous)) missionById.set(mission.id, mission);
  }
  // Reconcile versions of already visible ids, including a recent conversion or
  // assignment. A mission snapshot never injects a new independent course.
  for (const mission of missionById.values()) {
    if (mission.status !== 'available' || mission.country_code !== countryCode ||
        enterprise(mission.enterprise_id) !== null || enterprise(enterpriseId) !== null) continue;
    for (const member of mission.__available_courses || []) {
      if (!byId.has(member.id)) continue;
      const course = currentRecord(byId.get(member.id), member);
      if (course.country_code !== countryCode || enterprise(course.enterprise_id) !== enterprise(enterpriseId) ||
          TERMINAL.has(course.statut) || course.livreur_id || course.accepted_by_livreur_id ||
          (!isEcoDeliveryCourse(course) && (course.statut !== 'recherche_livreur' ||
            !['disponible_push', 'propose'].includes(course.dispatch_status)))) byId.delete(member.id);
      else byId.set(member.id, course);
    }
  }
  const used = new Set(), availableMissions = [];
  if (enterprise(enterpriseId) === null) for (const mission of missionById.values()) {
    if (mission.status !== 'available' || mission.livreur_id || mission.country_code !== countryCode ||
        enterprise(mission.enterprise_id) !== null || !Array.isArray(mission.course_ids)) continue;
    const ids = mission.course_ids;
    if (ids.length < 2 || new Set(ids).size !== ids.length || ids.some(id => !id || used.has(id) || blocked.has(id))) continue;
    const linked = new Map((mission.__available_courses || []).map(course => [course.id, course]));
    const members = ids.map(id => currentRecord(byId.get(id), linked.get(id)));
    if (!members.every(course => course && isEcoDeliveryCourse(course) &&
        course.country_code === countryCode && enterprise(course.enterprise_id) === null &&
        course.eco_mission_id === mission.id && course.eco_status === 'grouped' &&
        course.dispatch_status === 'en_attente' && !TERMINAL.has(course.statut) &&
        !course.livreur_id && !course.accepted_by_livreur_id)) continue;
    ids.forEach(id => used.add(id));
    availableMissions.push({ ...mission, __available_courses: members });
  }
  const individualCourses = [...byId.values()].filter(course => !used.has(course.id));
  const offers = [
    ...individualCourses.map(course => ({ id: 'course:' + course.id, kind: 'course', courses: [course] })),
    ...availableMissions.map(mission => ({ id: 'mission:' + mission.id, kind: 'eco_mission', courses: mission.__available_courses })),
  ];
  return { individualCourses, missions: availableMissions, offers, count: offers.length };
}
