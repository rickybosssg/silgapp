import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from 'base44:runtime';

/**
 * Vérifie le GPS de tous les livreurs disponibles et envoie une notification push
 * à ceux dont le GPS est stale (>5 min) ou absent.
 *
 * Appelé automatiquement toutes les 5 minutes par une automation programmée.
 * Peut aussi être appelé manuellement par un admin.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth : admin si appelé manuellement, auto si appelé par automation ──
    // Les automations programmées n'ont pas de token utilisateur — on utilise
    // asServiceRole directement. Si un utilisateur appelle, on vérifie admin.
    const authHeader = req.headers.get('authorization') || '';
    const isManualCall = authHeader.startsWith('Bearer ');
    if (isManualCall) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    }

    const now = Date.now();

    // ── Restriction horaire : notifications uniquement entre 08h00 et 21h00 ──
    const currentHour = new Date().getHours();
    if (currentHour < 8 || currentHour >= 21) {
      return Response.json({
        success: true,
        message: 'Notifications GPS désactivées (hors plage 08h-21h)',
        stats: { total: 0, skipped: true, currentHour },
      });
    }

    const SEUIL_GPS_STALE_MIN = 5;
    const SEUIL_GPS_PERDU_MIN = 20;
    const DELAI_ENTRE_ALERTES_MS = 30 * 60 * 1000; // 30 min entre chaque alerte

    // ── Récupérer tous les livreurs disponibles ──
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      type_livreur: 'externe',
      validation: 'valide',
      actif: true,
      statut: 'disponible',
      bloque_encours: false,
      manual_hors_ligne: { $ne: true },
      admin_hors_ligne: { $ne: true },
    }, '-last_seen_at', 200);

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ success: true, message: 'Aucun livreur disponible', stats: { total: 0 } });
    }

    let gpsOk = 0;
    let gpsStale = 0;
    let gpsPerdu = 0;
    let gpsAbsent = 0;
    let alertsEnvoyees = 0;
    const detailsAlertes = [];

    for (const livreur of livreurs) {
      const lastGpsDate = livreur.derniere_position_date || livreur.last_seen_at;
      const hasGps = livreur.latitude && livreur.longitude;

      if (!hasGps || !lastGpsDate) {
        gpsAbsent++;
        // Pas de GPS du tout — alerter
        const lastAlert = livreur.encours_alerte_at ? new Date(livreur.encours_alerte_at).getTime() : 0;
        if (now - lastAlert > DELAI_ENTRE_ALERTES_MS && livreur.user_email) {
          waitUntil(
            base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: livreur.user_email,
              livreur_id: livreur.id,
              titre: '📍 GPS requis',
              message: 'Vous êtes en ligne mais votre position GPS n\'est pas active. Rouvrez l\'application SILGAPP pour recevoir des courses.',
              type: 'livreur_hors_ligne',
            }).catch(() => null)
          );
          waitUntil(
            base44.asServiceRole.entities.Livreur.update(livreur.id, {
              encours_alerte_at: new Date().toISOString(),
            }).catch(() => null)
          );
          alertsEnvoyees++;
          detailsAlertes.push({ id: livreur.id, nom: `${livreur.prenom || ''} ${livreur.nom || ''}`, raison: 'gps_absent' });
        }
        continue;
      }

      const gpsAgeMin = (now - new Date(lastGpsDate).getTime()) / 60000;

      if (gpsAgeMin < SEUIL_GPS_STALE_MIN) {
        gpsOk++;
        continue;
      }

      if (gpsAgeMin >= SEUIL_GPS_PERDU_MIN) {
        gpsPerdu++;
        // Alerte push — uniquement pour GPS perdu (>20 min), max 1 fois / 30 min
        const lastAlert = livreur.encours_alerte_at ? new Date(livreur.encours_alerte_at).getTime() : 0;
        if (now - lastAlert > DELAI_ENTRE_ALERTES_MS && livreur.user_email) {
          waitUntil(
            base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: livreur.user_email,
              livreur_id: livreur.id,
              titre: '📍 GPS perdu — rouvrez l\'app',
              message: `Votre position GPS date de ${Math.round(gpsAgeMin)} min. Rouvrez SILGAPP pour rester visible et recevoir des courses.`,
              type: 'livreur_hors_ligne',
            }).catch(() => null)
          );
          waitUntil(
            base44.asServiceRole.entities.Livreur.update(livreur.id, {
              encours_alerte_at: new Date().toISOString(),
            }).catch(() => null)
          );
          alertsEnvoyees++;
          detailsAlertes.push({
            id: livreur.id,
            nom: `${livreur.prenom || ''} ${livreur.nom || ''}`,
            raison: `gps_perdu_${Math.round(gpsAgeMin)}min`,
            gpsAgeMin: Math.round(gpsAgeMin),
          });
        }
      } else {
        gpsStale++;
      }
    }

    console.log(`[verifierGPSLivreurs] ${livreurs.length} livreurs — OK:${gpsOk} stale:${gpsStale} perdu:${gpsPerdu} absent:${gpsAbsent} — ${alertsEnvoyees} alertes envoyées`);

    return Response.json({
      success: true,
      stats: {
        total: livreurs.length,
        gpsOk,
        gpsStale,
        gpsPerdu,
        gpsAbsent,
        alertsEnvoyees,
      },
      detailsAlertes: detailsAlertes.slice(0, 20),
    });
  } catch (error) {
    console.error('[verifierGPSLivreurs] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}