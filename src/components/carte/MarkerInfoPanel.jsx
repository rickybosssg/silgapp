import React from "react";
import { X, Phone, MessageCircle, MapPin, Clock, Wifi, WifiOff, Truck, User, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const GPS_SEUIL_MIN = 5;
const GPS_CLIENT_SEUIL_MIN = 30;

function isEnLigne(entity) {
  if (!entity?.app_active) return false;
  if (!entity?.last_seen_at) return false;
  return (Date.now() - new Date(entity.last_seen_at).getTime()) < 3 * 60 * 1000;
}

function getLastGPSMin(entity) {
  const dt = entity?.derniere_position_date || entity?.last_seen_at || entity?.updated_date;
  if (!dt) return null;
  return Math.round((Date.now() - new Date(dt).getTime()) / 60000);
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

function getGPSHealthEmoji(gpsMin) {
  if (gpsMin === null) return { emoji: "❓", label: "Inconnu", color: "text-gray-500" };
  if (gpsMin < 2) return { emoji: "❤️", label: "Excellent", color: "text-green-600" };
  if (gpsMin < 5) return { emoji: "💚", label: "Bon", color: "text-green-600" };
  if (gpsMin < 15) return { emoji: "🧡", label: "Moyen", color: "text-orange-600" };
  if (gpsMin < 30) return { emoji: "💗", label: "Faible", color: "text-red-600" };
  return { emoji: "❤️‍🔥", label: "Expiré", color: "text-red-700" };
}

function isLivreur(entity) {
  return !!(entity?.vehicule || entity?.type_vehicule || entity?.statut);
}

function formatTel(tel, countryCode) {
  if (!tel) return "";
  let cleaned = tel.replace(/\s/g, "");
  const indicatifs = { BF: "+226", CI: "+225", TG: "+228", BJ: "+229", SN: "+221", ML: "+223", GN: "+224", NE: "+227" };
  if (!cleaned.startsWith("+")) {
    const indicatif = indicatifs[countryCode] || "+226";
    cleaned = `${indicatif}${cleaned}`;
  }
  return cleaned.replace(/(\+\d{3})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
}

const PAYS_EMOJIS = { BF: "🇧🇫", CI: "🇨🇮", TG: "🇹🇬", BJ: "🇧🇯", SN: "🇸🇳", ML: "🇲🇱", GN: "🇬🇳", NE: "🇳🇪" };

export default function MarkerInfoPanel({ entity, onClose }) {
  if (!entity) return null;

  const enLigne = isEnLigne(entity);
  const lastGPSMin = getLastGPSMin(entity);
  const lastGPS = getLastGPS(entity);
  const gpsHealth = getGPSHealthEmoji(lastGPSMin);
  const zone = entity.quartier || entity.ville || "Zone inconnue";
  const isLiv = isLivreur(entity);
  const countryCode = entity.country_code || "BF";
  const paysEmoji = PAYS_EMOJIS[countryCode] || "🌍";

  const statutLabel = isLiv
    ? entity.statut === "disponible" ? "Libre" : entity.statut === "en_course" ? "En course" : "Hors ligne"
    : null;
  const statutColor = isLiv
    ? entity.statut === "disponible" ? "bg-emerald-100 text-emerald-700" : entity.statut === "en_course" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
    : null;

  const telFormatted = formatTel(entity.telephone, countryCode);
  const whatsappUrl = `https://wa.me/${entity.telephone?.replace(/\+/g, "")}`;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-80 flex-shrink-0 shadow-xl">
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

      {/* Avatar + Nom + Pays */}
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
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 text-base leading-tight truncate">
            {entity.prenom} {entity.nom}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-lg">{paysEmoji}</span>
            <span className="text-xs text-gray-500 font-medium">{countryCode}</span>
          </div>
        </div>
      </div>

      {/* Boutons action rapide */}
      {entity.telephone && (
        <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
          <a href={`tel:${entity.telephone}`} className="flex-1">
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white" size="sm">
              <Phone className="w-4 h-4 mr-1" /> Appeler
            </Button>
          </a>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
              <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
            </Button>
          </a>
        </div>
      )}

      {/* Infos */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Statut (livreurs uniquement) */}
        {isLiv && statutLabel && (
          <div className="p-3 rounded-xl bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Statut</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${statutColor}`}>
              {statutLabel}
            </span>
          </div>
        )}

        {/* Zone / Quartier */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">Zone</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{zone}</p>
          </div>
        </div>

        {/* Santé GPS */}
        <div className="p-3 rounded-xl bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">Qualité GPS</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{gpsHealth.emoji}</span>
            <div>
              <p className={`text-sm font-bold ${gpsHealth.color}`}>{gpsHealth.label}</p>
              {lastGPS && <p className="text-xs text-gray-500">{lastGPS}</p>}
            </div>
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
            {entity.courses_du_jour !== undefined && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-600 font-semibold mb-1">Courses aujourd'hui</p>
                <p className="text-2xl font-bold text-blue-700">{entity.courses_du_jour || 0}</p>
              </div>
            )}
            {entity.note_moyenne > 0 && (
              <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                <p className="text-xs text-yellow-600 font-semibold mb-1">Note moyenne</p>
                <p className="text-lg font-bold text-yellow-700">
                  ⭐ {Number(entity.note_moyenne).toFixed(1)} <span className="text-xs font-normal text-yellow-600">({entity.nombre_avis} avis)</span>
                </p>
              </div>
            )}
          </>
        )}

        {/* Infos client spécifiques */}
        {!isLiv && entity.created_date && (
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
            <p className="text-xs text-purple-600 font-semibold mb-1">Membre depuis</p>
            <p className="text-sm font-bold text-purple-700">
              {new Date(entity.created_date).toLocaleDateString('fr-FR')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}