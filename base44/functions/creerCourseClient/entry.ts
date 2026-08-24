import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ── Champs sensibles que le frontend ne doit JAMAIS définir ──
const FORBIDDEN_FIELDS = [
  'statut', 'dispatch_status', 'livreur_id', 'livreur_nom', 'livreur_telephone',
  'livreur_photo_url', 'livreur_vehicule', 'livreur_note_moyenne', 'livreur_nombre_avis',
  'prix_final', 'commission_silga', 'montant_livreur', 'statut_paiement_livreur',
  'client_user_email', 'livreur_user_email',
  'dispatch_notified_ids', 'dispatch_wave_notified_ids', 'dispatch_refused_ids',
  'dispatch_locked_until', 'dispatch_cycle_count', 'dispatch_wave',
  'dispatch_v2_secours_phase', 'dispatch_wave_started_at', 'dispatch_next_wave_at',
  'heure_acceptation', 'heure_prise_en_charge', 'heure_arrivee',
  'heure_recuperation', 'heure_livraison', 'heure_contact_client', 'heure_sollicitation',
  'timeout_expires_at',
  'note_livreur', 'commentaire_livreur', 'note_date',
  'destinataire_feedback', 'destinataire_feedback_date',
  'pickup_confirmed_by', 'delivery_confirmed_by',
  'pickup_confirmed_at', 'delivery_confirmed_at',
  'manual_price', 'manual_price_status', 'proposed_by_livreur_id',
  'client_price_validated_at', 'client_price_refused_at',
  'crm_stats_synced', 'encours_comptabilise_at', 'encours_comptabilise_montant',
  'latitude_prise_en_charge', 'longitude_prise_en_charge',
  'latitude_arrivee_dest', 'longitude_arrivee_dest',
  'latitude_recuperation', 'longitude_recuperation',
  'latitude_livraison', 'longitude_livraison',
  'latitude_arrivee_livraison', 'longitude_arrivee_livraison',
  'colis_livre_at',
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_data, is_duplicate } = body;

    if (!course_data || typeof course_data !== 'object') {
      return Response.json({ error: 'course_data requis' }, { status: 400 });
    }

    // ── Nettoyer les champs sensibles ──
    const cleanData = { ...course_data };
    for (const field of FORBIDDEN_FIELDS) {
      delete cleanData[field];
    }

    // ── Résoudre client_user_email côté backend ──
    cleanData.client_user_email = user.email;

    // ── Normaliser le pays et dériver les statuts côté backend ──
    // Le frontend ne peut pas imposer ces champs sensibles, mais la course doit
    // être exploitable immédiatement, même si le dispatch asynchrone tarde.
    cleanData.country_code = String(cleanData.country_code || '').trim().toUpperCase();
    if (!cleanData.country_code) {
      return Response.json({ error: 'country_code requis' }, { status: 400 });
    }
    cleanData.statut = cleanData.date_souhaitee ? 'programmee' : 'recherche_livreur';
    cleanData.dispatch_status = 'en_attente';

    // ── Pour les duplications, ne pas copier les QR codes ──
    if (is_duplicate) {
      delete cleanData.id;
      delete cleanData.created_date;
      delete cleanData.updated_date;
      delete cleanData.created_by_id;
      // Régénérer QR codes pour la copie
      delete cleanData.pickup_qr_token;
      delete cleanData.delivery_qr_token;
      delete cleanData.pickup_code_4_digits;
      delete cleanData.delivery_code_4_digits;
      delete cleanData.tracking_token;
      delete cleanData.tracking_link;
    }

    // ── Créer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.create(cleanData);

    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerCourseClient] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
