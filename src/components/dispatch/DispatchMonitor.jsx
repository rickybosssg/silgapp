import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, User, Zap, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function DispatchMonitor() {
  const queryClient = useQueryClient();
  const [tempsRestant, setTempsRestant] = useState(null);

  const { data: configs = [] } = useQuery({
    queryKey: ["dispatch-config"],
    queryFn: () => base44.entities.DispatchConfig.list(),
    initialData: [],
    refetchInterval: 5000,
  });

  const config = configs[0];
  const isAuto = config?.mode === "automatique";

  // Timer compte à rebours
  useEffect(() => {
    if (!config?.heure_sollicitation || !isAuto) {
      setTempsRestant(null);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(config.heure_sollicitation).getTime()) / 1000;
      const restant = Math.max(0, (config.timeout_secondes || 60) - elapsed);
      setTempsRestant(Math.round(restant));
    }, 1000);
    return () => clearInterval(interval);
  }, [config?.heure_sollicitation, isAuto, config?.timeout_secondes]);

  const tickMutation = useMutation({
    mutationFn: () => base44.functions.invoke("dispatchMoteur", { action: "tick" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dispatch-config"] }),
    onError: (e) => toast.error("Erreur moteur: " + e.message),
  });

  // Tick automatique toutes les 8s si mode auto
  useEffect(() => {
    if (!isAuto) return;
    // Tick immédiat au démarrage
    tickMutation.mutate();
    const interval = setInterval(() => tickMutation.mutate(), 8000);
    return () => clearInterval(interval);
  }, [isAuto]);

  if (!isAuto) return null;

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
          <p className="text-sm font-bold text-pink-700">Moteur de dispatch actif</p>
        </div>
        <button
          onClick={() => tickMutation.mutate()}
          disabled={tickMutation.isPending}
          className="text-xs text-pink-500 flex items-center gap-1 hover:text-pink-700 transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", tickMutation.isPending && "animate-spin")} />
          Forcer tick
        </button>
      </div>

      {config?.course_en_dispatch_id && config?.livreur_sollicite_nom ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-pink-800">
            <User className="w-4 h-4 text-pink-500" />
            <span className="font-semibold">{config.livreur_sollicite_nom}</span>
            <span className="text-pink-400">sollicité</span>
          </div>
          {tempsRestant !== null && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-pink-400" />
              <div className="flex-1 bg-pink-100 rounded-full h-2">
                <div
                  className="bg-pink-500 h-2 rounded-full transition-all"
                  style={{ width: `${(tempsRestant / (config.timeout_secondes || 60)) * 100}%` }}
                />
              </div>
              <span className={cn(
                "text-xs font-bold",
                tempsRestant < 10 ? "text-red-600" : "text-pink-600"
              )}>
                {tempsRestant}s
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-pink-400">En attente de la prochaine course à dispatcher...</p>
      )}
    </div>
  );
}