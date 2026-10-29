import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CARTO_TILE_URL, CARTO_TILE_CONFIG } from '@/lib/cartTiles';
import 'leaflet/dist/leaflet.css';

export default function GuestCourseMap({ course, isolated = false }) {
  const container = useRef(null);
  const instance = useRef(null);
  const layer = useRef(null);
  const fittedPhase = useRef(null);
  const points = [course.depart_position, course.arrivee_position, course.driver_position].filter(Boolean);
  const signature = JSON.stringify(points);
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (isolated || !container.current || !hasPoints) return;
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([points[0].lat, points[0].lng], 13);
    L.tileLayer(CARTO_TILE_URL, CARTO_TILE_CONFIG).addTo(map);
    instance.current = map; layer.current = L.layerGroup().addTo(map);
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => { cancelAnimationFrame(frame); map.remove(); instance.current = null; layer.current = null; fittedPhase.current = null; };
  }, [isolated, hasPoints]);
  useEffect(() => {
    if (!instance.current || !layer.current) return;
    layer.current.clearLayers();
    const markers = [{ point: course.depart_position, label: 'Départ approximatif du quartier', color: '#2367d6' }, { point: course.arrivee_position, label: 'Arrivée approximative du quartier', color: '#0e846e' }, { point: course.driver_position, label: 'Position récente du livreur', color: '#b56b12' }].filter(m => m.point).map(({ point, label, color }) => L.circleMarker([point.lat, point.lng], { radius: 8, color, fillColor: color, fillOpacity: .9 }).bindPopup(label).addTo(layer.current));
    if (markers.length > 1 && fittedPhase.current !== course.statut) instance.current.fitBounds(L.featureGroup(markers).getBounds(), { padding: [30, 30], maxZoom: 15 });
    fittedPhase.current = course.statut;
  }, [signature, course.statut, isolated]);
  if (isolated) return <div className="guest-map-unavailable" role="status">Carte non chargée dans la recette isolée.</div>;
  if (!points.length) return <div className="guest-map-unavailable" role="status">Position cartographique indisponible.</div>;
  return <div ref={container} className="guest-course-map" aria-label="Carte de votre course" />;
}
