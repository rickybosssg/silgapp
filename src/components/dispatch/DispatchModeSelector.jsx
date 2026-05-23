import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Zap, Hand } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DispatchModeSelector() {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["dispatch-config"],
    queryFn: () => base44.entities.DispatchConfig.list(),
    initialData: [],
    refetchInterval: 10000,
  });

  const config = configs[0];

  const mutation = useMutation({
    mutationFn: async (newMode) => {
      if (config) {
        return base44.entities.DispatchConfig.update(config.id, {
          mode: newMode,
          moteur_actif: newMode === "automatique",
        });
      } else {
        return base44.entities.DispatchConfig.create({
          mode: newMode,
          moteur_actif: newMode === "automatique",
          timeout_secondes: 60,
        });
      }
    },
    onSuccess: (_, newMode) => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-config"] });
      toast.success(newMode === "automatique" ? "Pilote Automatique Activé 🤖" : "Pilote Automatique Désactivé ✋");
    },
  });

  if (isLoading) return null;

  const isAuto = config?.mode === "automatique";

  return (
    <div className={cn(
      "rounded-2xl p-5 shadow-lg transition-all duration-300",
      isAuto
        ? "bg-gradient-to-r from-pink-500 to-rose-600"
        : "bg-gradient-to-r from-blue-500 to-blue-700"
    )}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            {isAuto ? <Zap className="w-6 h-6 text-white" /> : <Hand className="w-6 h-6 text-white" />}
          </div>
          <div>
            <p className="text-white font-black text-lg leading-tight">
              {isAuto ? "Pilote Automatique Activé" : "Pilote Automatique Désactivé"}
            </p>
            <p className="text-white/70 text-xs mt-0.5">
              {isAuto
                ? "Le moteur gère les dispatches automatiquement"
                : "Vous assignez chaque course manuellement"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate("manuel")}
            disabled={mutation.isPending}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              !isAuto
                ? "bg-white text-blue-700 shadow-md"
                : "bg-white/20 text-white hover:bg-white/30"
            )}
          >
            <Hand className="w-4 h-4 inline mr-1.5" />
            Manuel
          </button>
          <button
            onClick={() => mutation.mutate("automatique")}
            disabled={mutation.isPending}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              isAuto
                ? "bg-white text-pink-600 shadow-md"
                : "bg-white/20 text-white hover:bg-white/30"
            )}
          >
            <Zap className="w-4 h-4 inline mr-1.5" />
            Automatique
          </button>
        </div>
      </div>
    </div>
  );
}