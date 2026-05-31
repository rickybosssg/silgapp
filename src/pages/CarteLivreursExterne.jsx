import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Wifi, WifiOff, X, Clock, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DispatchMap from "@/components/carte/DispatchMap";
import MarkerInfoPanel from "@/components/carte/MarkerInfoPanel";
import NetworkHealthBanner from "@/components/carte/NetworkHealthBanner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";

// ─── Constantes de seuils ────────────────────────────────────────────────────

const GPS_SEUIL_MIN = 5;          // GPS valide si < 5 min
const HEARTBEAT_SEUIL_MIN = 5;    // App active si heartbeat < 5 min
const HEARTBEAT_ON_SEUIL_MIN = 10; // ON si heartbeat < 10 min
const GPS_EXPIRE_MIN = 10;        // GPS expiré si > 10 min → noir

// ─── Helpers (règles unifiées) ───────────────────────────────────────────────

/** GPS récent = dernière position < GPS_SEUIL_MIN minutes */
function isGPSRecent(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_SEUIL_MIN * 60 * 1000;
}

/** GPS valide = coordonnées non nulles ET récentes */
function hasValidGPS(entity) {
  return !!(entity.latitude && entity.longitude && isGPSRecent(entity));
}

/** App active = heartbeat < HEARTBEAT_SEUIL_MIN minutes */
function isAppActive(entity) {
  const dt = entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < HEARTBEAT_SEUIL_MIN * 60 * 1000;
}

/** ON = statut actif ET heartbeat < HEARTBEAT_ON_SEUIL_MIN */
function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return actifEnDB && (Date.now() - new Date(dt).getTime()) < HEARTBEAT_ON_SEUIL_MIN * 60 * 1000;
}

/** Libre = disponible + ON + app active + GPS récent → peut recevoir une course */
function isLibre(livreur) {
  return livreur.statut === "disponible" && isON(livreur) && isAppActive(livreur) && hasValidGPS(livreur);
}

/** En course = statut en_course + ON */
function isEnCourse(livreur) {
  return livreur.statut === "en_course" && isON(livreur);
}

/**
 * Livreur noir = hors ligne ou GPS expiré > 10 min
 */
function isLivreurNoir(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return true; // jamais vu
  const min = (Date.now() - new Date(dt).getTime()) / 60000;
  return min > GPS_EXPIRE_MIN || livreur.statut === "hors_ligne";
}

/**
 * Client noir = GPS absent ou expiré > 10 min
 */
function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  const dt = client.last_seen_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) > GPS_EXPIRE_MIN * 60 * 1000;
}

/**
 * Client GPS récent = position < 5 min
 */
function isClientGPSRecent(client) {
  return isGPSRecent(client);
}

const INDICATIFS = {
  BF: "+226", CI: "+225", TG: "+228", BJ: "+229",
  SN: "+221", ML: "+223", GN: "+224", NE: "+227",
};

function formatTel(tel, countryCode) {
  if (!tel) return "";
  let cleaned = tel.replace(/\s/g, "");
  if (!cleaned.startsWith("+")) {
    const indicatif = INDICATIFS[countryCode];
    if (indicatif) cleaned = `${indicatif}${cleaned}`;
  }
  // Formatage avec espaces : +226 XX XX XX XX
  return cleaned.replace(/(\+\d{3})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
}

function getZone(entity) {
  return entity.quartier || entity.ville || (entity.latitude ? "Ouagadougou" : "Zone inconnue");
}

function getLastGPS(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at || entity.updated_date;
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch { return null; }
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function ONBadge({ livreur }) {
  return isON(livreur) ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />ON
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />OFF
    </span>
  );
}

function StatutBadge({ livreur }) {
  if (isLibre(livreur)) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Libre
    </span>
  );
  if (isEnCourse(livreur)) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />En course
    </span>
  );
  return null;
}

