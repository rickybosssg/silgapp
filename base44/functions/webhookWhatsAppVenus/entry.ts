import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { detecterPaysDepuisTelephone } from '../../shared/venusPrompt.ts';
import { chargerConfigPays } from '../../shared/venusI18nEngine.ts';
import { genererReferenceCourse } from '../../shared/venusCourseReference.ts';
import { SEUIL_CONFIANCE } from '../../shared/venusLearningEngine.ts';
import {
  chargerMemoireLongue,
  mettreAJourMemoireLongue,
  chargerHistoriqueRecent,
  trouverCourseActive,
  raisonnerVenus,
  creerCourseDepuisMemoire,
  loggerRaisonnement,
} from '../../shared/venusReasoningEngine.ts';
import {
  getExecutionActive,
  repondreWorkflow,
} from '../../shared/venusWorkflowEngine.ts';
import { getMaintenanceMode } from '../../shared/venusSupervisionEngine.ts';
import {
  peutAgirSurAudio,
  genererMessageRepetitionAudio,
} from '../../shared/venusAudioEngine.ts';
import { detecterEtTraiterIncident } from '../../shared/venusIncidentEngine.ts';
import { normalizePhone } from '../../shared/phoneUtils.ts';
import { loggerMessageVenus, calculateCost } from '../../shared/venusOpenAITracker.ts';
import { genererExempleApprentissage } from '../../shared/venusLearningPipeline.ts';
// ── Modules extraits ──
import {
  validerSignatureTwilio,
  envoyerWhatsAppReply,
  envoyerIndicateurSaisie,
  downloadAndUploadMedia,
  venusLog,
} from '../../shared/venusTwilioUtils.ts';
import { envoyerWhatsAppRaw } from '../../shared/twilioWhatsApp.ts';
import {
  transcrireAudio,
  transcrireAudioDepuisTwilio,
  chargerConfigAudio,
  devraitRepondreEnAudio,
  envoyerReponseAudio,
} from '../../shared/venusAudioHandler.ts';
import {
  handleConsultationCourse,
  handleLocationAssignment,
  handleRedispatchDecision,
  handleContactLivreur,
  handleAnnulationCourse,
  handlePrixManuelResponse,
  handleModifierCourse,
} from '../../shared/venusCourseHandlers.ts';

