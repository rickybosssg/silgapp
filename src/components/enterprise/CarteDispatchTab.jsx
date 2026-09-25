import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import { RefreshCw, Truck, Package, Users } from "lucide-react";
import L from "leaflet";

// Fix default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function livreurIcon(statut) {
  const color = statut === "disponible" ? "#10b981" : statut === "en_course" ? "#f59e0b" : "#94a3b8";
  return L.divIcon({
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">🛵</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function courseIcon() {
  return L.divIcon({
    html: `<div style="background:#3b82f6;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">📦</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const ACTIVE_STATUSES = ["nouvelle", "en_attente", "recherche_livreur", "livreur_en_route", "client_contacte", "en_route_expediteur", "arrive_prise_en_charge", "colis_recupere", "pris_en_charge", "en_livraison", "arrivee"];

export default function CarteDispatchTab({ enterprise, onCourseClick, onLivreurClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseDashboard", {});
      setData(res?.data || res);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={load} className="text-xs text-blue-500 mt-2">Réessayer</button>
      </div>
    );
  }

  const livreurs = (data?.livreurs || []).filter(
    (l) => l.latitude && l.longitude
  );
  const activeCourses = (data?.courses?.in_progress || []).filter(
    (c) => (c.gps_depart_lat && c.gps_depart_lng) || (c.livreur_id && c.gps_arrivee_lat)
  );

  const countDispo = livreurs.filter((l) => l.statut === "disponible").length;
  const countEnCourse = livreurs.filter((l) => l.statut === "en_course").length;
  const countCoursesRecherche = (data?.courses?.in_progress || []).filter((c) =>
    ["nouvelle", "en_attente", "recherche_livreur"].includes(c.statut)
  ).length;

  const allLats = [...livreurs.map((l) => l.latitude), ...activeCourses.map((c) => c.gps_depart_lat).filter(Boolean)];
  const allLngs = [...livreurs.map((l) => l.longitude), ...activeCourses.map((c) => c.gps_depart_lng).filter(Boolean)];

  const center = allLats.length > 0
    ? [allLats.reduce((a, b) => a + b, 0) / allLats.length, allLngs.reduce((a, b) => a + b, 0) / allLngs.length]
    : [12.3714, -1.5197]; // Ouaga default

  return (
    <div className="space-y-3">
      {/* Compteurs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-emerald-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Dispos</p>
          <p className="text-sm font-bold text-emerald-600">{countDispo}</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">En course</p>
          <p className="text-sm font-bold text-amber-600">{countEnCourse}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Recherche</p>
          <p className="text-sm font-bold text-blue-600">{countCoursesRecherche}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Total L.</p>
          <p className="text-sm font-bold text-gray-700">{livreurs.length}</p>
        </div>
      </div>

      {/* Carte */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: "400px" }}>
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          {livreurs.map((l) => (
            <Marker
              key={l.id}
              position={[l.latitude, l.longitude]}
              icon={livreurIcon(l.statut)}
              eventHandlers={{ click: () => onLivreurClick?.(l) }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">{l.prenom} {l.nom}</p>
                  <p>{l.telephone}</p>
                  <p>Statut: {l.statut}</p>
                  <p>Véhicule: {l.vehicule || l.type_vehicule || "moto"}</p>
                  {l.derniere_position_date && (
                    <p>GPS: {new Date(l.derniere_position_date).toLocaleTimeString("fr-FR")}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {activeCourses.map((c) => {
            const pos = c.gps_depart_lat ? [c.gps_depart_lat, c.gps_depart_lng] : null;
            if (!pos) return null;
            return (
              <Marker
                key={c.id}
                position={pos}
                icon={courseIcon()}
                eventHandlers={{ click: () => onCourseClick?.(c) }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{c.client_nom || "Client"}</p>
                    <p>{c.adresse_depart} → {c.adresse_arrivee}</p>
                    <p>Statut: {c.statut}</p>
                    {c.livreur_nom && <p>Livreur: {c.livreur_nom}</p>}
                    {c.prix_final > 0 && <p>{c.prix_final.toLocaleString("fr-FR")} F</p>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {activeCourses.map((c) => {
            if (c.gps_depart_lat && c.gps_arrivee_lat) {
              return (
                <Polyline
                  key={`line-${c.id}`}
                  positions={[[c.gps_depart_lat, c.gps_depart_lng], [c.gps_arrivee_lat, c.gps_arrivee_lng]]}
                  pathOptions={{ color: "#3b82f6", weight: 2, dashArray: "5, 5" }}
                />
              );
            }
            return null;
          })}
        </MapContainer>
      </div>

      <button onClick={load} className="w-full text-xs text-blue-500 flex items-center justify-center gap-1 py-2">
        <RefreshCw className="w-3 h-3" /> Rafraîchir (auto 30s)
      </button>

      <p className="text-[10px] text-gray-400 text-center">
        Carte scoped {enterprise?.nom || "agence"}. Mise à jour toutes les 30 secondes.
      </p>
    </div>
  );
}