function AppBadge({ entity }) {
  return isAppActive(entity) ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <Wifi className="w-3 h-3" />App ouverte
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3 h-3" />App fermée
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  const [filtreLivreur, setFiltreLivreur] = useState("tous");
  const [selectedMarker, setSelectedMarker] = useState(null);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const defaultCountry = paysActifs.length === 1 ? paysActifs[0].code : null;
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || defaultCountry || "");

  // Coordonnées du pays sélectionné pour centrer la carte
  const { data: allPays = [] } = useQuery({
    queryKey: ["all-pays"],
    queryFn: () => base44.entities.Country.list(),
    initialData: [],
    staleTime: 300000,
  });
  const paysData = useMemo(() => allPays.find(p => p.code === effectiveCountry), [allPays, effectiveCountry]);

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", actif: true, validation: "valide", country_code: effectiveCountry }
    : { type_livreur: "externe", actif: true, validation: "valide" };

  const clientFilter = effectiveCountry
    ? { country_code: effectiveCountry }
    : {};

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-carte", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter(livreurFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes-carte", effectiveCountry],
    queryFn: () => base44.entities.ClientExterne.filter(clientFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  // Courses en attente : créées, sans livreur assigné, non terminées/annulées
  const coursesAttenteFilter = effectiveCountry
    ? { country_code: effectiveCountry }
    : {};
  const { data: toutesCoursesExternes = [] } = useQuery({
    queryKey: ["courses-attente-carte", effectiveCountry],
    queryFn: () => base44.entities.CourseExterne.filter(coursesAttenteFilter, "-created_date", 100),
    initialData: [],
    refetchInterval: 15000,
  });

  // Filtrage côté client : sans livreur, non annulée, non terminée, avec GPS départ
  const coursesEnAttente = useMemo(() =>
    toutesCoursesExternes.filter(c =>
      !c.livreur_id &&
      c.statut !== "annulee" &&
      c.statut !== "livree" &&
      c.gps_depart_lat &&
      c.gps_depart_lng
    ), [toutesCoursesExternes]);

  // ─── Compteurs livreurs (règles unifiées) ───────────────────────────────
  const compteursLivreurs = useMemo(() => ({
    total:       livreurs.length,
    noirs:       livreurs.filter(l => isLivreurNoir(l)).length,
    verts:       livreurs.filter(l => isLibre(l)).length,
    oranges:     livreurs.filter(l => isEnCourse(l)).length,
    surCarte:    livreurs.length, // TOUS les livreurs enregistrés
  }), [livreurs]);

  // ─── Compteurs clients (règles unifiées) ────────────────────────────────
  const compteursClients = useMemo(() => ({
    total:       clients.length,
    noirs:       clients.filter(c => isClientNoir(c)).length,
    bleus:       clients.filter(c => !isClientNoir(c)).length,
    surCarte:    clients.length, // TOUS les clients enregistrés
  }), [clients]);

  // ─── Listes filtrées ────────────────────────────────────────────────────
  const livreursAffiches = useMemo(() => {
    switch (filtreLivreur) {
      case "noirs":     return livreurs.filter(l => isLivreurNoir(l));
      case "verts":     return livreurs.filter(l => isLibre(l));
      case "oranges":   return livreurs.filter(l => isEnCourse(l));
      default:          return livreurs;
    }
  }, [livreurs, filtreLivreur]);

  // ─── Marqueurs carte — TOUS les utilisateurs enregistrés ────────────
  // Livreurs sur carte : TOUS les livreurs (couleur selon état)
  const livreursSurCarte = useMemo(() => livreurs, [livreurs]);

  // Clients sur carte : TOUS les clients (couleur selon état)
  const clientsSurCarte = useMemo(() => clients, [clients]);



  // Zoom adapté au rayon du pays (rayon_km → zoom Leaflet approx)
  function rayonToZoom(rayon) {
    if (!rayon) return 12;
    if (rayon <= 10) return 14;
    if (rayon <= 20) return 13;
    if (rayon <= 40) return 12;
    if (rayon <= 80) return 11;
    return 10;
  }

  // Centre de la carte : pays sélectionné > premier livreur éligible > Ouagadougou (BF)
  const centerPosition = paysData?.latitude_centre
    ? { latitude: paysData.latitude_centre, longitude: paysData.longitude_centre, zoom: rayonToZoom(paysData.rayon_km) }
    : livreursSurCarte[0]
      ? { latitude: livreursSurCarte[0].latitude, longitude: livreursSurCarte[0].longitude, zoom: 13 }
      : { latitude: 12.3569, longitude: -1.5353, zoom: 12 };

  const filtresBtns = [
    { key: "tous",      label: `Tous (${compteursLivreurs.total})` },
    { key: "on",        label: `ON (${compteursLivreurs.on})` },
    { key: "off",       label: `OFF (${compteursLivreurs.off})` },
    { key: "libres",    label: `Libres (${compteursLivreurs.libres})` },
    { key: "en_course", label: `En course (${compteursLivreurs.enCourse})` },
    { key: "app_active",label: `App active (${compteursLivreurs.appActive})` },
    { key: "carte",     label: `Sur carte (${compteursLivreurs.surCarte})` },
  ];

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Link to={isGlobal ? "/admin/global" : "/"}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              {isGlobal ? "Admin Global" : "Retour"}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Carte Dispatch — Terrain réel</h1>
            <p className="text-sm text-muted-foreground">
              🟢 {compteursLivreurs.surCarte} livreurs · 🔵 {compteursClients.surCarte} clients · 🔴 {coursesEnAttente.length} en attente
            </p>
          </div>
        </div>
        {isGlobal && paysActifs.length > 1 && (
          <CountrySelector
            value={effectiveCountry}
            onChange={setSelectedCountry}
            className="h-9 text-xs"
          />
        )}
      </div>

      {/* Compteurs livreurs */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Livreurs</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "⚫ Noirs",    count: compteursLivreurs.noirs,   color: "text-gray-700 bg-gray-100 border-gray-300", title: "Hors ligne ou GPS > 10 min" },
            { label: "🟢 Verts",   count: compteursLivreurs.verts,   color: "text-green-700 bg-green-50 border-green-200", title: "Disponibles + GPS < 5 min" },
            { label: "🟠 Oranges", count: compteursLivreurs.oranges, color: "text-orange-700 bg-orange-50 border-orange-200", title: "En mission + GPS < 10 min" },
            { label: "📍 Total",   count: compteursLivreurs.surCarte,color: "text-purple-700 bg-purple-50 border-purple-200", title: "Tous les livreurs enregistrés" },
          ].map(c => (
            <div key={c.label} className={`border rounded-lg p-2 text-center ${c.color}`} title={c.title}>
              <p className="text-lg font-bold leading-none">{c.count}</p>
              <p className="text-xs mt-0.5 leading-tight">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Compteurs clients */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Clients</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: "⚫ Noirs",   count: compteursClients.noirs,  color: "text-gray-700 bg-gray-100 border-gray-300", title: "GPS > 10 min ou absent" },
            { label: "🔵 Bleus",  count: compteursClients.bleus,  color: "text-blue-700 bg-blue-50 border-blue-200", title: "Actifs + GPS < 10 min" },
            { label: "📍 Total",  count: compteursClients.surCarte,color: "text-purple-700 bg-purple-50 border-purple-200", title: "Tous les clients enregistrés" },
          ].map(c => (
            <div key={c.label} className={`border rounded-lg p-2 text-center ${c.color}`} title={c.title}>
              <p className="text-lg font-bold leading-none">{c.count}</p>
              <p className="text-xs mt-0.5 leading-tight">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Légende carte */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <p className="text-xs font-semibold text-slate-700 mb-2">Légende carte — Réseau SILGAPP complet</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-800 flex-shrink-0" /><b>⚫ Noir</b> — Utilisateur enregistré, hors ligne ou GPS &gt; {GPS_EXPIRE_MIN} min</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" /><b>🟢 Vert</b> — Livreur disponible + GPS &lt; {GPS_SEUIL_MIN} min + app active</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" /><b>🟠 Orange</b> — Livreur en course + GPS &lt; {GPS_SEUIL_MIN} min</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" /><b>🔵 Bleu</b> — Client actif + GPS &lt; {GPS_SEUIL_MIN} min</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 flex-shrink-0" /><b>🔴 Rouge</b> — Course en attente (sans livreur)</span>
        </div>
      </Card>

      {/* Bouton carte */}
      <Card className="p-4 cursor-pointer hover:shadow-lg transition-all border-2 border-purple-200 bg-purple-50" onClick={() => setShowMap(true)}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-purple-900">🗺️ Ouvrir la carte dispatch temps réel</p>
            <p className="text-xs text-purple-700">
              🟢 {compteursLivreurs.libres} libres · 🟠 {compteursLivreurs.enCourse} en course · 🔵 {compteursClients.surCarte} clients · 🔴 {coursesEnAttente.length} en attente
            </p>
          </div>
        </div>
      </Card>

      {/* Filtres livreurs */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filtrer les livreurs</p>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={filtreLivreur === "tous" ? "default" : "outline"}
            onClick={() => setFiltreLivreur("tous")}
            className="text-xs"
          >
            Tous ({compteursLivreurs.total})
          </Button>
          <Button
            size="sm"
            variant={filtreLivreur === "noirs" ? "default" : "outline"}
            onClick={() => setFiltreLivreur("noirs")}
            className="text-xs"
          >
            ⚫ Noirs ({compteursLivreurs.noirs})
          </Button>
          <Button
            size="sm"
            variant={filtreLivreur === "verts" ? "default" : "outline"}
            onClick={() => setFiltreLivreur("verts")}
            className="text-xs"
          >
            🟢 Verts ({compteursLivreurs.verts})
          </Button>
          <Button
            size="sm"
            variant={filtreLivreur === "oranges" ? "default" : "outline"}
            onClick={() => setFiltreLivreur("oranges")}
            className="text-xs"
          >
            🟠 Oranges ({compteursLivreurs.oranges})
          </Button>
        </div>
      </div>

      {/* Liste livreurs */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Truck className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Livreurs ({livreursAffiches.length})</h2>
        </div>
        {livreursAffiches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun livreur dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-3">
            {livreursAffiches.map(livreur => {
              const estNoir = isLivreurNoir(livreur);
              const estVert = isLibre(livreur);
              const estOrange = isEnCourse(livreur);
              const couleurBorder = estNoir ? "border-gray-400" : (estVert ? "border-green-200 bg-green-50/30" : (estOrange ? "border-orange-200 bg-orange-50/30" : "border-gray-200"));
              return (
                <div key={livreur.id} className={`flex items-start justify-between p-3 border rounded-lg ${couleurBorder}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{livreur.prenom} {livreur.nom}</p>
                      {estNoir && <span className="text-xs text-gray-500 font-medium">⚫ Hors ligne</span>}
                      {estVert && <span className="text-xs text-green-600 font-medium">🟢 Libre</span>}
                      {estOrange && <span className="text-xs text-orange-600 font-medium">🟠 En course</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
                      {!estNoir && <ONBadge livreur={livreur} />}
                      {!estNoir && <StatutBadge livreur={livreur} />}
                      {!estNoir && <AppBadge entity={livreur} />}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(livreur)}</span>
                      {getLastGPS(livreur) && (
                        <span className={`flex items-center gap-1 ${hasValidGPS(livreur) ? "text-teal-600" : "text-red-400"}`}>
                          <Clock className="w-3 h-3" />GPS : {getLastGPS(livreur)}
                        </span>
                      )}
                    </div>
                  </div>
                  <a href={`tel:${livreur.telephone}`} className="text-sm text-primary hover:underline ml-3 flex-shrink-0">
                    {formatTel(livreur.telephone, livreur.country_code)}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Liste clients */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold">Clients ({compteursClients.surCarte} sur carte)</h2>
        </div>
        {clientsSurCarte.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun client avec GPS</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clientsSurCarte.map(client => {
              const gpsRecent = isClientGPSRecent(client);
              return (
                <div key={client.id} className={`flex items-center justify-between p-3 border rounded-lg ${gpsRecent ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-gray-50/30"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{client.prenom} {client.nom}</p>
                      {gpsRecent ? (
                        <span className="text-xs text-blue-600 font-medium">🔵 GPS récent</span>
                      ) : (
                        <span className="text-xs text-gray-500 font-medium">⚫ GPS ancien</span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(client)}</span>
                      {getLastGPS(client) && (
                        <span className={`flex items-center gap-1 ${gpsRecent ? "text-teal-600" : "text-gray-400"}`}>
                          <Clock className="w-3 h-3" />GPS : {getLastGPS(client)}
                        </span>
                      )}
                      <AppBadge entity={client} />
                    </div>
                  </div>
                  <a href={`tel:${client.telephone}`} className="text-sm text-primary hover:underline ml-3 flex-shrink-0">
                    {formatTel(client.telephone, client.country_code)}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modale carte interactive */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex flex-col gap-0 border-b bg-card flex-shrink-0">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-base font-bold text-foreground">
                🗺️ Carte Dispatch — Terrain temps réel
              </h2>
              <Button variant="ghost" size="icon" onClick={() => { setShowMap(false); setSelectedMarker(null); }}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="px-4 pb-3 flex items-center gap-3">
              <div className="flex-1">
                <NetworkHealthBanner
                  libres={compteursLivreurs.libres}
                  enCourse={compteursLivreurs.enCourse}
                  clientsGPS={compteursClients.surCarte}
                  enAttente={coursesEnAttente.length}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <DispatchMap
                position={centerPosition}
                livreurs={livreursSurCarte}
                clients={clientsSurCarte}
                courses={coursesEnAttente}
                onMarkerClick={(entity) => setSelectedMarker(entity)}
              />
            </div>
            {selectedMarker && (
              <MarkerInfoPanel
                entity={selectedMarker}
                onClose={() => setSelectedMarker(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}