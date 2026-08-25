import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const CREATION_MUTEX_KEY = 'COURSE_CREATION_MUTEX';
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 12_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function findExistingCourse(base44: any, requestId: string, userEmail: string) {
  const existing = await base44.asServiceRole.entities.CourseExterne.filter(
    { request_id: requestId, client_user_email: userEmail },
    'created_date',
    2
  );
  return existing?.[0] || null;
}

async function acquireCreationMutex(base44: any, requestId: string, userEmail: string) {
  const configs = await base44.asServiceRole.entities.AppConfig.filter(
    { cle: CREATION_MUTEX_KEY },
    'created_date',
    2
  );

  // Le mutex est provisionne avant le deploiement de cette fonction. Echouer
  // ferme est preferable a creer une course sans garantie d'idempotence.
  if (!configs || configs.length !== 1) {
    throw new Error('COURSE_CREATION_MUTEX_NOT_PROVISIONED');
  }

  const mutex = configs[0];
  const owner = crypto.randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const existing = await findExistingCourse(base44, requestId, userEmail);
    if (existing) return { existing, mutex, owner: null };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS).toISOString();

    // updateMany realise le compare-and-set dans la base. Un seul appel peut
    // remplacer un mutex libre ou expire par son propre jeton proprietaire.
    await base44.asServiceRole.entities.AppConfig.updateMany(
      {
        id: mutex.id,
        $or: [
          { lock_owner: '' },
          { lock_owner: null },
          { lock_owner: { $exists: false } },
          { lock_expires_at: { $lt: now.toISOString() } },
        ],
      },
      {
        $set: {
          lock_owner: owner,
          lock_request_id: requestId,
          lock_expires_at: expiresAt,
        },
      }
    );

    const verified = await base44.asServiceRole.entities.AppConfig.get(mutex.id);
    if (verified?.lock_owner === owner) {
      return { existing: null, mutex, owner };
    }

    await sleep(75 + Math.floor(Math.random() * 75));
  }

  const existing = await findExistingCourse(base44, requestId, userEmail);
  if (existing) return { existing, mutex, owner: null };
  throw new Error('COURSE_CREATION_MUTEX_TIMEOUT');
}

async function releaseCreationMutex(base44: any, mutexId: string, owner: string) {
  await base44.asServiceRole.entities.AppConfig.updateMany(
    { id: mutexId, lock_owner: owner },
    {
      $set: {
        lock_owner: '',
        lock_request_id: '',
        lock_expires_at: new Date(0).toISOString(),
      },
    }
  );
}

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
    const normalizedRequestId = typeof request_id === 'string' ? request_id.trim() : '';

    if (!course_data || typeof course_data !== 'object') {
      return Response.json({ error: 'course_data requis' }, { status: 400 });
    }

    let mutex: any = null;
    if (normalizedRequestId) {
      mutex = await acquireCreationMutex(base44, normalizedRequestId, user.email);
      if (mutex.existing) {
        return Response.json({ success: true, course: mutex.existing, idempotent: true });
      }
    }

    try {

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
    if (normalizedRequestId) {
      cleanData.request_id = normalizedRequestId;
    }

    // ── Créer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.create(cleanData);

    return Response.json({ success: true, course });
    } finally {
      if (mutex?.owner && mutex?.mutex?.id) {
        await releaseCreationMutex(base44, mutex.mutex.id, mutex.owner).catch((error: any) => {
          console.error('[creerCourseClient] Erreur liberation mutex:', error?.message || String(error));
        });
      }
    }
  } catch (error) {
    console.error('[creerCourseClient] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
