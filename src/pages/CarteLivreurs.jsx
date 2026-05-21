import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Package, Phone, MapPin, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function createIcon(color) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%; 
      background: ${color}; border: 3px solid white; 
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createCourseIcon(type) {
  const color = type === "depart" ? "#dc2626" : "#16a34a";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 20px; height: 20px; border-radius: 50%; 
      background: ${color}; border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

const statusColors = {
  disponible: "#16a34a",
  en_course: "#f59e0b",
  hors_ligne: "#9ca3af",
};

const statusLabels = {
  disponible: "Disponible",
  en_course: "En course",
  hors_ligne: "Hors ligne",
};

export default function CarteLivreurs() {
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const { data: livreurs = [], refetch: refetchLivreurs } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: coursesActives = [] } = useQuery({
    queryKey: ["courses-actives"],
    queryFn: () => base44.entities.Course.filter({
      statut: ["en_route_recuperation", "colis_recupere", "en_livraison", "en_attente_livreur", "acceptee"]
    }),
    initialData: [],
    refetchInterval: 15000,
  });

  const livreursAvecPos = useMemo(
    () => livreurs.filter(l => l.latitude && l.longitude),
    [livreurs]
  );

  // Default center: Ouagadougou
  const center = livreursAvecPos.length > 0
    ? [livreursAvecPos[0].latitude, livreursAvecPos[0].longitude]
    : [12.3714, -1.5197];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carte en direct</h1>
          <p className="text-sm text-muted-foreground">
            {livreursAvecPos.length} livreurs visibles • {coursesActives.length} courses actives
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchLivreurs()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
        </Button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-full" style={{ background: statusColors[key] }} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-full bg-red-600" />
          <span className="text-muted-foreground">Point départ</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-full bg-green-600" />
          <span className="text-muted-foreground">Point arrivée</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden border bg-card" style={{ height: "600px" }}>
          <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {livreursAvecPos.map(livreur => (
              <Marker
                key={livreur.id}
                position={[livreur.latitude, livreur.longitude]}
                icon={createIcon(statusColors[livreur.statut] || "#9ca3af")}
                eventHandlers={{ click: () => setSelectedLivreur(livreur) }}
              >
                <Popup>
                  <div className="text-sm space-y-1">
                    <p className="font-semibold">{livreur.nom}</p>
                    <p className="text-xs">{livreur.telephone}</p>
                    <p className="text-xs">{statusLabels[livreur.statut]}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            {coursesActives.map(course => (
              <React.Fragment key={course.id}>
                {course.gps_depart_lat && (
                  <Marker
                    position={[course.gps_depart_lat, course.gps_depart_lng]}
                    icon={createCourseIcon("depart")}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">Départ: {course.adresse_depart}</p>
                        <p>{course.client_nom}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}
                {course.gps_arrivee_lat && (
                  <Marker
                    position={[course.gps_arrivee_lat, course.gps_arrivee_lng]}
                    icon={createCourseIcon("arrivee")}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">Arrivée: {course.adresse_arrivee}</p>
                        <p>{course.client_nom}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </React.Fragment>
            ))}
          </MapContainer>
        </div>

        {/* Livreurs sidebar */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          <h3 className="font-semibold text-sm mb-2">Livreurs ({livreurs.length})</h3>
          {livreurs.map(livreur => (
            <Card
              key={livreur.id}
              className={cn(
                "p-3 cursor-pointer transition-all hover:shadow-sm",
                selectedLivreur?.id === livreur.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedLivreur(livreur)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: statusColors[livreur.statut] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{livreur.nom}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span>{livreur.telephone}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {livreur.courses_du_jour || 0}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}