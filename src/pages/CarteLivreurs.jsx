import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck, Phone, RefreshCw, MapPin, Package, Wifi, WifiOff, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors = {
  disponible: "#22c55e",
  en_course:  "#f59e0b",
  hors_ligne: "#6b7280",
};

const statusLabels = {
  disponible: "Disponible",
  en_course:  "En course",
  hors_ligne: "Hors ligne",
};

function isON(livreur) {
  return livreur.statut === "disponible" || livreur.statut === "en_course";
}

function isEnLigne(livreur) {
  if (!livreur.app_active) return false;
  if (!livreur.last_seen_at) return false;
  return (Date.now() - new Date(livreur.last_seen_at).getTime()) < 3 * 60 * 1000;
}

function getLastGPS(livreur) {
  const dt = livreur.derniere_position_date || livreur.last_seen_at || livreur.updated_date;
  if (!dt) return null;
  try { return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr }); }
  catch { return null; }
}

// ─── Carte Leaflet full-screen ────────────────────────────────────────────────

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
    style.textContent = `
      .leaflet-container { background: #1a1a2e; }
      .leaflet-popup-content-wrapper { background: #1e293b; color: #f1f5f9; border: 1px solid #334155; border-radius: 12px; }
      .leaflet-popup-tip { background: #1e293b; }
      .leaflet-popup-content { margin: 10px 14px; }
      .leaflet-control-zoom a { background: #1e293b !important; color: #94a3b8 !important; border-color: #334155 !important; }
      .leaflet-control-zoom a:hover { background: #334155 !important; color: #f1f5f9 !important; }
      .leaflet-bar { border: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important; }
      .leaflet-control-attribution { background: rgba(15,23,42,0.8) !important; color: #64748b !important; }
      @keyframes ping { 75%,100% { transform:scale(2); opacity:0; } }
    `;
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      if (!L || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: false }).setView([12.3714, -1.5197], 13);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

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
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#0f172a;border:3px solid ${color};box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">
              🛵
            </div>
          </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = L.marker([livreur.latitude, livreur.longitude], { icon })
        .bindPopup(`<div style="font-family:sans-serif;font-size:13px;">
          <b style="color:#f1f5f9">${livreur.prenom ? livreur.prenom + " " + livreur.nom : livreur.nom}</b><br/>
          <span style="color:#94a3b8">${livreur.telephone}</span><br/>
          <span style="color:${color};font-weight:600">${statusLabels[livreur.statut]}</span>
          ${livreur.courses_du_jour ? `<br/><span style="color:#64748b;font-size:11px">${livreur.courses_du_jour} course(s) aujourd'hui</span>` : ""}
        </div>`)
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

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CarteLivreurs() {
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [showMap, setShowMap] = useState(false);

  // Données internes uniquement
  const { data: livreurs = [], refetch, isFetching } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "interne" }),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: coursesRaw = [] } = useQuery({
    queryKey: ["courses-actives"],
    queryFn: () => base44.entities.Course.filter({ reseau: "interne" }, "-created_date", 50),
    initialData: [],
    refetchInterval: 15000,
  });

  const validLivreurs = useMemo(() => livreurs.filter(l => l.validation === "valide"), [livreurs]);
  const actives = useMemo(() => coursesRaw.filter(c => !["livree", "annulee", "nouvelle"].includes(c.statut)), [coursesRaw]);

  const compteurs = useMemo(() => ({
    on:       validLivreurs.filter(l => isON(l)).length,
    off:      validLivreurs.filter(l => !isON(l)).length,
    libres:   validLivreurs.filter(l => l.statut === "disponible").length,
    enCourse: validLivreurs.filter(l => l.statut === "en_course").length,
    enLigne:  validLivreurs.filter(l => isEnLigne(l)).length,
  }), [validLivreurs]);

  const livreursAffiches = useMemo(() => {
    switch (filtre) {
      case "on":        return validLivreurs.filter(l => isON(l));
      case "off":       return validLivreurs.filter(l => !isON(l));
      case "libres":    return validLivreurs.filter(l => l.statut === "disponible");
      case "en_course": return validLivreurs.filter(l => l.statut === "en_course");
      case "en_ligne":  return validLivreurs.filter(l => isEnLigne(l));
      default:          return validLivreurs;
    }
  }, [validLivreurs, filtre]);

  const livreursAvecGPS = useMemo(() => validLivreurs.filter(l => l.latitude && l.longitude), [validLivreurs]);

  const filtresBtns = [
    { key: "tous",      label: `Tous (${validLivreurs.length})` },
    { key: "on",        label: `ON (${compteurs.on})` },
    { key: "off",       label: `OFF (${compteurs.off})` },
    { key: "libres",    label: `Libres (${compteurs.libres})` },
    { key: "en_course", label: `En course (${compteurs.enCourse})` },
    { key: "en_ligne",  label: `App ouverte (${compteurs.enLigne})` },
  ];

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carte — Livreurs Internes</h1>
          <p className="text-sm text-muted-foreground">
            {validLivreurs.length} livreurs validés • {livreursAvecGPS.length} avec GPS
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[
          { label: "ON",        count: compteurs.on,       color: "text-green-700 bg-green-50 border-green-200" },
          { label: "OFF",       count: compteurs.off,      color: "text-gray-500 bg-gray-50 border-gray-200" },
          { label: "Libres",    count: compteurs.libres,   color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "En course", count: compteurs.enCourse, color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "App ouverte", count: compteurs.enLigne, color: "text-sky-700 bg-sky-50 border-sky-200" },
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
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /><b>En course</b> = mission en cours</span>
          <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-green-600" /><b>Application ouverte</b> = présent dans l'application</span>
          <span className="flex items-center gap-1.5"><WifiOff className="w-3 h-3 text-gray-400" /><b>Application fermée</b> = absent de l'application</span>
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

      {/* Bouton carte interactive */}
      <Card className="p-4 cursor-pointer hover:shadow-lg transition-all" onClick={() => setShowMap(true)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">🗺️ Voir la carte interactive</p>
            <p className="text-xs text-muted-foreground">{livreursAvecGPS.length} livreurs avec GPS • {actives.length} courses actives</p>
          </div>
        </div>
      </Card>

      {/* Liste des livreurs */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Truck className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Livreurs internes ({livreursAffiches.length})</h2>
        </div>

        {livreursAffiches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun livreur dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-3">
            {livreursAffiches.map(livreur => {
              const lastGPS = getLastGPS(livreur);
              const online = isEnLigne(livreur);
              return (
                <div key={livreur.id} className="flex items-start justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {livreur.photo_url ? (
                      <img src={livreur.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-xl">🛵</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm mb-1">
                        {livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                        {/* Badge ON/OFF */}
                        {isON(livreur) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                            <span className="w-2 h-2 rounded-full bg-green-500" />ON
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded-full bg-gray-300" />OFF
                          </span>
                        )}
                        {/* Badge statut */}
                        {livreur.statut === "disponible" && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />Libre
                          </span>
                        )}
                        {livreur.statut === "en_course" && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />En course
                          </span>
                        )}
                        {/* Badge app */}
                        {online ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                            <Wifi className="w-3 h-3" />Application ouverte
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <WifiOff className="w-3 h-3" />Application fermée
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {livreur.quartier && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{livreur.quartier}</span>}
                        {lastGPS && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Dernier GPS : {lastGPS}</span>}
                        {livreur.courses_du_jour > 0 && <span>🛵 {livreur.courses_du_jour} course(s) aujourd'hui</span>}
                      </div>
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

      {/* Modale carte interactive full-screen */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-slate-950">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center justify-between px-4 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-700/60">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-base">Carte — Livreurs Internes</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />{compteurs.on} en ligne</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3 text-blue-400" />{actives.length} actives</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-400 hover:text-white h-8 w-8 p-0">
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowMap(false)} className="text-slate-400 hover:text-white h-8 w-8 p-0">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Carte + panneau latéral */}
          <div className="flex h-full pt-[52px]">
            {/* Carte */}
            <div className="flex-1 relative">
              <MapView
                livreurs={validLivreurs}
                coursesActives={actives}
                onSelectLivreur={setSelectedLivreur}
              />
            </div>

            {/* Panneau latéral livreurs */}
            <div className="hidden md:flex w-72 bg-slate-900/95 backdrop-blur border-l border-slate-700/60 flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/60">
                <h3 className="text-white font-semibold text-sm">Livreurs actifs</h3>
                <p className="text-slate-400 text-xs mt-0.5">{compteurs.on} / {validLivreurs.length} en ligne</p>
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
                      selectedLivreur?.id === livreur.id ? "bg-slate-700/80 ring-1 ring-slate-500" : "hover:bg-slate-800/70"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {livreur.photo_url ? (
                        <img src={livreur.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 text-lg">🛵</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom}
                        </p>
                        <p className="text-slate-400 text-xs">{livreur.telephone}</p>
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: statusColors[livreur.statut] }} />
                    </div>
                    {selectedLivreur?.id === livreur.id && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-600/50 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Statut</span>
                          <span className="font-medium" style={{ color: statusColors[livreur.statut] }}>{statusLabels[livreur.statut]}</span>
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
                            <MapPin className="w-3 h-3" /><span>GPS actif</span>
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
              {/* Légende */}
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
      )}
    </div>
  );
}