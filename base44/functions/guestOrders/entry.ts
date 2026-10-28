import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { normalizePhone, withPlusPrefix } from '../../shared/phoneUtils.ts';

// ── Module invité : commande sans compte ──
// Fonction publique (asServiceRole, aucune auth requise).
// L'invité accède uniquement à sa course via son tracking_token privé (UUID non devinable).
// Anti-abus : OTP SMS Twilio Verify + max 1 course invité par téléphone vérifié.

const CONFIG_ENABLED_KEY = 'GUEST_ORDERS_ENABLED';
const CONFIG_MAX_PER_PHONE_KEY = 'GUEST_ORDERS_MAX_PER_PHONE';
const DEFAULT_MAX_PER_PHONE = 1;

// Champs sensibles que le frontend invité ne doit JAMAIS définir (réutilise le pattern creerCourseClient).
const FORBIDDEN_FIELDS = [
  'statut', 'dispatch_status', 'livreur_id', 'livreur_nom', 'livreur_telephone',
  'livreur_photo_url', 'livreur_vehicule', 'livreur_note_moyenne', 'livreur_nombre_avis',
  'prix_final', 'commission_silga', 'montant_livreur', 'statut_paiement_livreur',
  'client_user_email', 'livreur_user_email',
  'enterprise_id', 'enterprise_commission_rate_locked', 'enterprise_commission_locked_at',
  'enterprise_commission_amount', 'enterprise_encours_comptabilise_at', 'enterprise_encours_comptabilise_montant',
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
  'delivery_mode', 'eco_status', 'eco_mission_id', 'eco_created_at',
  'eco_convert_after_at', 'eco_converted_at', 'eco_conversion_reason',
  'eco_candidate_score',
  'latitude_prise_en_charge', 'longitude_prise_en_charge',
  'latitude_arrivee_dest', 'longitude_arrivee_dest',
  'latitude_recuperation', 'longitude_recuperation',
  'latitude_livraison', 'longitude_livraison',
  'latitude_arrivee_livraison', 'longitude_arrivee_livraison',
  'colis_livre_at',
];

async function getConfig(base44: any, key: string, fallback: string): Promise<string> {
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: key }, '-created_date', 1);
    if (configs && configs.length > 0 && configs[0].valeur) return configs[0].valeur;
  } catch { /* fallback */ }
  return fallback;
}

async function isGuestOrdersEnabled(base44: any): Promise<boolean> {
  const val = await getConfig(base44, CONFIG_ENABLED_KEY, 'true');
  return String(val).toLowerCase() === 'true' || val === '1';
}

async function getMaxPerPhone(base44: any): Promise<number> {
  const val = await getConfig(base44, CONFIG_MAX_PER_PHONE_KEY, String(DEFAULT_MAX_PER_PHONE));
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PER_PHONE;
}

