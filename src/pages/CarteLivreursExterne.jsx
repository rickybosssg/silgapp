import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Wifi, WifiOff, X, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ModernMap from "@/components/client/ModernMap";
import MarkerInfoPanel from "@/components/carte/MarkerInfoPanel";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Heartbeat récent = dernière activité < 10 minutes */
function isHeartbeatRecent(entity) {
  const dt = entity.last_seen_at || entity.derniere_position_date;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < 10 * 60 * 1000;
}

/**
 * ON = statut disponible ou en_course ET heartbeat récent (< 10 min).
 * Si le livreur a fermé l'app il y a plus de 10 min, il n'est plus ON
 * même si la DB dit encore "disponible".
 */
function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  return actifEnDB && isHeartbeatRecent(livreur);
}

/** Libre = disponible ET heartbeat récent */
function isLibre(livreur) {
  return livreur.statut === "disponible" && isHeartbeatRecent(livreur);
}

/** En ligne = app ouverte ET heartbeat < 3 minutes */
function isEnLigne(entity) {
  if (!entity.app_active) return false;
  if (!entity.last_seen_at) return false;
  return (Date.now() - new Date(entity.last_seen_at).getTime()) < 3 * 60 * 1000;
}

/** GPS récent = dernière position < 15 minutes */
function isGPSRecent(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < 15 * 60 * 1000;
}

function getZone(entity) {
  return entity.quartier || (entity.latitude ? "Ouagadougou" : "Zone inconnue");
}

function getLastGPS(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at || entity.updated_date;
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch {
    return null;
  }
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function ONBadge({ livreur }) {
  if (isON(livreur)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        ON
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
      OFF
    </span>
  );
}

function LibreBadge({ livreur }) {
  if (livreur.statut === "disponible") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
        Libre
      </span>
    );
  }
  if (livreur.statut === "en_course") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
        En course
      </span>
    );
  }
  return null;
}

