import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Tente de provisionner le WhatsApp Sender +226 55 48 38 38 via l'API Twilio.
 *
 * Étapes :
 * 1. Liste les Messaging Services existants
 * 2. Pour chaque service, liste les WhatsApp Senders (vérifie si le numéro existe déjà)
 * 3. Si le numéro n'existe pas, tente de le créer via POST /WhatsAppSenders
 *    - Tentative 1 : avec phone_number uniquement (migration directe)
 *    - Tentative 2 : avec EmbeddedSignup placeholder (capture l'erreur OAuth exacte)
 * 4. Vérifie le statut du WABA via Content Templates API
 * 5. Retourne le code d'erreur Twilio exact et les étapes manuelles obligatoires
 *
 * Admin only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return Response.json({ error: 'Secrets Twilio manquants' }, { status: 500 });
    }

    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const VENUS_NUMBER = '+22655483838';
    const VENUS_DIGITS = '22655483838';

    const rapport: any = {
      timestamp: new Date().toISOString(),
      numero_cible: VENUS_NUMBER,
    };

    // ── 1. Lister les Messaging Services ──
    let messagingServices: any[] = [];
    try {
      const msResp = await fetch('https://messaging.twilio.com/v1/Services', { headers });
      const msData = await msResp.json();
      messagingServices = msData?.data || [];
      rapport.messaging_services = messagingServices.map((ms: any) => ({
        sid: ms.sid,
        nom: ms.friendly_name,
        whatsapp_enabled: ms.whatsapp_enabled || false,
      }));
    } catch (e) {
      return Response.json({ error: 'Impossible de lister les Messaging Services: ' + e.message }, { status: 500 });
    }

    // ── Auto-créer un Messaging Service si aucun n'existe ──
    if (messagingServices.length === 0) {
      try {
        const createResp = await fetch('https://messaging.twilio.com/v1/Services', {
          method: 'POST',
          headers,
          body: new URLSearchParams({ FriendlyName: 'SILGAPP WhatsApp' }).toString(),
        });
        const createData = await createResp.json();
        if (createResp.ok && createData.sid) {
          messagingServices = [createData];
          rapport.auto_fix_messaging_service = {
            succes: true,
            sid: createData.sid,
            message: 'Messaging Service créé automatiquement.',
          };
        } else {
          rapport.diagnostic = 'AUCUN_MESSAGING_SERVICE';
          rapport.recommandation = 'Créer un Messaging Service dans Twilio Console d\'abord.';
          return Response.json(rapport);
        }
      } catch (e) {
        rapport.diagnostic = 'AUCUN_MESSAGING_SERVICE';
        rapport.recommandation = 'Créer un Messaging Service dans Twilio Console d\'abord. Erreur: ' + e.message;
        return Response.json(rapport);
      }
    }

    // Utiliser le premier Messaging Service (ou celui nommé "SILGAPP WhatsApp")
    const msTarget = messagingServices.find((ms: any) =>
      ms.friendly_name?.toLowerCase().includes('silgapp')
    ) || messagingServices[0];
    const msSid = msTarget.sid;

    rapport.messaging_service_utilise = {
      sid: msSid,
      nom: msTarget.friendly_name,
      whatsapp_enabled: msTarget.whatsapp_enabled || false,
    };

    // ── 2. Lister les WhatsApp Senders existants sur ce service ──
    let existingSenders: any[] = [];
    try {
      const wsResp = await fetch(
        `https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`,
        { headers }
      );
      const wsData = await wsResp.json();
      existingSenders = wsData?.data || [];
    } catch (e) {
      rapport.erreur_liste_senders = e.message;
    }

    rapport.whatsapp_senders_existants = existingSenders.map((s: any) => ({
      sid: s.sid,
      numero: s.phone_number,
      statut: s.status,
      code_erreur: s.error_code,
      message_erreur: s.error_message,
    }));

    // Vérifier si le numéro VENUS est déjà présent
    const venusSender = existingSenders.find((s: any) => {
      const num = (s.phone_number || '').replace(/\D/g, '');
      return num.endsWith(VENUS_DIGITS);
    });

    if (venusSender) {
      rapport.venus_sender_trouve = {
        sid: venusSender.sid,
        numero: venusSender.phone_number,
        statut: venusSender.status,
        code_erreur: venusSender.error_code,
        message_erreur: venusSender.error_message,
        webhook_url: venusSender.webhook_url,
        webhook_method: venusSender.webhook_method,
      };

      if (venusSender.status === 'approved' || venusSender.status === 'connected') {
        rapport.diagnostic = 'DEJA_APPROUVE';
        rapport.recommandation = `Le numéro ${VENUS_NUMBER} est déjà approuvé (statut: ${venusSender.status}). Configurer TWILIO_WHATSAPP_VENUS_FROM = whatsapp:${VENUS_NUMBER}.`;
      } else {
        rapport.diagnostic = 'DEJA_AJOUTE_MAIS_NON_APPROUVE';
        rapport.code_erreur_twilio = venusSender.error_code;
        rapport.recommandation = `Le numéro existe mais son statut est "${venusSender.status}". Erreur Twilio: ${venusSender.error_message || 'N/A'} (code ${venusSender.error_code || 'N/A'}). Vérifiez dans Twilio Console → Messaging → Services → ${msTarget.friendly_name} → WhatsApp senders.`;
      }

      return Response.json(rapport);
    }

    // ── 3. Le numéro n'existe pas — tenter de le créer via API ──
    rapport.venus_sender_trouve = false;
    rapport.tentatives_creation = [];

    // ── Tentative 1 : Création avec phone_number directement ──
    try {
      const resp1 = await fetch(
        `https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`,
        {
          method: 'POST',
          headers,
          body: new URLSearchParams({
            PhoneNumber: VENUS_NUMBER,
          }).toString(),
        }
      );
      const data1 = await resp1.json();

      rapport.tentatives_creation.push({
        methode: 'phone_number_direct',
        http_status: resp1.status,
        succes: resp1.ok,
        code_erreur: data1.code,
        message: data1.message,
        message_detail: data1.more_info || data1.detail || null,
        reponse: resp1.ok ? {
          sid: data1.sid,
          statut: data1.status,
          numero: data1.phone_number,
        } : data1,
      });

      // Si la création a réussi, vérifier le statut
      if (resp1.ok && data1.sid) {
        rapport.diagnostic = 'SENDER_CREE';
        rapport.venus_sender_cree = {
          sid: data1.sid,
          statut: data1.status,
          message: `WhatsApp Sender créé avec le statut "${data1.status}". Si le statut n'est pas "approved", il faut compléter l'Embedded Signup dans Twilio Console.`,
        };
        return Response.json(rapport);
      }
    } catch (e) {
      rapport.tentatives_creation.push({
        methode: 'phone_number_direct',
        erreur_reseau: e.message,
      });
    }

    // ── Tentative 2 : Avec EmbeddedSignup placeholder (capture l'erreur OAuth) ──
    try {
      const resp2 = await fetch(
        `https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`,
        {
          method: 'POST',
          headers,
          body: new URLSearchParams({
            'EmbeddedSignup.Code': 'PLACEHOLDER_OAUTH_CODE_REQUIRED',
          }).toString(),
        }
      );
      const data2 = await resp2.json();

      rapport.tentatives_creation.push({
        methode: 'embedded_signup_placeholder',
        http_status: resp2.status,
        succes: resp2.ok,
        code_erreur: data2.code,
        message: data2.message,
        message_detail: data2.more_info || data2.detail || null,
        reponse_complete: data2,
      });
    } catch (e) {
      rapport.tentatives_creation.push({
        methode: 'embedded_signup_placeholder',
        erreur_reseau: e.message,
      });
    }

    // ── 4. Vérifier le statut du WABA via Content Templates ──
    try {
      const contentResp = await fetch(
        'https://content.twilio.com/v1/Content?PageSize=5',
        { headers }
      );
      const contentData = await contentResp.json();
      rapport.waba_statut = {
        http_status: contentResp.status,
        content_templates_count: contentData?.contents?.length || 0,
        waba_connecte: contentResp.ok,
        message: contentResp.ok
          ? 'Un WABA semble connecté (Content Templates accessibles).'
          : 'Aucun WABA connecté ou accès Content Templates refusé.',
      };
    } catch (e) {
      rapport.waba_statut = { erreur: e.message };
    }

    // ── 5. Diagnostic final ──
    const tentatives = rapport.tentatives_creation;
    const tentative1 = tentatives.find(t => t.methode === 'phone_number_direct');
    const tentative2 = tentatives.find(t => t.methode === 'embedded_signup_placeholder');

    rapport.diagnostic = 'CREATION_IMPOSSIBLE_VIA_API';
    rapport.code_erreur_twilio = tentative1?.code_erreur || tentative2?.code_erreur || null;

    rapport.recommandation = `═══ PROVISIONNING IMPOSSIBLE VIA API — ACTION MANUELLE OBLIGATOIRE ═══

Le numéro ${VENUS_NUMBER} n'existe pas comme WhatsApp Sender dans Twilio.
L'API Twilio REFUSE la création directe d'un WhatsApp Sender sans code OAuth Meta.

CODE D'ERREUR TWILIO: ${rapport.code_erreur_twilio || 'N/A'}
Message: ${tentative1?.message || tentative2?.message || 'N/A'}

Le message Meta "Veuillez contacter Twilio" signifie que l'Embedded Signup a été initié
du MAUVAIS CÔTÉ (côté Meta au lieu de côté Twilio).

═══ ÉTAPES MANUELLES OBLIGATOIRES (5 minutes) ═══

1. Aller sur https://console.twilio.com → Messaging → Services
2. Cliquer sur "${msTarget.friendly_name}" (SID: ${msSid})
3. Onglet "WhatsApp senders" → bouton "Add WhatsApp sender"
4. Une fenêtre Meta OAuth s'ouvre :
   a. Se connecter au compte Meta Business "Silgapp"
   b. AUTORISER Twilio à accéder au WhatsApp Business Account
   c. Sélectionner le numéro ${VENUS_NUMBER}
   d. Cliquer "Submit"
5. Le statut passe à "approved" en quelques secondes

══️ SI META AFFICHE ENCORE L'ERREUR ═══

Si Meta dit toujours "contactez Twilio", c'est qu'une association précédente bloque.
Solution :
1. Dans Meta Business Manager → WhatsApp Manager → Numéros
2. SUPPRIMER toute association Twilio existante pour ce numéro
3. Recommencer l'Embedded Signup depuis Twilio Console (étape 1-5 ci-dessus)

═══ APRÈS SUCCÈS ═══

Une fois le statut "approved" :
- Configurer le secret TWILIO_WHATSAPP_VENUS_FROM = whatsapp:${VENUS_NUMBER}
- Le webhook WhatsApp utilisera automatiquement ce numéro pour VENUS`;

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});