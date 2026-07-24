import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Permet a un admin de repondre a une conversation WhatsApp depuis SILGAPP.
 * Envoie le message via Twilio WhatsApp API et stocke le Message.
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return Response.json({ error: 'conversation_id et content requis' }, { status: 400 });
    }

    const convs = await base44.asServiceRole.entities.Conversation.filter({ id: conversation_id });
    if (!convs || convs.length === 0) {
      return Response.json({ error: 'Conversation introuvable' }, { status: 404 });
    }
    const conv = convs[0];

    if (!conv.whatsapp_phone) {
      return Response.json({ error: 'Cette conversation n\'est pas WhatsApp' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      return Response.json({ error: 'Configuration Twilio manquante' }, { status: 500 });
    }

    const to = `whatsapp:${conv.whatsapp_phone}`;
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    const twilioUrl = `${TWILIO_API_BASE}/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const formData = new URLSearchParams();
    formData.append('From', from);
    formData.append('To', to);
    formData.append('Body', content);

    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[envoyerWhatsAppAdmin] Erreur Twilio:', data);
      return Response.json({ error: 'Erreur Twilio', details: data }, { status: 502 });
    }

    // ── Créer le Message ──
    const message = await base44.asServiceRole.entities.Message.create({
      conversation_id,
      sender_type: 'admin',
      sender_id: user.email,
      sender_name: user.full_name || user.email,
      message_type: 'text',
      content,
      source: 'whatsapp',
      whatsapp_message_sid: data.sid || '',
    });

    // ── Mettre à jour la conversation ──
    await base44.asServiceRole.entities.Conversation.update(conversation_id, {
      last_message: content.slice(0, 80),
      last_message_date: new Date().toISOString(),
      last_sender_name: user.full_name || user.email,
      last_sender_type: 'admin',
    });

    return Response.json({ success: true, message });
  } catch (error) {
    console.error('[envoyerWhatsAppAdmin] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});