import { X, MapPin, Clock, Phone, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const CATEGORY_CONFIG = {
  libre_total: {
    label: "Libres — Tous dispatchables (GPS ≤ 60 min)",
    short: "Dispatchables",
    color: "text-green-700",
    bg: "bg-green-100",
    dot: "bg-green-500",
    border: "border-green-200",
    description: "Disponibles avec GPS récent ou ancien — tous dispatchables",
  },
  libre_gps_recent: {
    label: "Libres — GPS récent (≤ 10 min)",
    short: "Priorité max",
    color: "text-green-700",
    bg: "bg-green-100",
    dot: "bg-green-500",
    border: "border-green-200",
    description: "Disponibles, GPS récent — priorité de dispatch maximale",
  },
  libre_gps_ancien: {
    label: "Libres — GPS ancien (10-60 min)",
    short: "Fallback",
    color: "text-amber-700",
    bg: "bg-amber-100",
    dot: "bg-amber-500",
    border: "border-amber-200",
    description: "Disponibles, GPS 10-60 min — dispatchable en fallback si aucun GPS récent",
  },
  gps_expire: {
    label: "GPS expiré (> 60 min)",
    short: "Non dispatchable",
    color: "text-gray-700",
    bg: "bg-gray-100",
    dot: "bg-gray-500",
    border: "border-gray-200",
    description: "GPS > 60 min ou absent — non dispatchable, application probablement fermée",
  },
  en_course: {
    label: "En course",
    short: "En mission",
    color: "text-orange-700",
    bg: "bg-orange-100",
    dot: "bg-orange-500",
    border: "border-orange-200",
    description: "Livreur avec une course active en cours",
  },
  hors_ligne: {
    label: "Hors ligne",
    short: "Inactifs",
    color: "text-gray-600",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
    border: "border-gray-200",
    description: "Hors ligne, bloqué ou non validé",
  },
};

function getLastGPS(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at || entity.updated_date;
  if (!dt) return "Jamais";
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch {
    return "?";
  }
}

function getGPSAgeMin(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return null;
  return Math.round((Date.now() - new Date(dt).getTime()) / 60000);
}

export default function LivreurCategoryDialog({ category, livreurs, onClose }) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return null;

  const list = livreurs || [];

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${config.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
              <span className={`w-3 h-3 rounded-full ${config.dot}`} />
            </div>
            <div>
              <h3 className={`font-bold text-base ${config.color}`}>{config.label}</h3>
              <p className="text-xs text-gray-500">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-black ${config.color}`}>{list.length}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-gray-100 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {list.length === 0 ? (
            <div className="py-12 text-center">
              <Truck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">Aucun livreur dans cette catégorie</p>
            </div>
          ) : (
            list.map(livreur => {
              const gpsAge = getGPSAgeMin(livreur);
              const hasGPS = !!(livreur.latitude && livreur.longitude);
              return (
                <div key={livreur.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black ${config.bg} ${config.color}`}>
                    {(livreur.prenom || livreur.nom || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {livreur.prenom} {livreur.nom}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {livreur.quartier || livreur.ville || (hasGPS ? "Position GPS" : "Zone inconnue")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getLastGPS(livreur)}
                      </span>
                    </div>
                  </div>
                  {livreur.telephone && (
                    <a
                      href={`tel:${livreur.telephone}`}
                      className="text-xs text-primary font-medium hover:underline flex-shrink-0 flex items-center gap-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <Phone className="w-3 h-3" />
                      Appeler
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}