async function sendOtp(phoneE164: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const serviceSid = secrets.get('TWILIO_VERIFY_SMS_SERVICE_SID') || secrets.get('TWILIO_VERIFY_SERVICE_SID');
  const accountSid = secrets.get('TWILIO_ACCOUNT_SID');
  const authToken = secrets.get('TWILIO_AUTH_TOKEN');
  if (!serviceSid || !accountSid || !authToken) {
    return { success: false, error: 'Twilio Verify non configuré' };
  }
  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
  const formData = new URLSearchParams();
  formData.append('To', phoneE164);
  formData.append('Channel', 'sms');
  const creds = btoa(`${accountSid}:${authToken}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  if (resp.ok && data.sid) return { success: true, sid: data.sid };
  return { success: false, error: data.message || 'Erreur envoi OTP' };
}

async function verifyOtp(phoneE164: string, code: string): Promise<{ success: boolean; status?: string; error?: string }> {
  const serviceSid = secrets.get('TWILIO_VERIFY_SMS_SERVICE_SID') || secrets.get('TWILIO_VERIFY_SERVICE_SID');
  const accountSid = secrets.get('TWILIO_ACCOUNT_SID');
  const authToken = secrets.get('TWILIO_AUTH_TOKEN');
  if (!serviceSid || !accountSid || !authToken) {
    return { success: false, error: 'Twilio Verify non configuré' };
  }
  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;
  const formData = new URLSearchParams();
  formData.append('To', phoneE164);
  formData.append('Code', code);
  const creds = btoa(`${accountSid}:${authToken}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  if (resp.ok && data.status === 'approved') return { success: true, status: data.status };
  return { success: false, status: data.status, error: data.message || 'Code OTP invalide ou expiré' };
}

async function countGuestCoursesByPhone(base44: any, phoneNormalized: string): Promise<number> {
  try {
    const count = await base44.asServiceRole.entities.CourseExterne.count({
      source: 'invite',
      client_phone_normalized: phoneNormalized,
    });
    return Number(count) || 0;
  } catch { return 0; }
}

export default async function(req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();

    // ── Action : get_course (suivi public par token privé) ──
    // Réutilise la logique de getSuiviCourse : asServiceRole + tracking_token UUID non devinable.
    if (action === 'get_course') {
      const token = String(body.token || body.tracking_token || '').trim();
      if (!token) return Response.json({ error: 'token_manquant' }, { status: 400, headers: corsHeaders });
      let courses = await base44.asServiceRole.entities.CourseExterne.filter({ tracking_token: token });
      if (!courses || courses.length === 0) {
        const byId = await base44.asServiceRole.entities.CourseExterne.get(token).catch((e: any) => (e.status === 404 ? null : Promise.reject(e)));
        if (byId) courses = [byId];
      }
      if (!courses || courses.length === 0) {
        return Response.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
      }
      const course = courses[0];
      let livreurPos = null;
      if (course.livreur_id) {
        try {
          const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: course.livreur_id });
          const l = livreurs?.[0];
          if (l?.latitude && l?.longitude) {
            livreurPos = { lat: l.latitude, lng: l.longitude, nom: l.prenom ? `${l.prenom} ${l.nom}` : l.nom };
          }
        } catch { /* ignore */ }
      }
      return Response.json({ course, livreurPos }, { status: 200, headers: corsHeaders });
    }

    // ── Actions suivantes : vérifier que le module est activé ──
    if (!(await isGuestOrdersEnabled(base44))) {
      return Response.json({ error: 'Module invité désactivé' }, { status: 403, headers: corsHeaders });
    }

    // ── Action : send_otp ──
    if (action === 'send_otp') {
      const phone = String(body.phone || '').trim();
      const countryCode = String(body.country_code || '').trim().toUpperCase();
      if (!phone || !countryCode) {
        return Response.json({ error: 'phone et country_code requis' }, { status: 400, headers: corsHeaders });
      }
      const phoneNormalized = normalizePhone(phone, countryCode);
      if (!phoneNormalized) {
        return Response.json({ error: 'Numéro de téléphone invalide' }, { status: 400, headers: corsHeaders });
      }
      const phoneE164 = withPlusPrefix(phoneNormalized);
      const result = await sendOtp(phoneE164);
      if (!result.success) {
        return Response.json({ error: result.error || 'Erreur envoi OTP' }, { status: 400, headers: corsHeaders });
      }
      return Response.json({ success: true, phone_normalized: phoneNormalized }, { status: 200, headers: corsHeaders });
    }

    // ── Action : verify_and_create ──
    if (action === 'verify_and_create') {
      const phone = String(body.phone || '').trim();
      const countryCode = String(body.country_code || '').trim().toUpperCase();
      const otpCode = String(body.otp_code || '').trim();
      const requestId = String(body.request_id || '').trim();
      const courseData = body.course_data;

      if (!phone || !countryCode || !otpCode || !requestId || !courseData) {
        return Response.json({ error: 'phone, country_code, otp_code, request_id et course_data requis' }, { status: 400, headers: corsHeaders });
      }

      const phoneNormalized = normalizePhone(phone, countryCode);
      if (!phoneNormalized) {
        return Response.json({ error: 'Numéro de téléphone invalide' }, { status: 400, headers: corsHeaders });
      }
      const phoneE164 = withPlusPrefix(phoneNormalized);

      // 1. Vérifier l'OTP Twilio
      const otpResult = await verifyOtp(phoneE164, otpCode);
      if (!otpResult.success) {
        return Response.json({ error: otpResult.error || 'Code OTP invalide' }, { status: 400, headers: corsHeaders });
      }

      // 2. Anti-doublon : max N courses invité par téléphone vérifié
      const maxPerPhone = await getMaxPerPhone(base44);
      const existingCount = await countGuestCoursesByPhone(base44, phoneNormalized);
      if (existingCount >= maxPerPhone) {
        return Response.json({
          error: `Limite atteinte : ${maxPerPhone} course(s) invité maximum par numéro. Créez un compte pour continuer.`,
          limit_reached: true,
        }, { status: 403, headers: corsHeaders });
      }

      // 3. Idempotence : vérifier si une course avec ce request_id existe déjà
      try {
        const existing = await base44.asServiceRole.entities.CourseExterne.filter(
          { request_id: requestId, source: 'invite' }, '-created_date', 2
        );
        if (existing && existing.length > 0) {
          return Response.json({ success: true, course: existing[0], idempotent: true }, { status: 200, headers: corsHeaders });
        }
      } catch { /* continuation */ }

      // 4. Nettoyer les champs sensibles
      const cleanData: any = { ...courseData };
      for (const field of FORBIDDEN_FIELDS) {
        delete cleanData[field];
      }

      // 5. Forcer les champs invité
      cleanData.source = 'invite';
      cleanData.client_user_email = null;
      cleanData.client_phone_normalized = phoneNormalized;
      cleanData.client_telephone = phone;
      cleanData.country_code = countryCode;
      cleanData.statut = 'nouvelle';
      cleanData.dispatch_status = 'en_attente';
      cleanData.tracking_token = crypto.randomUUID();
      cleanData.tracking_link = `https://silga-dispatch-go.base44.app/suivi-public/${cleanData.tracking_token}`;
      cleanData.tracking_shared_at = new Date().toISOString();
      cleanData.request_id = requestId;
      cleanData.pricing_mode = cleanData.pricing_mode || 'automatic';

      // 6. Créer la course
      const course = await base44.asServiceRole.entities.CourseExterne.create(cleanData);

      // 7. Lancer le calcul de prix (non bloquant — le watchdog prendra le relais si échec)
      try {
        await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id: course.id });
      } catch (priceErr: any) {
        console.error('[guestOrders] calculPrixCourseExterne error:', priceErr?.message || String(priceErr));
      }

      return Response.json({
        success: true,
        course,
        tracking_token: course.tracking_token,
        tracking_link: course.tracking_link,
      }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ error: 'action inconnue' }, { status: 400, headers: corsHeaders });
  } catch (error: any) {
    console.error('[guestOrders] Erreur:', error);
    return Response.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}