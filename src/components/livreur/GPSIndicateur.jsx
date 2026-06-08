import React from "react";
import { Navigation, RefreshCw, AlertCircle } from "lucide-react";

/**
 * Indicateur GPS universel pour livreurs et clients
 * 🟢 GPS récent (<2 min)
 * 🟠 GPS ancien (2-10 min)
 * 🔴 GPS perdu (>10 min)
 */
export default function GPSIndicateur({ indicateur, ageMinutes, onActualiser, loading = false }) {
  const config = {
    recent: {
      dot: "bg-green-500",
      badge: "bg-green-100 text-green-700 border-green-200",
      label: "GPS récent",
      detail: ageMinutes !== null ? `${Math.round(ageMinutes < 1 ? 0 : ageMinutes)} min` : null,
    },
    ancien: {
      dot: "bg-amber-500",
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      label: "GPS ancien",
      detail: ageMinutes !== null ? `${Math.round(ageMinutes)} min` : null,
    },
    perdu: {
      dot: "bg-red-500",
      badge: "bg-red-100 text-red-700 border-red-200",
      label: "GPS perdu",
      detail: ageMinutes !== null ? `${Math.round(ageMinutes)} min` : null,
    },
    null: {
      dot: "bg-gray-400",
      badge: "bg-gray-100 text-gray-500 border-gray-200",
      label: "GPS inactif",
      detail: null,
    },
  };

  const c = config[indicateur] || config.null;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${c.badge}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot} ${indicateur === "recent" ? "animate-pulse" : ""}`} />
      <Navigation className="w-2.5 h-2.5 flex-shrink-0" />
      <span>{c.label}</span>
      {c.detail && <span className="opacity-70">· {c.detail}</span>}
      {onActualiser && (
        <button
          onClick={(e) => { e.stopPropagation(); onActualiser(); }}
          disabled={loading}
          className="ml-0.5 hover:opacity-70 transition-opacity"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

/**
 * Alerte GPS plein écran si permission refusée
 */
export function GPSAlerteBanner({ permissionStatut, onDemanderPermission }) {
  if (permissionStatut === "granted" || permissionStatut === "checking") return null;

  return (
    <div className="rounded-2xl bg-red-50 border-2 border-red-200 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
        <AlertCircle className="w-5 h-5 text-red-600" />
      </div>
      <div className="flex-1">
        <p className="font-bold text-red-900 text-sm">GPS refusé</p>
        <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
          Le GPS est nécessaire pour recevoir des courses et être visible sur la carte.
        </p>
        <button
          onClick={onDemanderPermission}
          className="mt-2 text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
        >
          Autoriser le GPS
        </button>
      </div>
    </div>
  );
}