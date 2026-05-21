import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Phone, RefreshCw, MapPin, Package, Clock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors = {
  disponible: "#22c55e",
  en_course: "#f59e0b",
  hors_ligne: "#6b7280",
};

const statusLabels = {
  disponible: "Disponible",
  en_course: "En course",
  hors_ligne: "Hors ligne",
};

function MapView({ livreurs, coursesActives, onSelectLivreur }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.textContent = `.leaflet-container { background: #1a1a2e; } .leaflet-popup-content-wrapper { background: #1e293b; color: #f1f5f9; border: 1px solid #334155; border-radius: 12px; } .leaflet-popup-tip { background: #1e293b; } .leaflet-popup-content { margin: 10px 14px; } .leaflet-control-zoom a { background: #1e293b !important; color: #94a3b8 !important; border-color: #334155 !important; } .leaflet-control-zoom a:hover { background: #334155 !important; color: #f1f5f9 !important; } .leaflet-bar { border: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important; } .leaflet-control-attribution { background: rgba(15,23,42,0.8) !important; color: #64748b !important; }`;
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      if (!L || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
      }).setView([12.3714, -1.5197], 13);
      mapInstanceRef.current = map;

      // Tuiles style sombre (CartoDB Dark Matter)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      // Zoom control en bas à droite
      L.control.zoom({ position: "bottomright" }).addTo(map);

      renderMarkers(L, map, livreurs, coursesActives, onSelectLivreur);
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
    renderMarkers(L, mapInstanceRef.current, livreurs, coursesActives, onSelectLivreur);
  }, [livreurs, coursesActives]);

  function renderMarkers(L, map, livreurs, courses, onSelect) {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    livreurs.filter(l => l.latitude && l.longitude && l.validation === "valide").forEach(livreur => {
      const color = statusColors[livreur.statut] || "#6b7280";
      const isActive = livreur.statut === "en_course";

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:44px;height:44px;">
            ${isActive ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ""}
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#0f172a;border:3px solid ${color};box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
          </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = L.marker([livreur.latitude, livreur.longitude], { icon })
        .bindPopup(`<div style="font-family:sans-serif;font-size:13px;"><b style="color:#f1f5f9">${livreur.prenom ? livreur.prenom + " " + livreur.nom : livreur.nom}</b><br/><span style="color:#94a3b8">${livreur.telephone}</span><br/><span style="color:${color};font-weight:600">${statusLabels[livreur.statut]}</span></div>`)
        .addTo(map);

      marker.on("click", () => onSelect && onSelect(livreur));
      markersRef.current.push(marker);
    });

    courses.forEach(course => {
      if (course.gps_depart_lat) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fca5a5;box-shadow:0 0 8px rgba(239,68,68,0.6);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        });
        const m = L.marker([course.gps_depart_lat, course.gps_depart_lng], { icon })
          .bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><span style="color:#fca5a5;font-weight:600">📍 Départ</span><br/><span style="color:#f1f5f9">${course.adresse_depart}</span><br/><span style="color:#94a3b8">${course.client_nom}</span></div>`)
          .addTo(map);
        markersRef.current.push(m);
      }
      if (course.gps_arrivee_lat) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #86efac;box-shadow:0 0 8px rgba(34,197,94,0.6);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        });
        const m = L.marker([course.gps_arrivee_lat, course.gps_arrivee_lng], { icon })
          .bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><span style="color:#86efac;font-weight:600">🏁 Arrivée</span><br/><span style="color:#f1f5f9">${course.adresse_arrivee}</span><br/><span style="color:#94a3b8">${course.client_nom}</span></div>`)
          .addTo(map);
        markersRef.current.push(m);
      }
    });
  }

  return <div ref={mapRef} style={{ height: "100%", width: "100%" }} />;
}

