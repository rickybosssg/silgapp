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

    const container = document.getElementById(`client-map-${livreurLat}`);
    if (!container) return;

    const L = window.L;
    if (!L) return;

    const map = L.map(container).setView([livreurLat, livreurLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // Marqueur livreur (position live)
    const livreurIcon = L.divIcon({
      html: '<div style="background:#dc2626;color:white;padding:4px 8px;border-radius:12px;font-weight:bold;font-size:11px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3)"> Livreur</div>',
      iconSize: [70, 28],
      iconAnchor: [35, 14],
    });
    L.marker([livreurLat, livreurLng], { icon: livreurIcon }).addTo(map);

    // Départ
    if (departLat && departLng) {
      L.marker([departLat, departLng], {
        icon: L.divIcon({ html: '', iconSize: [28, 28], className: '' })
      }).addTo(map).bindPopup('Point de récupération');
    }

    // Arrivée
    if (arriveeLat && arriveeLng) {
      L.marker([arriveeLat, arriveeLng], {
        icon: L.divIcon({ html: '', iconSize: [28, 28], className: '' })
      }).addTo(map).bindPopup('Point de livraison');
    }

    // Ajuster le zoom pour voir tous les points
    const bounds = [[livreurLat, livreurLng]];
    if (departLat && departLng) bounds.push([departLat, departLng]);
    if (arriveeLat && arriveeLng) bounds.push([arriveeLat, arriveeLng]);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });

    return () => { map.remove(); };
  }, [mapLoaded, livreurLat, livreurLng]);

  if (!livreurLat || !livreurLng) return null;
  if (mapError) return null;

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <div className="bg-gradient-to-r from-red-500 to-red-600 px-4 py-2.5 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-white" />
        <p className="text-white font-bold text-sm">{isVersRecup ? "Livreur → Point de récupération" : isVersLivraison ? "Livreur → Point de livraison" : "Position du livreur"}</p>
      </div>
      <div id={`client-map-${livreurLat}`} className="h-56 w-full bg-gray-100">
        {!mapLoaded && (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </Card>
  );
}
