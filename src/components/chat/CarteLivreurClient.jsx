import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";

export default function CarteLivreurClient({ livreurLat, livreurLng, livreurNom, departLat, departLng, arriveeLat, arriveeLng, statut }) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  const isVersRecup = statut === "livreur_en_route";
  const isVersLivraison = ["colis_recupere", "en_livraison"].includes(statut);

  useEffect(() => {
    if (!livreurLat || !livreurLng) return;

    let cancelled = false;
    const loadLeaflet = async () => {
      try {
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        if (!window.L) {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => { if (!cancelled) setMapLoaded(true); };
          script.onerror = () => { if (!cancelled) setMapError(true); };
          document.head.appendChild(script);
        } else {
          setMapLoaded(true);
        }
      } catch {
        setMapError(true);
      }
    };
    loadLeaflet();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !livreurLat || !livreurLng) return;

    const container = document.getElementById('client-map-container');
    if (!container) return;

    const L = window.L;
    if (!L) return;

    // Détruire l'ancienne carte si elle existe (évite le flicker sur Android)
    if (container._leaflet_map) {
      container._leaflet_map.remove();
      container._leaflet_map = null;
    }

    const map = L.map(container, { zoomControl: false, attributionControl: true }).setView([livreurLat, livreurLng], 14);
    container._leaflet_map = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    // Marqueur livreur (position live) — bonhomme sur scooter, design moderne
    const livreurIcon = L.divIcon({
      html: '<div style="position:relative;width:44px;height:44px;">' +
        '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(220,38,38,0.2);animation:pulse 2s infinite;"></div>' +
        '<div style="position:absolute;top:4px;left:4px;width:36px;height:36px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="5.5" cy="17.5" r="3.5" fill="white" stroke="white"/>' +
        '<circle cx="18.5" cy="17.5" r="3.5" fill="white" stroke="white"/>' +
        '<path d="M5.5 17.5 L9 17.5 L10 14 L15 14 L18.5 17.5" stroke="white" stroke-width="2" fill="none"/>' +
        '<path d="M10 14 L11 10 L14 10 L15 14" stroke="white" stroke-width="2" fill="none"/>' +
        '<circle cx="12.5" cy="7" r="2.5" fill="white" stroke="white"/>' +
        '</svg>' +
        '</div>' +
        '</div>' +
        '<style>@keyframes pulse{0%{transform:scale(0.8);opacity:0.7}70%{transform:scale(1.3);opacity:0}100%{transform:scale(0.8);opacity:0}}</style>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      className: 'livreur-marker-anim',
    });
    L.marker([livreurLat, livreurLng], { icon: livreurIcon }).addTo(map).bindPopup(`<div style="font-weight:bold;font-size:13px">${livreurNom || 'Livreur'}<div><div style="font-size:11px;color:#666">Position en temps réel</div>`);

    // Départ — point bleu
    if (departLat && departLng) {
      const departIcon = L.divIcon({
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([departLat, departLng], { icon: departIcon }).addTo(map).bindPopup('<b>Point de récupération</b>');
    }

    // Arrivée — point rouge
    if (arriveeLat && arriveeLng) {
      const arriveeIcon = L.divIcon({
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([arriveeLat, arriveeLng], { icon: arriveeIcon }).addTo(map).bindPopup('<b>Point de livraison</b>');
    }

    // Ajuster le zoom pour voir tous les points
    const bounds = [[livreurLat, livreurLng]];
    if (departLat && departLng) bounds.push([departLat, departLng]);
    if (arriveeLat && arriveeLng) bounds.push([arriveeLat, arriveeLng]);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });

    return () => {
      map.remove();
      if (container._leaflet_map) container._leaflet_map = null;
    };
  }, [mapLoaded, livreurLat, livreurLng]);

  if (!livreurLat || !livreurLng) return null;
  if (mapError) return null;

  return (
    <Card className="overflow-hidden border border-slate-200 shadow-md rounded-2xl">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm leading-tight">{isVersRecup ? "En route vers récupération" : isVersLivraison ? "En route vers livraison" : "Position du livreur"}</p>
          <p className="text-white/50 text-[10px] leading-tight">Position en temps réel</p>
        </div>
        <span className="flex items-center gap-1 bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      </div>
      <div id="client-map-container" className="h-56 w-full bg-slate-100 rounded-b-2xl overflow-hidden">
        {!mapLoaded && (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </Card>
  );
}