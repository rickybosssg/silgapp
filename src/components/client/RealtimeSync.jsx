import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

/**
 * COMPOSANT DE SYNCHRONISATION TEMPS RÉEL
 * Force la synchronisation parfaite entre toutes les interfaces
 */
export function RealtimeSync({ courseIds, children }) {
  useEffect(() => {
    if (!courseIds || courseIds.length === 0) return;

    // CORRECTION CRITIQUE : Abonnements WebSocket pour chaque course
    const unsubscribers = [];
    
    courseIds.forEach(id => {
      try {
        const unsub = base44.entities.CourseExterne.subscribe((event) => {
          if (event.entity_id === id) {
            console.log(`[REALTIME] Course ${id.slice(-6)} ${event.type}d à ${new Date().toLocaleTimeString()}`);
            // L'entity SDK gère automatiquement l'invalidation du cache
          }
        });
        unsubscribers.push(unsub);
      } catch (err) {
        console.error(`[REALTIME] Erreur abonnement course ${id}:`, err);
      }
    });

    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, [courseIds?.join(",")]);

  return <>{children}</>;
}

/**
 * Indicateur de synchronisation
 */
export function SyncStatusIndicator({ courseId }) {
  const [lastSync, setLastSync] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);

  useEffect(() => {
    if (!courseId) return;

    const unsub = base44.entities.CourseExterne.subscribe((event) => {
      if (event.entity_id === courseId) {
        setLastSync(new Date());
        setSyncing(true);
        setTimeout(() => setSyncing(false), 500);
      }
    });

    return () => unsub?.();
  }, [courseId]);

  return (
    <Badge variant="outline" className={`text-[10px] ${syncing ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-100"}`}>
      {syncing ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
      {lastSync ? `Sync: ${lastSync.toLocaleTimeString()}` : "En attente"}
    </Badge>
  );
}