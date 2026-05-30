import React, { useEffect, useRef, useState } from "react";
import { Loader2, Navigation } from "lucide-react";

export default function ModernMap({ 
  position, 
  livreursProches, 
  courseActive,
  onMapReady 
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Charger Leaflet
  useEffect(() => {
    if (!mapRef.current || !position) return;

    if (!window.L) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
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

  // Mettre à jour les marqueurs de livreurs et clients
  useEffect(() => {
    if (!mapInstanceRef.current || !livreursProches) return;

    const map = mapInstanceRef.current;
    
    // Nettoyer les anciens marqueurs (garder seulement le marqueur principal)
    markersRef.current.slice(1).forEach(marker => marker.remove());
    markersRef.current = markersRef.current.slice(0, 1);

    // Ajouter les nouveaux marqueurs
    livreursProches.forEach((personne, index) => {
      if (!personne.latitude || !personne.longitude) return;

      // Déterminer si c'est un livreur ou un client
      const isLivreur = !!personne.vehicule || !!personne.type_vehicule || !!personne.statut;
      const isClient = !isLivreur;

      const markerIcon = window.L.divIcon({
        html: isClient ? `
          <div class="client-marker-wrapper">
            <div class="client-marker-pulse"></div>
            <div class="client-marker">
              <div class="client-marker-dot"></div>
            </div>
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

      // Helpers popup
      const isEnLigneP = personne.app_active && personne.last_seen_at && (Date.now() - new Date(personne.last_seen_at).getTime()) < 3 * 60 * 1000;
      const zone = personne.quartier || (personne.latitude ? 'Ouagadougou' : 'Zone inconnue');
      const lastSeen = (() => {
        const dt = personne.derniere_position_date || personne.last_seen_at || personne.updated_date;
        if (!dt) return null;
        const diff = Math.round((Date.now() - new Date(dt).getTime()) / 60000);
        if (diff < 1) return 'à l\'instant';
        if (diff < 60) return `il y a ${diff} min`;
        const h = Math.round(diff / 60);
        return `il y a ${h}h`;
      })();

      // Popup avec infos
      if (isClient) {
        marker.bindPopup(`
          <div style="min-width:200px;font-family:sans-serif;padding:4px 0">
            <p style="font-weight:700;font-size:14px;margin:0 0 6px 0;color:#1a1a1a">${personne.prenom || ''} ${personne.nom || ''}</p>
            ${personne.telephone ? `<p style="font-size:12px;color:#444;margin:2px 0">📞 ${personne.telephone}</p>` : ''}
            <p style="font-size:12px;color:#444;margin:2px 0">${isEnLigneP ? '🟢 Application ouverte' : '⚪ Application fermée'}</p>
            <p style="font-size:12px;color:#444;margin:2px 0">📍 ${zone}</p>
            ${lastSeen ? `<p style="font-size:12px;color:#888;margin:2px 0">🕒 Dernier GPS : ${lastSeen}</p>` : ''}
          </div>
        `, { maxWidth: 260 });
      } else {
        const isON = personne.statut === 'disponible' || personne.statut === 'en_course';
        const statutLabel = personne.statut === 'disponible' ? '🟢 Libre' : personne.statut === 'en_course' ? '🔵 En course' : null;
        marker.bindPopup(`
          <div style="min-width:200px;font-family:sans-serif;padding:4px 0">
            <p style="font-weight:700;font-size:14px;margin:0 0 6px 0;color:#1a1a1a">${personne.prenom || ''} ${personne.nom || ''}</p>
            ${personne.telephone ? `<p style="font-size:12px;color:#444;margin:2px 0">📞 ${personne.telephone}</p>` : ''}
            <p style="font-size:12px;color:#444;margin:2px 0">${isON ? '🟢 ON' : '⚪ OFF'}</p>
            ${statutLabel ? `<p style="font-size:12px;color:#444;margin:2px 0">${statutLabel}</p>` : ''}
            <p style="font-size:12px;color:#444;margin:2px 0">${isEnLigneP ? '🟢 Application ouverte' : '⚪ Application fermée'}</p>
            <p style="font-size:12px;color:#444;margin:2px 0">📍 ${zone}</p>
            ${lastSeen ? `<p style="font-size:12px;color:#888;margin:2px 0">🕒 Dernier GPS : ${lastSeen}</p>` : ''}
          </div>
        `, { maxWidth: 260 });
      }

      markersRef.current.push(marker);
    });
  }, [livreursProches]);

  const initMap = () => {
    if (!window.L || !mapRef.current) return;

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
    <div className="relative w-full h-full">
      <div 
        ref={mapRef} 
        className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200"
        style={{ minHeight: "300px" }}
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
      
      {/* Badge livreurs et clients à proximité */}
      {mapLoaded && livreursProches.length > 0 && (
        <div className="absolute top-4 right-4 z-[1000] space-y-2">
          {(() => {
            const livreurs = livreursProches.filter(p => p.vehicule || p.type_vehicule || p.statut);
            const clients = livreursProches.filter(p => !p.vehicule && !p.type_vehicule && !p.statut);
            
            return (
              <>
                {livreurs.length > 0 && (
                  <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-2.5 shadow-lg border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-700">
                        {livreurs.length} livr{livreurs.length === 1 ? "eur" : "eurs"}
                      </span>
                    </div>
                  </div>
                )}
                {clients.length > 0 && (
                  <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-2.5 shadow-lg border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-700">
                        {clients.length} client{clients.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}