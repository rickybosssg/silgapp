// ── Utilitaires Twilio pour VENUS WhatsApp ───────────────────────────────────
// Extrait de webhookWhatsAppVenus — signature, envoi de messages, indicateurs, médias.

export const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

const VENUS_DEBUG = Deno.env.get('VENUS_DEBUG') === 'true';

/** Log de débogage VENUS — supprimé en production (sauf VENUS_DEBUG=true) */
export function venusLog(...args: any[]) {
  if (VENUS_DEBUG) console.log(...args);
}

export async function validerSignatureTwilio(url, rawBody, authToken, signatureHeader) {
  if (!signatureHeader) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(url + rawBody));
    const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return computed === signatureHeader;
  } catch (e) {
    console.error('[WebhookVenus] Erreur validation signature:', e.message);
    return false;
  }
}

export async function envoyerWhatsAppReply(telephone, message, accountSid, authToken, fromNumber) {
  const to = telephone.startsWith('whatsapp:') ? telephone : `whatsapp:${telephone}`;
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  const twilioUrl = `${TWILIO_API_BASE}/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);
  const formData = new URLSearchParams();
  formData.append('From', from);
  formData.append('To', to);
  formData.append('Body', message);
  const resp = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });
  const data = await resp.json();
  return { ok: resp.ok, data };
}

export async function envoyerIndicateurSaisie(messageSid, accountSid, authToken) {
  if (!messageSid || !accountSid || !authToken) return false;
  try {
    const url = 'https://messaging.twilio.com/v3/Indicators/Typing.json';
    const credentials = btoa(`${accountSid}:${authToken}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'WHATSAPP',
        messageId: messageSid,
      }),
    });
    if (resp.ok) {
      console.log(`[WebhookVenus] ⌨️ Indicateur de saisie envoyé pour ${messageSid}`);
      return true;
    }
    const errText = await resp.text().catch(() => '');
    console.warn(`[WebhookVenus] ⌨️ Indicateur de saisie échoué: HTTP ${resp.status} | messageId: ${messageSid} | Response: ${errText.substring(0, 500)}`);
    return false;
  } catch (e) {
    console.warn(`[WebhookVenus] ⌨️ Erreur indicateur de saisie: ${e.message}`);
    return false;
  }
}

export async function downloadAndUploadMedia(mediaUrl, accountSid, authToken, base44, mediaContentType = '') {
  try {
    if (!mediaUrl) {
      console.error('[WebhookVenus] 📎 ❌ Aucun MediaUrl fourni par Twilio');
      return null;
    }

    console.log(`[WebhookVenus] 📎 ÉTAPE A — Téléchargement média Twilio | URL: ${mediaUrl.substring(0, 80)}... | Content-Type attendu: ${mediaContentType || 'inconnu'}`);

    const credentials = btoa(`${accountSid}:${authToken}`);

    let resp = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${credentials}` },
      redirect: 'manual',
    });

    let redirectCount = 0;
    while ((resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) && redirectCount < 5) {
      const redirectUrl = resp.headers.get('location');
      if (!redirectUrl) break;
      redirectCount++;
      console.log(`[WebhookVenus] 📎   Redirection ${redirectCount} → ${redirectUrl.substring(0, 80)}...`);
      const needsAuth = redirectUrl.includes('api.twilio.com');
      resp = await fetch(redirectUrl, {
        headers: needsAuth ? { Authorization: `Basic ${credentials}` } : {},
        redirect: 'manual',
      });
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      console.error(`[WebhookVenus] 📎 ❌ ÉTAPE A — Téléchargement échoué | HTTP ${resp.status} ${resp.statusText} | Redirections: ${redirectCount} | Réponse: ${errorText.substring(0, 200)}`);
      return null;
    }

    const blob = await resp.blob();
    const blobSize = blob.size;
    const blobType = blob.type || mediaContentType || '';

    if (blobType.includes('xml') || blobType.includes('html') || blobType.includes('text/')) {
      const errorPeek = await blob.text().catch(() => '');
      console.error(`[WebhookVenus] 📎 ❌ ÉTAPE A — Type de réponse inattendu: ${blobType} | Contenu: ${errorPeek.substring(0, 200)}`);
      return null;
    }

    console.log(`[WebhookVenus] 📎 ✅ ÉTAPE A — Média téléchargé | Taille: ${blobSize} octets | Type: ${blobType} | Redirections: ${redirectCount}`);

    if (blobSize === 0) {
      console.error('[WebhookVenus] 📎 ❌ ÉTAPE A — Fichier téléchargé VIDE (0 octet)');
      return null;
    }

    if (blobSize < 100) {
      console.warn(`[WebhookVenus] 📎 ⚠️ ÉTAPE A — Fichier très petit (${blobSize} octets) — possible contenu invalide`);
    }

    let extension = 'bin';
    if (blobType.includes('ogg') || blobType.includes('opus')) extension = 'ogg';
    else if (blobType.includes('mp3') || blobType.includes('mpeg')) extension = 'mp3';
    else if (blobType.includes('wav')) extension = 'wav';
    else if (blobType.includes('webm')) extension = 'webm';
    else if (blobType.includes('m4a') || blobType.includes('mp4')) extension = 'm4a';
    else if (blobType.includes('image/jpeg')) extension = 'jpg';
    else if (blobType.includes('image/png')) extension = 'png';
    else if (blobType.includes('video/')) extension = 'mp4';
    else if (blobType.includes('pdf')) extension = 'pdf';

    const fileName = `whatsapp_media_${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: blobType || 'application/octet-stream' });

    console.log(`[WebhookVenus] 📎 ÉTAPE B — Upload vers stockage Base44 | Fichier: ${fileName} | Taille: ${blobSize} octets | Type: ${blobType}`);

    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    if (!result?.file_url) {
      console.error('[WebhookVenus] 📎 ❌ ÉTAPE B — Upload échoué — aucune URL retournée');
      return null;
    }

    console.log(`[WebhookVenus] 📎 ✅ ÉTAPE B — Upload réussi | URL: ${result.file_url.substring(0, 80)}...`);
    return result.file_url;
  } catch (e) {
    console.error(`[WebhookVenus] 📎 ❌ Erreur downloadAndUploadMedia: ${e.message} | Stack: ${e.stack?.substring(0, 200)}`);
    return null;
  }
}