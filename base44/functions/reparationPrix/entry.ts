import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * RÉPARATION FINALE DES PRIX
 * Recalcule TOUS les prix estimés basés sur GPS
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const courses = await base44.entities.CourseExterne.list();
    let repaired = 0;

    for (const course of courses) {
      try {
        // Si pas de prix_estimate ou = 0, recalculer depuis GPS
        if (!course.prix_estimate || course.prix_estimate === 0) {
          if (course.gps_depart_lat && course.gps_depart_lng &&
              course.gps_arrivee_lat && course.gps_arrivee_lng) {

            const dist = haversine(
              course.gps_depart_lat, course.gps_depart_lng,
              course.gps_arrivee_lat, course.gps_arrivee_lng
            );

            if (dist > 0) {
              const prix = Math.round(dist * 100);
              await base44.entities.CourseExterne.update(course.id, {
                prix_estimate: prix
              });
              repaired++;
              console.log(`[PRIX] ${course.id.slice(-6)}: ${dist.toFixed(2)}km → ${prix}F`);
            }
          }
        }
      } catch (err) {
        console.error(`[PRIX] Erreur ${course.id}:`, err.message);
      }
    }

    console.log(`[PRIX] ${repaired}/${courses.length} courses réparées`);

    return Response.json({
      success: true,
      repaired,
      total: courses.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
