import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ModernMap({
  position,
  livreursProches,
  courseActive,
  onMapReady,
  onMarkerClick,
  partenaires = [],
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Charger Leaflet
  useEffect(() => {
    if (!mapRef.current || !position) return;

    let cancelled = false;

    if (!window.L) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => {
        if (cancelled) {
          console.log("[ModernMap] Script Leaflet chargé après démontage — ignoré");
          return;
        }
        initMap();
      };
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
    };
  }, [position?.latitude, position?.longitude]);

  // Mettre à jour la position du client
  useEffect(() => {
    if (!mapInstanceRef.current || !position) return;
    
    const map = mapInstanceRef.current;
    
    // Mettre à jour le marqueur client
    if (markersRef.current[0]) {
      markersRef.current[0].setLatLng([position.latitude, position.longitude]);
    }
    
    // Centrer sur la position avec animation fluide
    map.flyTo([position.latitude, position.longitude], 14, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [position]);

  // Map des marqueurs livreurs par id — pour mise à jour stable sans recréation
  const livreurMarkersRef = useRef({}); // { [id]: marker }
  const partenaireMarkersRef = useRef({}); // { [id]: marker }

  // Mettre à jour les marqueurs de livreurs — diff intelligent (pas de suppression totale)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    if (!livreursProches || livreursProches.length === 0) return; // Ne jamais vider sur tableau vide

    const map = mapInstanceRef.current;
    const currentIds = new Set(livreursProches.map(p => p.id));

    // 1. Supprimer les marqueurs des livreurs qui ne sont plus dans la liste
    Object.keys(livreurMarkersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        livreurMarkersRef.current[id].remove();
        delete livreurMarkersRef.current[id];
      }
    });

    // 2. Pour chaque livreur : mettre à jour la position si existant, ou créer si nouveau
    livreursProches.forEach((personne) => {
      if (!personne.latitude || !personne.longitude) return;
      if (!personne.id) return;

      const isLivreur = !!personne.vehicule || !!personne.type_vehicule || !!personne.statut;
      const isClient = !isLivreur;

      // Déjà un marqueur pour cet id → juste déplacer
      if (livreurMarkersRef.current[personne.id]) {
        livreurMarkersRef.current[personne.id].setLatLng([personne.latitude, personne.longitude]);
        return;
      }

      // Nouveau marqueur
      const markerIcon = window.L.divIcon({
        html: isClient ? `
          <div class="client-marker-wrapper">
            <div class="client-marker-pulse"></div>
            <div class="client-marker"><div class="client-marker-dot"></div></div>
          </div>
        ` : `
          <div class="livreur-marker-wrapper">
            <div class="livreur-marker-pulse"></div>
            <div class="livreur-marker">
              ${personne.photo_url
                ? `<img src="${personne.photo_url}" alt="${personne.nom}" class="livreur-photo" />`
                : `<div class="livreur-avatar">${personne.nom?.charAt(0) || 'L'}</div>`
              }
            </div>
          </div>
        `,
        className: isClient ? "client-marker-container" : "livreur-marker-container",
        iconSize: isClient ? [60, 60] : [48, 48],
        iconAnchor: isClient ? [30, 30] : [24, 24],
      });

      const marker = window.L.marker([personne.latitude, personne.longitude], {
        icon: markerIcon,
        zIndexOffset: 1000
      }).addTo(map);

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(personne));
      }

      const zone = personne.quartier || 'Ouagadougou';
      const lastSeen = (() => {
        const dt = personne.derniere_position_date || personne.last_seen_at || personne.updated_date;
        if (!dt) return null;
        const diff = Math.round((Date.now() - new Date(dt).getTime()) / 60000);
        if (diff < 1) return 'à l\'instant';
        if (diff < 60) return `il y a ${diff} min`;
        return `il y a ${Math.round(diff / 60)}h`;
      })();

      const statutLabel = personne.statut === 'disponible' ? '🟢 Libre' : personne.statut === 'en_course' ? '🔵 En course' : '⚪ Hors ligne';
      marker.bindPopup(`
        <div style="min-width:200px;font-family:sans-serif;padding:4px 0">
          <p style="font-weight:700;font-size:14px;margin:0 0 6px 0;color:#1a1a1a">${personne.prenom || ''} ${personne.nom || ''}</p>
          ${personne.telephone ? `<p style="font-size:12px;color:#444;margin:2px 0">📞 ${personne.telephone}</p>` : ''}
          <p style="font-size:12px;color:#444;margin:2px 0">${statutLabel}</p>
          <p style="font-size:12px;color:#444;margin:2px 0">📍 ${zone}</p>
          ${lastSeen ? `<p style="font-size:12px;color:#888;margin:2px 0">🕒 Dernier GPS : ${lastSeen}</p>` : ''}
        </div>
      `, { maxWidth: 260 });

      livreurMarkersRef.current[personne.id] = marker;
    });
  }, [livreursProches]);

  // ── Marqueurs partenaires (boutiques violet + restaurants rose) — position FIXE ──
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    if (!partenaires || partenaires.length === 0) {
      // Nettoyer les marqueurs existants si pas de partenaires
      Object.keys(partenaireMarkersRef.current).forEach(id => {
        partenaireMarkersRef.current[id].remove();
        delete partenaireMarkersRef.current[id];
      });
      return;
    }

    const map = mapInstanceRef.current;
    const currentIds = new Set(partenaires.map(p => p.id));

    // Supprimer les marqueurs qui ne sont plus dans la liste
    Object.keys(partenaireMarkersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        partenaireMarkersRef.current[id].remove();
        delete partenaireMarkersRef.current[id];
      }
    });

    // Créer / mettre à jour les marqueurs
    partenaires.forEach((partenaire) => {
      if (!partenaire.latitude || !partenaire.longitude) return;
      if (!partenaire.id) return;

      // Déjà un marqueur → ne pas recréer (position fixe)
      if (partenaireMarkersRef.current[partenaire.id]) return;

      const isBoutique = partenaire._type === "boutique" || !partenaire._type;
      const borderColor = isBoutique ? "#8b5cf6" : "#ec4899";
      const emoji = isBoutique ? "🏪" : "🍽️";

      const markerIcon = window.L.divIcon({
        html: `
          <div class="partenaire-marker-wrapper">
            <div class="partenaire-marker" style="border-color: ${borderColor}">
              ${partenaire.logo_url
                ? `<img src="${partenaire.logo_url}" alt="${partenaire.nom}" class="partenaire-photo" />`
                : `<div class="partenaire-avatar" style="background: ${borderColor}">${emoji}</div>`
              }
            </div>
          </div>
        `,
        className: "partenaire-marker-container",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = window.L.marker([partenaire.latitude, partenaire.longitude], {
        icon: markerIcon,
        zIndexOffset: 700,
      }).addTo(map);

      const statutLabel = partenaire.ouvert === false
        ? '<span style="color:#dc2626;font-weight:600">🔴 Fermé</span>'
        : '<span style="color:#16a34a;font-weight:600">🟢 Ouvert</span>';
      const typeLabel = isBoutique ? "🏪 Boutique" : "🍽️ Restaurant";

      marker.bindPopup(`
        <div style="min-width:200px;font-family:sans-serif;padding:4px 0">
          <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;color:#1a1a1a">${partenaire.nom || ""}</p>
          <p style="font-size:12px;margin:2px 0;color:${borderColor};font-weight:600">${typeLabel}</p>
          <p style="font-size:12px;margin:2px 0">${statutLabel}</p>
          ${partenaire.adresse ? `<p style="font-size:12px;margin:2px 0;color:#6b7280">📍 ${partenaire.adresse}</p>` : ""}
          ${partenaire.quartier ? `<p style="font-size:12px;margin:2px 0;color:#6b7280">📌 ${partenaire.quartier}</p>` : ""}
          ${partenaire.telephone ? `<p style="font-size:12px;margin:2px 0;color:#444">📞 ${partenaire.telephone}</p>` : ""}
        </div>
      `, { maxWidth: 260 });

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(partenaire));
      }

      partenaireMarkersRef.current[partenaire.id] = marker;
    });
  }, [partenaires]);

  const initMap = () => {
    if (!window.L || !mapRef.current || !document.body.contains(mapRef.current)) return;

    // Créer la carte avec options premium
    const map = window.L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: !courseActive, // Désactiver drag pendant course active
      keyboard: false,
    }).setView([position.latitude, position.longitude], 14);

    // Tiles style Uber/Glovo (CartoDB Voyager - propre et moderne)
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    // Contrôles de zoom stylisés
    const zoomControl = window.L.control.zoom({
      position: 'bottomright'
    }).addTo(map);

    // Personnaliser les boutons de zoom
    setTimeout(() => {
      const zoomIn = document.querySelector('.leaflet-control-zoom-in');
      const zoomOut = document.querySelector('.leaflet-control-zoom-out');
      
      [zoomIn, zoomOut].forEach(btn => {
        if (btn) {
          btn.style.cssText = `
            background: white !important;
            color: #1a1a1a !important;
            border: 1px solid #e5e5e5 !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
            border-radius: 8px !important;
            font-weight: 600 !important;
            width: 36px !important;
            height: 36px !important;
            line-height: 36px !important;
            font-size: 20px !important;
          `;
        }
      });
    }, 100);

    // Marqueur client personnalisé (style Uber)
    const clientIcon = window.L.divIcon({
      html: `
        <div class="client-marker-wrapper">
          <div class="client-marker-pulse"></div>
          <div class="client-marker">
            <div class="client-marker-dot"></div>
          </div>
        </div>
      `,
      className: "client-marker-container",
      iconSize: [60, 60],
      iconAnchor: [30, 30],
    });

    const clientMarker = window.L.marker([position.latitude, position.longitude], { 
      icon: clientIcon,
      zIndexOffset: 2000
    }).addTo(map);

    markersRef.current = [clientMarker];

    // Ajouter CSS personnalisé pour les marqueurs
    addCustomStyles();

    setMapLoaded(true);
    mapInstanceRef.current = map;
    
    if (onMapReady) onMapReady(map);
  };

  const addCustomStyles = () => {
    const styleId = 'modern-map-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Marqueur client - style Uber */
      .client-marker-container {
        pointer-events: none;
      }
      
      .client-marker-wrapper {
        position: relative;
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .client-marker-pulse {
        position: absolute;
        width: 60px;
        height: 60px;
        background: rgba(220, 38, 38, 0.3);
        border-radius: 50%;
        animation: pulse-client 2s ease-out infinite;
      }
      
      @keyframes pulse-client {
        0% {
          transform: scale(0.5);
          opacity: 1;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }
      
      .client-marker {
        width: 20px;
        height: 20px;
        background: #dc2626;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
        position: relative;
      }
      
      .client-marker-dot {
        width: 6px;
        height: 6px;
        background: white;
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      
      /* Marqueurs livreurs - style Glovo */
      .livreur-marker-container {
        transition: all 0.3s ease;
      }
      
      .livreur-marker-wrapper {
        position: relative;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .livreur-marker-pulse {
        position: absolute;
        width: 48px;
        height: 48px;
        background: rgba(22, 163, 74, 0.3);
        border-radius: 50%;
        animation: pulse-livreur 2s ease-out infinite;
      }
      
      @keyframes pulse-livreur {
        0% {
          transform: scale(0.5);
          opacity: 1;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }
      
      .livreur-marker {
        width: 40px;
        height: 40px;
        background: white;
        border-radius: 50%;
        border: 3px solid #16a34a;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .livreur-photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .livreur-avatar {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 18px;
      }
      
      /* Popup livreurs */
      .livreur-popup {
        min-width: 180px;
      }
      
      .livreur-popup-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      
      .livreur-popup-header img {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
      }
      
      .livreur-popup-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 20px;
      }
      
      .livreur-popup-name {
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        font-size: 14px;
      }
      
      .livreur-popup-rating {
        font-size: 12px;
        color: #f59e0b;
        margin-top: 2px;
      }
      
      .livreur-popup-vehicle {
        font-size: 12px;
        color: #666;
        margin: 0;
      }
      
      /* Popup clients */
      .client-popup {
        min-width: 200px;
      }
      
      .client-popup-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      
      .client-popup-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 20px;
      }
      
      .client-popup-name {
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
        font-size: 14px;
      }
      
      .client-popup-status {
        font-size: 11px;
        color: #dc2626;
        margin-top: 2px;
        font-weight: 600;
      }
      
      .client-popup-phone {
        font-size: 12px;
        color: #666;
        margin: 0;
      }
      
      /* Marqueurs partenaires (boutiques violet + restaurants rose) */
      .partenaire-marker-container {
        transition: all 0.3s ease;
      }

      .partenaire-marker-wrapper {
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .partenaire-marker {
        width: 38px;
        height: 38px;
        background: white;
        border-radius: 50%;
        border: 3px solid #8b5cf6;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .partenaire-photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .partenaire-avatar {
        width: 100%;
        height: 100%;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }

      /* Contrôles de zoom */
      .leaflet-control-zoom {
        border: none !important;
      }
      
      .leaflet-control-zoom-in,
      .leaflet-control-zoom-out {
        transition: all 0.2s ease !important;
      }
      
      .leaflet-control-zoom-in:hover,
      .leaflet-control-zoom-out:hover {
        background: #f5f5f5 !important;
        transform: scale(1.1);
      }
      
      /* Responsive */
      @media (max-width: 640px) {
        .livreur-marker-wrapper {
          width: 40px;
          height: 40px;
        }
        
        .livreur-marker {
          width: 32px;
          height: 32px;
        }
        
        .client-marker-wrapper {
          width: 50px;
          height: 50px;
        }
        
        .client-marker {
          width: 16px;
          height: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  };

  return (
    <div className="relative w-full h-full" style={{ minHeight: "calc(100vh - 73px)" }}>
      <div 
        ref={mapRef} 
        className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200"
        style={{ minHeight: "calc(100vh - 73px)" }}
      />
      
      {/* Overlay de chargement */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <div className="text-center space-y-3">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
            </div>
            <p className="text-xs font-medium text-slate-600">Chargement de la carte...</p>
          </div>
        </div>
      )}
      
      {/* Badge livreurs — même source que les marqueurs (avec GPS uniquement) */}
      {mapLoaded && (() => {
        const livreursAffiches = livreursProches.filter(p => (p.vehicule || p.type_vehicule || p.statut) && p.latitude && p.longitude);
        if (livreursAffiches.length === 0) return null;
        return (
          <div className="absolute top-4 right-4 z-[1000]">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-2.5 shadow-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-slate-700">
                  {livreursAffiches.length} livr{livreursAffiches.length === 1 ? "eur" : "eurs"} disponible{livreursAffiches.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Badge partenaires — boutiques + restaurants à proximité */}
      {mapLoaded && (() => {
        const partenairesAffiches = (partenaires || []).filter(p => p.latitude && p.longitude);
        if (partenairesAffiches.length === 0) return null;
        const nbBoutiques = partenairesAffiches.filter(p => p._type === "boutique").length;
        const nbRestaurants = partenairesAffiches.filter(p => p._type === "restaurant").length;
        return (
          <div className="absolute top-4 left-4 z-[1000]">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-2.5 shadow-lg border border-slate-200">
              <div className="flex items-center gap-3">
                {nbBoutiques > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
                    {nbBoutiques} boutique{nbBoutiques > 1 ? "s" : ""}
                  </span>
                )}
                {nbRestaurants > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-pink-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
                    {nbRestaurants} restaurant{nbRestaurants > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}