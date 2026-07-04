import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { id, data, mark_courses_paid } = await req.json();
    if (!id) return Response.json({ success: false, error: 'id requis' }, { status: 400 });
    if (Array.isArray(mark_courses_paid) && mark_courses_paid.length > 0) {
      await Promise.all(mark_courses_paid.map(cid =>
        base44.asServiceRole.entities.CourseExterne.update(cid, { statut_paiement_livreur: "paye" })
      ));
    }
    const updated = await base44.asServiceRole.entities.Livreur.update(id, data);
    return Response.json({ success: true, livreur: updated });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
