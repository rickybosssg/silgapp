import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, Navigation, Phone, MessageCircle, User, Package, 
  Clock, History, HelpCircle, ChevronRight, TrendingUp, 
  Shield, Zap, Star, Loader2, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ClientProfil from "./ClientProfil";

export default function ClientExterneApp() {
  const navigate = useNavigate();
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsRequired, setGpsRequired] = useState(true);
  const [profilRequired, setProfilRequired] = useState(false);
  const [profilComplet, setProfilComplet] = useState(false);
  const [position, setPosition] = useState(null);
  const [clientProfil, setClientProfil] = useState(null);
  const [courseActive, setCourseActive] = useState(null);
  const [livreursProches, setLivreursProches] = useState([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      // 1. Vérifier GPS
      const savedGps = localStorage.getItem("client_gps_active");
      const savedPos = JSON.parse(localStorage.getItem("client_gps_position") || "null");
      if (savedGps === "true") {
        setGpsActive(true);
        setGpsRequired(false);
        if (savedPos) setPosition(savedPos);
      } else {
        setLoading(false);
        return;
      }

      // 2. Vérifier profil client
      const user = await base44.auth.me();
      const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });

      if (clients && clients.length > 0) {
        const profil = clients[0];
        setClientProfil(profil);
        
        if (profil.nom && profil.prenom && profil.telephone) {
          setProfilComplet(true);
        } else {
          setProfilRequired(true);
        }
      } else {
        setProfilRequired(true);
      }

      // 3. Vérifier course active
      const courses = await base44.entities.CourseExterne.filter({ 
        user_email: user.email 
      });
      const activeCourse = courses?.find(c => 
        !["livree", "annulee"].includes(c.statut)
      );
      if (activeCourse) {
        setCourseActive(activeCourse);
      }

      // 4. Charger livreurs disponibles
      await loadLivreursProches(savedPos || JSON.parse(localStorage.getItem("client_gps_position") || "null"));

    } catch (err) {
      console.error("Erreur vérification statut:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadLivreursProches = async (pos) => {
    try {
      if (!pos) return;
      
      const livreurs = await base44.entities.Livreur.filter({
        type_livreur: "externe",
        statut: "disponible",
        actif: true,
        validation: "valide"
      });

      // Filtrer livreurs proches (dans un rayon de 5km)
      const proches = livreurs.filter(l => {
        if (!l.latitude || !l.longitude) return false;
        const distance = haversineDistance(pos.latitude, pos.longitude, l.latitude, l.longitude);
        return distance <= 5; // 5km
      }).slice(0, 5);

      setLivreursProches(proches);
    } catch (err) {
      console.error("Erreur chargement livreurs:", err);
    }
  };

  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleProfilComplete = () => {
    setProfilRequired(false);
    setProfilComplet(true);
    checkStatus();
  };

  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      alert("GPS non disponible sur cet appareil");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posData = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setPosition(posData);
        setGpsActive(true);
        setGpsRequired(false);
        localStorage.setItem("client_gps_active", "true");
        localStorage.setItem("client_gps_position", JSON.stringify(posData));
        loadLivreursProches(posData);
      },
      (err) => {
        console.error("Erreur GPS:", err);
        alert("Permission GPS refusée – obligatoire pour créer une course");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Initialiser la carte Leaflet
  useEffect(() => {
    if (!gpsActive || !position || !mapRef.current || courseActive) return;

    // Injecter Leaflet CSS & JS si pas déjà fait
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
      if (mapRef.current) {
        mapRef.current.innerHTML = "";
      }
    };
  }, [gpsActive, position, courseActive]);

  const initMap = () => {
    if (!window.L || !mapRef.current) return;

    const map = window.L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([position.latitude, position.longitude], 13);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Marqueur position client
    const clientIcon = window.L.divIcon({
      html: `<div style="background: #dc2626; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
      className: "",
      iconSize: [16, 16],
    });

    window.L.marker([position.latitude, position.longitude], { icon: clientIcon }).addTo(map);

    // Marqueurs livreurs
    livreursProches.forEach((livreur, idx) => {
      const livreurIcon = window.L.divIcon({
        html: `<div style="background: #16a34a; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
        className: "",
        iconSize: [12, 12],
      });

      window.L.marker([livreur.latitude, livreur.longitude], { icon: livreurIcon }).addTo(map);
    });

    // Retirer zoom control
    map.zoomControl.setPosition("bottomright");
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-red-50">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (gpsRequired && !gpsActive) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-6 space-y-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <MapPin className="w-10 h-10 text-primary" />
          </div>
          <div>
            <p className="text-xl font-black text-gray-900 mb-2">GPS Obligatoire</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Pour créer une course et être localisé, l'activation du GPS est requise.
            </p>
          </div>
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all"
            onClick={handleActiverGPS}
          >
            Activer le GPS
          </button>
        </div>
      </div>
    );
  }

  if (profilRequired && !profilComplet) {
    return <ClientProfil existingProfil={clientProfil} onComplete={handleProfilComplete} />;
  }

  const prenom = clientProfil?.prenom || clientProfil?.nom?.split(" ")[0] || "Client";
  const quartier = "Ouagadougou"; // Pourrait être amélioré avec reverse geocoding

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Course active - Floating card */}
      {courseActive && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top duration-300">
          <Card className="border-l-4 border-l-primary shadow-lg cursor-pointer" onClick={() => navigate("/client/suivi")}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <Badge className="bg-primary/10 text-primary">
                    {courseActive.statut === "recherche_livreur" ? "🔍 Recherche" : 
                     courseActive.statut === "livreur_en_route" ? "🚀 En route" :
                     courseActive.statut === "colis_recupere" ? "📦 Récupéré" : "🚚 Livraison"}
                  </Badge>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-3">
                {courseActive.livreur_photo_url ? (
                  <img src={courseActive.livreur_photo_url} alt={courseActive.livreur_nom} className="w-10 h-10 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{courseActive.livreur_nom || "Livreur en route"}</p>
                  <p className="text-xs text-muted-foreground">
                    {courseActive.adresse_depart} → {courseActive.adresse_arrivee}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className={`px-4 py-4 ${courseActive ? "mt-32" : ""}`}>
        <div className="max-w-lg mx-auto space-y-4">
          
          {/* Header moderne */}
          <div className="bg-gradient-to-r from-primary to-red-600 rounded-3xl p-5 shadow-lg shadow-red-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/80 text-xs mb-0.5">Bonjour 👋</p>
                <h1 className="text-2xl font-black text-white">{prenom}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <MapPin className="w-3 h-3 text-white" />
                    <span className="text-xs text-white font-medium">{quartier}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-green-500/90 px-2.5 py-1 rounded-full">
                    <Navigation className="w-3 h-3 text-white" />
                    <span className="text-xs text-white font-medium">GPS actif</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl"
                onClick={() => navigate("/client/profil")}
              >
                <User className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Carte GPS */}
          {!courseActive && (
            <Card className="overflow-hidden border-0 shadow-lg">
              <div className="relative">
                <div 
                  ref={mapRef} 
                  className="w-full h-48 bg-gradient-to-br from-blue-50 to-blue-100"
                  style={{ minHeight: "192px" }}
                />
                <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Votre position</p>
                        <p className="text-[10px] text-muted-foreground">Localisation en temps réel</p>
                      </div>
                    </div>
                    {livreursProches.length > 0 && (
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {livreursProches.length} livr{livreursProches.length === 1 ? "eur" : "eurs"} à proximité
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Livreurs disponibles */}
          {!courseActive && livreursProches.length > 0 && (
            <Card className="p-4 border-l-4 border-l-green-500">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Livreurs disponibles</p>
                  <p className="text-xs text-muted-foreground">Près de votre position</p>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {livreursProches.map((livreur) => (
                  <div key={livreur.id} className="flex-shrink-0 w-20 text-center">
                    {livreur.photo_url ? (
                      <img src={livreur.photo_url} alt={livreur.nom} className="w-14 h-14 rounded-full object-cover mx-auto mb-1 border-2 border-green-500" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-1">
                        <User className="w-6 h-6 text-green-600" />
                      </div>
                    )}
                    <p className="text-xs font-medium truncate">{livreur.nom?.split(" ")[0]}</p>
                    <div className="flex items-center justify-center gap-0.5 text-[10px] text-green-600">
                      <Star className="w-2.5 h-2.5 fill-green-600" />
                      <span>4.8</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Actions principales */}
          <div className="grid grid-cols-2 gap-3">
            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/30 bg-gradient-to-br from-white to-primary/5"
              onClick={() => navigate("/client/course/expedier", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center mx-auto shadow-lg shadow-red-200 group-hover:scale-110 transition-transform">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Expédier</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Envoyer un colis</p>
                </div>
              </div>
            </Card>

            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-accent/30 bg-gradient-to-br from-white to-accent/5"
              onClick={() => navigate("/client/course/recevoir", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-green-600 flex items-center justify-center mx-auto shadow-lg shadow-green-200 group-hover:scale-110 transition-transform">
                  <span className="text-3xl">📥</span>
                </div>
                <div>
                  <p className="font-bold text-foreground">Recevoir</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recevoir un colis</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Raccourcis */}
          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Raccourcis</p>
            <div className="grid grid-cols-4 gap-2">
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-blue-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-[10px] font-medium">Mes courses</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-purple-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-[10px] font-medium">Historique</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-green-50"
                onClick={() => window.open("https://wa.me/22600000000", "_blank")}
              >
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="text-[10px] font-medium">Support</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-orange-50"
                onClick={() => navigate("/client/profil")}
              >
                <User className="w-5 h-5 text-orange-600" />
                <span className="text-[10px] font-medium">Profil</span>
              </Button>
            </div>
          </Card>

          {/* Estimation dynamique */}
          <Card className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-indigo-900">Tarification transparente</p>
                <p className="text-xs text-indigo-700 mt-1">
                  100 F/km • Prix calculé automatiquement selon la distance réelle
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge className="bg-white/80 text-indigo-700">Petit colis: ~500F</Badge>
                  <Badge className="bg-white/80 text-indigo-700">Moyen: ~1000F</Badge>
                  <Badge className="bg-white/80 text-indigo-700">Gros: ~1500F+</Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* Pourquoi Silga */}
          <Card className="p-5 bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Star className="w-4 h-4 text-primary" />
              </div>
              <p className="font-bold text-foreground">Pourquoi Silga Externe ?</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-3 h-3 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Livraison rapide</p>
                  <p className="text-xs text-muted-foreground">Livreurs disponibles 24/7 près de chez vous</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield className="w-3 h-3 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Service sécurisé</p>
                  <p className="text-xs text-muted-foreground">Livreurs vérifiés et suivis en temps réel</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <HelpCircle className="w-3 h-3 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Support réactif</p>
                  <p className="text-xs text-muted-foreground">Assistance disponible à tout moment</p>
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}