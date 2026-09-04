// ═══════════════════════════════════════════════════════════════════════════
// crmProspection.js — Logique partagée de mise à jour du pipeline CRM
// ═══════════════════════════════════════════════════════════════════════════
//
// Source de vérité unique pour :
//   - nb_contacts (incrémenté uniquement pour les vraies tentatives de contact)
//   - prochaine_relance_at (J+7 quand "a_relancer", préservé sinon)
//
// Utilisé par ClientFicheDialog et CrmProspectionPanel pour un comportement identique.
// ═══════════════════════════════════════════════════════════════════════════

const RELANCE_DELAI_JOURS = 7;

// Statuts qui représentent une vraie tentative de contact commercial.
// "a_relancer" n'incrément pas : c'est un indicateur de relance planifiée,
// pas un contact effectué. L'incrément se fait quand l'admin passe à "contacte"
// après avoir réellement recontacté le prospect.
const STATUTS_CONTACT = new Set(["contacte"]);

/**
 * Construit le payload de mise à jour pour CrmProspection.update().
 *
 * Règle nb_contacts :
 *   - Incrémenté de +1 UNIQUEMENT si :
 *     1. newStatus ∈ {contacte, a_relancer} (vraie tentative de contact)
 *     2. previousStatus !== newStatus (anti double-incrément)
 *   - Sinon : nb_contacts préservé (pas d'incrément pour interesse, converti, etc.)
 *
 * Règle prochaine_relance_at :
 *   - J+7 quand newStatus === "a_relancer"
 *   - Non écrasé pour les autres statuts (préserve l'historique)
 *
 * @param {object|null} existing - Enregistrement CrmProspection existant
 * @param {string} newStatus - Nouveau pipeline_status
 * @param {object} extraUpdates - Champs additionnels (crm_type, canal_utilise, etc.)
 * @returns {object} Payload pour CrmProspection.update()
 */
export function buildPipelineUpdatePayload(existing, newStatus, extraUpdates = {}) {
  const now = new Date().toISOString();
  const previousStatus = existing?.pipeline_status || null;

  const payload = {
    pipeline_status: newStatus,
    canal_utilise: extraUpdates.canal_utilise || existing?.canal_utilise || "whatsapp",
    ...extraUpdates,
  };

  // ── nb_contacts : incrémenter seulement pour les vrais contacts ──
  const isContactStatus = STATUTS_CONTACT.has(newStatus);
  const statusChanged = previousStatus !== newStatus;

  if (isContactStatus && statusChanged) {
    payload.dernier_contact_at = now;
    payload.nb_contacts = (existing?.nb_contacts || 0) + 1;
  } else {
    payload.dernier_contact_at = existing?.dernier_contact_at || null;
    payload.nb_contacts = existing?.nb_contacts || 0;
  }

  // ── prochaine_relance_at : J+7 uniquement pour a_relancer ──
  // Ne pas écraser la valeur existante pour les autres statuts
  if (newStatus === "a_relancer") {
    payload.prochaine_relance_at = new Date(
      Date.now() + RELANCE_DELAI_JOURS * 86400000
    ).toISOString();
  }

  return payload;
}

/**
 * Construit le payload de création pour CrmProspection.create().
 *
 * @param {object} client - ClientExterne
 * @param {string} newStatus - pipeline_status initial
 * @param {object} extraUpdates - Champs additionnels
 * @returns {object} Payload pour CrmProspection.create()
 */
export function buildPipelineCreatePayload(client, newStatus, extraUpdates = {}) {
  const now = new Date().toISOString();

  const payload = {
    client_id: client.id,
    client_nom: `${client.prenom || ""} ${client.nom || ""}`.trim(),
    client_telephone: client.telephone || "",
    client_phone_normalized: client.telephone_normalized || "",
    country_code: client.country_code || "",
    pipeline_status: newStatus,
    origine: "crm",
    ...extraUpdates,
  };

  // nb_contacts = 1 seulement si le statut initial est un statut de contact
  if (STATUTS_CONTACT.has(newStatus)) {
    payload.dernier_contact_at = now;
    payload.nb_contacts = 1;
  } else {
    payload.dernier_contact_at = null;
    payload.nb_contacts = 0;
  }

  if (newStatus === "a_relancer") {
    payload.prochaine_relance_at = new Date(
      Date.now() + RELANCE_DELAI_JOURS * 86400000
    ).toISOString();
  }

  return payload;
}

export { RELANCE_DELAI_JOURS, STATUTS_CONTACT };