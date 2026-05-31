import React, { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * HeatmapLayer — Couche thermique pour Leaflet
 * Affiche les zones de forte demande clients ou concentration de livreurs
 */
export default function HeatmapLayer({ map, clients = [], livreurs = [], mode = "demande" }) {
  const heatmapRef = useRef(null);

  useEffect(() => {
    if (!map || !window.L) return;

    // Nettoyer l'ancienne heatmap
    if (heatmapRef.current) {
      map.removeLayer(heatmapRef.current);
      heatmapRef.current = null;
    }

    if (mode === "off") return;

    // Données pour heatmap
    const points = mode === "demande" 
      ? clients.filter(c => c.latitude && c.longitude).map(c => [c.latitude, c.longitude, 1])
      : livreurs.filter(l => l.latitude && l.longitude).map(l => [l.latitude, l.longitude, 1]);

    if (points.length === 0) return;

    // Créer heatmap simple avec cercles semi-transparents
    const heatGroup = window.L.layerGroup().addTo(map);
    
    points.forEach(([lat, lng, intensity]) => {
      const radius = mode === "demande" ? 30 : 25;
      const color = mode === "demande" 
        ? `rgba(239, 68, 68, ${0.15 * intensity})` // Rouge pour demande
        : `rgba(34, 197, 94, ${0.15 * intensity})`; // Vert pour livreurs
      
      window.L.circle([lat, lng], {
        radius,
        fillColor: color,
        color: color,
        weight: 0,
        fillOpacity: 0.4,
      }).addTo(heatGroup);
    });

    heatmapRef.current = heatGroup;

    return () => {
      if (heatmapRef.current) {
        map.removeLayer(heatmapRef.current);
        heatmapRef.current = null;
      }
    };
  }, [map, clients, livreurs, mode]);

  return null; // Rendu géré par Leaflet directement
}

// Contrôles heatmap
export function HeatmapControls({ mode, onModeChange }) {
  return (
    <div className="flex flex-col gap-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
      <p className="text-xs font-semibold text-gray-700 px-1">Carte thermique</p>
      <Button
        size="sm"
        variant={mode === "off" ? "default" : "outline"}
        onClick={() => onModeChange("off")}
        className="text-xs justify-start"
      >
        <MapPin className="w-3 h-3 mr-1" /> Standard
      </Button>
      <Button
        size="sm"
        variant={mode === "demande" ? "default" : "outline"}
        onClick={() => onModeChange("demande")}
        className="text-xs justify-start bg-red-50 hover:bg-red-100 border-red-200"
      >
        🔥 Zones demande
      </Button>
      <Button
        size="sm"
        variant={mode === "livreurs" ? "default" : "outline"}
        onClick={() => onModeChange("livreurs")}
        className="text-xs justify-start bg-green-50 hover:bg-green-100 border-green-200"
      >
        🟢 Zones livreurs
      </Button>
    </div>
  );
}