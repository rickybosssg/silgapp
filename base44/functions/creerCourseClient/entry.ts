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
    const { course_data, is_duplicate, request_id } = body;

    if (!course_data || typeof course_data !== 'object') {
      return Response.json({ error: 'course_data requis' }, { status: 400 });
    }

    // ── Anti-double-création idempotente via request_id ──
    // Si le frontend envoie un request_id, vérifier si une course avec ce même
    // request_id existe déjà. Si oui, la retourner sans en créer une nouvelle.
    // Cas couverts : double-clic rapide, retry réseau, re-render React.
    if (request_id && typeof request_id === 'string') {
      try {
        const existing = await base44.asServiceRole.entities.CourseExterne.filter(
          { request_id },
          '-created_date',
          1
        );
        if (existing && existing.length > 0) {
          return Response.json({ success: true, course: existing[0], idempotent: true });
        }
      } catch (_) {
        // Ne pas bloquer la création si la vérification échoue
      }
    }

    // ── Nettoyer les champs sensibles ──
    const cleanData = { ...course_data };
    for (const field of FORBIDDEN_FIELDS) {
      delete cleanData[field];
    }

    // ── Résoudre client_user_email côté backend ──
    cleanData.client_user_email = user.email;

    // ── Normaliser country_code (uppercase, trim) ──
    if (cleanData.country_code) {
      cleanData.country_code = String(cleanData.country_code).trim().toUpperCase();
    }

    // ── Forcer le statut initial et dispatch_status après nettoyage ──
    // statut et dispatch_status sont dans FORBIDDEN_FIELDS (le frontend ne peut pas les définir),
    // mais ils DOIVENT être initialisés côté backend après le nettoyage.
    // Sans ça, dispatch_status reste null (pas de default dans le schema) et la course
    // n'est pas prise en charge par le dispatch automatique.
    cleanData.statut = 'nouvelle';
    cleanData.dispatch_status = 'en_attente';

    // ── S'assurer que les champs multi-colis sont préservés ──
    // is_multi_colis, nb_colis, nb_colis_livres, nb_colis_annules ne sont pas sensibles
    // et doivent être conservés tels quels depuis le frontend.
    // (aucune action nécessaire — ils ne sont pas dans FORBIDDEN_FIELDS)

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

    // ── Sauvegarder request_id pour l'idempotence future ──
    if (request_id && typeof request_id === 'string') {
      cleanData.request_id = request_id;
    }

    // ── Créer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.create(cleanData);

    // ── Post-creation dedup : protection contre les race conditions ──
    // Deux requêtes concurrentes avec le même request_id peuvent toutes deux
    // passer la vérification initiale (TOCTOU). Cette étape détecte et résout
    // les doublons APRÈS création en gardant la course la plus ancienne.
    if (request_id && typeof request_id === 'string') {
      try {
        const allWithRequestId = await base44.asServiceRole.entities.CourseExterne.filter(
          { request_id },
          'created_date',
          10
        );
        if (allWithRequestId && allWithRequestId.length > 1) {
          // Garder la plus ancienne (premier élément trié par created_date asc)
          const oldest = allWithRequestId[0];
          const toDelete = allWithRequestId.slice(1);
          for (const dup of toDelete) {
            try {
              await base44.asServiceRole.entities.CourseExterne.delete(dup.id);
              console.warn(`[creerCourseClient] Doublon request_id supprimé: ${dup.id} (gardé: ${oldest.id})`);
            } catch (delErr) {
              console.error(`[creerCourseClient] Erreur suppression doublon ${dup.id}:`, delErr?.message);
            }
          }
          return Response.json({ success: true, course: oldest, idempotent: true, deduped: true });
        }
      } catch (dedupErr) {
        console.error('[creerCourseClient] Erreur post-creation dedup:', dedupErr?.message);
      }
    }

    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerCourseClient] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}