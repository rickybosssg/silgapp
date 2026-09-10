import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { waitUntil } from 'base44:runtime';

// ─── Types d'événements autorisés ───────────────────────────────────────────
const ALLOWED_EVENT_TYPES = new Set([
  'push_requested',
  'push_succes',
  'push_echec',
  'notification_received',
  'notification_opened',
  'app_opened_from_notification',
  'course_screen_opened',
  'acceptation_attempt',
  'accepte',
  'refuse',
  'already_taken',
  'race_condition_perdue',
]);

// ─── Sources autorisées ─────────────────────────────────────────────────────
const ALLOWED_SOURCES = new Set([
  'backend',
  'native_android',
  'native_ios',
  'frontend',
]);

// ─── Plateformes autorisées ─────────────────────────────────────────────────
const ALLOWED_PLATFORMS = new Set(['android', 'ios', 'web']);

// ─── Fonction utilitaire : résoudre livreur_user_email depuis livreur_id ────
// Mise en cache simple par requête pour éviter les N+1 si plusieurs événements
// de la même fonction concernent le même livreur.
async function resolveLivreurEmail(base44, livreurId, cache) {
  if (!livreurId) return null;
  if (cache.has(livreurId)) return cache.get(livreurId);
  try {
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
    const email = livreur?.user_email || null;
    cache.set(livreurId, email);
    return email;
  } catch (_) {
    cache.set(livreurId, null);
    return null;
  }
}

// ─── Fonction utilitaire : construire la clé d'idempotence ──────────────────
// Format : course_id|livreur_id|event_type|timestamp_arrondi_minute
function buildIdempotencyKey(courseId, livreurId, eventType, eventTimestamp) {
  // Arrondir le timestamp à la minute pour éviter les doublons dans la même fenêtre
  const ts = eventTimestamp ? new Date(eventTimestamp).getTime() : Date.now();
  const roundedMinute = Math.floor(ts / 60000);
  return `${courseId}|${livreurId}|${eventType}|${roundedMinute}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      course_id,
      livreur_id,
      notification_id,
      dispatch_notification_id,
      device_id,
      fcm_token_prefix,
      event_type,
      platform,
      country_code,
      source,
      event_timestamp,
      metadata,
    } = body;

    // ── Validation des champs obligatoires ──
    if (!course_id || !livreur_id || !event_type) {
      return Response.json({
        error: 'Champs obligatoires manquants: course_id, livreur_id, event_type',
      }, { status: 400 });
    }

    if (!ALLOWED_EVENT_TYPES.has(event_type)) {
      return Response.json({
        error: `event_type non autorisé: ${event_type}`,
        allowed: [...ALLOWED_EVENT_TYPES],
      }, { status: 400 });
    }

    if (source && !ALLOWED_SOURCES.has(source)) {
      return Response.json({ error: `source non autorisé: ${source}` }, { status: 400 });
    }

    if (platform && !ALLOWED_PLATFORMS.has(platform)) {
      return Response.json({ error: `platform non autorisée: ${platform}` }, { status: 400 });
    }

    // ── Authentification ──
    // Les événements natifs (native_android, native_ios) peuvent arriver sans
    // session utilisateur (l'app peut être en arrière-plan). On accepte ces
    // sources si un livreur_id valide est fourni.
    // Les événements frontend/backend nécessitent un utilisateur authentifié.
    let authenticatedUser = null;
    let authenticatedEmail = null;
    const requiresAuth = source !== 'native_android' && source !== 'native_ios';

    if (requiresAuth) {
      try {
        authenticatedUser = await base44.auth.me();
        authenticatedEmail = authenticatedUser?.email;
      } catch (_) {
        return Response.json({ error: 'Authentification requise' }, { status: 401 });
      }
    }

    // ── Résoudre l'email du livreur (avec cache par requête) ──
    const livreurCache = new Map();
    const livreurEmail = await resolveLivreurEmail(base44, livreur_id, livreurCache);

    // ── Sécurité : un livreur ne peut tracer que ses propres événements ──
    if (authenticatedEmail && livreurEmail && authenticatedEmail !== livreurEmail) {
      // Vérifier si l'utilisateur est admin
      const isAdmin = authenticatedUser?.role === 'admin';
      if (!isAdmin) {
        return Response.json({
          error: 'Un livreur ne peut tracer des événements que pour lui-même',
        }, { status: 403 });
      }
    }

    // ── Construction de la clé d'idempotence ──
    const idempotencyKey = buildIdempotencyKey(course_id, livreur_id, event_type, event_timestamp);

    // ── Vérification d'idempotence : chercher un événement existant ──
    // On ne fait qu'UNE seule lecture. Si un événement existe déjà pour cette
    // clé, on retourne immédiatement sans créer de doublon.
    try {
      const existing = await base44.asServiceRole.entities.PushTelemetryEvent.filter(
        { idempotency_key: idempotencyKey },
        '-created_date',
        1
      );

      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          idempotent: true,
          event_id: existing[0].id,
          message: 'Événement déjà enregistré (idempotence)',
        });
      }
    } catch (_) {
      // Si la vérification échoue, on continue — l'idempotence est best-effort
    }

    // ── Création de l'événement ──
    const nowIso = new Date().toISOString();
    const eventRecord = await base44.asServiceRole.entities.PushTelemetryEvent.create({
      course_id,
      livreur_id,
      livreur_user_email: livreurEmail || undefined,
      notification_id: notification_id || undefined,
      dispatch_notification_id: dispatch_notification_id || undefined,
      device_id: device_id || undefined,
      fcm_token_prefix: fcm_token_prefix || undefined,
      event_type,
      platform: platform || 'web',
      country_code: country_code || undefined,
      source: source || 'frontend',
      event_timestamp: event_timestamp || nowIso,
      idempotency_key: idempotencyKey,
      metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : undefined,
    });

    return Response.json({
      success: true,
      idempotent: false,
      event_id: eventRecord.id,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});