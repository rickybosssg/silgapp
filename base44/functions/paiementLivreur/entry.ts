import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * PAIEMENT LIVREUR - Enregistre le paiement de la commission Silga
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { course_id, livreur_id, montant_silga, montant_livreur } = payload;

    if (!course_id || !livreur_id || !montant_silga) {
      return Response.json({ error: 'Paramètres requis manquants' }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Vérifier que le livreur correspond
    if (course.livreur_id !== livreur_id) {
      return Response.json({ error: 'Livreur ne correspond pas à la course' }, { status: 403 });
    }

    // Vérifier que la course est livrée
    if (course.statut !== 'livree') {
      return Response.json({ error: 'Course non livrée' }, { status: 400 });
    }

    // Mettre à jour le livreur
    const livreur = await base44.entities.Livreur.get(livreur_id);
    await base44.entities.Livreur.update(livreur_id, {
      statut_paiement: "paye",
      montant_paye: montant_silga,
      heure_paiement: new Date().toISOString(),
      admin_paiement: user.full_name || "Paiement auto",
      montant_du_silga: Math.max(0, (livreur.montant_du_silga || 0) - montant_silga),
    });

    // Mettre à jour la course
    await base44.entities.CourseExterne.update(course_id, {
      statut_paiement_livreur: "paye",
    });

    console.log(`[PAIEMENT] ${livreur_id} a payé ${montant_silga}F pour course ${course_id}`);

    return Response.json({
      success: true,
      message: `Paiement de ${montant_silga} FCFA enregistré`,
      montant_silga,
      montant_livreur,
    });

  } catch (error) {
    console.error('[PAIEMENT] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
