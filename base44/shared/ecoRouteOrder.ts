// Geographic pre-ranking only; this does not claim to measure road distance.
export function bestTwoCourseOrder(courses: any[], distance: (...args: number[]) => number | null) {
  if (courses.length !== 2) return null;
  const [a, b] = courses;
  const point = (course: any, type: string) => ({
    type, course_id: course.id, status: 'pending',
    lat: type === 'pickup' ? course.gps_depart_lat : course.gps_arrivee_lat,
    lng: type === 'pickup' ? course.gps_depart_lng : course.gps_arrivee_lng,
  });
  const steps = [point(a, 'pickup'), point(a, 'delivery'), point(b, 'pickup'), point(b, 'delivery')];
  const orders = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 2, 3, 1], [2, 3, 0, 1], [2, 0, 3, 1], [2, 0, 1, 3]];
  let best = null;
  let bestKm = Infinity;
  for (const order of orders) {
    let km = 0;
    for (let i = 1; i < order.length; i++) {
      const previous = steps[order[i - 1]];
      const next = steps[order[i]];
      if ([previous.lat, previous.lng, next.lat, next.lng].some(value => value == null || !Number.isFinite(Number(value)))) {
        km = Infinity;
        break;
      }
      const leg = distance(previous.lat, previous.lng, next.lat, next.lng);
      if (leg == null || !Number.isFinite(leg) || leg < 0) { km = Infinity; break; }
      km += leg;
    }
    if (km < bestKm) {
      bestKm = km;
      best = order.map((index, i) => ({ ...steps[index], order: i + 1 }));
    }
  }
  return best;
}
