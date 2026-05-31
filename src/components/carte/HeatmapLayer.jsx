import React, { useEffect, useRef, useState } from "react";
import { MapPin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * HeatmapLayer — Couche thermique pour Leaflet
 * Affiche les zones de forte demande clients ou concentration de livreurs
 * avec gradient de couleur selon la densité (rouge = fort, vert = faible)
 */
export default function HeatmapLayer({ map, clients = [], livreurs = [], mode = "demande" }) {
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

    // Données pour heatmap
    const points = mode === "demande" 
      ? clients.filter(c => c.latitude && c.longitude)
      : livreurs.filter(l => l.latitude && l.longitude && l.statut === "disponible");

    // Vérifier données insuffisantes
    if (points.length < 3) {
      setInsufficientData(true);
      return;
    }
    setInsufficientData(false);

    // Calculer la densité locale pour chaque point
    const heatGroup = window.L.layerGroup().addTo(map);
    const cellSize = 0.002; // ~200m
    
    // Compter les points dans chaque cellule
    const densityMap = {};
    points.forEach(p => {
      const cellKey = `${Math.floor(p.latitude / cellSize)},${Math.floor(p.longitude / cellSize)}`;
      densityMap[cellKey] = (densityMap[cellKey] || 0) + 1;
    });

    // Trouver la densité max pour normaliser les couleurs
    const maxDensity = Math.max(...Object.values(densityMap));
    
    // Créer les cercles de chaleur avec gradient
    Object.entries(densityMap).forEach(([key, count]) => {
      const [latCell, lngCell] = key.split(',').map(Number);
      const lat = latCell * cellSize + cellSize / 2;
      const lng = lngCell * cellSize + cellSize / 2;
      
      // Normaliser l'intensité (0 à 1)
      const intensity = count / maxDensity;
      
      // Gradient de couleur : vert → jaune → orange → rouge
      // Faible densité = vert/bleu, Moyenne = jaune/orange, Forte = rouge
      let fillColor;
      if (intensity < 0.33) {
        // Faible : vert à jaune
        const ratio = intensity / 0.33;
        fillColor = `rgba(${Math.round(34 + 205 * ratio)}, ${Math.round(197 - 26 * ratio)}, 94, 0.5)`;
      } else if (intensity < 0.66) {
        // Moyenne : jaune à orange
        const ratio = (intensity - 0.33) / 0.33;
        fillColor = `rgba(${Math.round(239 + 16 * ratio)}, ${Math.round(171 - 103 * ratio)}, ${Math.round(68 - 68 * ratio)}, 0.6)`;
      } else {
        // Forte : orange à rouge
        const ratio = (intensity - 0.66) / 0.34;
        fillColor = `rgba(255, ${Math.round(68 + 127 * (1 - ratio))}, ${Math.round(68 * (1 - ratio))}, 0.7)`;
      }
      
      const radius = mode === "demande" ? 40 : 35;
      
      window.L.circle([lat, lng], {
        radius,
        fillColor,
        color: fillColor,
        weight: 0,
        fillOpacity: 0.6,
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
      
      {mode !== "off" && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Intensité</p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-600" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Faible</span>
            <span>Moyenne</span>
            <span>Forte</span>
          </div>
        </div>
      )}
    </div>
  );
}