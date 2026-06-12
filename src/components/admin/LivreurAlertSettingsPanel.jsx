import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Save } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_LIVREUR_ALERT_DURATION_SECONDS,
  DEFAULT_LIVREUR_ALERT_INTERVAL_SECONDS,
  normalizeLivreurAlertConfig,
} from "@/lib/livreurUrgentAlert";

export default function LivreurAlertSettingsPanel() {
  const queryClient = useQueryClient();
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_LIVREUR_ALERT_DURATION_SECONDS);
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_LIVREUR_ALERT_INTERVAL_SECONDS);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["dispatch-config"],
    queryFn: () => base44.entities.DispatchConfig.list(),
    initialData: [],
    refetchInterval: 30000,
  });

  const config = configs?.[0] || null;

  useEffect(() => {
    const normalized = normalizeLivreurAlertConfig(config || {});
    setDurationSeconds(normalized.durationSeconds);
    setIntervalSeconds(normalized.intervalSeconds);
  }, [config?.id, config?.alert_duration_seconds, config?.alert_interval_seconds]);

  const mutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeLivreurAlertConfig({
        alert_duration_seconds: durationSeconds,
        alert_interval_seconds: intervalSeconds,
      });
      const payload = {
        mode: config?.mode || "manuel",
        moteur_actif: config?.moteur_actif || false,
        timeout_secondes: normalized.durationSeconds,
        alert_duration_seconds: normalized.durationSeconds,
        alert_interval_seconds: normalized.intervalSeconds,
      };
      if (config?.id) return base44.entities.DispatchConfig.update(config.id, payload);
      return base44.entities.DispatchConfig.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-config"] });
      toast.success("Parametres d'alerte livreur sauvegardes");
    },
    onError: (error) => {
      toast.error("Erreur sauvegarde alerte livreur", {
        description: error?.message || "Impossible de sauvegarder",
      });
    },
  });

  if (isLoading) return null;

  return (
    <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <BellRing className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm">Alerte nouvelle course livreur</p>
              <p className="text-xs text-gray-500">Sonnerie et vibration repetees, limitees pour Android.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Duree alerte livreur</span>
            <Input
              type="number"
              min="10"
              max="180"
              step="5"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Intervalle vibration</span>
            <Input
              type="number"
              min="3"
              max="30"
              step="1"
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(e.target.value)}
              className="h-10"
            />
          </label>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-10 rounded-xl gap-2 bg-primary hover:bg-primary/90"
        >
          <Save className="w-4 h-4" />
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
