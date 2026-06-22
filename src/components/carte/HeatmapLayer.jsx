import React, { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

/**
 * HeatmapLayer — Couche thermique intelligente pour Leaflet
 *
 * Modes disponibles :
 * - "demande" : Clients + courses récentes (rouge = forte demande)
 * - "couverture" : Livreurs disponibles + en course (bleu/vert = forte couverture)
 * - "opportunite" : Déséquilibre offre/demande (rouge = opportunité, vert = équilibré)
 */
export default function HeatmapLayer({
  map,
  clients = [],
  livreurs = [],
  courses = [],
  mode = "demande"
}) {
  const heatmapRef = useRef(null);
  const [insufficientData, setInsufficientData] = useState(false);

  useEffect(() => {
    if (!map || !window.L) return;

    // Nettoyer l'ancienne heatmap
    if (heatmapRef.current) {
      map.removeLayer(heatmapRef.current);
      heatmapRef.current = null;
    }

    if (mode === "off") {
      setInsufficientData(false);
      return;
    }

    // ─── COLLECTE DES DONNÉES PAR MODE ──────────────────────────────────────

    let points = [];

    if (mode === "demande") {
      // Clients GPS actifs
      const clientPoints = clients
        .filter(c => c.latitude && c.longitude)
        .map(c => ({ lat: c.latitude, lng: c.longitude, type: "client", weight: 1 }));

      // Courses créées récemment (< 2h)
      const now = Date.now();
      const recentCourses = courses.filter(c => {
        if (!c.created_date) return false;
        return (now - new Date(c.created_date).getTime()) < 2 * 60 * 60 * 1000;
      });
      const coursePoints = recentCourses
        .filter(c => c.gps_depart_lat && c.gps_depart_lng)
        .map(c => ({ lat: c.gps_depart_lat, lng: c.gps_depart_lng, type: "course", weight: 2 }));

      points = [...clientPoints, ...coursePoints];

    } else if (mode === "couverture") {
      // Livreurs connectés (disponibles + en course)
      const livreursPoints = livreurs
        .filter(l =>
          l.latitude &&
          l.longitude &&
          (l.statut === "disponible" || l.statut === "en_course")
        )
        .map(l => ({
          lat: l.latitude,
          lng: l.longitude,
          type: "livreur",
          weight: l.statut === "disponible" ? 1.5 : 1
        }));

      points = livreursPoints;

    } else if (mode === "opportunite") {
      // Mode opportunité : comparer offre et demande par cellule
      const cellSize = 0.003; // ~300m pour opportunité
      const demandMap = {};
      const supplyMap = {};

      // Demande (clients + courses)
      [...clients, ...courses].forEach(p => {
        const lat = p.latitude || p.gps_depart_lat;
        const lng = p.longitude || p.gps_depart_lng;
        if (!lat || !lng) return;
        const cellKey = `${Math.floor(lat / cellSize)},${Math.floor(lng / cellSize)}`;
        demandMap[cellKey] = (demandMap[cellKey] || 0) + 1;
      });

      // Offre (livreurs disponibles)
      livreurs
        .filter(l => l.latitude && l.longitude && l.statut === "disponible")
        .forEach(l => {
          const cellKey = `${Math.floor(l.latitude / cellSize)},${Math.floor(l.longitude / cellSize)}`;
          supplyMap[cellKey] = (supplyMap[cellKey] || 0) + 1;
        });

      // Calculer le ratio offre/demande par cellule
      const allCells = new Set([...Object.keys(demandMap), ...Object.keys(supplyMap)]);

      points = Array.from(allCells)
        .map(cellKey => {
          const [latCell, lngCell] = cellKey.split(',').map(Number);
          const lat = latCell * cellSize + cellSize / 2;
          const lng = lngCell * cellSize + cellSize / 2;

          const demand = demandMap[cellKey] || 0;
          const supply = supplyMap[cellKey] || 0;

          // Ratio : 0 = forte opportunité (beaucoup de demande, pas d'offre)
          // 1 = équilibré
          // >1 = surcouverture
          const ratio = demand > 0 ? supply / demand : 0;

          return {
            lat,
            lng,
            type: "opportunite",
            ratio, // 0 à 2+
            demand,
            supply,
            weight: demand > 0 ? 1 : 0 // Ignorer les zones sans demande
          };
        })
        .filter(p => p.weight > 0);
    }

    // Vérifier données insuffisantes
    if (points.filter(p => p.weight > 0).length < 3) {
      setInsufficientData(true);
      return;
    }
    setInsufficientData(false);

    // ─── CALCUL DE LA DENSITÉ ──────────────────────────────────────────────

    const heatGroup = window.L.layerGroup().addTo(map);
    const cellSize = mode === "opportunite" ? 0.003 : 0.002;

    // Regrouper par cellule
    const densityMap = {};
    points.forEach(p => {
      const cellKey = `${Math.floor(p.lat / cellSize)},${Math.floor(p.lng / cellSize)}`;
      densityMap[cellKey] = {
        count: (densityMap[cellKey]?.count || 0) + p.weight,
        lat: p.lat,
        lng: p.lng,
        ratio: p.ratio,
        demand: p.demand,
        supply: p.supply,
      };
    });

    // Normaliser
    const maxDensity = Math.max(...Object.values(densityMap).map(d => d.count));

    // ─── GÉNÉRATION DES CERCLES DE CHALEUR ─────────────────────────────────

    Object.values(densityMap).forEach(cell => {
      const intensity = cell.count / maxDensity;
      let fillColor;

      if (mode === "opportunite") {
        // Mode opportunité : rouge = opportunité (ratio bas), vert = équilibré
        const ratio = cell.ratio || 0;

        if (ratio < 0.5) {
          // Forte opportunité : peu de livreurs, beaucoup de demande → ROUGE
          fillColor = `rgba(220, 38, 38, ${0.5 + intensity * 0.2})`;
        } else if (ratio < 1) {
          // Opportunité modérée → ORANGE/JAUNE
          const t = ratio / 0.5;
          fillColor = `rgba(${Math.round(220 - 100 * t)}, ${Math.round(38 + 133 * t)}, 38, ${0.5 + intensity * 0.2})`;
        } else {
          // Équilibré ou surcouverture → VERT
          fillColor = `rgba(34, 197, 94, ${0.4 + intensity * 0.2})`;
        }

      } else if (mode === "demande") {
        // Mode demande : gradient vert → jaune → rouge
        if (intensity < 0.33) {
          const t = intensity / 0.33;
          fillColor = `rgba(${Math.round(34 + 205 * t)}, ${Math.round(197 - 26 * t)}, 94, ${0.5 + intensity * 0.1})`;
        } else if (intensity < 0.66) {
          const t = (intensity - 0.33) / 0.33;
          fillColor = `rgba(${Math.round(239 + 16 * t)}, ${Math.round(171 - 103 * t)}, ${Math.round(68 - 68 * t)}, ${0.6 + intensity * 0.1})`;
        } else {
          const t = (intensity - 0.66) / 0.34;
          fillColor = `rgba(255, ${Math.round(68 + 127 * (1 - t))}, ${Math.round(68 * (1 - t))}, ${0.7 + intensity * 0.1})`;
        }

      } else if (mode === "couverture") {
        // Mode couverture : gradient ROUGE → JAUNE → VERT
        // Rouge = manque de livreurs, Vert = bonne couverture
        if (intensity < 0.33) {
          // Faible couverture → ROUGE
          const t = intensity / 0.33;
          fillColor = `rgba(${Math.round(239 - 120 * t)}, ${Math.round(68 + 103 * t)}, ${Math.round(68 - 20 * t)}, ${0.6 + intensity * 0.1})`;
        } else if (intensity < 0.66) {
          // Couverture moyenne → JAUNE/ORANGE
          const t = (intensity - 0.33) / 0.33;
          fillColor = `rgba(${Math.round(119 + 120 * t)}, ${Math.round(171 - 27 * t)}, ${Math.round(48 + 46 * t)}, ${0.65 + intensity * 0.1})`;
        } else {
          // Bonne couverture → VERT
          const t = (intensity - 0.66) / 0.34;
          fillColor = `rgba(${Math.round(239 - 205 * t)}, ${Math.round(144 + 53 * t)}, ${Math.round(94 - 26 * t)}, ${0.7 + intensity * 0.1})`;
        }
      }

      const radius = mode === "opportunite" ? 45 : (mode === "demande" ? 40 : 35);

      window.L.circle([cell.lat, cell.lng], {
        radius,
        fillColor,
        color: fillColor,
        weight: 0,
        fillOpacity: 0.65,
      }).addTo(heatGroup);
    });

    heatmapRef.current = heatGroup;

    return () => {
      if (heatmapRef.current) {
        map.removeLayer(heatmapRef.current);
        heatmapRef.current = null;
      }
    };
  }, [map, clients, livreurs, courses, mode]);

  // Message données insuffisantes
  if (insufficientData) {
    return (
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-sm border border-yellow-300 rounded-lg px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2 text-yellow-800">
          <AlertCircle className="w-4 h-4" />
          <p className="text-sm font-medium">Pas assez de données pour générer une carte thermique</p>
        </div>
      </div>
    );
  }

  return null;
}
