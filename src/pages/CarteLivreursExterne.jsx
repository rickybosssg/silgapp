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
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";

// ─── Constantes de seuils ────────────────────────────────────────────────────

const GPS_SEUIL_MIN = 5;          // GPS valide si < 5 min
const HEARTBEAT_SEUIL_MIN = 5;    // App active si heartbeat < 5 min
const HEARTBEAT_ON_SEUIL_MIN = 10; // ON si heartbeat < 10 min

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
 * Éligible carte = visible sur la carte dispatch
 * Conditions : ON + GPS récent < 5 min + app active
 * Inclut libre ET en_course (couleurs différentes)
 */
function isEligibleCarte(livreur) {
  return isON(livreur) && hasValidGPS(livreur) && isAppActive(livreur);
}

/**
 * Client éligible carte = actif + GPS récent < 5 min + app active
 */
function isClientEligibleCarte(client) {
  return client.actif !== false && hasValidGPS(client) && isAppActive(client);
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

  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", actif: true, validation: "valide", country_code: effectiveCountry }
    : { type_livreur: "externe", actif: true, validation: "valide" };

  const clientFilter = effectiveCountry
    ? { actif: true, country_code: effectiveCountry }
    : { actif: true };

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
    on:          livreurs.filter(l => isON(l)).length,
    off:         livreurs.filter(l => !isON(l)).length,
    libres:      livreurs.filter(l => isLibre(l)).length,
    enCourse:    livreurs.filter(l => isEnCourse(l)).length,
    appActive:   livreurs.filter(l => isAppActive(l)).length,
    appFermee:   livreurs.filter(l => !isAppActive(l)).length,
    gpsRecent:   livreurs.filter(l => hasValidGPS(l)).length,
    gpsExpire:   livreurs.filter(l => l.latitude && l.longitude && !isGPSRecent(l)).length,
    surCarte:    livreurs.filter(l => isEligibleCarte(l)).length,
  }), [livreurs]);

  // ─── Compteurs clients (règles unifiées) ────────────────────────────────
  const compteursClients = useMemo(() => ({
    total:       clients.length,
    gpsRecent:   clients.filter(c => hasValidGPS(c)).length,
    gpsExpire:   clients.filter(c => c.latitude && c.longitude && !isGPSRecent(c)).length,
    sansGPS:     clients.filter(c => !c.latitude || !c.longitude).length,
    appActive:   clients.filter(c => isAppActive(c)).length,
    surCarte:    clients.filter(c => isClientEligibleCarte(c)).length,
  }), [clients]);

  // ─── Listes filtrées ────────────────────────────────────────────────────
  const livreursAffiches = useMemo(() => {
    switch (filtreLivreur) {
      case "on":        return livreurs.filter(l => isON(l));
      case "off":       return livreurs.filter(l => !isON(l));
      case "libres":    return livreurs.filter(l => isLibre(l));
      case "en_course": return livreurs.filter(l => isEnCourse(l));
      case "app_active":return livreurs.filter(l => isAppActive(l));
      case "carte":     return livreurs.filter(l => isEligibleCarte(l));
      default:          return livreurs;
    }
  }, [livreurs, filtreLivreur]);

  // ─── Marqueurs carte — SEULS les éligibles (règles strictes) ────────────
  // Livreurs sur carte : ON + GPS < 5 min + app active
  const livreursSurCarte = useMemo(() =>
    livreurs.filter(l => isEligibleCarte(l)), [livreurs]);

  // Clients sur carte : actif + GPS < 5 min + app active
  const clientsSurCarte = useMemo(() =>
    clients.filter(c => isClientEligibleCarte(c)), [clients]);

  // Centre de la carte sur le premier livreur éligible ou Ouagadougou
  const centerPosition = livreursSurCarte[0]
    ? { latitude: livreursSurCarte[0].latitude, longitude: livreursSurCarte[0].longitude }
    : { latitude: 12.3714, longitude: -1.5197 };

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
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: "ON",         count: compteursLivreurs.on,       color: "text-green-700 bg-green-50 border-green-200",    title: "Statut actif + heartbeat < 10 min" },
            { label: "OFF",        count: compteursLivreurs.off,      color: "text-gray-500 bg-gray-50 border-gray-200",      title: "Inactif ou heartbeat > 10 min" },
            { label: "Libres",     count: compteursLivreurs.libres,   color: "text-emerald-700 bg-emerald-50 border-emerald-200", title: "Disponible + ON + app active + GPS < 5 min" },
            { label: "En course",  count: compteursLivreurs.enCourse, color: "text-orange-700 bg-orange-50 border-orange-200",title: "Mission en cours + ON" },
            { label: "Sur carte",  count: compteursLivreurs.surCarte, color: "text-purple-700 bg-purple-50 border-purple-200",title: "Visibles sur carte dispatch (ON + GPS < 5min + app active)" },
            { label: "App active", count: compteursLivreurs.appActive,color: "text-blue-700 bg-blue-50 border-blue-200",      title: "Heartbeat < 5 min" },
            { label: "App fermée", count: compteursLivreurs.appFermee,color: "text-gray-400 bg-gray-50 border-gray-200",      title: "Heartbeat > 5 min" },
            { label: "GPS récent", count: compteursLivreurs.gpsRecent,color: "text-teal-700 bg-teal-50 border-teal-200",      title: "Position GPS < 5 min" },
            { label: "GPS expiré", count: compteursLivreurs.gpsExpire,color: "text-red-500 bg-red-50 border-red-200",         title: "GPS > 5 min ou absent" },
            { label: "Total",      count: compteursLivreurs.total,    color: "text-slate-700 bg-slate-50 border-slate-200",   title: "Tous les livreurs valides" },
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: "Sur carte",  count: compteursClients.surCarte,  color: "text-blue-700 bg-blue-50 border-blue-200",      title: "Actif + GPS < 5 min + app active" },
            { label: "GPS récent", count: compteursClients.gpsRecent, color: "text-teal-700 bg-teal-50 border-teal-200",      title: "Position GPS < 5 min" },
            { label: "GPS expiré", count: compteursClients.gpsExpire, color: "text-red-500 bg-red-50 border-red-200",         title: "GPS > 5 min" },
            { label: "Sans GPS",   count: compteursClients.sansGPS,   color: "text-gray-400 bg-gray-50 border-gray-200",      title: "Aucune coordonnée GPS" },
            { label: "App active", count: compteursClients.appActive, color: "text-green-700 bg-green-50 border-green-200",   title: "Heartbeat < 5 min" },
            { label: "Total",      count: compteursClients.total,     color: "text-slate-700 bg-slate-50 border-slate-200",   title: "Tous les clients" },
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
        <p className="text-xs font-semibold text-slate-700 mb-2">Légende carte dispatch</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" /><b>🟢 Libre</b> — ON + disponible + GPS &lt; {GPS_SEUIL_MIN} min + app active</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" /><b>🟠 En course</b> — Mission en cours, ON + GPS récent</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" /><b>🔵 Client</b> — Actif + GPS &lt; {GPS_SEUIL_MIN} min + app active</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 flex-shrink-0" /><b>🔴 Course en attente</b> — créée, sans livreur, non terminée</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" /><b>⚫ Masqués</b> — OFF, GPS expiré, app fermée, non validés</span>
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
          {filtresBtns.map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filtreLivreur === f.key ? "default" : "outline"}
              onClick={() => setFiltreLivreur(f.key)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
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
              const eligibleCarte = isEligibleCarte(livreur);
              return (
                <div key={livreur.id} className={`flex items-start justify-between p-3 border rounded-lg ${eligibleCarte ? "border-green-200 bg-green-50/30" : "border-gray-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{livreur.prenom} {livreur.nom}</p>
                      {eligibleCarte && <span className="text-xs text-green-600 font-medium">📍 Sur carte</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
                      <ONBadge livreur={livreur} />
                      <StatutBadge livreur={livreur} />
                      <AppBadge entity={livreur} />
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
                    {livreur.telephone}
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
          <h2 className="font-semibold">Clients GPS récents ({compteursClients.surCarte} sur carte)</h2>
        </div>
        {clientsSurCarte.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun client avec GPS récent et app active</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clientsSurCarte.map(client => (
              <div key={client.id} className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{client.prenom} {client.nom}</p>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(client)}</span>
                    {getLastGPS(client) && (
                      <span className="flex items-center gap-1 text-teal-600">
                        <Clock className="w-3 h-3" />GPS : {getLastGPS(client)}
                      </span>
                    )}
                    <AppBadge entity={client} />
                  </div>
                </div>
                <a href={`tel:${client.telephone}`} className="text-sm text-primary hover:underline ml-3 flex-shrink-0">
                  {client.telephone}
                </a>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modale carte interactive */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-foreground">
                🗺️ Carte Dispatch — Terrain temps réel
              </h2>
              <p className="text-xs text-muted-foreground">
                🟢 {compteursLivreurs.libres} libres · 🟠 {compteursLivreurs.enCourse} en course · 🔵 {compteursClients.surCarte} clients · 🔴 {coursesEnAttente.length} en attente
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setShowMap(false); setSelectedMarker(null); }}>
              <X className="w-5 h-5" />
            </Button>
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