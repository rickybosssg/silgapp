import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { ensureCodePromo } from '../../shared/codePromoUtils.ts';
import { normalizePhone, loadCountryDialCodes } from '../../shared/phoneUtils.ts';

/**
 * Initialisation automatique pour NOUVEAU CLIENT
 * Configure : GPS, device, notifications, heartbeat
 *
 * RATTACHEMENT CRM (idempotent) :
 *   1. Recherche par user_email (comportement existant)
 *   2. Si aucun profil trouvé ET un téléphone fiable est fourni dans le payload,
 *      recherche par telephone_normalized sur les profils CRM existants (sans user_email).
 *   3. Si exactement UN profil correspond → rattachement (ajout de user_email).
 *   4. Si plusieurs profils correspondent → aucune fusion automatique, journalisation.
 *   5. Si aucun profil ne correspond → création normale (comportement existant).
 *
 * Le téléphone doit provenir du flux d'authentification (formulaire d'inscription validé).
 * Aucun rattachement n'est effectué à partir d'un numéro fourni arbitrairement.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { device_id, platform, notification_token, latitude, longitude, country_code, telephone } = payload;

    // VALIDATION STRICTE : country_code OBLIGATOIRE
    if (!country_code) {
      console.error('[initClientAuto] country_code manquant — inscription rejetée');
      return Response.json({
        success: false,
        error: "country_code_required",
        message: "Le pays est obligatoire pour utiliser SILGAPP. Veuillez sélectionner un pays lors de l'inscription."
      }, { status: 400 });
    }

    // Charger les indicatifs pays dynamiques (pour normalisation du téléphone)
    await loadCountryDialCodes(base44, country_code);

    // 1. VÉRIFIER si l'email existe déjà dans Livreur (livreur externe)
    const existingLivreur = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
    if (existingLivreur && existingLivreur.length > 0) {
      // C'est un livreur ! Ne pas créer de profil client
      console.log(`[initClientAuto] Email ${user.email} trouvé dans Livreur → pas de création client`);
      return Response.json({
        success: false,
        reason: "livreur_exists",
        message: "Cet email est enregistré comme livreur. Redirection vers le dashboard livreur."
      }, { status: 409 });
    }

    // 2. Rechercher le profil client par user_email (comportement existant)
    let client = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
    let linkedToCrm = false;

    if (client && client.length > 0) {
      client = client[0];
    } else {
      // ── RATTACHEMENT CRM : rechercher par téléphone si fourni ──
      // Le téléphone doit provenir du formulaire d'inscription validé (ClientOnboarding).
      // Il est normalisé avec les helpers SILGAPP (phoneUtils.ts).
      const normalizedTel = telephone ? normalizePhone(telephone, country_code) : null;

      if (normalizedTel) {
        const crmMatches = await base44.asServiceRole.entities.ClientExterne.filter({
          telephone_normalized: normalizedTel,
        });

        if (crmMatches.length === 1) {
          // ── Profil CRM unique trouvé → rattachement sûr ──
          const crmProfile = crmMatches[0];
          if (!crmProfile.user_email) {
            console.log(`[initClientAuto] Rattachement CRM: profil ${crmProfile.id} (tél=${normalizedTel}) lié à ${user.email}`);
            client = await base44.asServiceRole.entities.ClientExterne.update(crmProfile.id, {
              user_email: user.email,
              // Préserver toutes les données existantes — ne pas écraser
            });
            linkedToCrm = true;
          } else {
            // Le profil a déjà un user_email différent — ne pas écraser
            console.warn(`[initClientAuto] Profil CRM ${crmProfile.id} déjà lié à ${crmProfile.user_email} — pas de rattachement`);
            client = null;
          }
        } else if (crmMatches.length > 1) {
          // ── Plusieurs profils avec le même téléphone → ne pas fusionner ──
          console.warn(`[initClientAuto] ${crmMatches.length} profils CRM trouvés pour tél=${normalizedTel} — fusion automatique refusée (IDs: ${crmMatches.map(c => c.id).join(', ')})`);
          client = null;
        } else {
          client = null;
        }
      } else {
        client = null;
      }

      // 3. Si aucun profil existant trouvé → créer un nouveau profil
      if (!client) {
        client = await base44.asServiceRole.entities.ClientExterne.create({
          nom: user.full_name?.split(' ')[0] || user.email.split('@')[0],
          prenom: user.full_name?.split(' ').slice(1).join(' ') || '',
          telephone: telephone || "",
          telephone_normalized: normalizedTel || undefined,
          user_email: user.email,
          actif: true,
          latitude: latitude || null,
          longitude: longitude || null,
          country_code: country_code,
        });
      }
    }

    // 1b. Créer automatiquement un code promo ambassadeur pour le client
    try {
      await ensureCodePromo(base44.asServiceRole, {
        proprietaire_type: 'client',
        proprietaire_id: client.id,
        proprietaire_nom: client.nom || user.email,
        proprietaire_email: user.email,
        country_code: country_code,
      });
    } catch (e) {
      console.error('[initClientAuto] Erreur création code promo:', e.message);
    }

    // 2. Enregistrer la session device
    const session = await base44.asServiceRole.entities.DeviceSession.create({
      user_email: user.email,
      user_type: "client",
      device_id: device_id || `web_${user.email}_${Date.now()}`,
      platform: platform || "web",
      notification_token: notification_token || null,
      gps_actif: !!(latitude && longitude),
      derniere_position_lat: latitude || null,
      derniere_position_lng: longitude || null,
      derniere_sync_date: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      app_active: true,
      session_actif: true,
    });

    // 3. Configurer les notifications push
    if (notification_token) {
      await base44.asServiceRole.entities.NotificationToken.create({
        user_email: user.email,
        token: notification_token,
        platform: platform || "web",
        user_type: "client",
        actif: true,
        derniere_utilisation: new Date().toISOString(),
      });
    }

    // 4. Tester la notification
    await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
      user_email: user.email,
      titre: " Bienvenue sur SILGAPP",
      message: "Votre compte est configuré. GPS et notifications activés "
    });

    return Response.json({
      success: true,
      client_id: client.id,
      session_id: session.id,
      gps_sync: !!(latitude && longitude),
      notifications: !!notification_token,
      linked_to_crm: linkedToCrm,
    });
  } catch (error) {
    console.error('[initClientAuto] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});