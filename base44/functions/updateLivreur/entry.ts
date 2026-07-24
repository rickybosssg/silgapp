import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ success: false, error: 'Authentification requise' }, { status: 401 });
    }
    const { id, data, mark_courses_paid } = await req.json();
    if (!id) return Response.json({ success: false, error: 'id requis' }, { status: 400 });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return Response.json({ success: false, error: 'data invalide' }, { status: 400 });
    }

    const livreur = await base44.asServiceRole.entities.Livreur.get(id).catch(() => null);
    if (!livreur) {
      return Response.json({ success: false, error: 'Livreur introuvable' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = String(livreur.user_email || '').trim().toLowerCase()
      === String(user.email || '').trim().toLowerCase();
    if (!isAdmin && !isOwner) {
      return Response.json({ success: false, error: 'Non autorisé' }, { status: 403 });
    }

    if (!isAdmin) {
      const adminOnlyFields = [
        'encours',
        'montant_du_silga',
        'statut_paiement',
        'dernier_paiement_date',
        'bloque_encours',
        'date_blocage_encours',
        'commission_pct',
        'note_moyenne',
        'nombre_avis',
        'admin_hors_ligne',
      ];
      const forbiddenField = adminOnlyFields.find(field => Object.prototype.hasOwnProperty.call(data, field));
      const requestsValidationChange = Object.prototype.hasOwnProperty.call(data, 'validation');
      const validSelfDeactivation = data.validation === 'refuse' && data.actif === false;
      const requestsReactivation = data.actif === true;
      if (forbiddenField || (requestsValidationChange && !validSelfDeactivation) || requestsReactivation || mark_courses_paid) {
        return Response.json({
          success: false,
          error: 'Modification réservée aux administrateurs',
          field: forbiddenField || (mark_courses_paid ? 'mark_courses_paid' : requestsValidationChange ? 'validation' : 'actif'),
        }, { status: 403 });
      }
    }
    if (Array.isArray(mark_courses_paid) && mark_courses_paid.length > 0) {
      await Promise.all(mark_courses_paid.map(cid =>
        base44.asServiceRole.entities.CourseExterne.update(cid, { statut_paiement_livreur: "paye" })
      ));
    }
    // Si le montant_du_silga est modifié, enregistrer automatiquement la date de paiement
    if (data.montant_du_silga !== undefined) {
      data.dernier_paiement_date = new Date().toISOString();
    }
    const updated = await base44.asServiceRole.entities.Livreur.update(id, data);
    return Response.json({ success: true, livreur: updated });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
