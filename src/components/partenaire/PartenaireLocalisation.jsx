import React, { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, Check, Edit3, X, Navigation } from "lucide-react";

/**
 * PartenaireLocalisation — Permet au partenaire d'enregistrer une position GPS FIXE.
 * - Bouton "Localiser ma boutique/restaurant"
 * - Récupère la position GPS actuelle (one-shot)
 * - Affiche la position sur une mini-carte Leaflet
 * - Bouton "Confirmer cet emplacement"
 * - Bouton "Modifier l'emplacement" si position déjà enregistrée
 *
 * La position est FIXE : aucune mise à jour automatique.
 */
export default function PartenaireLocalisation({ type, existingLat, existingLng, existingAdresse, onConfirm }) {
  const [mode, setMode] = useState("idle"); // idle | locating | preview | confirmed
  const [previewPos, setPreviewPos] = useState(null);
  const [adresseData, setAdresseData] = useState(null);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const isRestaurant = type === "restaurant";
  const label = isRestaurant ? "mon restaurant" : "ma boutique";
  const hasExisting = !!(existingLat && existingLng);

  // Charger Leaflet si pas déjà chargé
  useEffect(() => {
    if (!window.L) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.head.appendChild(script);
    }
  }, []);

  // Initialiser / mettre à jour la mini-carte
  useEffect(() => {
    const lat = previewPos?.latitude || existingLat;
    const lng = previewPos?.longitude || existingLng;
    if (!lat || !lng || !mapRef.current) return;

    const initMap = () => {
      if (!window.L || !mapRef.current || !document.body.contains(mapRef.current)) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = window.L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,
      }).setView([lat, lng], 16);

      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      const color = isRestaurant ? "#ec4899" : "#8b5cf6";
      const icon = window.L.divIcon({
        html: `<div style="width:36px;height:36px;background:white;border:3px solid ${color};border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:16px">${isRestaurant ? "🍽️" : "🏪"}</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      markerRef.current = window.L.marker([lat, lng], { icon }).addTo(map);
      mapInstanceRef.current = map;
    };

    if (window.L) {
      initMap();
    } else {
      const checkInterval = setInterval(() => {
        if (window.L) {
          clearInterval(checkInterval);
          initMap();
        }
      }, 200);
      return () => clearInterval(checkInterval);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [previewPos, existingLat, existingLng, isRestaurant]);

  // Récupérer la position GPS (one-shot)
  const obtenirPosition = async () => {
    setMode("locating");
    setError(null);

    try {
      let coords = null;

      // Essayer Capacitor Geolocation (Android natif)
      if (typeof window !== "undefined" && window.Capacitor) {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const perm = await Geolocation.requestPermissions();
          if (perm.location === "granted" || perm.coarseLocation === "granted") {
            const result = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
            coords = result.coords;
          }
        } catch {}
      }

      // Fallback navigator.geolocation
      if (!coords && "geolocation" in navigator) {
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
      }

      if (!coords) {
        setError("Impossible d'obtenir la position GPS. Vérifiez que le GPS est activé.");
        setMode("idle");
        return;
      }

      setPreviewPos({ latitude: coords.latitude, longitude: coords.longitude });
      setMode("preview");

      // Reverse geocoding (Nominatim) pour remplir ville/quartier/adresse
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "fr" } }
        );
        const data = await res.json();
        const addr = data?.address || {};
        setAdresseData({
          ville: addr.city || addr.town || addr.village || addr.municipality || "",
          quartier: addr.suburb || addr.neighbourhood || addr.quarter || "",
          adresse: data?.display_name || [addr.road, addr.house_number].filter(Boolean).join(" ") || "",
        });
      } catch {
        setAdresseData(null);
      }
    } catch (err) {
      setError("Erreur GPS: " + (err?.message || "échec"));
      setMode("idle");
    }
  };

  const confirmer = () => {
    if (!previewPos) return;
    onConfirm({
      latitude: previewPos.latitude,
      longitude: previewPos.longitude,
      ville: adresseData?.ville || "",
      quartier: adresseData?.quartier || "",
      adresse: adresseData?.adresse || "",
    });
    setMode("confirmed");
    setPreviewPos(null);
  };

  // ─── État: position déjà enregistrée ───
  if (mode === "idle" && hasExisting) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <MapPin className="w-4 h-4 text-green-600" />
          Emplacement enregistré
        </div>
        <div ref={mapRef} className="w-full h-40 rounded-xl border border-gray-200 overflow-hidden bg-gray-100" />
        {existingAdresse && (
          <p className="text-xs text-gray-500 flex items-start gap-1">
            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" /> {existingAdresse}
          </p>
        )}
        <p className="text-xs text-gray-400">
          📍 {existingLat?.toFixed(5)}, {existingLng?.toFixed(5)}
        </p>
        <button
          onClick={() => {
            if (confirm("Voulez-vous modifier l'emplacement de votre établissement ?")) {
              obtenirPosition();
            }
          }}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <Edit3 className="w-4 h-4" /> Modifier l'emplacement
        </button>
      </div>
    );
  }

  // ─── État: aucune position — bouton localiser ───
  if (mode === "idle") {
    return (
      <div className="space-y-2">
        <button
          onClick={obtenirPosition}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4" /> 📍 Localiser {label}
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          La position sera fixe et ne suivra pas votre téléphone
        </p>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  // ─── État: localisation en cours ───
  if (mode === "locating") {
    return (
      <div className="py-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
        <p className="text-sm text-gray-500 font-medium">Localisation GPS en cours...</p>
      </div>
    );
  }

  // ─── État: aperçu de la position ───
  if (mode === "preview" && previewPos) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <MapPin className="w-4 h-4 text-purple-600" /> Confirmez cet emplacement
        </div>
        <div ref={mapRef} className="w-full h-48 rounded-xl border border-gray-200 overflow-hidden bg-gray-100" />
        {adresseData && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            {adresseData.adresse && <p className="text-xs text-gray-600">📍 {adresseData.adresse}</p>}
            {adresseData.quartier && <p className="text-xs text-gray-500">Quartier: {adresseData.quartier}</p>}
            {adresseData.ville && <p className="text-xs text-gray-500">Ville: {adresseData.ville}</p>}
          </div>
        )}
        <p className="text-[10px] text-gray-400 text-center">
          📍 {previewPos.latitude.toFixed(5)}, {previewPos.longitude.toFixed(5)}
        </p>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={confirmer}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Confirmer cet emplacement
          </button>
          <button
            onClick={() => { setMode("idle"); setPreviewPos(null); }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── État: confirmé ───
  if (mode === "confirmed") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-green-700">
          <Check className="w-4 h-4" /> Emplacement enregistré avec succès
        </div>
        <div ref={mapRef} className="w-full h-40 rounded-xl border border-gray-200 overflow-hidden bg-gray-100" />
        <button
          onClick={() => {
            if (confirm("Voulez-vous modifier l'emplacement ?")) {
              obtenirPosition();
            }
          }}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <Edit3 className="w-4 h-4" /> Modifier l'emplacement
        </button>
      </div>
    );
  }

  return null;
}