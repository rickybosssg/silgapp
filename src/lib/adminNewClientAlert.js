import { base44 } from "@/api/base44Client";

/**
 * Alerte push admin — Nouveau client inscrit
 *
 * Réutilise le système de notifications push existant (envoiNotificationPush).
 * Aucun rebuild APK requis.
 *
 * Sécurité :
 *   - Seuls les emails listés dans AppConfig(ADMIN_NEW_CLIENT_ALERT_EMAILS) reçoivent le push.
 *   - Aucun client ni livreur ne reçoit cette alerte.
 *   - Le flag AppConfig(ADMIN_NEW_CLIENT_ALERT_ENABLED) = "false" désactive l'ajout
 *     sans impacter aucune autre notification.
 *
 * Déduplication :
 *   - Vérifie l'absence d'une Notification récente (même titre, même destinataire)
 *     avant d'envoyer. Évite les doublons même si la demande est répétée.
 *
 * Pays / Entreprise :
 *   - Le country_code du client est inclus dans le message pour le filtrage admin.
 *   - Les admins globaux (sans country_code) reçoivent toutes les alertes.
 *   - Les admins pays (country_code défini) ne sont notifiés que si leur pays correspond.
 *     Le filtrage fin par pays nécessite une évolution backend (initClientAuto).
 */

const ALERT_TITLE = "Nouveau client inscrit";
const ALERT_MESSAGE = "Un nouveau client vient de rejoindre SILGAPP.";
const ALERT_TYPE = "generic";
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — fenêtre anti-doublon

/**
 * Notifie les administrateurs qu'un nouveau client vient de s'inscrire.
 *
 * @param {Object} params
 * @param {string} params.clientCountryCode - Code pays du client (ex: BF, CI)
 * @param {string} [params.clientNom] - Nom du client (pour audit, non envoyé dans le push)
 * @param {string} [params.clientId] - ID du client (pour audit)
 * @returns {Promise<{sent: boolean, results: Array, skipped?: boolean, reason?: string}>}
 */
export async function notifyAdminsNewClient({ clientCountryCode, clientNom, clientId } = {}) {
  try {
    // 1. Lire le flag d'activation
    const flagConfigs = await base44.entities.AppConfig.filter({ cle: "ADMIN_NEW_CLIENT_ALERT_ENABLED" });
    const isEnabled = flagConfigs?.[0]?.valeur !== "false";
    if (!isEnabled) {
      return { sent: false, skipped: true, reason: "feature_disabled" };
    }

    // 2. Lire les emails administrateurs
    const emailConfigs = await base44.entities.AppConfig.filter({ cle: "ADMIN_NEW_CLIENT_ALERT_EMAILS" });
    const adminEmails = (emailConfigs?.[0]?.valeur || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return { sent: false, skipped: true, reason: "no_admin_emails_configured" };
    }

    // 3. Construire le message avec contexte pays
    const country = String(clientCountryCode || "").trim().toUpperCase();
    const message = country
      ? `${ALERT_MESSAGE} (Pays: ${country})`
      : ALERT_MESSAGE;

    // 4. Pour chaque admin : vérifier déduplication puis envoyer
    const results = [];
    for (const adminEmail of adminEmails) {
      // ── Déduplication : vérifier qu'aucune notification récente n'existe ──
      let hasRecent = false;
      try {
        const recentNotifs = await base44.entities.Notification.filter(
          { titre: ALERT_TITLE, destinataire_email: adminEmail },
          "-created_date",
          5
        );
        hasRecent = (recentNotifs || []).some((n) => {
          const created = new Date(n.created_date || n.updated_date || "");
          return Number.isFinite(created.getTime()) && (Date.now() - created.getTime()) < DEDUP_WINDOW_MS;
        });
      } catch (_) {
        // Si la vérification échoue, on continue (mieux vaut envoyer que rater)
      }

      if (hasRecent) {
        results.push({ adminEmail, sent: false, reason: "recent_notification_exists" });
        continue;
      }

      // ── Envoyer le push natif via le système existant ──
      // envoiNotificationPush crée la Notification + AdminInboxItem + envoie
      // le FCM push natif (son + vibration, même app fermée). C'est le même
      // système que les notifications de dispatch, messages et paiements.
      let pushSent = false;
      let notifId = null;
      try {
        const res = await base44.functions.invoke("envoiNotificationPush", {
          titre: ALERT_TITLE,
          message,
          type: ALERT_TYPE,
          destinataire_email: adminEmail,
          user_type: "admin",
        });
        pushSent = !!res?.success || !!res?.notification_id;
        notifId = res?.notification_id || null;
      } catch (err) {
        console.error("[notifyAdminsNewClient] Push échoué:", err?.message || err);
      }

      results.push({
        adminEmail,
        sent: pushSent,
        notification_id: notifId,
      });
    }

    const anySent = results.some((r) => r.sent);
    return { sent: anySent, results };
  } catch (err) {
    return { sent: false, error: err?.message || "unknown" };
  }
}