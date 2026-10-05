// ═══════════════════════════════════════════════════════════════════════════
// crmPilotMessage.js — Message WhatsApp pilote CRM avec liens de téléchargement
// ═══════════════════════════════════════════════════════════════════════════
//
// Source de vérité unique pour le message WhatsApp de conversion CRM.
// Utilisé par ClientFicheDialog et CrmProspectionPanel.
//
// RÈGLES :
//   - L'admin ouvre WhatsApp manuellement — AUCUN envoi automatique
//   - Les liens Play Store et App Store sont cliquables dans WhatsApp
//   - Pas de détection Android/iPhone — les deux liens sont affichés
//   - Le canal admin reste ouvert (migration progressive, pas de rupture)
// ═══════════════════════════════════════════════════════════════════════════

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.base6a0ec08f3af5e1d1284254c1.app";

export const APP_STORE_URL =
  "https://apps.apple.com/bf/app/silgapp/id6782046749?l=fr-FR";

export const PILOT_WHATSAPP_MESSAGE = [
  "Bonjour 👋",
  "",
  "Vous utilisez déjà SILGAPP pour vos livraisons.",
  "",
  "Vous pouvez désormais créer vous-même vos demandes de livraison directement dans l'application SILGAPP, sans attendre que notre équipe crée la course pour vous.",
  "",
  "Vous continuez à vendre comme d'habitude : WhatsApp, Facebook, boutique, restaurant, téléphone, etc.",
  "",
  "Quand vous avez une livraison, SILGAPP vous trouve un livreur. 🛵",
  "",
  "📲 Téléchargez SILGAPP :",
  "",
  "Android :",
  PLAY_STORE_URL,
  "",
  "iPhone :",
  APP_STORE_URL,
  "",
  "Si vous le souhaitez, nous pouvons vous accompagner pour votre première utilisation.",
].join("\n");

/**
 * Construit le lien wa.me avec le message pilote prérempli.
 *
 * @param {string} phoneNormalized — Téléphone normalisé (format international sans +)
 * @returns {string|null} Lien wa.me ou null si téléphone invalide
 */
export function buildPilotWhatsAppLink(phoneNormalized) {
  if (!phoneNormalized) return null;
  return `https://wa.me/${phoneNormalized}?text=${encodeURIComponent(PILOT_WHATSAPP_MESSAGE)}`;
}

// ── Vagues du pilote CRM V1 ──
export const PILOT_V1_A_CAMPAIGN_ID = "pilote_v1_a";
export const PILOT_V1_B_CAMPAIGN_ID = "pilote_v1_b";

export const PILOT_WAVES = [
  { id: PILOT_V1_A_CAMPAIGN_ID, label: "V1-A", description: "5 premiers prospects" },
  { id: PILOT_V1_B_CAMPAIGN_ID, label: "V1-B", description: "5 prospects suivants" },
];