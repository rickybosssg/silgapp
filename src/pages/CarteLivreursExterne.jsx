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

/**
 * Détermine si un livreur est "présent dans l'app" (app ouverte, GPS actif récent).
 * La DISPONIBILITÉ (statut disponible/en_course) est indépendante de la présence app.
 */
function isPresenceApp(livreur) {
  if (!livreur.app_active) return false;
  if (!livreur.last_seen_at) return false;
  const lastSeen = new Date(livreur.last_seen_at);
  return (Date.now() - lastSeen.getTime()) < 3 * 60 * 1000; // 3 minutes
}

/**
 * Formatte la zone à partir du quartier ou des coordonnées GPS.
 * Pour les clients, on utilise le quartier stocké en BDD (mis à jour lors des syncs GPS).
 */
function getZone(entity) {
  return entity.quartier || (entity.latitude ? `${entity.latitude.toFixed(3)}, ${entity.longitude.toFixed(3)}` : "Zone inconnue");
}

/**
 * Formatte le délai depuis le dernier GPS.
 * Clients : last_seen_at (heartbeat) ou updated_date (fallback)
 * Livreurs : derniere_position_date ou last_seen_at
 */
function getLastGPS(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at || entity.updated_date;
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch {
    return null;
  }
}

function PresenceBadge({ livreur }) {
  const enLigne = isPresenceApp(livreur);
  if (enLigne) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs flex items-center gap-1">
        <Wifi className="w-3 h-3" />
        En ligne
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-gray-500 text-xs flex items-center gap-1">
      <WifiOff className="w-3 h-3" />
      Hors ligne
    </Badge>
  );
}

function DispoStatutBadge({ statut }) {
  if (statut === "disponible") {
    return <Badge className="bg-emerald-500 text-white text-xs">Disponible</Badge>;
  }
  if (statut === "en_course") {
    return <Badge className="bg-blue-500 text-white text-xs">En course</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Hors ligne</Badge>;
}

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  const [filtrePresence, setFiltrePresence] = useState("tous"); // tous | connectes | disponibles

  // Charger TOUS les livreurs disponibles ou en_course (peu importe app_active)
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-carte"],
    queryFn: () => base44.entities.Livreur.filter({
      type_livreur: "externe",
      statut: ["disponible", "en_course"],
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

  const livreursAvecGPS = useMemo(() =>
    livreurs.filter(l => l.latitude && l.longitude),
    [livreurs]
  );

  const livreursConnectes = useMemo(() =>
    livreurs.filter(l => isPresenceApp(l)),
    [livreurs]
  );

  const livreursDisponibles = useMemo(() =>
    livreurs.filter(l => l.statut === "disponible"),
    [livreurs]
  );

  const livreursAffiches = useMemo(() => {
    if (filtrePresence === "connectes") return livreursConnectes;
    if (filtrePresence === "disponibles") return livreursDisponibles;
    return livreurs;
  }, [livreurs, livreursConnectes, livreursDisponibles, filtrePresence]);

  // Clients : tous ceux avec GPS connu (même ancienne position)
  const clientsAvecGPS = clients.filter(c => c.actif !== false && c.latitude && c.longitude);
  const clientsEnLigne = clientsAvecGPS; // alias pour compatibilité carte

  const centerPosition = livreursAvecGPS[0]?.latitude
    ? { latitude: livreursAvecGPS[0].latitude, longitude: livreursAvecGPS[0].longitude }
    : { latitude: 12.3714, longitude: -1.5197 };

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
          <h1 className="text-2xl font-bold text-foreground">Carte - Livreurs & Clients</h1>
          <p className="text-sm text-muted-foreground">
            {livreurs.length} disponibles • {livreursConnectes.length} connectés • {clientsEnLigne.length} clients
          </p>
        </div>
      </div>

      {/* Légende */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-xs font-semibold text-blue-900 mb-2">Logique d'affichage :</p>
        <div className="flex flex-wrap gap-3 text-xs text-blue-800">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> <b>Disponible</b> = prêt à recevoir une course (même hors app)</span>
          <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-green-700" /> <b>En ligne</b> = app ouverte &lt; 3 min</span>
          <span className="flex items-center gap-1"><WifiOff className="w-3 h-3 text-gray-500" /> <b>Hors ligne</b> = disponible mais app fermée</span>
        </div>
      </Card>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "tous", label: `Tous (${livreurs.length})` },
          { key: "connectes", label: `Connectés (${livreursConnectes.length})` },
          { key: "disponibles", label: `Disponibles (${livreursDisponibles.length})` },
        ].map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filtrePresence === f.key ? "default" : "outline"}
            onClick={() => setFiltrePresence(f.key)}
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
            <p className="text-xs text-muted-foreground">{livreursAvecGPS.length} livreurs avec GPS • {clientsEnLigne.length} clients</p>
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
              const enLigne = isPresenceApp(livreur);
              const zone = getZone(livreur);
              const lastGPS = getLastGPS(livreur);
              return (
                <div key={livreur.id} className={`flex items-start justify-between p-3 border rounded-lg ${enLigne ? "border-green-200 bg-green-50/30" : "border-gray-200"}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-sm">{livreur.prenom} {livreur.nom}</p>
                      <DispoStatutBadge statut={livreur.statut} />
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        {enLigne ? "En ligne — " : "Disponible dans sa zone — "}
                        {zone}
                      </p>
                    </div>
                    {lastGPS && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">Dernier GPS : {lastGPS}</p>
                      </div>
                    )}
                    <div className="mt-1.5">
                      <PresenceBadge livreur={livreur} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                    <a href={`tel:${livreur.telephone}`} className="text-sm text-primary hover:underline">
                      {livreur.telephone}
                    </a>
                    <span className="text-xs text-muted-foreground">{livreur.vehicule || "moto"}</span>
                  </div>
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
              const enLigne = isPresenceApp(client);
              const zone = client.quartier || "Zone inconnue";
              const lastGPS = getLastGPS(client);
              return (
                <div key={client.id} className={`flex items-start justify-between p-3 border rounded-lg ${enLigne ? "border-green-200 bg-green-50/30" : "border-gray-200"}`}>
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">{client.prenom} {client.nom}</p>
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">{zone}</p>
                    </div>
                    {lastGPS && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">Dernier GPS : {lastGPS}</p>
                      </div>
                    )}
                    <PresenceBadge livreur={client} />
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <a href={`tel:${client.telephone}`} className="text-sm text-primary hover:underline">
                      {client.telephone}
                    </a>
                  </div>
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
            <h2 className="text-lg font-bold text-foreground">Carte - Livreurs Externes</h2>
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