/**
 * i18n — SILGAPP Internationalisation
 *
 * Langue par défaut : Français (tous les pays sauf Ghana)
 * Ghana (GH) : English
 */

const translations = {
  // ─── STATUTS LIVREUR ───
  "Disponible": { en: "Available" },
  "En course": { en: "On delivery" },
  "Hors ligne": { en: "Offline" },

  // ─── STATUTS COURSE ───
  "nouvelle": { en: "New" },
  "recherche_livreur": { en: "Looking for driver" },
  "livreur_en_route": { en: "Driver on the way" },
  "colis_recupere": { en: "Package picked up" },
  "en_livraison": { en: "Out for delivery" },
  "livree": { en: "Delivered" },
  "annulee": { en: "Cancelled" },
  "en_attente_livreur": { en: "Waiting for driver" },

  // ─── DISPATCH ───
  "en_attente": { en: "Pending" },
  "propose": { en: "Offered" },
  "accepte": { en: "Accepted" },
  "expire": { en: "Expired" },
  "redispatch": { en: "Redispatch" },
  "cycle_epuise": { en: "Cycle exhausted" },

  // ─── URGENCE ───
  "normale": { en: "Normal" },
  "urgente": { en: "Urgent" },
  "tres_urgente": { en: "Very urgent" },

  // ─── TYPE COLIS ───
  "petit_colis": { en: "Small package" },
  "moyen_colis": { en: "Medium package" },
  "gros_colis": { en: "Large package" },
  "document": { en: "Document" },
  "nourriture": { en: "Food" },
  "autre": { en: "Other" },

  // ─── VÉHICULE ───
  "moto": { en: "Motorbike" },
  "velo": { en: "Bicycle" },
  "voiture": { en: "Car" },
  "a_pied": { en: "On foot" },

  // ─── BOUTONS COMMUNS ───
  "Fermer": { en: "Close" },
  "Annuler": { en: "Cancel" },
  "Valider": { en: "Confirm" },
  "Enregistrer": { en: "Save" },
  "Modifier": { en: "Edit" },
  "Supprimer": { en: "Delete" },
  "Rechercher": { en: "Search" },
  "Exporter": { en: "Export" },
  "Télécharger": { en: "Download" },
  "Envoyer": { en: "Send" },
  "Retour": { en: "Back" },
  "Continuer": { en: "Continue" },
  "Confirmer": { en: "Confirm" },
  "Refuser": { en: "Refuse" },
  "Accepter": { en: "Accept" },

  // ─── DASHBOARD ───
  "Tableau de bord": { en: "Dashboard" },
  "Courses": { en: "Deliveries" },
  "Livreurs": { en: "Drivers" },
  "Clients": { en: "Customers" },
  "Rapports": { en: "Reports" },
  "Notifications": { en: "Notifications" },
  "Paramètres": { en: "Settings" },
  "Statistiques": { en: "Statistics" },

  // ─── COURSE ───
  "Nouvelle course": { en: "New delivery" },
  "Expédier un colis": { en: "Send a package" },
  "Recevoir un colis": { en: "Receive a package" },
  "Adresse de départ": { en: "Pickup address" },
  "Adresse d'arrivée": { en: "Delivery address" },
  "Nom du client": { en: "Customer name" },
  "Téléphone client": { en: "Customer phone" },
  "Type de colis": { en: "Package type" },
  "Prix estimé": { en: "Estimated price" },
  "Distance": { en: "Distance" },
  "Distance estimée": { en: "Estimated distance" },
  "Suivi": { en: "Tracking" },
  "Trajet": { en: "Route" },

  // ─── LIVREUR ───
  "Livreur assigné": { en: "Assigned driver" },
  "Aucun livreur": { en: "No driver" },
  "En attente de livreur": { en: "Waiting for driver" },
  "Recherche livreur en cours": { en: "Looking for a driver" },
  "Livreur en route": { en: "Driver is on the way" },
  "Course acceptée": { en: "Delivery accepted" },

  // ─── QR / PIN ───
  "Code de récupération": { en: "Pickup code" },
  "Code de livraison": { en: "Delivery code" },
  "Scanner le QR code": { en: "Scan QR code" },
  "QR code de récupération": { en: "Pickup QR code" },
  "QR code de livraison": { en: "Delivery QR code" },
  "Code PIN": { en: "PIN code" },
  "Saisir le code": { en: "Enter code" },

  // ─── NOTIFICATIONS ───
  "Nouvelle course disponible": { en: "New delivery available" },
  "Course à": { en: "Delivery at" },
  "Ouvrez SILGAPP pour accepter": { en: "Open SILGAPP to accept" },
  "Course acceptée — En route": { en: "Delivery accepted — On the way" },
  "Prix accepté — La course peut commencer": { en: "Price accepted — Delivery can start" },
  "Client injoignable": { en: "Customer unreachable" },
  "Client absent": { en: "Customer absent" },

  // ─── GPS ───
  "Position GPS": { en: "GPS position" },
  "GPS non disponible": { en: "GPS unavailable" },
  "Activer le GPS": { en: "Enable GPS" },

  // ─── DIVERS ───
  "Chargement...": { en: "Loading..." },
  "Erreur": { en: "Error" },
  "Succès": { en: "Success" },
  "Aucune donnée": { en: "No data" },
  "Voir tout": { en: "View all" },
  "Aujourd'hui": { en: "Today" },
  "Hier": { en: "Yesterday" },
  "Cette semaine": { en: "This week" },
  "Ce mois": { en: "This month" },
  "Total": { en: "Total" },
  "Non": { en: "No" },
  "Oui": { en: "Yes" },
  "Tous": { en: "All" },

  // ─── VENUS ───
  "Comment puis-je vous aider ?": { en: "How can I help you?" },
  "Tapez votre message...": { en: "Type your message..." },
  "VENUS — Assistance": { en: "VENUS — Support" },
};

/**
 * Returns the language code for a given country code.
 * GH → 'en', everything else → 'fr'
 */
export function getLanguageForCountry(countryCode) {
  if (countryCode === "GH") return "en";
  return "fr";
}

/**
 * Translate a French string to the target language.
 * Falls back to the original string if no translation found.
 */
export function t(frenchString, lang = "fr") {
  if (lang === "fr") return frenchString;
  const entry = translations[frenchString];
  if (entry?.en) return entry.en;
  return frenchString;
}

export default translations;