function EnLigneBadge({ entity }) {
  if (isEnLigne(entity)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
        <Wifi className="w-3 h-3" />
        Application ouverte
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3 h-3" />
      Application fermée
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  const [filtre, setFiltre] = useState("tous");
  const [selectedMarker, setSelectedMarker] = useState(null);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  
  // Admin pays : forcé sur son pays. Admin global : utilise selectedCountry
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", actif: true, validation: "valide", country_code: effectiveCountry }
    : { type_livreur: "externe", actif: true, validation: "valide" };

  const clientFilter = effectiveCountry
    ? { actif: true, country_code: effectiveCountry }
    : { actif: true };

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-carte", isPays ? adminCountryCode : "all"],
    queryFn: () => base44.entities.Livreur.filter(livreurFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes-carte", isPays ? adminCountryCode : "all"],
    queryFn: () => base44.entities.ClientExterne.filter(clientFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  // ─── Compteurs ──────────────────────────────────────────────────────────
  const compteurs = useMemo(() => ({
    on:         livreurs.filter(l => isON(l)).length,
    off:        livreurs.filter(l => !isON(l)).length,
    libres:     livreurs.filter(l => isLibre(l)).length,
    // En course = statut en_course ET heartbeat récent
    enCourse:   livreurs.filter(l => l.statut === "en_course" && isHeartbeatRecent(l)).length,
    enLigne:    livreurs.filter(l => isEnLigne(l)).length,
    horsLigne:  livreurs.filter(l => !isEnLigne(l)).length,
    gpsRecent:  livreurs.filter(l => l.latitude && l.longitude && isGPSRecent(l)).length,
  }), [livreurs]);

  // ─── Filtres ─────────────────────────────────────────────────────────────
  const livreursAffiches = useMemo(() => {
    switch (filtre) {
      case "on":        return livreurs.filter(l => isON(l));
      case "off":       return livreurs.filter(l => !isON(l));
      case "libres":    return livreurs.filter(l => isLibre(l));
      // En course : statut en_course ET heartbeat récent
      case "en_course": return livreurs.filter(l => l.statut === "en_course" && isHeartbeatRecent(l));
      case "en_ligne":  return livreurs.filter(l => isEnLigne(l));
      case "hors_ligne":return livreurs.filter(l => !isEnLigne(l));
      default:          return livreurs;
    }
  }, [livreurs, filtre]);

  // GPS récent uniquement (< 15 min) pour la carte — cohérent avec isGPSRecent
  const livreursAvecGPS = useMemo(() =>
    livreurs.filter(l => l.latitude && l.longitude && isGPSRecent(l)), [livreurs]);

  const clientsAvecGPS = clients.filter(c => c.actif !== false && c.latitude && c.longitude);

  const centerPosition = livreursAvecGPS[0]?.latitude
    ? { latitude: livreursAvecGPS[0].latitude, longitude: livreursAvecGPS[0].longitude }
    : { latitude: 12.3714, longitude: -1.5197 };

  const filtresBtns = [
    { key: "tous",      label: `Tous (${livreurs.length})` },
    { key: "on",        label: `ON (${compteurs.on})` },
    { key: "off",       label: `OFF (${compteurs.off})` },
    { key: "libres",    label: `Libres (${compteurs.libres})` },
    { key: "en_course", label: `En course (${compteurs.enCourse})` },
    { key: "en_ligne",  label: `App ouverte (${compteurs.enLigne})` },
    { key: "hors_ligne",label: `App fermée (${compteurs.horsLigne})` },
  ];
  // Note: ON = statut actif (dispo/en_course) ET heartbeat < 10 min
  // Libre = disponible ET heartbeat < 10 min
  // App ouverte = app_active ET heartbeat < 3 min

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header avec sélecteur de pays */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1">
          <Link to={isGlobal ? "/admin/global" : "/"}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              {isGlobal ? "Admin Global" : "Retour"}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Carte — Livreurs & Clients</h1>
            <p className="text-sm text-muted-foreground">
              {livreurs.length} livreurs • {compteurs.on} actifs • {livreursAvecGPS.length} GPS récent
            </p>
          </div>
        </div>
        {isGlobal && paysActifs.length > 1 && (
          <div className="flex items-center gap-2">
            <CountrySelector
              value={effectiveCountry}
              onChange={(code) => {
                setSelectedCountry(code);
              }}
              className="h-9 text-xs"
            />
          </div>
        )}
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        {[
          { label: "ON",         count: compteurs.on,        color: "text-green-700 bg-green-50 border-green-200",   title: "Actif + heartbeat < 10 min" },
          { label: "OFF",        count: compteurs.off,       color: "text-gray-500 bg-gray-50 border-gray-200",     title: "Inactif ou heartbeat expiré" },
          { label: "Libres",     count: compteurs.libres,    color: "text-emerald-700 bg-emerald-50 border-emerald-200", title: "Disponible + heartbeat < 10 min" },
          { label: "En course",  count: compteurs.enCourse,  color: "text-blue-700 bg-blue-50 border-blue-200",     title: "En mission + heartbeat récent" },
          { label: "App ouverte",count: compteurs.enLigne,   color: "text-green-700 bg-green-50 border-green-200",  title: "App ouverte < 3 min" },
          { label: "App fermée", count: compteurs.horsLigne, color: "text-gray-500 bg-gray-50 border-gray-200",     title: "App fermée ou absente" },
          { label: "GPS récent", count: compteurs.gpsRecent, color: "text-purple-700 bg-purple-50 border-purple-200", title: "Position GPS < 15 min" },
        ].map(c => (
          <div key={c.label} className={`border rounded-lg p-2 text-center ${c.color}`} title={c.title}>
            <p className="text-lg font-bold leading-none">{c.count}</p>
            <p className="text-xs mt-0.5 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Légende */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <p className="text-xs font-semibold text-slate-700 mb-2">Légende — Règles de cohérence</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /><b>ON</b> = statut actif + heartbeat &lt; 10 min</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /><b>OFF</b> = inactif OU heartbeat expiré (&gt; 10 min)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><b>Libre</b> = disponible + heartbeat &lt; 10 min</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><b>En course</b> = mission en cours + heartbeat récent</span>
          <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-green-600" /><b>App ouverte</b> = heartbeat &lt; 3 min</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400" /><b>GPS récent</b> = position envoyée &lt; 15 min</span>
        </div>
      </Card>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {filtresBtns.map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filtre === f.key ? "default" : "outline"}
            onClick={() => setFiltre(f.key)}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Bouton carte */}
      <Card className="p-4 cursor-pointer hover:shadow-lg transition-all" onClick={() => setShowMap(true)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">🗺️ Voir la carte interactive</p>
            <p className="text-xs text-muted-foreground">{livreursAvecGPS.length} livreurs GPS récent • {clientsAvecGPS.length} clients</p>
          </div>
        </div>
      </Card>

      {/* Liste des livreurs */}
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
              const zone = getZone(livreur);
              const lastGPS = getLastGPS(livreur);
              return (
                <div key={livreur.id} className="flex items-start justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm mb-1">{livreur.prenom} {livreur.nom}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2">
                      <ONBadge livreur={livreur} />
                      {isON(livreur) && <LibreBadge livreur={livreur} />}
                      <EnLigneBadge entity={livreur} />
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{zone}</span>
                      {lastGPS && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Dernier GPS : {lastGPS}</span>}
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

      {/* Clients */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="w-5 h-5 text-red-500" />
          <h2 className="font-semibold">Clients ({clientsAvecGPS.length})</h2>
        </div>
        {clientsAvecGPS.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun client avec position GPS</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clientsAvecGPS.map(client => {
              const zone = getZone(client);
              const lastGPS = getLastGPS(client);
              return (
                <div key={client.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{client.prenom} {client.nom}</p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{zone}</span>
                      {lastGPS && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Dernier GPS : {lastGPS}</span>}
                      <EnLigneBadge entity={client} />
                    </div>
                  </div>
                  <a href={`tel:${client.telephone}`} className="text-sm text-primary hover:underline ml-3 flex-shrink-0">
                    {client.telephone}
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
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
            <h2 className="text-base font-bold text-foreground">
              🗺️ Carte — {livreursAvecGPS.length} livreurs · {clientsAvecGPS.length} clients
            </h2>
            <Button variant="ghost" size="icon" onClick={() => { setShowMap(false); setSelectedMarker(null); }} className="h-9 w-9">
              <X className="w-5 h-5" />
            </Button>
          </div>
          {/* Carte + Panneau latéral */}
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <ModernMap
                position={centerPosition}
                livreursProches={[...livreursAvecGPS, ...clientsAvecGPS]}
                courseActive={null}
                onMarkerClick={(entity) => setSelectedMarker(entity)}
              />
            </div>
            {/* Panneau résumé à droite */}
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