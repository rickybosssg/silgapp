import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { detecterConversationsARelancer, genererMessageRelance } from '../../shared/venusReasoningEngine.ts';

/**
 * Relance intelligente VENUS.
 *
 * Parcourt les conversations WhatsApp où VENUS attend une réponse du client
 * depuis trop longtemps, et envoie un message de relance contextuel.
 *
 * Déclenchée par une automation programmée (toutes les 5-10 minutes).
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      return Response.json({ error: 'Configuration Twilio manquante' }, { status: 500 });
    }

    // Récupérer le délai de relance depuis SystemConfig (défaut: 15 minutes)
    let delaiMinutes = 15;
    try {
      const configs = await base44.asServiceRole.entities.SystemConfig.filter({ cle: 'VENUS_RELANCE_DELAI_MINUTES' });
      if (configs && configs.length > 0) {
        delaiMinutes = parseInt(configs[0].valeur, 10) || 15;
      }
    } catch {}

    // Détecter les conversations à relancer
    const conversationsARelancer = await detecterConversationsARelancer(base44, delaiMinutes);

    if (conversationsARelancer.length === 0) {
      return Response.json({ success: true, message: 'Aucune conversation à relancer', count: 0 });
    }

    console.log(`[RelanceVenus] ${conversationsARelancer.length} conversation(s) à relancer (délai: ${delaiMinutes}min)`);

    const credentials = btoa(`${accountSid}:${authToken}`);
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    let relancesEnvoyees = 0;
    let erreurs = 0;

    for (const conv of conversationsARelancer) {
      try {
        let pendingCourse: any = null;
        try { pendingCourse = conv.venus_pending_course ? JSON.parse(conv.venus_pending_course) : null; } catch {}

        const messageRelance = genererMessageRelance(pendingCourse);
        const telephone = conv.whatsapp_phone;
        if (!telephone) continue;

        // Envoyer via Twilio
        const formData = new URLSearchParams();
        formData.append('From', from);
        formData.append('To', `whatsapp:${telephone}`);
        formData.append('Body', messageRelance);

        const resp = await fetch(`${TWILIO_API_BASE}/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        if (resp.ok) {
          // Stocker le message de relance
          await base44.asServiceRole.entities.Message.create({
            conversation_id: conv.id,
            sender_type: 'admin',
            sender_id: 'venus',
            sender_name: 'VENUS',
            message_type: 'text',
            content: messageRelance,
            source: 'whatsapp',
          });

          // Mettre à jour la conversation
          await base44.asServiceRole.entities.Conversation.update(conv.id, {
            last_message: messageRelance.slice(0, 80),
            last_message_date: new Date().toISOString(),
            last_sender_name: 'VENUS',
            last_sender_type: 'admin',
          });

          relancesEnvoyees++;
          console.log(`[RelanceVenus] ✅ Relance envoyée à ${telephone}: "${messageRelance.substring(0, 60)}..."`);
        } else {
          erreurs++;
          console.error(`[RelanceVenus] ❌ Erreur Twilio pour ${telephone}: ${resp.status}`);
        }

        // Petit délai entre chaque envoi pour éviter le rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        erreurs++;
        console.error(`[RelanceVenus] ❌ Erreur pour conversation ${conv.id}:`, e.message);
      }
    }

    console.log(`[RelanceVenus] Terminé: ${relancesEnvoyees} relance(s) envoyée(s), ${erreurs} erreur(s)`);

    return Response.json({
      success: true,
      relances_envoyees: relancesEnvoyees,
      erreurs: erreurs,
      total_detectees: conversationsARelancer.length,
    });
  } catch (error) {
    console.error(`[RelanceVenus] ❌ ERREUR: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});