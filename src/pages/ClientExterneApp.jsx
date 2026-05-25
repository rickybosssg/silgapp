import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, AlertCircle, Navigation, Loader2 } from "lucide-react";

export default function ClientExterneApp() {
  const navigate = useNavigate();
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsRequired, setGpsRequired] = useState(true);
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier si GPS déjà activé
    const saved = localStorage.getItem("client_gps_active");
    if (saved === "true") {
      setGpsActive(true);
      setGpsRequired(false);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

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
      },
      (err) => {
        console.error("Erreur GPS:", err);
        alert("Permission GPS refusée – obligatoire pour créer une course");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Écran GPS obligatoire
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
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700 font-semibold">
              ⚠️ Sans GPS, vous ne pourrez pas créer de course.
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Silga Externe</h1>
              <p className="text-xs text-muted-foreground">Créer une course</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
              <Navigation className="w-3 h-3" />
              <span>GPS actif</span>
            </div>
          </div>
        </div>

        {/* Choix type course */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="p-6 cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary"
            onClick={() => navigate("/client/course/expedier", { state: { position } })}
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <span className="text-3xl">📦</span>
              </div>
              <div>
                <p className="font-bold text-foreground">Expédier un colis</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Vous envoyez un colis
                </p>
              </div>
            </div>
          </Card>

          <Card 
            className="p-6 cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-accent"
            onClick={() => navigate("/client/course/recevoir", { state: { position } })}
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
                <span className="text-3xl">📥</span>
              </div>
              <div>
                <p className="font-bold text-foreground">Recevoir un colis</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Vous recevez un colis
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Info tarification */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Tarification</p>
              <p className="text-xs text-blue-700 mt-1">
                Prix calculé à la livraison selon la distance réellement parcourue (100 F/km)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}