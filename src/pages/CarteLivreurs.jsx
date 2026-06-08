import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck, Phone, RefreshCw, MapPin, Wifi, WifiOff, Clock, X } from "lucide-react";
import NetworkHealthBanner from "@/components/carte/NetworkHealthBanner";
import { cn } from "@/lib/utils";
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

const INDICATIFS = {
  BF: "+226", CI: "+225", TG: "+228", BJ: "+229",
  SN: "+221", ML: "+223", GN: "+224", NE: "+227",
};

function formatTel(tel, countryCode = "BF") {
  if (!tel) return "";
  let cleaned = tel.replace(/\s/g, "");
  if (!cleaned.startsWith("+")) {
    const indicatif = INDICATIFS[countryCode];
    if (indicatif) cleaned = `${indicatif}${cleaned}`;
  }
  // Formatage avec espaces : +226 XX XX XX XX
  return cleaned.replace(/(\+\d{3})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
}

function getLastGPS(livreur) {
  const dt = livreur.derniere_position_date || livreur.last_seen_at || livreur.updated_date;
  if (!dt) return null;
  try { return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr }); }
  catch { return null; }
}

// ─── Carte Leaflet full-screen ────────────────────────────────────────────────

function MapView({ livreurs, livreursInactifs = [], showInactifs = false, coursesActives, onSelectLivreur, livreurIdsEnCourseReelle }) {
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
      .leaflet-container { background: #e8e8e8; }
      .leaflet-popup-content-wrapper { background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
      .leaflet-popup-tip { background: #ffffff; }
      .leaflet-popup-content { margin: 10px 14px; }
      .leaflet-control-zoom a { background: #ffffff !important; color: #475569 !important; border-color: #e2e8f0 !important; }
      .leaflet-control-zoom a:hover { background: #f1f5f9 !important; color: #1e293b !important; }
      .leaflet-bar { border: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; }
      .leaflet-control-attribution { background: rgba(255,255,255,0.8) !important; color: #94a3b8 !important; }
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

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      renderMarkers(L, map, livreurs, livreursInactifs, showInactifs, coursesActives, onSelectLivreur);
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
    renderMarkers(L, mapInstanceRef.current, livreurs, livreursInactifs, showInactifs, coursesActives, onSelectLivreur);
  }, [livreurs, livreursInactifs, showInactifs, coursesActives]);

  function renderMarkers(L, map, livreurs, inactifs, showInact, courses, onSelect) {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // ⚫ Inactifs en gris (dernière position connue) — en dessous
    if (showInact) {
      inactifs.forEach(livreur => {
        if (!livreur.latitude || !livreur.longitude) return;
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:44px;height:44px;opacity:0.5;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#374151;border:3px solid #9ca3af;box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">
              🛵
            </div>
          </div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          zIndexOffset: -100,
        });
        const dt = livreur.derniere_position_date || livreur.last_seen_at;
        const minAgo = dt ? Math.round((Date.now() - new Date(dt).getTime()) / 60000) : null;
        const minStr = minAgo === null ? "inconnue" : minAgo < 1 ? "à l'instant" : `il y a ${minAgo} min`;
        const m = L.marker([livreur.latitude, livreur.longitude], { icon })
          .bindPopup(`<div style="font-family:sans-serif;font-size:13px;">
            <b style="color:#1e293b">${livreur.prenom ? livreur.prenom + " " + livreur.nom : livreur.nom}</b><br/>
            <span style="color:#6b7280">⚫ Inactif — non dispatchable</span><br/>
            <span style="color:#9ca3af;font-size:11px;">Dernière position : ${minStr}</span><br/>
            ${livreur.telephone ? `<span style="color:#475569">📞 ${formatTel(livreur.telephone, livreur.country_code)}</span>` : ""}
          </div>`)
          .addTo(map);
        m.on("click", () => onSelect && onSelect(livreur));
        markersRef.current.push(m);
      });
    }

    livreurs.filter(l => l.latitude && l.longitude && l.validation === "valide").forEach(livreur => {
      // 🎯 CORRECTION : "En course" = livreur avec course ACTIVE (peu importe le statut DB)
      const estEnCourse = livreurIdsEnCourseReelle && livreurIdsEnCourseReelle.has(livreur.id);
      const color = estEnCourse ? statusColors.en_course : statusColors[livreur.statut] || "#6b7280";
      const isActive = estEnCourse;

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:44px;height:44px;">
            ${isActive ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ""}
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#ffffff;border:3px solid ${color};box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">
              🛵
            </div>
          </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = L.marker([livreur.latitude, livreur.longitude], { icon })
        .bindPopup(`<div style="font-family:sans-serif;font-size:13px;">
          <b style="color:#1e293b">${livreur.prenom ? livreur.prenom + " " + livreur.nom : livreur.nom}</b><br/>
          <span style="color:#475569">${formatTel(livreur.telephone, livreur.country_code)}</span><br/>
          <span style="color:${color};font-weight:600">${estEnCourse ? "En course" : statusLabels[livreur.statut]}</span>
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
  const [showInactifs, setShowInactifs] = useState(() => {
    try { return localStorage.getItem("silgapp_show_inactifs") === "true"; } catch { return false; }
  });
  const toggleInactifs = () => setShowInactifs(v => {
    const next = !v;
    try { localStorage.setItem("silgapp_show_inactifs", String(next)); } catch {}
    return next;
  });

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
  // Inactifs = validés mais OFF, ou pas d'app active, ou GPS expiré — avec coordonnées GPS
  const livreursInactifsGPS = useMemo(() =>
    validLivreurs.filter(l => !isON(l) && l.latitude && l.longitude), [validLivreurs]);
  
  // Courses VRAIMENT actives : statuts de livraison en cours + livreur assigné
  const actives = useMemo(() => {
    const STATUTS_LIVREUR_OCCUPE = ["livreur_en_route", "colis_recupere", "en_livraison"];
    const STATUTS_TERMINAUX = ["annulee", "livree", "terminee", "completed"];
    return coursesRaw.filter(c =>
      STATUTS_LIVREUR_OCCUPE.includes(c.statut) &&
      !STATUTS_TERMINAUX.includes(c.statut) &&
      c.livreur_id
    );
  }, [coursesRaw]);

  // IDs des livreurs ayant une course réellement active en DB
  const livreurIdsEnCourseReelle = useMemo(() =>
    new Set(actives.map(c => c.livreur_id)),
    [actives]
  );

  const compteurs = useMemo(() => {
    // "En course" = livreur avec course ACTIVE (peu importe le statut DB)
    const enCourseReel = validLivreurs.filter(l => livreurIdsEnCourseReelle.has(l.id));
    return {
      on:       validLivreurs.filter(l => isON(l)).length,
      off:      validLivreurs.filter(l => !isON(l)).length,
      libres:   validLivreurs.filter(l => l.statut === "disponible").length,
      enCourse: enCourseReel.length,
      enLigne:  validLivreurs.filter(l => isEnLigne(l)).length,
    };
  }, [validLivreurs, livreurIdsEnCourseReelle]);

  const livreursAffiches = useMemo(() => {
    switch (filtre) {
      case "on":        return validLivreurs.filter(l => isON(l));
      case "off":       return validLivreurs.filter(l => !isON(l));
      case "libres":    return validLivreurs.filter(l => l.statut === "disponible");
      case "en_course": return validLivreurs.filter(l => livreurIdsEnCourseReelle.has(l.id));
      case "en_ligne":  return validLivreurs.filter(l => isEnLigne(l));
      default:          return validLivreurs;
    }
  }, [validLivreurs, filtre, livreurIdsEnCourseReelle]);

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
    <div className="p-4 space-y-5 max-w-4xl mx-auto">

      {/* ── HERO HEADER ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">🗺️</div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Carte — Livreurs Internes</h1>
              <p className="text-white/60 text-xs mt-0.5">
                {validLivreurs.length} validés · {livreursAvecGPS.length} avec GPS · {actives.length} course{actives.length > 1 ? "s" : ""} active{actives.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="text-white/70 hover:text-white hover:bg-white/10 border border-white/20 rounded-xl gap-1.5"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      </div>

      {/* ── COMPTEURS ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {[
          { label: "ON",          count: compteurs.on,       grad: "from-green-500 to-emerald-500",  shadow: "shadow-green-100" },
          { label: "OFF",         count: compteurs.off,      grad: "from-gray-400 to-gray-500",      shadow: "shadow-gray-100" },
          { label: "Libres",      count: compteurs.libres,   grad: "from-emerald-500 to-teal-500",   shadow: "shadow-emerald-100" },
          { label: "En course",   count: compteurs.enCourse, grad: "from-blue-500 to-indigo-500",    shadow: "shadow-blue-100" },
          { label: "App ouverte", count: compteurs.enLigne,  grad: "from-cyan-500 to-sky-500",       shadow: "shadow-cyan-100" },
        ].map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.grad} rounded-2xl p-3 text-center text-white shadow-md ${c.shadow}`}>
            <p className="text-2xl font-black leading-none">{c.count}</p>
            <p className="text-[10px] font-semibold opacity-80 mt-0.5 uppercase tracking-wide">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── BOUTON CARTE INTERACTIVE ────────────────────────────── */}
      <div
        className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-200 cursor-pointer group"
        onClick={() => setShowMap(true)}
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-2xl shadow-md flex-shrink-0">
          🗺️
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground">Ouvrir la carte interactive</p>
          <p className="text-xs text-muted-foreground mt-0.5">{livreursAvecGPS.length} livreurs localisés · {actives.length} courses actives visibles</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
          <MapPin className="w-4 h-4 text-slate-600" />
        </div>
      </div>

      {/* ── LÉGENDE ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Légende</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" /><b>ON</b> — accepte les nouvelles courses</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" /><b>OFF</b> — n'accepte plus de nouvelles courses</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" /><b>Libre</b> — peut recevoir une course</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" /><b>En course</b> — mission en cours</span>
          <span className="flex items-center gap-2"><Wifi className="w-3 h-3 text-green-600 flex-shrink-0" /><b>App ouverte</b> — présent dans l'application</span>
          <span className="flex items-center gap-2"><WifiOff className="w-3 h-3 text-gray-400 flex-shrink-0" /><b>App fermée</b> — absent de l'application</span>
        </div>
      </div>

      {/* ── FILTRES ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {filtresBtns.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filtre === f.key
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-gray-200 hover:border-slate-400 hover:text-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── LISTE DES LIVREURS ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">Livreurs internes</p>
            <p className="text-xs text-muted-foreground">{livreursAffiches.length} affiché{livreursAffiches.length > 1 ? "s" : ""}</p>
          </div>
        </div>

        {livreursAffiches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">🛵</div>
            <p className="font-semibold text-sm">Aucun livreur dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-2">
            {livreursAffiches.map(livreur => {
              const lastGPS = getLastGPS(livreur);
              const online = isEnLigne(livreur);
              const on = isON(livreur);
              return (
                <div key={livreur.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                  {livreur.photo_url ? (
                    <img src={livreur.photo_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 text-xl">🛵</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground mb-1">
                      {livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${on ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-green-500" : "bg-gray-300"}`} />
                        {on ? "ON" : "OFF"}
                      </span>
                      {livreur.statut === "disponible" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Libre
                        </span>
                      )}
                      {livreurIdsEnCourseReelle.has(livreur.id) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />En course
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${online ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-400"}`}>
                        {online ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                        {online ? "App active" : "App fermée"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {livreur.quartier && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{livreur.quartier}</span>}
                      {lastGPS && <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{lastGPS}</span>}
                      {livreur.courses_du_jour > 0 && <span>🛵 {livreur.courses_du_jour} course(s) aujourd'hui</span>}
                    </div>
                  </div>
                  <a
                    href={`tel:${livreur.telephone}`}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <Phone className="w-3 h-3" />
                    <span className="hidden sm:inline">{formatTel(livreur.telephone, livreur.country_code)}</span>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modale carte interactive full-screen */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-slate-950">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-[1001] flex flex-col bg-slate-900/95 backdrop-blur border-b border-slate-700/60">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-white font-bold text-base">Carte — Livreurs Internes</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-400 hover:text-white h-8 w-8 p-0">
                  <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowMap(false)} className="text-slate-400 hover:text-white h-8 w-8 p-0">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="px-4 pb-3 flex items-center gap-3">
              <div className="flex-1">
                <NetworkHealthBanner
                  libres={compteurs.libres}
                  enCourse={compteurs.enCourse}
                  clientsGPS={0}
                  enAttente={actives.filter(c => !c.livreur_id).length}
                />
              </div>
              <button
                onClick={toggleInactifs}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  showInactifs
                    ? "bg-gray-600 text-white border-gray-600"
                    : "bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                {showInactifs ? "Masquer inactifs" : `Voir inactifs (${livreursInactifsGPS.length})`}
              </button>
            </div>
          </div>

          {/* Carte + panneau latéral */}
          <div className="flex h-full pt-[108px]">
            {/* Carte */}
            <div className="flex-1 relative">
              <MapView
                livreurs={validLivreurs}
                livreursInactifs={livreursInactifsGPS}
                showInactifs={showInactifs}
                coursesActives={actives}
                onSelectLivreur={setSelectedLivreur}
                livreurIdsEnCourseReelle={livreurIdsEnCourseReelle}
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
                        <p className="text-slate-400 text-xs">{formatTel(livreur.telephone, livreur.country_code)}</p>
                      </div>
                      {/* 🎯 CORRECTION : Couleur basée sur course active réelle */}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: livreurIdsEnCourseReelle?.has(livreur.id) ? statusColors.en_course : statusColors[livreur.statut] }} />
                    </div>
                    {selectedLivreur?.id === livreur.id && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-600/50 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Statut</span>
                          {/* 🎯 CORRECTION : Statut réel basé sur course active */}
                          <span className="font-medium" style={{ color: livreurIdsEnCourseReelle?.has(livreur.id) ? statusColors.en_course : statusColors[livreur.statut] }}>
                            {livreurIdsEnCourseReelle?.has(livreur.id) ? "En course" : statusLabels[livreur.statut]}
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