export default function CarteLivreurs() {
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const { data: livreurs = [], refetch, isFetching } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: coursesRaw = [] } = useQuery({
    queryKey: ["courses-actives"],
    queryFn: () => base44.entities.Course.list("-created_date", 50),
    initialData: [],
    refetchInterval: 15000,
  });

  const actives = useMemo(
    () => coursesRaw.filter(c => !["livree", "annulee", "nouvelle"].includes(c.statut)),
    [coursesRaw]
  );

  const validLivreurs = useMemo(() => livreurs.filter(l => l.validation === "valide"), [livreurs]);
  const enLigne = useMemo(() => validLivreurs.filter(l => l.statut !== "hors_ligne"), [validLivreurs]);
  const enCourse = useMemo(() => validLivreurs.filter(l => l.statut === "en_course"), [validLivreurs]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 64px)" }}>
      {/* Map full screen */}
      <div className="absolute inset-0">
        <MapView
          livreurs={validLivreurs}
          coursesActives={actives}
          onSelectLivreur={setSelectedLivreur}
        />
      </div>

      {/* Top stats bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-2xl px-4 py-2 flex items-center gap-4 shadow-2xl text-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-slate-300 font-medium">{enLigne.length} en ligne</span>
          </div>
          <div className="w-px h-4 bg-slate-600" />
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-slate-300 font-medium">{enCourse.length} en course</span>
          </div>
          <div className="w-px h-4 bg-slate-600" />
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-300 font-medium">{actives.length} courses actives</span>
          </div>
          <button
            onClick={() => refetch()}
            className="ml-1 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-slate-400", isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Driver list panel */}
      <div className="absolute top-4 right-4 bottom-4 z-[1000] w-72 flex flex-col gap-3">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-full">
          <div className="px-4 py-3 border-b border-slate-700/60">
            <h2 className="text-white font-semibold text-sm">Livreurs actifs</h2>
            <p className="text-slate-400 text-xs mt-0.5">{enLigne.length} / {validLivreurs.length} en ligne</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 p-2">
            {validLivreurs.length === 0 && (
              <div className="text-center text-slate-500 text-xs py-8">Aucun livreur validé</div>
            )}
            {validLivreurs.map(livreur => (
              <button
                key={livreur.id}
                onClick={() => setSelectedLivreur(selectedLivreur?.id === livreur.id ? null : livreur)}
                className={cn(
                  "w-full text-left rounded-xl p-3 transition-all",
                  selectedLivreur?.id === livreur.id
                    ? "bg-slate-700/80 ring-1 ring-slate-500"
                    : "hover:bg-slate-800/70"
                )}
              >
                <div className="flex items-center gap-2.5">
                  {livreur.photo_url ? (
                    <img src={livreur.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom}
                    </p>
                    <p className="text-slate-400 text-xs">{livreur.telephone}</p>
                  </div>
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: statusColors[livreur.statut] }}
                  />
                </div>

                {selectedLivreur?.id === livreur.id && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-600/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Statut</span>
                      <span className="font-medium" style={{ color: statusColors[livreur.statut] }}>
                        {statusLabels[livreur.statut]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Courses aujourd'hui</span>
                      <span className="text-white font-medium">{livreur.courses_du_jour || 0}</span>
                    </div>
                    {livreur.quartier && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Quartier</span>
                        <span className="text-white">{livreur.quartier}</span>
                      </div>
                    )}
                    {livreur.latitude && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <MapPin className="w-3 h-3" />
                        <span>GPS actif</span>
                      </div>
                    )}
                    <a
                      href={`tel:${livreur.telephone}`}
                      className="mt-1.5 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-slate-600/60 hover:bg-slate-600 transition-colors text-xs text-white font-medium"
                      onClick={e => e.stopPropagation()}
                    >
                      <Phone className="w-3.5 h-3.5" /> Appeler
                    </a>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-slate-700/60 flex items-center gap-3 flex-wrap">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: statusColors[key] }} />
                <span className="text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}