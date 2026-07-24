/**
 * ═══════════════════════════════════════════════════════════════════
 * NOTIFICATEUR VENUS — Envoie un WhatsApp au client pour décision de redispatch
 * ═══════════════════════════════════════════════════════════════════
 *
 * Utilisé quand :
 * 1. Un livreur annule une course (annulerCourseExterne)
 * 2. Le cycle de dispatch est épuisé (dispatchExterneAuto → cycle_epuise)
 *
 * Le client reçoit un message VENUS sur WhatsApp lui demandant s'il veut
 * relancer la recherche ou annuler. La réponse est traitée par
 * handleRedispatchDecision dans webhookWhatsAppVenus.
 *
 * Le flag `redispatch_pending` est stocké dans conversation.venus_pending_course.
 */

interface NotifierParams {
  base44: any;
  course: any;
  messageVenus: string;
  motif?: string;
}

export async function notifierRedispatchClient({ base44, course, messageVenus, motif }: NotifierParams): Promise<boolean> {
  if (!course.client_telephone) {
    console.warn('[RedispatchNotifier] ⚠️ Pas de client_telephone — impossible de notifier');
    return false;
  }

  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFromNumber = course.silgapp_from_number
    || Deno.env.get('TWILIO_WHATSAPP_FROM')
    || 'whatsapp:+14155238886';

  if (!twilioAccountSid || !twilioAuthToken) {
    console.warn('[RedispatchNotifier] ⚠️ Twilio non configuré — impossible d\'envoyer WhatsApp');
    return false;
  }

  try {
    const to = course.client_telephone.startsWith('whatsapp:')
      ? course.client_telephone
      : `whatsapp:${course.client_telephone}`;
    const from = twilioFromNumber.startsWith('whatsapp:')
      ? twilioFromNumber
      : `whatsapp:${twilioFromNumber}`;
    const creds = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const formData = new URLSearchParams();
    formData.append('From', from);
    formData.append('To', to);
    formData.append('Body', messageVenus);

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }
    );
    const data = await resp.json();
    const envoye = resp.ok && !!data.sid;

    if (envoye) {
      // ── Mettre à jour la conversation avec le flag redispatch_pending ──
      const convs = await base44.asServiceRole.entities.Conversation.filter({
        whatsapp_phone: course.client_telephone,
      });
      if (convs?.[0]) {
        let pending: any = {};
        try { pending = convs[0].venus_pending_course ? JSON.parse(convs[0].venus_pending_course) : {}; } catch {}
        // Nettoyer d'anciens flags
        delete pending.contact_livreur_mode;
        delete pending.contact_livreur_course_id;
        delete pending.contact_livreur_livreur_id;
        delete pending.contact_livreur_livreur_tel;
        // Activer le flag redispatch
        pending.redispatch_pending = true;
        pending.redispatch_course_id = course.id;
        pending.redispatch_motif = motif || '';
        await base44.asServiceRole.entities.Conversation.update(convs[0].id, {
          venus_pending_course: JSON.stringify(pending),
        });

        // Stocker le message VENUS dans l'entité Message
        await base44.asServiceRole.entities.Message.create({
          conversation_id: convs[0].id,
          sender_type: 'admin',
          sender_id: 'venus',
          sender_name: 'VENUS',
          message_type: 'text',
          content: messageVenus,
          source: 'whatsapp',
        }).catch(() => null);
      }
      console.log(`[RedispatchNotifier] ✅ WhatsApp VENUS envoyé au client ${course.client_telephone} — en attente de décision`);
    }
    return envoye;
  } catch (e) {
    console.error('[RedispatchNotifier] ❌ Erreur envoi WhatsApp:', e.message);
    return false;
  }
}