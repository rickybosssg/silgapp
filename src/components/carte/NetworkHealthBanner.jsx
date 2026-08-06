import React from "react";

/**
 * Calcule l'état de santé du réseau dispatch.
 * Retourne { heart, label, description, color }
 */
function getNetworkHealth({ libres, enCourse, clientsGPS, clientsTotal, enAttente }) {
  const totalActifs = libres + enCourse + (clientsGPS || 0);
  const hasActivity = totalActifs > 0 || enAttente > 0;

  // Réseau inactif = ZERO livreur libre + ZERO client GPS récent + ZERO course en attente
  // Les livreurs "en course" ne comptent PAS pour activer le réseau
  if (libres === 0 && (clientsGPS || 0) === 0 && enAttente === 0) {
    return {
      heart: "",
      label: "Réseau inactif",
      description: "Aucun utilisateur actif visible.",
      bg: "bg-gray-100 border-gray-300",
      text: "text-gray-700",
    };
  }

  // Activité faible = très peu d'utilisateurs (1-2)
  if (totalActifs <= 2 && enAttente === 0) {
    return {
      heart: "",
      label: "Activité faible",
      description: "Très peu d'utilisateurs actifs sur le réseau.",
      bg: "bg-yellow-50 border-yellow-300",
      text: "text-yellow-800",
    };
  }

  // Réseau opérationnel = au moins un livreur libre ou client GPS
  if (libres > 0 || (clientsGPS || 0) > 0) {
    return {
      heart: "",
      label: "Réseau opérationnel",
      description: "Utilisateurs actifs et opérationnels.",
      bg: "bg-green-50 border-green-300",
      text: "text-green-800",
    };
  }

  // Situation intermédiaire
  return {
    heart: "",
    label: "Activité en cours",
    description: "Livreurs en mission, réseau actif.",
    bg: "bg-orange-50 border-orange-300",
    text: "text-orange-800",
  };
}

export default function NetworkHealthBanner({ libres, enCourse, clientsGPS, clientsTotal, enAttente }) {
  const health = getNetworkHealth({ libres, enCourse, clientsGPS, clientsTotal, enAttente });

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
        <StatItem emoji="" label="Livreurs libres" value={libres} />
        <StatItem emoji="" label="En course" value={enCourse} />
        <StatItem emoji="" label={`Clients${clientsTotal !== undefined && clientsTotal !== clientsGPS ? ` (${clientsTotal} totaux)` : ''}`} value={clientsGPS} />
        <StatItem emoji="" label="Courses en attente" value={enAttente} />
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
