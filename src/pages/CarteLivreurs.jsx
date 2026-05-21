import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Phone, RefreshCw, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";

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

function MapView({ livreurs, coursesActives }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Load Leaflet dynamically via script tag to avoid duplicate React
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      if (!L || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current).setView([12.3714, -1.5197], 13);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      renderMarkers(L, map, livreurs, coursesActives);
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    renderMarkers(L, mapInstanceRef.current, livreurs, coursesActives);
  }, [livreurs, coursesActives]);

  function renderMarkers(L, map, livreurs, courses) {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    livreurs.filter(l => l.latitude && l.longitude).forEach(livreur => {
      const color = statusColors[livreur.statut] || "#9ca3af";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([livreur.latitude, livreur.longitude], { icon })
        .bindPopup(`<b>${livreur.nom}</b><br>${livreur.telephone}<br>${statusLabels[livreur.statut]}`)
        .addTo(map);
      markersRef.current.push(marker);
    });

    courses.forEach(course => {
      if (course.gps_depart_lat) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        const m = L.marker([course.gps_depart_lat, course.gps_depart_lng], { icon })
          .bindPopup(`<b>Départ:</b> ${course.adresse_depart}<br>${course.client_nom}`)
          .addTo(map);
        markersRef.current.push(m);
      }
      if (course.gps_arrivee_lat) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        const m = L.marker([course.gps_arrivee_lat, course.gps_arrivee_lng], { icon })
          .bindPopup(`<b>Arrivée:</b> ${course.adresse_arrivee}<br>${course.client_nom}`)
          .addTo(map);
        markersRef.current.push(m);
      }
    });
  }

  return <div ref={mapRef} style={{ height: "100%", width: "100%" }} />;
}

export default function CarteLivreurs() {
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const { data: livreurs = [], refetch } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: coursesActives = [] } = useQuery({
    queryKey: ["courses-actives"],
    queryFn: () => base44.entities.Course.list("-created_date", 50),
    initialData: [],
    refetchInterval: 15000,
  });

  const actives = useMemo(
    () => coursesActives.filter(c => !["livree", "annulee", "nouvelle"].includes(c.statut)),
    [coursesActives]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carte en direct</h1>
          <p className="text-sm text-muted-foreground">
            {livreurs.filter(l => l.latitude).length} livreurs visibles • {actives.length} courses actives
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
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
        <div
          className="lg:col-span-3 rounded-xl overflow-hidden border bg-muted"
          style={{ height: "600px" }}
        >
          <MapView livreurs={livreurs} coursesActives={actives} />
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
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span>{livreur.telephone}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {livreur.courses_du_jour || 0}
                </Badge>
              </div>
              {selectedLivreur?.id === livreur.id && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-0.5">
                  <p>Statut : {statusLabels[livreur.statut]}</p>
                  {livreur.latitude && (
                    <p>GPS : {livreur.latitude?.toFixed(4)}, {livreur.longitude?.toFixed(4)}</p>
                  )}
                  <p>Courses aujourd'hui : {livreur.courses_du_jour || 0}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}