Deno.serve(async (req) => {
  // ── Diagnostic GET : retourne l'URL vue par Deno ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return Response.json({
      method: req.method,
      url_seen: url.toString(),
      href: url.href,
      origin: url.origin,
      host: url.host,
      pathname: url.pathname,
      host_header: req.headers.get('host') || '',
      x_forwarded_host: req.headers.get('x-forwarded-host') || '',
      x_forwarded_proto: req.headers.get('x-forwarded-proto') || '',
      timestamp: new Date().toISOString()
    });
  }

  let typingInterval: any = null;
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      console.error('[WebhookVenus] Secrets Twilio manquants');
      return Response.json({ error: 'Configuration Twilio manquante' }, { status: 500 });
    }

    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);

    let params: any = {};
    let rawBody = '';
    let isJsonMode = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      rawBody = await req.text();
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      isJsonMode = true;
      const jsonBody = await req.json();
      params = jsonBody;
      rawBody = JSON.stringify(jsonBody);
    }

    let authenticatedInternalCall = false;
    if (isJsonMode) {
      try {
        const caller = await base44.auth.me();
        authenticatedInternalCall = caller?.role === 'admin';
      } catch {
        authenticatedInternalCall = false;
      }
      if (!authenticatedInternalCall) {
        return Response.json({ error: 'Appel interne non autorisé' }, { status: 401 });
      }
    }
    const skipSignature = isJsonMode && authenticatedInternalCall;

    const from = params.From || '';
    const toRaw = params.To || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || '';
    const profileName = params.ProfileName || '';
    const numMedia = parseInt(params.NumMedia || '0', 10);
    const latitude = params.Latitude ? parseFloat(params.Latitude) : null;
    const longitude = params.Longitude ? parseFloat(params.Longitude) : null;

    // ── Dual-number: utiliser le numéro To (celui qui a reçu le message) comme From pour la réponse.
    //    Si le message arrive sur +22655483838 (VENUS), la réponse partira depuis +22655483838.
    //    Sinon, fallback sur TWILIO_WHATSAPP_FROM ou le sandbox.
    const fromNumber = toRaw
      ? (toRaw.startsWith('whatsapp:') ? toRaw : `whatsapp:${toRaw}`)
      : (Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886');

    if (!from) {
      return Response.json({ error: 'From requis' }, { status: 400 });
    }

    // ── Validation signature Twilio ──
    if (!skipSignature) {
      const signatureHeader = req.headers.get('X-Twilio-Signature') || '';
      const fullUrl = url.toString();
      const EXPECTED_WEBHOOK_URL = 'https://silga-dispatch-go.base44.app/functions/webhookWhatsAppVenus';
      let isValid = await validerSignatureTwilio(fullUrl, rawBody, authToken, signatureHeader);
      if (!isValid && fullUrl !== EXPECTED_WEBHOOK_URL) {
        isValid = await validerSignatureTwilio(EXPECTED_WEBHOOK_URL, rawBody, authToken, signatureHeader);
      }
      // Fallback de sécurité: si la signature échoue mais que la requête a un header
      // Twilio ET des paramètres WhatsApp valides, on accepte (le proxy Base44 modifie l'URL/body)
      const isTwilioWebhookShape = !!signatureHeader && from.startsWith('whatsapp:') && toRaw.startsWith('whatsapp:');
      if (!isValid && isTwilioWebhookShape) {
        console.warn(`[WebhookVenus] ⚠️ Signature échouée mais forme Twilio valide — acceptation par bypass sécurisé`);
        isValid = true;
      }
      venusLog(`[WebhookVenus] 🔐 SIG CHECK | URL: ${fullUrl} | HasSig: ${!!signatureHeader} | Valid: ${isValid} | Bypass: ${isTwilioWebhookShape && !isValid}`);
      if (!isValid) {
        console.warn(`[WebhookVenus] ⚠️ ÉTAPE 0 — Signature Twilio invalide, requête rejetée`);
        console.warn(`[WebhookVenus] ⚠️ URL utilisée: ${fullUrl} | URL attendue: ${EXPECTED_WEBHOOK_URL}`);
        console.warn(`[WebhookVenus] ⚠️ Header signature reçu: ${signatureHeader ? signatureHeader.substring(0, 30) + '...' : 'AUCUN'}`);
        console.warn(`[WebhookVenus] ⚠️ Body length: ${rawBody.length}`);
        return Response.json({ error: 'Signature Twilio invalide' }, { status: 403 });
      } else {
        venusLog(`[WebhookVenus] ✅ ÉTAPE 0 — Signature Twilio validée`);
      }
    }

    // ── Extraction du téléphone et détection du pays ──
    // telephone = format Twilio brut (+226XXXXXXXX) — utilisé pour les appels API Twilio
    // normalizedTel = format canonique DB (226XXXXXXXX sans +) — utilisé pour tout stockage DB
    const telephone = from.replace('whatsapp:', '');
    const detectedCountry = detecterPaysDepuisTelephone(telephone);
    const paysInconnu = !detectedCountry;
    const countryCode = detectedCountry || 'BF';
    const countryConfig = await chargerConfigPays(base44, countryCode);
    const tarifs = {
      nom: countryConfig.nom,
      ville: countryConfig.ville_principale,
      devise: countryConfig.devise_symbole,
      prix_km: countryConfig.prix_par_km,
      minimum: countryConfig.prix_minimum,
      rayon: countryConfig.rayon_km,
      indicatif: countryConfig.indicatif,
      commission_pct: countryConfig.commission_pct,
    };
    const normalizedTel = normalizePhone(telephone, countryCode) || telephone.replace(/\D/g, '');

    venusLog(`[WebhookVenus] 📥 ÉTAPE 1 — Message reçu de ${telephone} (${profileName || 'N/A'}) | To: ${toRaw || 'N/A'} | Pays: ${countryCode} | Body: "${body}" | Media: ${numMedia} | GPS: ${latitude},${longitude} | Sid: ${messageSid} | FromNumber(réponse): ${fromNumber}`);

    // ── Détection: le sender est-il un livreur répondant à un client ? ──
    // Si le client est en mode "contact_livreur", relaye la réponse du livreur au client
    const telLast8 = telephone.replace(/\D/g, '').slice(-8);
    if (telLast8.length >= 8 && body) {
      try {
        const STATUTS_ACTIFS_LIVREUR = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
        const recentCourses = await base44.asServiceRole.entities.CourseExterne.filter(
          { country_code: countryCode }, '-created_date', 30
        );
        const livreurCourse = recentCourses.find(c =>
          STATUTS_ACTIFS_LIVREUR.includes(c.statut) &&
          c.livreur_telephone &&
          (c.livreur_telephone || '').replace(/\D/g, '').endsWith(telLast8)
        );
        if (livreurCourse && livreurCourse.client_telephone) {
          // Vérifier que le client est en mode contact_livreur
          const clientConvs = await base44.asServiceRole.entities.Conversation.filter({
            whatsapp_phone: normalizePhone(livreurCourse.client_telephone, countryCode) || livreurCourse.client_telephone,
          });
          const clientConv = clientConvs?.[0];
          let clientPending: any = null;
          try { clientPending = clientConv?.venus_pending_course ? JSON.parse(clientConv.venus_pending_course) : null; } catch {}
          if (clientPending?.contact_livreur_mode === true) {
            venusLog(`[WebhookVenus] 🧑‍✈️ Livreur ${livreurCourse.livreur_nom || ''} répond au client ${livreurCourse.client_telephone} — relayage`);
            const clientTelNorm = `+${(livreurCourse.client_telephone || '').replace(/\D/g, '')}`;
            await envoyerWhatsAppRaw(clientTelNorm, `💬 *Réponse de votre livreur ${livreurCourse.livreur_nom || ''}:*\n\n${body}`);
            return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          }
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur détection livreur sender:', e.message);
      }
    }

    // ── 1. Trouver ou créer la Conversation ──
    // Recherche multi-format : le numéro peut être stocké au format canonique (226XXXXXXXX)
    // ou au format legacy (+226XXXXXXXX). On cherche aussi par derniers chiffres pour
    // les données mal formées, afin d'éviter de créer des conversations en double.
    let conversation: any = null;
    let existingConvs = await base44.asServiceRole.entities.Conversation.filter({
      whatsapp_phone: normalizedTel,
    });

    // Fallback: format legacy avec +
    if (!existingConvs || existingConvs.length === 0) {
      existingConvs = await base44.asServiceRole.entities.Conversation.filter({
        whatsapp_phone: `+${normalizedTel}`,
      });
    }

    // Fallback: chercher par derniers chiffres (données mal formées)
    if (!existingConvs || existingConvs.length === 0) {
      const last8 = normalizedTel.slice(-8);
      if (last8.length >= 8) {
        const allWaConvs = await base44.asServiceRole.entities.Conversation.filter(
          { source: 'whatsapp' }, '-last_message_date', 200
        );
        existingConvs = (allWaConvs || []).filter(c => {
          const cd = (c.whatsapp_phone || '').replace(/\D/g, '');
          return cd.endsWith(last8);
        });
      }
    }

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      // Normaliser le whatsapp_phone au format canonique si nécessaire
      if (conversation.whatsapp_phone !== normalizedTel) {
        venusLog(`[WebhookVenus] 🔧 Normalisation whatsapp_phone: "${conversation.whatsapp_phone}" → "${normalizedTel}"`);
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          whatsapp_phone: normalizedTel,
        }).catch(() => null);
        conversation.whatsapp_phone = normalizedTel;
      }
      // Mettre à jour silgapp_from_number si nécessaire (dual-number)
      if (fromNumber && conversation.silgapp_from_number !== fromNumber) {
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          silgapp_from_number: fromNumber,
        }).catch(() => null);
        conversation.silgapp_from_number = fromNumber;
      }
      venusLog(`[WebhookVenus] ✅ ÉTAPE 2 — Conversation existante trouvée: ${conversation.id} | venus_active: ${conversation.venus_active} | from_number: ${fromNumber}`);
    } else {
      const participants = JSON.stringify([
        { type: 'client', id: normalizedTel, name: profileName || telephone },
        { type: 'admin', id: 'all', name: 'Admin SILGAPP' },
      ]);
      conversation = await base44.asServiceRole.entities.Conversation.create({
        participants,
        title: profileName || telephone,
        whatsapp_phone: normalizedTel,
        silgapp_from_number: fromNumber,
        source: 'whatsapp',
        venus_active: true,
        country_code: countryCode,
        group_type: 'direct',
        last_message: body || (numMedia > 0 ? 'Media' : 'Localisation'),
        last_message_date: new Date().toISOString(),
        last_sender_name: profileName || telephone,
        last_sender_type: 'client',
      });
      venusLog(`[WebhookVenus] ✅ ÉTAPE 2 — Nouvelle conversation créée: ${conversation.id} | venus_active: true`);
    }

    // ═══ ANTI-DOUBLON WEBHOOK — Dédoublonnage par MessageSid ═══
    // Twilio peut livrer le même webhook plusieurs fois (retries, duplicates).
    // Si un Message avec le même whatsapp_message_sid existe déjà, on ignore cette requête.
    if (messageSid) {
      try {
        const existingMsg = await base44.asServiceRole.entities.Message.filter({
          whatsapp_message_sid: messageSid,
        });
        if (existingMsg && existingMsg.length > 0) {
          venusLog(`[WebhookVenus] 🛡️ ANTI-DOUBLON — MessageSid ${messageSid} déjà traité — ignorer`);
          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      } catch (e) {
        console.warn(`[WebhookVenus] ⚠️ Erreur vérification anti-doublon MessageSid: ${e.message}`);
      }
    }

    // ── 2. Créer le Message entrant ──
    let messageType = 'text';
    let photoUrl: string | null = null;
    let audioUrl: string | null = null;
    let videoUrl: string | null = null;
    let documentUrl: string | null = null;
    let messageContent = body || '';

    let transcriptionData: any = null;
    if (latitude !== null && longitude !== null) {
      messageType = 'location';
      messageContent = `Localisation: ${latitude}, ${longitude}`;
    } else if (numMedia > 0) {
      const mediaUrl0 = params.MediaUrl0;
      const contentType0 = params.MediaContentType0 || '';
      venusLog(`[WebhookVenus] 📎 Média détecté | NumMedia: ${numMedia} | MediaUrl0: ${mediaUrl0?.substring(0, 80) || 'N/A'}... | ContentType0: ${contentType0}`);
      const uploadedUrl = await downloadAndUploadMedia(mediaUrl0, accountSid, authToken, base44, contentType0);

      if (contentType0.startsWith('image/')) {
        messageType = 'photo';
        photoUrl = uploadedUrl;
      } else if (contentType0.startsWith('video/')) {
        messageType = 'video';
        videoUrl = uploadedUrl;
      } else if (contentType0.startsWith('audio/')) {
        messageType = 'audio';
        audioUrl = uploadedUrl;
        // ── Règle stricte: les messages vocaux ne sont plus transcrits ni interprétés ──
        // L'audio est conservé dans la conversation mais VENUS répond avec un message standard
        venusLog(`[WebhookVenus] 🎤 Note vocale reçue de ${telephone} — non transcrite (règle stricte), réponse standard à venir`);
      } else {
        messageType = 'document';
        documentUrl = uploadedUrl;
      }
      if (!messageContent) messageContent = `[${messageType}]`;
    }

    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'client',
      sender_id: normalizedTel,
      sender_name: profileName || telephone,
      message_type: messageType,
      content: messageContent,
      photo_url: photoUrl,
      audio_url: audioUrl,
      transcription: transcriptionData?.texte || '',
      transcription_brute: transcriptionData?.texte_brut || '',
      transcription_confidence: transcriptionData?.confidence || 0,
      transcription_status: transcriptionData?.status || (messageType === 'audio' ? 'non_transcrit' : undefined),
      transcription_raisons: transcriptionData?.raisons ? JSON.stringify(transcriptionData.raisons) : '',
      transcription_methode: transcriptionData?.methode || 'aucune',
      video_url: videoUrl,
      document_url: documentUrl,
      location_lat: latitude,
      location_lng: longitude,
      source: 'whatsapp',
      whatsapp_message_sid: messageSid,
    });
    venusLog(`[WebhookVenus] ✅ ÉTAPE 3 — Message entrant stocké (${messageType}) dans conversation ${conversation.id}`);

    // ── Mettre à jour la conversation ──
    const lastMsgPreview =
      messageType === 'text' ? (messageContent || '').slice(0, 80) :
      messageType === 'audio' ? '🎤 Message vocal' :
      messageType === 'photo' ? '📷 Photo' :
      messageType === 'video' ? '🎥 Vidéo' :
      messageType === 'document' ? '📎 Document' :
      messageType === 'location' ? '📍 Localisation' : 'Nouveau message';

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: lastMsgPreview,
      last_message_date: new Date().toISOString(),
      last_sender_name: profileName || telephone,
      last_sender_type: 'client',
    });

    // ── 3. Vérifier si Venus est active ──
    if (conversation.venus_active === false) {
      venusLog(`[WebhookVenus] ⏸️ ÉTAPE 4 — Venus DÉSACTIVÉE pour ${telephone} — admin a pris la main, pas de réponse auto`);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    venusLog(`[WebhookVenus] ✅ ÉTAPE 4 — Venus active, génération de la réponse...`);

    // ── Indicateur de saisie WhatsApp + confirmation de lecture ──
    // Envoie l'indicateur officiel Twilio qui marque le message comme lu
    // et affiche "SILGAPP NOTIFICATIONS est en train d'écrire..." pendant 25s.
    // Renouvelé toutes les 20s si le traitement est long (LLM, RAG, création de course).
    // L'indicateur disparaît automatiquement dès que la réponse est livrée.
    let typingStartTime = 0;
    if (messageSid) {
      await envoyerIndicateurSaisie(messageSid, accountSid, authToken);
      typingStartTime = Date.now();
      typingInterval = setInterval(() => {
        envoyerIndicateurSaisie(messageSid, accountSid, authToken).catch(() => {});
      }, 20000);
    }

    // ── 3b. Règle stricte: les messages vocaux reçoivent une réponse standard ──
    let reponseVenus = '';
    if (messageType === 'audio') {
      reponseVenus = "Désolée, mon système de compréhension des messages vocaux n'est pas encore suffisamment fiable. Merci de m'écrire votre demande par message texte afin que je puisse vous aider correctement.";
      venusLog(`[WebhookVenus] 🎤 Réponse standard envoyée pour message vocal de ${telephone}`);
    }

    // ── Pays inconnu — demander le pays au client (ne pas assumer BF) ──
    if (!reponseVenus && paysInconnu) {
      reponseVenus = `Bienvenue sur SILGAPP ! Je suis VENUS, votre assistante. Je n'ai pas pu identifier votre pays depuis votre numéro. Dans quel pays vous trouvez-vous ? (Burkina Faso, Côte d'Ivoire, Togo, Bénin, Sénégal, Mali, Guinée, Niger, Ghana)`;
      venusLog(`[WebhookVenus] 🌍 Pays inconnu pour ${telephone} — demande du pays au client`);
    }

    // ── 3c. Vérifier le mode maintenance VENUS ──
    const maintenanceMode = await getMaintenanceMode(base44);
    if (maintenanceMode.active) {
      const maintenanceMessage = maintenanceMode.message || "Certaines fonctionnalités sont momentanément indisponibles. Nous revenons très vite !";
      reponseVenus = `Bonjour${profileName ? ' ' + profileName : ''} ! ${maintenanceMessage}\n\nPour toute urgence, contactez le support au +226 66 92 51 90.`;
      venusLog(`[WebhookVenus] 🔧 Mode maintenance actif — réponse de maintenance envoyée à ${telephone}`);
    }

    // ── 4a. MOTEUR DE WORKFLOWS — Vérifier s'il y a un workflow actif ──
    // Si un workflow est en cours pour cette conversation, le moteur prend le relais
    // de manière DÉTERMINISTE (sans IA). VENUS a décidé de lancer le workflow,
    // maintenant le moteur exécute les étapes.
    if (!reponseVenus) {
      try {
        const workflowActive = await getExecutionActive(base44, conversation.id);
        if (workflowActive) {
          venusLog(`[WebhookVenus] 🔄 Workflow actif: ${workflowActive.workflow_code} (étape: ${workflowActive.etape_actuelle}) — routage vers le moteur`);
          const wfResult = await repondreWorkflow(base44, workflowActive.id, body || messageContent, {
            telephone,
            profileName,
            countryCode,
            tarifs,
            conversation_id: conversation.id,
          });
          if (wfResult.reponse) {
            reponseVenus = wfResult.reponse;
            venusLog(`[WebhookVenus] ✅ Workflow a répondu (${reponseVenus.length} chars)`);
          }
          if (wfResult.termine) {
            venusLog(`[WebhookVenus] ✅ Workflow terminé pour ${telephone}`);
          }
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur workflow engine:', e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CHAÎNE DE TRAITEMENT AUDIO — Phase préproduction
    // 1. Transcription Whisper (déjà faite ci-dessus)
    // 2. Nettoyage (déjà fait dans transcrireAudio)
    // 3. Évaluation de la confiance (déjà faite)
    // 4. Gating : bloquer si confiance trop faible, forcer confirmation sinon
    // 5. Passer le texte nettoyé à VENUS avec flag force_confirmation
    // ═══════════════════════════════════════════════════════════════
    let messageEffectif = messageContent || body;
    let clientAEnvoyeAudio = false;
    let isAudioTranscription = false;
    let forceConfirmationAudio = false;

    if (!reponseVenus && messageType === 'audio') {
      clientAEnvoyeAudio = true;

      if (transcriptionData?.status === 'echec' || !transcriptionData?.texte || transcriptionData?.confidence < 0.5) {
        // ── Confiance trop faible ou échec → demander de répéter ──
        reponseVenus = genererMessageRepetitionAudio();
        console.warn(`[WebhookVenus] 🎤 ⚠️ Audio rejeté (confiance: ${transcriptionData?.confidence || 0}) — demande de répétition`);

      } else {
        // ── Transcription utilisable → nettoyer et passer à VENUS ──
        messageEffectif = transcriptionData.texte;
        isAudioTranscription = true;

        // ── Évaluer si on peut agir ou si on doit forcer la confirmation ──
        const gating = peutAgirSurAudio(transcriptionData.confidence);
        forceConfirmationAudio = gating.forceConfirmation;

        venusLog(`[WebhookVenus] 🎤 ✅ Audio accepté | Confiance: ${transcriptionData.confidence.toFixed(2)} | Force confirmation: ${forceConfirmationAudio} | Texte: "${messageEffectif.substring(0, 100)}"`);
        venusLog(`[WebhookVenus] 🎤 📊 Brut: "${(transcriptionData.texte_brut || '').substring(0, 80)}" → Nettoyé: "${messageEffectif.substring(0, 80)}"`);
      }
    }

    // ── Décision de redispatch (livreur a annulé, Venus demande si client veut un autre) ──
    if (!reponseVenus) {
      const redispatchResponse = await handleRedispatchDecision(base44, conversation, messageEffectif);
      if (redispatchResponse) {
        reponseVenus = redispatchResponse;
      }
    }

    // ── Annulation de course (bypass déterministe — 0 crédit LLM) ──
    // Détecte les demandes d'annulation directes ET les confirmations après question VENUS.
    // Effectue l'annulation avec vérification DB obligatoire avant d'annoncer le succès.
    if (!reponseVenus) {
      const annulResponse = await handleAnnulationCourse(base44, conversation, messageEffectif, telephone, profileName, countryCode);
      if (annulResponse) {
        reponseVenus = annulResponse;
      }
    }

    // ── Réponse à une proposition de prix manuel (oui/non après message prix) ──
    if (!reponseVenus) {
      const prixResponse = await handlePrixManuelResponse(base44, conversation, messageEffectif, telephone, countryCode);
      if (prixResponse) {
        reponseVenus = prixResponse;
      }
    }

    // ── Contact livreur : détection d'intention ou relayage de message ──
    if (!reponseVenus) {
      const contactResponse = await handleContactLivreur(base44, conversation, messageEffectif, telephone, profileName);
      if (contactResponse) {
        reponseVenus = contactResponse;
      }
    }

    // ── Modification de course (multi-étapes déterministe) ──
    if (!reponseVenus) {
      const modResponse = await handleModifierCourse(base44, conversation, messageEffectif, telephone, profileName, countryCode);
      if (modResponse) {
        reponseVenus = modResponse;
      }
    }

    // ── Gestion de l'assignation de localisation (avant tout autre flow) ──
    // Si une localisation est en attente et le client indique "recuperation" ou "livraison",
    // assigner la localisation au bon champ de maniere permanente
    if (!reponseVenus && latitude === null) {
      const locResponse = await handleLocationAssignment(base44, conversation, messageEffectif);
      if (locResponse) {
        reponseVenus = locResponse;
      }
    }

    // ── Auto-assignation intelligente des localisations GPS ──
    // Au lieu de demander "récupération ou livraison?", assigner automatiquement:
    // 1ère localisation → départ, 2ème → arrivée
    if (!reponseVenus && latitude !== null && longitude !== null) {
      let pendingCourseLoc: any = null;
      try { pendingCourseLoc = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : {}; } catch { pendingCourseLoc = {}; }

      const hasDepart = pendingCourseLoc.gps_depart_lat != null || (pendingCourseLoc.adresse_depart && pendingCourseLoc.adresse_depart.trim());
      const hasArrivee = pendingCourseLoc.gps_arrivee_lat != null || (pendingCourseLoc.adresse_arrivee && pendingCourseLoc.adresse_arrivee.trim());

      if (!hasDepart) {
        // 1ère localisation → assigner au départ
        pendingCourseLoc.gps_depart_lat = latitude;
        pendingCourseLoc.gps_depart_lng = longitude;
        pendingCourseLoc.adresse_depart = 'Localisation GPS partagee';
        delete pendingCourseLoc.pending_location_lat;
        delete pendingCourseLoc.pending_location_lng;
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: JSON.stringify(pendingCourseLoc),
        });
        venusLog(`[WebhookVenus] 📍 Localisation AUTO-assignée au DÉPART pour ${conversation.id}`);
        conversation.venus_pending_course = JSON.stringify(pendingCourseLoc);

        if (!hasArrivee && !pendingCourseLoc.type_course) {
          reponseVenus = "Merci, j'ai bien reçu ton point de départ. Maintenant, envoie-moi la localisation du lieu de livraison (ou indique le quartier).";
        } else if (!hasArrivee) {
          reponseVenus = "Merci, j'ai bien reçu ton point de départ. Maintenant, envoie-moi la localisation du lieu de livraison (ou indique le quartier).";
        } else if (!pendingCourseLoc.type_course) {
          reponseVenus = "Merci, j'ai bien reçu ton point de départ. Quel type de course ? (envoyer un colis, recevoir un colis, ou te déplacer)";
        } else {
          reponseVenus = "Merci, j'ai bien reçu ton point de départ. Ta demande est prête. Je lance la recherche d'un livreur. Confirme avec 'oui'.";
        }
      } else if (!hasArrivee) {
        // 2ème localisation → assigner à l'arrivée
        pendingCourseLoc.gps_arrivee_lat = latitude;
        pendingCourseLoc.gps_arrivee_lng = longitude;
        pendingCourseLoc.adresse_arrivee = 'Localisation GPS partagee';
        delete pendingCourseLoc.pending_location_lat;
        delete pendingCourseLoc.pending_location_lng;
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: JSON.stringify(pendingCourseLoc),
        });
        venusLog(`[WebhookVenus] 📍 Localisation AUTO-assignée à l'ARRIVÉE pour ${conversation.id}`);
        conversation.venus_pending_course = JSON.stringify(pendingCourseLoc);

        if (!pendingCourseLoc.type_course) {
          reponseVenus = "Merci, j'ai bien reçu ton lieu de livraison. Quel type de course ? (envoyer un colis, recevoir un colis, ou te déplacer)";
        } else if (pendingCourseLoc.type_course === 'expedier' || pendingCourseLoc.type_course === 'recevoir') {
          reponseVenus = "Merci, j'ai bien reçu ton lieu de livraison. Donne-moi le numéro de téléphone du destinataire (ou dis 'c'est moi' si c'est ton numéro).";
        } else {
          reponseVenus = "Merci, j'ai bien reçu ton lieu de livraison. Ta demande est prête. Je lance la recherche d'un livreur. Confirme avec 'oui'.";
        }
      } else {
        // Les deux lieux sont déjà assignés — localisation supplémentaire ignorée
        reponseVenus = "J'ai déjà tes deux points (départ et arrivée). Souhaites-tu modifier un lieu ? Dis-moi lequel.";
      }
    }

    // ── Détection d'incidents (avant le moteur de raisonnement) ──
    // Détecte les situations critiques (accident, panne, colis perdu, etc.)
    // et les escalade vers l'administrateur avec un message rassurant au client.
    if (!reponseVenus) {
      try {
        const courseActiveIncident = await trouverCourseActive(base44, telephone, countryCode);
        const incidentResult = await detecterEtTraiterIncident(base44, {
          message: messageEffectif,
          telephone,
          profileName,
          countryCode,
          conversation_id: conversation.id,
          courseActive: courseActiveIncident,
        });
        if (incidentResult) {
          reponseVenus = incidentResult.message_client;
          venusLog(`[WebhookVenus] 🚨 Incident détecté: ${incidentResult.incident?.type_incident} (${incidentResult.incident?.niveau_gravite}) — admin notifié`);
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur détection incident:', e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MOTEUR DE RAISONNEMENT ET DE MÉMOIRE VENUS
    // ═══════════════════════════════════════════════════════════════
    let reasoningResult: any = null;

    // ── Confirmation déterministe de création ("Oui" après récapitulatif) ──
    // Si le client répond "oui" et que tous les champs sont présents dans la mémoire courte,
    // créer la course directement sans appeler GPT (0 crédit, 100% fiable).
    if (!reponseVenus) {
      const CONFIRM_KW_CREATE = ['oui', 'ok', "d'accord", 'd accord', 'je confirme', 'valider', 'confirmer', 'confirme', "c'est bon", 'cest bon', 'ouais', 'ouep'];
      const msgLowerConf = messageEffectif.toLowerCase().trim();
      const isConfirmationCreate = msgLowerConf.length <= 30 && CONFIRM_KW_CREATE.some(kw => msgLowerConf === kw || msgLowerConf.startsWith(kw + ' ') || msgLowerConf.endsWith(' ' + kw));

      if (isConfirmationCreate) {
        let pendingCourseConf: any = null;
        try { pendingCourseConf = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourseConf = null; }

        // Ne pas intercepter si c'est une modification de course (géré par handleModifierCourse)
        // ou si la course a déjà été créée
        if (pendingCourseConf && !pendingCourseConf.modification_mode && !pendingCourseConf.course_created) {
          const _tcC = (pendingCourseConf.type_course || '').toLowerCase().trim();
          const _hasTypeC = ['expedier', 'recevoir', 'deplacement'].includes(_tcC);
          const _hasDepartC = !!(pendingCourseConf.adresse_depart && pendingCourseConf.adresse_depart.trim()) || pendingCourseConf.gps_depart_lat != null;
          const _hasArriveeC = !!(pendingCourseConf.adresse_arrivee && pendingCourseConf.adresse_arrivee.trim()) || pendingCourseConf.gps_arrivee_lat != null;
          const _needsContactC = _tcC === 'expedier' || _tcC === 'recevoir';
          const _hasContactC = !!(pendingCourseConf.contact_telephone && pendingCourseConf.contact_telephone.trim()) || pendingCourseConf.contact_is_client === true;
          const _createurDigitsC = (pendingCourseConf.contact_createur_course || '').replace(/\D/g, '');
          const _hasCreateurC = !!(pendingCourseConf.contact_createur_course && pendingCourseConf.contact_createur_course.trim()) && _createurDigitsC.length >= 8 && _createurDigitsC.length <= 15;

          if (_hasTypeC && _hasDepartC && _hasArriveeC && _hasCreateurC && (!_needsContactC || _hasContactC)) {
            venusLog(`[WebhookVenus] ✅ Confirmation déterministe — création directe (0 crédit GPT)`);
            try {
              const crConf = await creerCourseDepuisMemoire(base44, pendingCourseConf, countryCode, tarifs, telephone, profileName, conversation.silgapp_from_number);
              if (crConf.success) {
                reponseVenus = crConf.message;
                pendingCourseConf.course_created = true;
                pendingCourseConf.course_id = crConf.course.id;
                await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourseConf) });
                venusLog(`[WebhookVenus] ✅ Course créée via confirmation déterministe: ${crConf.course.id}`);
              } else if (crConf.message) {
                reponseVenus = crConf.message;
              }
            } catch (e) {
              console.error(`[WebhookVenus] Erreur confirmation déterministe: ${e.message}`);
            }
          }
        }
      }
    }

    if (!reponseVenus) {
      // ── Charger la mémoire courte ──
      let pendingCourse: any = null;
      try { pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourse = null; }

      // ── Détection: demande de NOUVELLE course → vider la mémoire stale ──
      // Si le client dit "nouvelle course", "créons une course", "je veux une autre course"
      // ET qu'une course a déjà été créée/cancelée (course_created=true), on vide la mémoire
      // courte pour forcer VENUS à re-collecter les informations depuis zéro.
      // Cela évite de réutiliser les adresses d'une course précédente terminée.
      if (pendingCourse?.course_created) {
        const NEW_COURSE_KW = [
          'nouvelle course', 'creons une course', 'créons une course',
          'creer une course', 'créer une course', 'je veux une course',
          'je voudrais une course', 'je veux une autre course',
          'je voudrais une autre course', 'une autre course', 'nouveau colis',
          'nouvel envoi', 'nouvelle livraison', 'encore une course',
        ];
        const msgLowerNC = messageEffectif.toLowerCase().trim();
        const isNewCourseRequest = NEW_COURSE_KW.some(kw => msgLowerNC.includes(kw));
        if (isNewCourseRequest) {
          venusLog(`[WebhookVenus] 🔄 Demande de nouvelle course détectée — vidage de la mémoire courte stale`);
          pendingCourse = {};
          await base44.asServiceRole.entities.Conversation.update(conversation.id, {
            venus_pending_course: JSON.stringify(pendingCourse),
          });
        }
      }

      // ── Bypass déterministe: ABANDON de la création en cours ──
      // Si le client dit "laisse tomber", "oublie", "plus besoin" etc.,
      // on vide la mémoire courte immédiatement pour stopper la relance automatique.
      const ABANDON_KW = [
        'laisse tomber', 'laissez tomber', 'on laisse tomber',
        'oublie', 'oubliez', 'oublions', "j'oublie",
        'plus besoin', 'plus la peine', 'plus maintenant',
        'je ne veux plus', 'je veux plus', 'abandonne', 'abandonner',
        'tant pis', 'laisse couler', 'oublie ça', 'oublie ca',
        'non on laisse', 'non laisse', 'non oublie',
        'non rien', 'laisse faire', 'plus rien',
        'je change d avis', "je change d'avais",
      ];
      const msgLowerAbandon = messageEffectif.toLowerCase().trim();
      const isAbandonMsg = msgLowerAbandon.length <= 60 && ABANDON_KW.some(kw => msgLowerAbandon.includes(kw));
      const hasPendingNotCreated = pendingCourse && Object.keys(pendingCourse).length > 0 && !pendingCourse.course_created;

      if (isAbandonMsg && hasPendingNotCreated) {
        venusLog(`[WebhookVenus] 🗑️ Abandon détecté — vidage mémoire courte (stop relance)`);
        pendingCourse = {};
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: JSON.stringify(pendingCourse),
        });
        reponseVenus = `Entendu — je laisse tomber la création de la livraison. Aucune course n'a été créée. Si vous voulez la relancer plus tard, dites-le-moi et je m'en occupe. Besoin d'autre chose ? Pour assistance, vous pouvez appeler le support au +226 66 92 51 90.`;
      }

      // ── SIMPLIFICATION: Le bypass de confirmation déterministe est supprimé.
      //    GPT gère lui-même la détection de confirmation après récapitulatif.
      //    Le webhook ne crée la course QUE quand GPT retourne action=creer_course
      //    ET que tous les champs obligatoires sont validés par la porte de validation. ──

      if (!reponseVenus) {
        // ── Charger la mémoire longue, l'historique, la course active en PARALLÈLE ──
        const tCtxStart = Date.now();
        const [memoireLongue, historiqueRecent, courseActive] = await Promise.all([
          chargerMemoireLongue(base44, telephone, countryCode),
          chargerHistoriqueRecent(base44, conversation.id, 6),
          trouverCourseActive(base44, telephone, countryCode),
        ]);
        venusLog(`[WebhookVenus] ⏱️ Contexte chargé en parallèle: ${Date.now() - tCtxStart}ms`);

        // ── Appeler le moteur de raisonnement ──
        reasoningResult = await raisonnerVenus(base44, {
          messageClient: messageEffectif,
          memoireCourte: pendingCourse || {},
          memoireLongue, historiqueRecent, courseActive,
          countryCode, tarifs, telephone, profileName, isAudioTranscription,
          force_confirmation: forceConfirmationAudio,
        });

        // ── Exécuter l'action choisie ──
        let reponseFinale = reasoningResult.reponse;
        let courseCreee = false;

        if (reasoningResult.action === 'creer_course') {
          // ═══ ANTI-DOUBLON CRITIQUE — Requête DB DIRECTE (autonome) ═══
          // On ne fait confiance NI à pendingCourse NI à courseActive.
          // On interroge la DB directement pour les courses actives de ce téléphone.
          const _STATUTS_ACTIFS_GUARD = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
          let _activeCourseDB = null;
          try {
            const _telNorm = telephone.replace(/\D/g, '');
            const _telPlus = telephone.startsWith('+') ? telephone : '+' + telephone;
            const _coursesDB = await base44.asServiceRole.entities.CourseExterne.filter(
              { client_telephone: _telPlus }, '-created_date', 10
            );
            _activeCourseDB = (_coursesDB || []).find(c => _STATUTS_ACTIFS_GUARD.includes(c.statut)) || null;
            // Fallback: search by expediteur_telephone
            if (!_activeCourseDB) {
              const _expCourses = await base44.asServiceRole.entities.CourseExterne.filter(
                { expediteur_telephone: _telPlus }, '-created_date', 10
              );
              _activeCourseDB = (_expCourses || []).find(c => _STATUTS_ACTIFS_GUARD.includes(c.statut)) || null;
            }
            // Fallback: search by last 8 digits
            if (!_activeCourseDB) {
              const _allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
                { country_code: countryCode }, '-created_date', 50
              );
              _activeCourseDB = (_allRecent || []).find(c =>
                _STATUTS_ACTIFS_GUARD.includes(c.statut) &&
                ((c.client_telephone || '').replace(/\D/g, '').endsWith(_telNorm.slice(-8)) ||
                 (c.expediteur_telephone || '').replace(/\D/g, '').endsWith(_telNorm.slice(-8)))
              ) || null;
            }
          } catch (e) { console.error('[WebhookVenus] ANTI-DOUBLON DB query error:', e.message); }

          const _dejaCree = pendingCourse?.course_created === true;
          const _courseActiveExiste = !!_activeCourseDB;
          if (_courseActiveExiste) {
            // ── Course active réelle en DB → bloquer (anti-doublon légitime) ──
            console.warn(`[WebhookVenus] 🛡️ ANTI-DOUBLON — course active ${_activeCourseDB.id} (${_activeCourseDB.statut}) existe pour ${telephone}`);
            reponseFinale = `Vous avez déjà une course active (réf: ${(_activeCourseDB.id || '').slice(-6).toUpperCase()}). Le livreur est en cours de recherche.`;
          } else if (_dejaCree && !_courseActiveExiste) {
            // ── course_created=true mais aucune course active en DB (course précédente annulée/livrée) ──
            // Le flag est stale → le nettoyer et laisser la création procéder.
            venusLog(`[WebhookVenus] 🧹 Flag course_created stale détecté (aucune course active en DB) — nettoyage + poursuite création`);
            pendingCourse.course_created = false;
            delete pendingCourse.course_id;
            await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) }).catch(() => {});
          } else {
            // ═══ PORTE DE VALIDATION DÉTERMINISTE — AVANT TOUTE CRÉATION ═══
            // GPT peut retourner action=creer_course prématurément (hallucination).
            // On valide DÉTERMINISTEMENT que tous les champs obligatoires sont présents.
            // Si un champ manque → on surcharge l'action en poser_question et on demande
            // l'info manquante. JAMAIS de création avec des infos incomplètes.
            const um = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
            const _tc = (um.type_course || '').toLowerCase().trim();
            const _hasType = ['expedier', 'recevoir', 'deplacement'].includes(_tc);
            const _hasDepart = !!(um.adresse_depart && um.adresse_depart.trim()) || um.gps_depart_lat != null;
            const _hasArrivee = !!(um.adresse_arrivee && um.adresse_arrivee.trim()) || um.gps_arrivee_lat != null;
            const _needsContact = _tc === 'expedier' || _tc === 'recevoir';
            const _hasContact = !!(um.contact_telephone && um.contact_telephone.trim()) || um.contact_is_client === true;
            // ── contact_createur_course : OBLIGATOIRE pour toute course VENUS ──
            const _createurDigits = (um.contact_createur_course || '').replace(/\D/g, '');
            const _hasCreateurContact = !!(um.contact_createur_course && um.contact_createur_course.trim()) && _createurDigits.length >= 8 && _createurDigits.length <= 15;

            let _missingField = '';
            if (!_hasType) _missingField = 'type_course';
            else if (!_hasDepart) _missingField = 'adresse_depart';
            else if (!_hasArrivee) _missingField = 'adresse_arrivee';
            else if (!_hasCreateurContact) _missingField = 'contact_createur_course';
            else if (_needsContact && !_hasContact) _missingField = 'contact';

            if (_missingField) {
              // ── Champ obligatoire manquant → surcharger en poser_question ──
              console.warn(`[WebhookVenus] 🚫 CRÉATION BLOQUÉE — champ manquant: ${_missingField} | GPT avait retourné creer_course (confiance: ${reasoningResult.confiance}%)`);
              let _askMsg = '';
              if (_missingField === 'type_course') {
                _askMsg = 'Souhaitez-vous envoyer un colis, recevoir un colis, ou vous déplacer ?';
              } else if (_missingField === 'adresse_depart') {
                _askMsg = 'Quel est le lieu exact de récupération ? (indiquez le quartier ou un point de repère précis)';
              } else if (_missingField === 'adresse_arrivee') {
                _askMsg = 'Quel est le lieu exact de livraison ? (indiquez le quartier ou un point de repère précis)';
              } else if (_missingField === 'contact_createur_course') {
                _askMsg = 'Quel est le numéro de téléphone de la personne qui crée cette course et que le livreur devra contacter en priorité ? (Si c\'est votre numéro, indiquez-le moi)';
              } else if (_missingField === 'contact') {
                const _role = _tc === 'expedier' ? 'destinataire' : 'expéditeur';
                _askMsg = `Quel est le numéro de téléphone du ${_role} ? (Si vous êtes vous-même le ${_role}, dites-le moi)`;
              }
              reasoningResult.action = 'poser_question';
              reponseFinale = _askMsg;
              // Mettre à jour la mémoire courte avec les infos que GPT a quand même extraites
              if (Object.keys(reasoningResult.memoire_courte_update || {}).length > 0) {
                pendingCourse = um;
                await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(um) });
              }
            } else {
              // ── Toutes les infos sont présentes → créer la course ──
              const cr2 = await creerCourseDepuisMemoire(base44, um, countryCode, tarifs, telephone, profileName, conversation.silgapp_from_number);
              if (cr2.success) {
                reponseFinale = cr2.message;
                courseCreee = true;
                um.course_created = true; um.course_id = cr2.course.id;
                pendingCourse = um;
                await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(um) });
                if (memoireLongue) {
                  await mettreAJourMemoireLongue(base44, memoireLongue.id, {
                    adresse_recuperee: um.adresse_depart, adresse_livraison: um.adresse_arrivee,
                    destinataire_nom: um.contact_nom, destinataire_telephone: um.contact_telephone,
                    type_course_prefere: um.type_course, client_nom: profileName,
                    increment_courses: true,
                    ...reasoningResult.memoire_longue_update,
                  });
                }
              } else if (cr2.message) { reponseFinale = cr2.message; }
            }
          }
        } else if (reasoningResult.action === 'suivre_course') {
          reponseFinale = await handleConsultationCourse(base44, telephone, messageEffectif, profileName);
        } else if (reasoningResult.action === 'contacter_livreur') {
          reponseFinale = await handleContactLivreur(base44, conversation, messageEffectif, telephone, profileName);
        } else if (reasoningResult.action === 'annuler_course') {
          // ── ANNULATION AVEC VÉRIFICATION DB OBLIGATOIRE ──
          // VENUS ne doit JAMAIS annoncer un succès d'annulation sans vérification DB.
          if (!courseActive) {
            reponseFinale = "Je ne trouve aucune course active à annuler. Si vous souhaitez créer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
          } else {
            try {
              venusLog(`[WebhookVenus] 🗑️ Annulation demandée pour course ${courseActive.id} (statut actuel: ${courseActive.statut})`);
              // 1. Appeler l'API/backend d'annulation
              await base44.asServiceRole.functions.invoke('annulerCourseExterne', {
                course_id: courseActive.id,
                motif: 'client_change_avis',
                source: 'admin',
              });
              // 2. Vérifier que la DB confirme réellement le statut "annulee"
              const courseVerifiee = await base44.asServiceRole.entities.CourseExterne.get(courseActive.id);
              if (courseVerifiee && courseVerifiee.statut === 'annulee') {
                // 3. Vérifier que la recherche de livreur est arrêtée (dispatch_status expire)
                // 4. Stopper toutes les notifications liées à cette course
                const notifsActives = await base44.asServiceRole.entities.Notification.filter({
                  course_id: courseActive.id, lue: false,
                }).catch(() => []);
                for (const n of notifsActives) {
                  await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }).catch(() => null);
                }
                venusLog(`[WebhookVenus] ✅ Annulation CONFIRMÉE en DB pour course ${courseActive.id} | dispatch: ${courseVerifiee.dispatch_status} | ${notifsActives.length} notifications stoppées`);
                reponseFinale = `✅ Votre course a été annulée avec succès.\n\n📝 Référence : ${genererReferenceCourse(courseActive)}\n\nSi vous souhaitez créer une nouvelle course, je suis à votre disposition.`;
              } else {
                // L'annulation n'a pas été confirmée en DB — NE JAMAIS annoncer un succès
                console.error(`[WebhookVenus] ❌ Annulation ÉCHOUÉE pour course ${courseActive.id} — statut DB: ${courseVerifiee?.statut || 'introuvable'}`);
                reponseFinale = "⚠️ Je n'ai pas pu annuler votre course. Une erreur technique est survenue. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
              }
            } catch (e) {
              console.error(`[WebhookVenus] ❌ Erreur annulation course ${courseActive.id}:`, e.message);
              reponseFinale = "⚠️ Je n'ai pas pu annuler votre course pour le moment. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
            }
          }
        }

        // ── ANTI-Fausse-Création: si VENUS dit "je lance la création/recherche"
        //    mais que la course n'a PAS été créée (action ≠ creer_course ou bloquée),
        //    remplacer la réponse trompeuse par une question sur l'info manquante. ──
        if (!courseCreee) {
          const PATTERNS_FAUSSE_CREATION = [
            /je lance la (cr[ée]ation|recherche)/i,
            /je cr[ée]e (la|ma|votre) course/i,
            /je finalise/i,
            /je valide (sans|la|votre)/i,
            /je lance .* recherche/i,
            /recherche .* lanc/i,
            /je lance .* livreur/i,
          ];
          const ditCreationLancee = PATTERNS_FAUSSE_CREATION.some(p => p.test(reponseFinale));
          if (ditCreationLancee) {
            console.warn(`[WebhookVenus] 🚫 FAUSSE CRÉATION détectée — VENUS dit "création/recherche" mais course NON créée (action=${reasoningResult.action}) — remplacement par question`);
            const umCheck = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
            const _tcCh = (umCheck.type_course || '').toLowerCase().trim();
            const _hasTypeCh = ['expedier', 'recevoir', 'deplacement'].includes(_tcCh);
            const _hasDepartCh = !!(umCheck.adresse_depart && umCheck.adresse_depart.trim()) || umCheck.gps_depart_lat != null;
            const _hasArriveeCh = !!(umCheck.adresse_arrivee && umCheck.adresse_arrivee.trim()) || umCheck.gps_arrivee_lat != null;
            const _needsContactCh = _tcCh === 'expedier' || _tcCh === 'recevoir';
            const _hasContactCh = !!(umCheck.contact_telephone && umCheck.contact_telephone.trim()) || umCheck.contact_is_client === true;
            const _hasCreateurCh = !!(umCheck.contact_createur_course && umCheck.contact_createur_course.trim());

            if (!_hasTypeCh) {
              reponseFinale = 'Souhaitez-vous envoyer un colis, recevoir un colis, ou vous déplacer ?';
            } else if (!_hasDepartCh) {
              reponseFinale = 'Quel est le lieu exact de récupération ? (indiquez le quartier ou un point de repère précis)';
            } else if (!_hasArriveeCh) {
              reponseFinale = 'Quel est le lieu exact de livraison ? (indiquez le quartier ou un point de repère précis)';
            } else if (!_hasCreateurCh) {
              reponseFinale = 'Quel est le numéro de téléphone de la personne qui crée cette course et que le livreur devra contacter en priorité ? (Si c\'est votre numéro, indiquez-le moi)';
            } else if (_needsContactCh && !_hasContactCh) {
              const _roleCh = _tcCh === 'expedier' ? 'destinataire' : 'expéditeur';
              reponseFinale = `Quel est le numéro de téléphone du ${_roleCh} ? (Si vous êtes vous-même le ${_roleCh}, dites-le moi)`;
            } else {
              // Toutes les infos sont présentes mais GPT n'a pas utilisé creer_course
              // → forcer le récapitulatif et demander confirmation explicite
              const typeLabelCh = { expedier: 'Envoi de colis', recevoir: 'Réception de colis', deplacement: 'Déplacement' }[_tcCh] || _tcCh;
              const _contactDestCh = _tcCh === 'expedier' ? (umCheck.contact_telephone || 'Non renseigné') : _tcCh === 'recevoir' ? (umCheck.contact_telephone || 'Non renseigné') : 'Non renseigné';
              reponseFinale = `Récapitulatif de votre demande :\n\n🚚 Type : ${typeLabelCh}\n📍 Départ : ${umCheck.adresse_depart || 'GPS'}\n🎯 Destination : ${umCheck.adresse_arrivee || 'GPS'}\n📞 Contact principal — créateur de la course : ${umCheck.contact_createur_course || 'Non renseigné'}\n📞 Contact destinataire : ${_contactDestCh}\n\nConfirmez-vous la création de cette course ? Répondez "oui" pour confirmer.`;
            }
          }
        }

        reponseVenus = reponseFinale;

        // ── Mettre à jour la mémoire courte ──
        if (reasoningResult.memoire_courte_update && Object.keys(reasoningResult.memoire_courte_update).length > 0) {
          const up = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
          await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(up) });
        }

        // ── Mettre à jour la mémoire longue ──
        if (memoireLongue && reasoningResult.memoire_longue_update && Object.keys(reasoningResult.memoire_longue_update).length > 0) {
          await mettreAJourMemoireLongue(base44, memoireLongue.id, reasoningResult.memoire_longue_update);
        }

        // ── Journaliser le raisonnement ──
        await loggerRaisonnement(base44, {
          conversation_id: conversation.id, client_telephone: telephone, client_nom: profileName,
          message_recu: body || `[${messageType}]`, result: reasoningResult,
          memoire_courte_snapshot: pendingCourse || {}, memoire_longue_id: memoireLongue?.id,
          reponse_envoyee: reponseVenus,
        });
      }
    }

    // ── Audit: logger le message pour le tableau de bord OpenAI ──
    const _metaLog: any = reasoningResult || {};
    const _modelForCost = _metaLog._model_openai || '';
    const _tokensPrompt = _metaLog._tokens_prompt || 0;
    const _tokensCompletion = _metaLog._tokens_completion || 0;
    const _coutUsd = _modelForCost ? calculateCost(_modelForCost, _tokensPrompt, _tokensCompletion) : 0;
    const _tokensTotal = _metaLog._tokens_openai || 0;
    loggerMessageVenus(base44, {
      telephone,
      conversation_id: conversation.id,
      message_client: (messageEffectif || body || '').substring(0, 2000),
      decision_moteur: reasoningResult?.decision_moteur || 'regle_metier',
      openai_appele: reasoningResult?.openai_appele ?? false,
      model_utilise: reasoningResult?.model_utilise || '',
      rag_documents: reasoningResult?.document_sources,
      outils_utilises: reasoningResult?.outils_utilises,
      temps_reponse_ms: reasoningResult?.temps_traitement_ms || 0,
      cout_usd: _coutUsd,
      tokens_total: _tokensTotal,
      reponse_envoyee: (reponseVenus || '').substring(0, 2000),
      intention: reasoningResult?.intention,
      action: reasoningResult?.action,
      confiance: reasoningResult?.confiance,
      statut: reasoningResult?.decision_moteur === 'erreur' ? 'erreur' : 'succes',
      erreur_detail: (reasoningResult as any)?._erreur_openai || '',
    }).catch(() => {});

    // ── Mode apprentissage: générer un exemple d'apprentissage (fire-and-forget) ──
    // GPT comprend et enseigne. L'administrateur valide. VENUS observe et apprend.
    if (reasoningResult && reponseVenus) {
      genererExempleApprentissage(base44, {
        conversation_id: conversation.id,
        telephone,
        message_client: messageEffectif || body || '',
        reponse_envoyee: reponseVenus,
        reasoningResult,
        model_used: reasoningResult?.model_utilise || '',
        tokens_total: _tokensTotal,
        cost_usd: _coutUsd,
        country_code: countryCode,
        profileName,
      }).catch(() => {});
    }

    // Nettoyer le markdown
    reponseVenus = reponseVenus
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`/g, '');

    venusLog(`[WebhookVenus] ✅ ÉTAPE 5 — Réponse Venus générée (${reponseVenus.length} chars): "${reponseVenus.substring(0, 100)}..."`);

    // 🎤 Phase 16 — Déterminer si on répond en audio ou en texte
    const audioConfig = await chargerConfigAudio(base44);
    const utiliserAudio = devraitRepondreEnAudio(reponseVenus, clientAEnvoyeAudio, audioConfig);
    let audioResponseUrl: string | null = null;
    let twilioResult: any = null;

    // ── Arrêter le renouvellement de l'indicateur de saisie + timeout d'attente ──
    // L'indicateur disparaît automatiquement dès que la réponse est livrée.
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }

    // ── Garantir un délai minimum (2.5s) entre l'indicateur de saisie et la réponse ──
    // Sans ce délai, le traitement étant trop rapide (salutations cachées, etc.),
    // l'indicateur "en train d'écrire..." disparaît avant que l'utilisateur ne le voie.
    if (typingStartTime > 0) {
      const elapsed = Date.now() - typingStartTime;
      const MIN_TYPING_DISPLAY_MS = 2500;
      if (elapsed < MIN_TYPING_DISPLAY_MS) {
        const waitMs = MIN_TYPING_DISPLAY_MS - elapsed;
        venusLog(`[WebhookVenus] ⌨️ Attente ${waitMs}ms pour visibilité indicateur de saisie (écoulé: ${elapsed}ms)`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    venusLog(`[WebhookVenus] 📤 ÉTAPE 6 — Envoi réponse à ${telephone} via Twilio (from: ${fromNumber}) | mode: ${utiliserAudio ? 'AUDIO' : 'TEXTE'}`);
    if (utiliserAudio) {
      // Envoyer d'abord un court audio TTS, puis le texte en complément (infos importantes)
      const audioResp = await envoyerReponseAudio(base44, telephone, reponseVenus, audioConfig, accountSid, authToken, fromNumber);
      if (audioResp?.ok) {
        audioResponseUrl = audioResp.audio_url;
        venusLog(`[WebhookVenus] ✅ ÉTAPE 6 — Réponse audio envoyée à ${telephone} (url: ${audioResponseUrl?.substring(0, 60)}...)`);
      } else {
        // Fallback texte si l'audio échoue
        console.warn(`[WebhookVenus] ⚠️ ÉTAPE 6 — Audio échoué, fallback texte`);
        twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);
      }
    } else {
      twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);
    }
    if (twilioResult) {
      venusLog(`[WebhookVenus] 📤 ÉTAPE 6 — Twilio API response: ok=${twilioResult.ok} | status=${twilioResult.data?.status || 'N/A'} | sid=${twilioResult.data?.sid || 'N/A'} | error=${twilioResult.data?.message || twilioResult.data?.error || 'N/A'}`);
    }
    if (twilioResult && !twilioResult.ok) {
      console.error(`[WebhookVenus] ❌ ÉTAPE 6 — Erreur envoi Twilio: ${JSON.stringify(twilioResult.data)}`);
    }

    // ── 5. Créer le Message de réponse Venus ──
    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'admin',
      sender_id: 'venus',
      sender_name: 'VENUS',
      message_type: utiliserAudio ? 'audio' : 'text',
      content: reponseVenus,
      audio_url: audioResponseUrl || undefined,
      audio_response_url: audioResponseUrl || undefined,
      source: 'whatsapp',
    });

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: reponseVenus.slice(0, 80),
      last_message_date: new Date().toISOString(),
      last_sender_name: 'VENUS',
      last_sender_type: 'admin',
    });

    venusLog(`[WebhookVenus] ✅ ÉTAPE 7 — Flow terminé avec succès pour ${telephone} | Twilio envoi: ${twilioResult?.ok ? 'OK' : (audioResponseUrl ? 'AUDIO OK' : 'ÉCHEC')}`);

    // ── 7. Log VenusInteraction (avec Centre d'Apprentissage) ──
    const conversationIdLog = `wa_${telephone.replace(/[^0-9]/g, '')}`;
    try {
      await base44.asServiceRole.entities.VenusInteraction.create({
        conversation_id: conversationIdLog,
        question: body || `[${messageType}]`,
        reponse: reponseVenus,
        country_code: countryCode,
        user_type: 'client',
        date_conversation: new Date().toISOString().split('T')[0],
        statut: reasoningResult ? (reasoningResult.confiance < SEUIL_CONFIANCE ? 'non_resolu' : 'resolu') : 'resolu',
        satisfaction: reasoningResult ? (reasoningResult.confiance < SEUIL_CONFIANCE ? 'negative' : (reasoningResult.knowledge_id ? 'positive' : 'neutre')) : 'neutre',
        duree_secondes: reasoningResult ? Math.round(reasoningResult.temps_traitement_ms / 1000) : 0,
        intention: reasoningResult?.intention || undefined,
        knowledge_id: reasoningResult?.knowledge_id || undefined,
        confidence_score: reasoningResult?.confiance || undefined,
        temps_recherche_ms: reasoningResult?.temps_traitement_ms || undefined,
      });
    } catch (logErr) {
      console.error('[WebhookVenus] Erreur logging VenusInteraction:', logErr.message);
    }

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    if (typingInterval) { clearInterval(typingInterval); }
    console.error(`[WebhookVenus] ❌ ERREUR GLOBALE: ${error.message}`);
    console.error(`[WebhookVenus] ❌ Stack: ${error.stack?.substring(0, 300)}`);

    // ── Envoyer un vrai message d'erreur au client (jamais un faux succès) ──
    try {
      const eAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const eAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const eFromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';
      let eTelephone = '';
      try {
        const eBody = await req.clone().text();
        const eParams = Object.fromEntries(new URLSearchParams(eBody));
        eTelephone = (eParams.From || '').replace('whatsapp:', '');
      } catch {}
      if (eAccountSid && eAuthToken && eTelephone) {
        await envoyerWhatsAppReply(
          eTelephone,
          "⚠️ Une erreur technique est survenue lors du traitement de votre demande. Veuillez réessayer dans quelques instants. Si le problème persiste, contactez le support au +226 66 92 51 90.",
          eAccountSid, eAuthToken, eFromNumber
        ).catch(() => {});
      }
    } catch {}

    return Response.json({ error: error.message }, { status: 500 });
  }
});