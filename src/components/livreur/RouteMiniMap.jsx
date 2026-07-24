import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRouteORS } from "@/hooks/useRouteORS";

// ── Icônes ──
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const LIVREUR_ICON = L.divIcon({
  html: '<div style="width:28px;height:28px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;">🛵</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  className: "livreur-marker-anim",
});

const DEST_ICON = L.divIcon({
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// ── Ajuster la vue aux marqueurs + route ──
function FitBounds({ positions }) {
  const map = useMap();
  const lastLen = useRef(0);
  useEffect(() => {
    if (positions.length !== lastLen.current) {
      lastLen.current = positions.length;
      if (positions.length >= 2) {
        const bounds = L.latLngBounds(positions.map((p) => [p[0], p[1]]));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      } else if (positions.length === 1) {
        map.setView(positions[0], 15);
      }
    }
  }, [positions]);
  return null;
}

// ── Carte Leaflet avec itinéraire road-based ──
function LeafletRouteMiniMap({ livreurLat, livreurLng, destLat, destLng, courseId, phase, countryCode, livreurId }) {
  const { route } = useRouteORS({
    courseId,
    phase,
    fromLat: livreurLat,
    fromLng: livreurLng,
    toLat: destLat,
    toLng: destLng,
    countryCode,
    livreurId,
    enabled: !!(livreurLat && livreurLng && destLat && destLng),
  });

  const routeCoords = route?.coordinates || [];

  const allPositions = useMemo(() => {
    const pts = [];
    if (livreurLat && livreurLng) pts.push([livreurLat, livreurLng]);
    if (destLat && destLng) pts.push([destLat, destLng]);
    if (routeCoords.length > 0) pts.push(...routeCoords);
    return pts;
  }, [livreurLat, livreurLng, destLat, destLng, routeCoords]);

  return (
    <div className="rounded-xl overflow-hidden border border-green-200 relative" style={{ height: 200 }}>
      <MapContainer
        center={[destLat, destLng]}
        zoom={14}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <FitBounds positions={allPositions} />

        {/* Itinéraire road-based (ou fallback ligne droite) */}
        {routeCoords.length > 1 && (
          <Polyline positions={routeCoords} color="#16a34a" weight={4} opacity={0.8} />
        )}

        {/* Marqueur livreur */}
        <Marker position={[livreurLat, livreurLng]} icon={LIVREUR_ICON} />

        {/* Marqueur destination */}
        <Marker position={[destLat, destLng]} icon={DEST_ICON} />
      </MapContainer>

      {/* Badge source */}
      <div className="absolute top-2 left-2 bg-white/90 rounded-lg px-2 py-1 text-[10px] font-bold text-green-700 border border-green-200 z-[1000]">
        {route?.source === "ors" ? "🛣️ Itinéraire route" : "📍 À vol d'oiseau"}
      </div>
    </div>
  );
}

// ── Fallback: iframe OSM (comportement actuel, si Leaflet échoue) ──
function IframeMiniMap({ destLat, destLng }) {
  const bbox = `${destLng - 0.01},${destLat - 0.01},${destLng + 0.01},${destLat + 0.01}`;
  const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${destLat},${destLng}`;
  return (
    <div className="rounded-xl overflow-hidden border border-green-200 relative">
      <iframe
        title="Position destinataire"
        src={url}
        width="100%"
        height="200"
        style={{ border: 0 }}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
      <div className="absolute top-2 left-2 bg-white/90 rounded-lg px-2 py-1 text-[10px] font-bold text-green-700 border border-green-200">
        📍 Destinataire
      </div>
    </div>
  );
}

// ── Error Boundary: fallback iframe si Leaflet crash ──
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Silencieux — le fallback iframe prend le relais
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * RouteMiniMap — mini carte avec itinéraire road-based (ORS).
 * Fallback automatique vers iframe OSM si Leaflet indisponible.
 */
export default function RouteMiniMap(props) {
  const { destLat, destLng } = props;
  if (!destLat || !destLng) return null;

  return (
    <MapErrorBoundary fallback={<IframeMiniMap destLat={destLat} destLng={destLng} />}>
      <LeafletRouteMiniMap {...props} />
    </MapErrorBoundary>
  );
}