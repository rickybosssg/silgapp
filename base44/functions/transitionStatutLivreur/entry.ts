import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION STATUT LIVREUR — Toutes les transitions de statut sans prix
// ═══════════════════════════════════════════════════════════════════════════
//
// Transitions valides (machine d'états) :
//   client_contacte      ← livreur_en_route, recherche_livreur (ADMIN ONLY)
//   en_route_expediteur  ← client_contacte, livreur_en_route
//   colis_recupere       ← en_route_expediteur, arrive_prise_en_charge, livreur_en_route
//   en_livraison         ← colis_recupere, en_route_expediteur, livreur_en_route
//   pris_en_charge       ← livreur_en_route, en_route_expediteur (déplacement)
//   arrivee              ← pris_en_charge, en_livraison
//
// Sécurité :
//   - Valide l'identité du livreur (user.email → Livreur.user_email)
//   - Valide que le livreur est assigné à la course
//   - Strip TOUS les champs sensibles (prix, commission, livreur_id, etc.)
//   - Idempotent : si déjà au statut cible → success sans réécriture
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS_VALIDES: Record<string, string[]> = {
  'client_contacte': ['livreur_en_route', 'recherche_livreur'],
  'en_route_expediteur': ['client_contacte', 'livreur_en_route'],
  'colis_recupere': ['en_route_expediteur', 'arrive_prise_en_charge', 'livreur_en_route'],
  'en_livraison': ['colis_recupere', 'en_route_expediteur', 'livreur_en_route'],
  'pris_en_charge': ['livreur_en_route', 'en_route_expediteur'],
  'arrivee': ['pris_en_charge', 'en_livraison'],
};

const GPS_FIELDS_PAR_STATUT: Record<string, string[]> = {
  'pris_en_charge': ['latitude_prise_en_charge', 'longitude_prise_en_charge'],
  'arrivee': ['latitude_arrivee_dest', 'longitude_arrivee_dest'],
};

// Champs sensibles JAMAIS acceptés du frontend
const FORBIDDEN_FIELDS = [
  'prix_final', 'commission_silga', 'montant_livreur', 'livreur_id',
  'livreur_nom', 'livreur_photo_url', 'livreur_telephone', 'livreur_vehicule',
  'livreur_note_moyenne', 'livreur_nombre_avis',
  'dispatch_status', 'dispatch_wave', 'dispatch_wave_notified_ids',
  'dispatch_notified_ids', 'dispatch_refused_ids', 'dispatch_locked_until',
  'dispatch_cycle_count', 'dispatch_v2_secours_phase',
  'client_user_email', 'livreur_user_email',
  'statut_paiement_livreur', 'encours_comptabilise_at', 'encours_comptabilise_montant',
  'crm_stats_synced', 'manual_price', 'manual_price_status', 'proposed_by_livreur_id',
  'client_price_validated_at', 'client_price_refused_at', 'pricing_mode',
  'tracking_token', 'tracking_link', 'tracking_shared_at', 'tracking_opened_count',
  'pickup_qr_token', 'pickup_code_4_digits', 'delivery_qr_token', 'delivery_code_4_digits',
  'pickup_confirmed_by', 'delivery_confirmed_by',
  'heure_acceptation', 'source', 'country_code', 'type_course', 'is_multi_colis',
  'nb_colis', 'nb_colis_livres', 'nb_colis_annules',
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, statut_cible, latitude, longitude, remarque } = body;

    if (!course_id || !statut_cible) {
      return Response.json({ error: 'course_id et statut_cible requis' }, { status: 400 });
    }

    // Valider statut_cible
    if (!TRANSITIONS_VALIDES[statut_cible]) {
      return Response.json({ error: `Statut cible invalide: ${statut_cible}` }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // Vérifier que la course n'est pas terminée
    if (['livree', 'annulee'].includes(course.statut)) {
      return Response.json({ error: 'Course terminée ou annulée' }, { status: 400 });
    }

    // Idempotence : si déjà au statut cible, retourner success
    if (course.statut === statut_cible) {
      return Response.json({ success: true, skipped: 'already_at_target', course_id, statut: statut_cible });
    }

    // Valider la transition
    const statutsSources = TRANSITIONS_VALIDES[statut_cible];
    if (!statutsSources.includes(course.statut)) {
      return Response.json({
        error: `Transition invalide: ${course.statut} → ${statut_cible}`,
        statut_actuel: course.statut,
        statut_cible,
      }, { status: 400 });
    }

    // Vérifier l'identité du livreur
    if (!course.livreur_id) {
      return Response.json({ error: 'Aucun livreur assigné à cette course' }, { status: 403 });
    }
    const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
    if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
    if (livreur.user_email !== user.email) {
      return Response.json({ error: 'Vous n\'êtes pas le livreur assigné à cette course' }, { status: 403 });
    }

    // Validation spécifique: client_contacte réservé aux courses admin
    if (statut_cible === 'client_contacte' && course.source !== 'admin' && course.pricing_mode !== 'admin_manuel') {
      return Response.json({ error: 'L\'étape "Client contacté" est réservée aux courses administratives' }, { status: 400 });
    }

    // Construire l'update
    const now = new Date().toISOString();
    const updateData: any = { statut: statut_cible };

    // Champs heure selon le statut
    if (statut_cible === 'client_contacte') updateData.heure_contact_client = now;
    if (statut_cible === 'colis_recupere') {
      updateData.heure_recuperation = now;
      updateData.pickup_confirmed_by = 'livreur';
      updateData.pickup_confirmed_at = now;
    }
    if (statut_cible === 'pris_en_charge') updateData.heure_prise_en_charge = now;
    if (statut_cible === 'arrivee') updateData.heure_arrivee = now;

    // Champs GPS (uniquement si fournis et valides)
    const gpsFields = GPS_FIELDS_PAR_STATUT[statut_cible];
    if (gpsFields && latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      updateData[gpsFields[0]] = latitude;
      updateData[gpsFields[1]] = longitude;
    }

    // Remarque livreur (champ sûr)
    if (remarque != null && typeof remarque === 'string' && remarque.trim().length > 0) {
      updateData.remarque_livreur = remarque.trim();
    }

    // Strip forbidden fields (sécurité: ne jamais accepter du frontend)
    for (const f of FORBIDDEN_FIELDS) {
      delete updateData[f];
    }

    const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);
    return Response.json({ success: true, course: updated, statut: statut_cible });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}