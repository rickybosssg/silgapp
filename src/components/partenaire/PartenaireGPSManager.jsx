import React, { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useGPSNatif } from "@/hooks/useGPSNatif";
import { MapPin, MapPinOff, Loader2 } from "lucide-react";

/**
 * PartenaireGPSManager — Gère la géolocalisation temps réel du partenaire.
 * - Active le GPS natif au démarrage
 * - Synchronise la position toutes les 30s via syncPartenaireGPS
 * - Affiche un badge GPS dans le header
 * - Bloque le dashboard si GPS désactivé
 */
export default function PartenaireGPSManager({ onGPSReady }) {
  const lastSyncRef = useRef(0);

  const handlePosition = async (pos) => {
    // Éviter sync trop fréquente (min 15s entre sync)
    const now = Date.now();
    if (now - lastSyncRef.current < 15000) return;
    lastSyncRef.current = now;

    try {
      await base44.functions.invoke("syncPartenaireGPS", {
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_actif: true,
      });
      if (onGPSReady) onGPSReady(true);
    } catch (err) {
      console.error("[PartenaireGPS] Erreur sync:", err.message);
    }
  };

  const { gpsActif, permissionStatut, indicateur, demanderPermission, actualiserPosition } = useGPSNatif({
    enabled: true,
    intervalMs: 30000,
    onPosition: handlePosition,
  });

  // Si GPS inactif, tenter de le réactiver
  useEffect(() => {
    if (permissionStatut === "denied") {
      const t = setTimeout(() => demanderPermission(), 3000);
      return () => clearTimeout(t);
    }
  }, [permissionStatut]);

  // Marquer GPS inactif côté serveur si pas de position
  useEffect(() => {
    if (!gpsActif && permissionStatut !== "checking") {
      base44.functions.invoke("syncPartenaireGPS", { gps_actif: false }).catch(() => {});
    }
  }, [gpsActif, permissionStatut]);

  const isChecking = permissionStatut === "checking";

  return (
    <>
      {/* Badge GPS dans le header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm flex-shrink-0">
        {isChecking ? (
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
        ) : gpsActif ? (
          <MapPin className="w-3.5 h-3.5 text-green-300" />
        ) : (
          <MapPinOff className="w-3.5 h-3.5 text-red-300" />
        )}
        <span className="text-[10px] font-bold text-white/90">
          {isChecking ? "GPS..." : gpsActif ? "GPS ON" : "GPS OFF"}
        </span>
      </div>

      {/* Overlay bloquant si GPS désactivé */}
      {!isChecking && !gpsActif && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <MapPinOff className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">GPS obligatoire</h2>
              <p className="text-sm text-gray-500 mt-1">
                Vous devez activer le GPS pour utiliser votre tableau de bord.
                Les livreurs ont besoin de votre position pour récupérer les commandes.
              </p>
            </div>
            <button
              onClick={async () => {
                await demanderPermission();
                await actualiserPosition();
              }}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors"
            >
              Activer le GPS
            </button>
          </div>
        </div>
      )}
    </>
  );
}