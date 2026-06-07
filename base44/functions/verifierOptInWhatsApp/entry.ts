import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vérifie si un livreur est opt-in dans le Sandbox WhatsApp Twilio.
 * Méthode : chercher si le numéro a envoyé "join rise-bit" ET 
 *           si le dernier message sortant vers ce numéro a réussi.
 * 
 * Peut aussi être appelé par le moteur de dispatch pour vérifier avant envoi.
 * 
 * Payload : { livreur_id } ou { telephone }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { livreur_id, telephone: telParam } = body;

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return Response.json({ error: 'Variables Twilio manquantes' }, { status: 500 });
    }

    const creds = btoa(`${accountSid}:${authToken}`);
    const headers = { 'Authorization': `Basic ${creds}` };
    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    // Résoudre le téléphone
    let telephone = telParam;
    let livreur = null;
    if (livreur_id) {
      livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
      telephone = livreur.telephone;
    }

    if (!telephone) return Response.json({ error: 'telephone requis' }, { status: 400 });

    // Normaliser le numéro
    let tel = telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!tel.startsWith('+')) tel = '+226' + tel;

    // ── 1. Vérifier les messages entrants (opt-in = "join rise-bit") ──────────
    const entrantsResp = await fetch(
      baseUrl + '/Messages.json?From=whatsapp:' + encodeURIComponent(tel) + '&PageSize=20',
      { headers }
    );
    const entrants = await entrantsResp.json();
    const msgs = entrants?.messages || [];

    // Chercher un "join rise-bit" entrant
    const optInMsg = msgs.find(m => m.body?.toLowerCase().includes('join') && m.body?.toLowerCase().includes('rise-bit'));
    const dernierOptIn = optInMsg ? new Date(optInMsg.date_sent) : null;

    // ── 2. Vérifier le dernier message sortant vers ce numéro ─────────────────
    const sortantsResp = await fetch(
      baseUrl + '/Messages.json?To=whatsapp:' + encodeURIComponent(tel) + '&PageSize=10',
      { headers }
    );
    const sortants = await sortantsResp.json();
    const dernierSortant = sortants?.messages?.sort((a, b) => new Date(b.date_sent) - new Date(a.date_sent))[0];

    const dernierEchec63015 = sortants?.messages?.find(m => m.error_code === 63015);
    const dernierSucces = sortants?.messages?.find(m => ['delivered', 'read', 'sent'].includes(m.status));

    // ── 3. Déterminer le statut opt-in ────────────────────────────────────────
    // Opt-in valide si :
    //   - A envoyé "join rise-bit" ET
    //   - Le dernier message sortant n'est pas 63015
    //   - OU dernier succès < 72h
    const now = Date.now();
    const OPT_IN_DURATION_MS = 72 * 60 * 60 * 1000; // 72h

    let optInActif = false;
    let raisonStatut = '';

    if (dernierSucces) {
      const ageSucces = now - new Date(dernierSucces.date_sent).getTime();
      if (ageSucces < OPT_IN_DURATION_MS) {
        optInActif = true;
        raisonStatut = `Dernier message livré il y a ${Math.round(ageSucces / 60000)} min`;
      } else {
        optInActif = false;
        raisonStatut = `Dernier succès il y a ${Math.round(ageSucces / 3600000)}h — opt-in probablement expiré`;
      }
    } else if (dernierEchec63015) {
      optInActif = false;
      raisonStatut = 'Erreur 63015 — opt-in expiré ou non fait';
    } else if (dernierOptIn) {
      const ageOptIn = now - dernierOptIn.getTime();
      optInActif = ageOptIn < OPT_IN_DURATION_MS;
      raisonStatut = optInActif
        ? `Opt-in il y a ${Math.round(ageOptIn / 60000)} min`
        : `Opt-in il y a ${Math.round(ageOptIn / 3600000)}h — expiré`;
    } else {
      optInActif = false;
      raisonStatut = 'Aucun opt-in trouvé dans l\'historique Twilio';
    }

    // ── 4. Mettre à jour le livreur si fourni ─────────────────────────────────
    if (livreur_id && livreur) {
      const updateData = {
        whatsapp_opt_in: optInActif,
      };
      if (optInActif) {
        updateData.whatsapp_opt_in_date = new Date().toISOString();
        // Expiration estimée : 72h après la dernière interaction réussie
        updateData.whatsapp_opt_in_expire_at = new Date(now + OPT_IN_DURATION_MS).toISOString();
        updateData.whatsapp_derniere_erreur = null;
        updateData.whatsapp_derniere_erreur_date = null;
      } else if (dernierEchec63015) {
        updateData.whatsapp_derniere_erreur = '63015';
        updateData.whatsapp_derniere_erreur_date = new Date().toISOString();
      }
      await base44.asServiceRole.entities.Livreur.update(livreur_id, updateData);
    }

    return Response.json({
      telephone: tel,
      livreur_id: livreur_id || null,
      opt_in_actif: optInActif,
      raison: raisonStatut,
      dernier_opt_in_date: dernierOptIn?.toISOString() || null,
      dernier_succes: dernierSucces ? { sid: dernierSucces.sid, date: dernierSucces.date_sent, status: dernierSucces.status } : null,
      dernier_echec_63015: dernierEchec63015 ? { sid: dernierEchec63015.sid, date: dernierEchec63015.date_sent } : null,
      sandbox_code: 'join rise-bit',
      sandbox_numero: '+14155238886',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});