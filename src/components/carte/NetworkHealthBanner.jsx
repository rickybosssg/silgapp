import React from "react";

/**
 * Calcule l'état de santé du réseau dispatch.
 * Retourne { heart, label, description, color }
 */
function getNetworkHealth({ libres, enCourse, enAttente }) {
  const hasActivity = libres > 0 || enCourse > 0 || enAttente > 0;

  if (!hasActivity) {
    return {
      heart: "🖤",
      label: "Réseau inactif",
      description: "Aucun livreur actif, aucune course en attente.",
      bg: "bg-gray-100 border-gray-300",
      text: "text-gray-700",
    };
  }

  if (libres === 0 && enAttente >= 1) {
    return {
      heart: "❤️",
      label: "Réseau saturé",
      description: "Aucun livreur libre pour les courses en attente.",
      bg: "bg-red-50 border-red-300",
      text: "text-red-800",
    };
  }

  if (libres <= 1 && enAttente >= 2) {
    return {
      heart: "🧡",
      label: "Réseau fortement sollicité",
      description: "Très peu de livreurs disponibles face à la demande.",
      bg: "bg-orange-50 border-orange-300",
      text: "text-orange-800",
    };
  }

  if (libres <= 2 && enAttente >= 1) {
    return {
      heart: "💛",
      label: "Réseau sous tension",
      description: "Peu de livreurs libres, la demande est en hausse.",
      bg: "bg-yellow-50 border-yellow-300",
      text: "text-yellow-800",
    };
  }

  return {
    heart: "💚",
    label: "Réseau sain",
    description: "Livreurs disponibles, situation maîtrisée.",
    bg: "bg-green-50 border-green-300",
    text: "text-green-800",
  };
}

export default function NetworkHealthBanner({ libres, enCourse, clientsGPS, enAttente }) {
  const health = getNetworkHealth({ libres, enCourse, enAttente });

  return (
    <div className={`border rounded-xl px-4 py-3 ${health.bg} flex flex-col sm:flex-row sm:items-center gap-3`}>
      {/* Cœur + état */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-3xl leading-none" role="img" aria-label={health.label}>
          {health.heart}
        </span>
        <div>
          <p className={`font-bold text-sm leading-tight ${health.text}`}>{health.label}</p>
          <p className={`text-xs leading-tight opacity-80 ${health.text}`}>{health.description}</p>
        </div>
      </div>

      {/* Séparateur vertical (desktop) */}
      <div className="hidden sm:block w-px bg-current opacity-20 self-stretch mx-1" />

      {/* Stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <StatItem emoji="🟢" label="Livreurs libres" value={libres} />
        <StatItem emoji="🟠" label="En course" value={enCourse} />
        <StatItem emoji="🔵" label="Clients GPS" value={clientsGPS} />
        <StatItem emoji="🔴" label="Courses en attente" value={enAttente} />
      </div>
    </div>
  );
}

function StatItem({ emoji, label, value }) {
  return (
    <span className="flex items-center gap-1 text-xs text-gray-700 font-medium whitespace-nowrap">
      <span>{emoji}</span>
      <span className="font-bold">{value}</span>
      <span className="text-gray-500 font-normal">{label}</span>
    </span>
  );
}