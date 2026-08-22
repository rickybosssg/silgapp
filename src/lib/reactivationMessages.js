/**
 * Bibliothèque de modèles de messages pour les campagnes de réactivation.
 * Tous les modèles sont modifiables par l'admin.
 */

export const MESSAGE_TEMPLATES = [
  {
    id: "premiere_utilisation",
    label: "Première utilisation",
    icon: "✨",
    title: "SILGAPP est prêt pour vous",
    message: "Vous avez SILGAPP, mais vous ne l'avez pas encore essayé 😉 Besoin d'envoyer un colis ou de faire récupérer quelque chose ? SILGAPP est prêt.",
    target_segment: "push_active",
    target_behavior: "0_course",
  },
  {
    id: "repas",
    label: "Repas",
    icon: "🍛",
    title: "Faites-vous livrer votre repas",
    message: "Pas envie de sortir ? 🍛 Faites récupérer votre repas avec SILGAPP.",
    target_segment: "push_active",
    target_behavior: "any",
  },
  {
    id: "gain_temps",
    label: "Gain de temps",
    icon: "⏱️",
    title: "Gagnez du temps",
    message: "Une course à faire ? Gagnez du temps, SILGAPP s'en charge.",
    target_segment: "push_active",
    target_behavior: "any",
  },
  {
    id: "retour_client",
    label: "Retour client",
    icon: "👋",
    title: "Ça fait un moment !",
    message: "Ça fait un moment ! Votre prochain livreur SILGAPP est à quelques clics.",
    target_segment: "push_active",
    target_behavior: "inactive_30d",
  },
  {
    id: "colis",
    label: "Envoi de colis",
    icon: "📦",
    title: "Besoin d'envoyer un colis ?",
    message: "📦 Envoyez un colis aujourd'hui avec SILGAPP. Livraison rapide et fiable.",
    target_segment: "push_active",
    target_behavior: "any",
  },
  {
    id: "deplacement",
    label: "Déplacement",
    icon: "🛵",
    title: "Un déplacement à faire ?",
    message: "🛵 Besoin d'un motard ? Réservez votre course SILGAPP en quelques secondes.",
    target_segment: "push_active",
    target_behavior: "any",
  },
];

export function getTemplateById(id) {
  return MESSAGE_TEMPLATES.find((t) => t.id === id) || null;
}