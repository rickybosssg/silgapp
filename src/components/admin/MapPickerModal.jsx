import React, { useEffect, useRef, useState } from "react";
import { Loader2, X, MapPin, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COUNTRY_CENTERS = {
  BF: [12.3714, -1.5197],
  CI: [5.3450, -4.0244],
  TG: [6.1725, 1.2314],
  BJ: [6.4969, 2.6288],
  SN: [14.7167, -17.4677],
  ML: [12.6392, -8.0029],
  GN: [9.6412, -13.5784],
  NE: [13.5117, 2.1098],
  GH: [5.6037, -0.1870],
};

export default function MapPickerModal({ open, onClose, onSelect, countryCode = "BF", initialLat, initialLng, label = "Sélectionner un point" }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPos, setSelectedPos] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;

    const center = (initialLat && initialLng)
      ? [initialLat, initialLng]
      : COUNTRY_CENTERS[countryCode] || COUNTRY_CENTERS.BF;

    setSelectedPos(initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null);

    const loadMap = () => {
      if (!window.L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => initMap(center);
        document.head.appendChild(script);
      } else {
        initMap(center);
      }
    };

    // Small delay to ensure the container is rendered
    const timer = setTimeout(loadMap, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
      setMapLoaded(false);
    };
  }, [open]);

  const initMap = (center) => {
    if (!window.L || !mapRef.current || !document.body.contains(mapRef.current)) return;

    const map = window.L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, 13);

    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Click to place marker
    map.on('click', (e) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
    });

    // If initial position, show marker
    if (initialLat && initialLng) {
      placeMarker(initialLat, initialLng, false);
    }

    mapInstanceRef.current = map;
    setMapLoaded(true);
  };

  const placeMarker = (lat, lng, panTo = true) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const icon = window.L.divIcon({
        html: `<div style="width:28px;height:28px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;transform:rotate(45deg);"></div></div>`,
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      markerRef.current = window.L.marker([lat, lng], { draggable: true, icon }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setSelectedPos({ lat: pos.lat, lng: pos.lng });
      });
    }

    setSelectedPos({ lat, lng });
    if (panTo) map.panTo([lat, lng]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await res.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        placeMarker(lat, lng);
      }
    } catch (e) {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleConfirm = () => {
    if (selectedPos) {
      onSelect(selectedPos.lat, selectedPos.lng);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-gray-800 text-sm">{label}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Rechercher une adresse ou un lieu..."
                className="rounded-lg h-10 pl-9 bg-gray-50 border-gray-200 text-sm"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} size="sm" className="h-10 rounded-lg">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
            </Button>
          </div>
        </div>

        {/* Map */}
        <div className="relative flex-1" style={{ minHeight: 300 }}>
          <div ref={mapRef} className="w-full h-full absolute inset-0" style={{ minHeight: 300 }} />
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          {selectedPos ? (
            <p className="text-xs text-gray-500">
              📍 {selectedPos.lat.toFixed(5)}, {selectedPos.lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-xs text-gray-400">Touchez la carte ou recherchez une adresse pour placer un point</p>
          )}
          <Button
            onClick={handleConfirm}
            disabled={!selectedPos}
            className="w-full h-11 rounded-xl gap-2 font-semibold"
          >
            <Check className="w-4 h-4" />
            Confirmer la position
          </Button>
        </div>
      </div>
    </div>
  );
}