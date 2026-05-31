import React from "react";

/**
 * Calcule la qualité GPS d'un utilisateur
 * Retourne { emoji, label, color, heart }
 */
export function getGPSHealth(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) {
    return {
      emoji: "❤️‍🔥",
      label: "GPS Expiré",
      description: "> 30 min",
      color: "text-red-600",
      bg: "bg-red-50 border-red-300",
      heart: "❤️‍🔥"
    };
  }

  const min = Math.round((Date.now() - new Date(dt).getTime()) / 60000);

  if (min < 2) {
    return {
      emoji: "❤️",
      label: "GPS Excellent",
      description: "< 2 min",
      color: "text-red-600",
      bg: "bg-red-50 border-red-300",
      heart: "❤️"
    };
  }

  if (min < 5) {
    return {
      emoji: "💚",
      label: "GPS Bon",
      description: "2-5 min",
      color: "text-green-600",
      bg: "bg-green-50 border-green-300",
      heart: "💚"
    };
  }

  if (min < 15) {
    return {
      emoji: "🧡",
      label: "GPS Moyen",
      description: "5-15 min",
      color: "text-orange-600",
      bg: "bg-orange-50 border-orange-300",
      heart: "🧡"
    };
  }

  if (min < 30) {
    return {
      emoji: "❤️‍🩹",
      label: "GPS Faible",
      description: "15-30 min",
      color: "text-pink-600",
      bg: "bg-pink-50 border-pink-300",
      heart: "❤️‍🩹"
    };
  }

  return {
    emoji: "❤️‍🔥",
    label: "GPS Expiré",
    description: "> 30 min",
    color: "text-red-600",
    bg: "bg-red-50 border-red-300",
    heart: "❤️‍🔥"
  };
}

/**
 * Badge de qualité GPS
 */
export function GPSHealthBadge({ entity, showLabel = true, compact = false }) {
  const health = getGPSHealth(entity);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${health.color}`}>
        <span>{health.emoji}</span>
        {showLabel && <span>{health.label}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg border ${health.bg}`}>
      <span className="text-lg">{health.emoji}</span>
      <div className="flex flex-col leading-none">
        <span className={`text-xs font-bold ${health.color}`}>{health.label}</span>
        <span className="text-xs text-gray-500">{health.description}</span>
      </div>
    </span>
  );
}

export default GPSHealthBadge;