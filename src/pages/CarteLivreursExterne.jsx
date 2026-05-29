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
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** ON = le livreur accepte des courses (statut disponible ou en_course) */
function isON(livreur) {
  return livreur.statut === "disponible" || livreur.statut === "en_course";
}

/** Libre = disponible pour une nouvelle mission */
function isLibre(livreur) {
  return livreur.statut === "disponible";
}

/** En ligne = app ouverte < 3 minutes */
function isEnLigne(entity) {
  if (!entity.app_active) return false;
  if (!entity.last_seen_at) return false;
  return (Date.now() - new Date(entity.last_seen_at).getTime()) < 3 * 60 * 1000;
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
        En ligne
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3 h-3" />
      Hors ligne
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  const [filtre, setFiltre] = useState("tous");

  // Charger TOUS les livreurs externes valides (ON ou OFF)
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-carte"],
    queryFn: () => base44.entities.Livreur.filter({
      type_livreur: "externe",
      actif: true,
      validation: "valide",
    }),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes-carte"],
    queryFn: () => base44.entities.ClientExterne.filter({ actif: true }),
    initialData: [],
    refetchInterval: 15000,
  });

  // ─── Compteurs ──────────────────────────────────────────────────────────
  const compteurs = useMemo(() => ({
    on:        livreurs.filter(l => isON(l)).length,
    off:       livreurs.filter(l => !isON(l)).length,
    libres:    livreurs.filter(l => isLibre(l)).length,
    enCourse:  livreurs.filter(l => l.statut === "en_course").length,
    enLigne:   livreurs.filter(l => isEnLigne(l)).length,
    horsLigne: livreurs.filter(l => !isEnLigne(l)).length,
  }), [livreurs]);

  // ─── Filtres ─────────────────────────────────────────────────────────────
  const livreursAffiches = useMemo(() => {
    switch (filtre) {
      case "on":        return livreurs.filter(l => isON(l));
      case "off":       return livreurs.filter(l => !isON(l));
      case "libres":    return livreurs.filter(l => isLibre(l));
      case "en_course": return livreurs.filter(l => l.statut === "en_course");
      case "en_ligne":  return livreurs.filter(l => isEnLigne(l));
      case "hors_ligne":return livreurs.filter(l => !isEnLigne(l));
      default:          return livreurs;
    }
  }, [livreurs, filtre]);

  const livreursAvecGPS = useMemo(() =>
    livreurs.filter(l => l.latitude && l.longitude), [livreurs]);

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
    { key: "en_ligne",  label: `En ligne (${compteurs.enLigne})` },
    { key: "hors_ligne",label: `Hors ligne (${compteurs.horsLigne})` },
  ];

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carte — Livreurs & Clients</h1>
          <p className="text-sm text-muted-foreground">
            {livreurs.length} livreurs • {clientsAvecGPS.length} clients GPS
          </p>
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "ON",        count: compteurs.on,        color: "text-green-700 bg-green-50 border-green-200" },
          { label: "OFF",       count: compteurs.off,       color: "text-gray-500 bg-gray-50 border-gray-200" },
          { label: "Libres",    count: compteurs.libres,    color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "En course", count: compteurs.enCourse,  color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "En ligne",  count: compteurs.enLigne,   color: "text-green-700 bg-green-50 border-green-200" },
          { label: "Hors ligne",count: compteurs.horsLigne, color: "text-gray-500 bg-gray-50 border-gray-200" },
        ].map(c => (
          <div key={c.label} className={`border rounded-lg p-2 text-center ${c.color}`}>
            <p className="text-lg font-bold leading-none">{c.count}</p>
            <p className="text-xs mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Légende */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <p className="text-xs font-semibold text-slate-700 mb-2">Légende</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /><b>ON</b> = accepte les nouvelles courses</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /><b>OFF</b> = n'accepte plus de nouvelles courses</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><b>Libre</b> = peut recevoir une course</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><b>En course</b> = mission en cours</span>
          <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-green-600" /><b>En ligne</b> = présent dans l'application</span>
          <span className="flex items-center gap-1.5"><WifiOff className="w-3 h-3 text-gray-400" /><b>Hors ligne</b> = absent de l'application</span>
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
            <p className="text-xs text-muted-foreground">{livreursAvecGPS.length} livreurs avec GPS • {clientsAvecGPS.length} clients</p>
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
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center justify-between p-4 border-b bg-card">
            <h2 className="text-lg font-bold text-foreground">Carte — Livreurs Externes</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} className="h-10 w-10">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="h-[calc(100vh-80px)]">
            <ModernMap
              position={centerPosition}
              livreursProches={livreursAvecGPS}
              courseActive={null}
            />
          </div>
        </div>
      )}
    </div>
  );
}