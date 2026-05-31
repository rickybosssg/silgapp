import React from "react";
import { X, Phone, MapPin, Clock, Wifi, WifiOff, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

function isEnLigne(entity) {
  if (!entity?.app_active) return false;
  if (!entity?.last_seen_at) return false;
  return (Date.now() - new Date(entity.last_seen_at).getTime()) < 3 * 60 * 1000;
}

function getLastGPS(entity) {
  const dt = entity?.derniere_position_date || entity?.last_seen_at || entity?.updated_date;
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch {
    return null;
  }
}

function isLivreur(entity) {
  return !!(entity?.vehicule || entity?.type_vehicule || entity?.statut);
}

export default function MarkerInfoPanel({ entity, onClose }) {
  if (!entity) return null;

  const enLigne = isEnLigne(entity);
  const lastGPS = getLastGPS(entity);
  const zone = entity.quartier || entity.ville || "Zone inconnue";
  const isLiv = isLivreur(entity);

  const statutLabel = isLiv
    ? entity.statut === "disponible" ? "Libre" : entity.statut === "en_course" ? "En course" : "Hors ligne"
    : null;
  const statutColor = isLiv
    ? entity.statut === "disponible" ? "bg-emerald-100 text-emerald-700" : entity.statut === "en_course" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
    : null;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-72 flex-shrink-0 shadow-xl">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${isLiv ? "bg-green-600" : "bg-red-600"}`}>
        <div className="flex items-center gap-2">
          {isLiv ? <Truck className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
          <span className="text-white text-sm font-semibold">{isLiv ? "Livreur" : "Client"}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Avatar + Nom */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${isLiv ? "border-2 border-green-500" : "border-2 border-red-400"}`}>
          {entity.photo_url ? (
            <img src={entity.photo_url} alt={entity.nom} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center font-bold text-xl text-white ${isLiv ? "bg-green-500" : "bg-red-500"}`}>
              {(entity.prenom || entity.nom || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-base leading-tight">
            {entity.prenom} {entity.nom}
          </p>
          {isLiv && statutLabel && (
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statutColor}`}>
              {statutLabel}
            </span>
          )}
        </div>
      </div>

      {/* Infos */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Téléphone */}
        {entity.telephone && (
          <a
            href={`tel:${entity.telephone}`}
            className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-green-50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Téléphone</p>
              <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">{entity.telephone}</p>
            </div>
          </a>
        )}

        {/* Zone / Quartier */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Zone</p>
            <p className="text-sm font-semibold text-gray-800">{zone}</p>
          </div>
        </div>

        {/* Statut application */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${enLigne ? "bg-green-100" : "bg-gray-100"}`}>
            {enLigne ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-gray-400" />}
          </div>
          <div>
            <p className="text-xs text-gray-500">Application</p>
            <p className={`text-sm font-semibold ${enLigne ? "text-green-700" : "text-gray-500"}`}>
              {enLigne ? "Ouverte" : "Fermée"}
            </p>
          </div>
        </div>

        {/* Dernier GPS */}
        {lastGPS && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Dernier GPS</p>
              <p className="text-sm font-semibold text-gray-800">{lastGPS}</p>
            </div>
          </div>
        )}

        {/* Infos livreur spécifiques */}
        {isLiv && (
          <>
            {entity.vehicule && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Véhicule</p>
                  <p className="text-sm font-semibold text-gray-800 capitalize">{entity.vehicule}</p>
                </div>
              </div>
            )}
            {entity.note_moyenne > 0 && (
              <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                <p className="text-xs text-yellow-600 font-semibold mb-1">Note</p>
                <p className="text-lg font-bold text-yellow-700">
                  ⭐ {Number(entity.note_moyenne).toFixed(1)} <span className="text-xs font-normal text-yellow-600">({entity.nombre_avis} avis)</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}