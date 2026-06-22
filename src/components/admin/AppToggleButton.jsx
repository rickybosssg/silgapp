import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppToggleButton() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: config = [] } = useQuery({
    queryKey: ["system-config-app-actif"],
    queryFn: () => base44.entities.SystemConfig.filter({ cle: "APP_ACTIF" }),
    initialData: [],
    refetchInterval: 10000,
  });

  const record = config[0];
  // Par défaut actif si pas de config
  const isActive = !record || record.valeur === "true";

  const toggle = async () => {
    setLoading(true);
    const newVal = isActive ? "false" : "true";
    try {
      if (record) {
        await base44.entities.SystemConfig.update(record.id, { valeur: newVal });
      } else {
        await base44.entities.SystemConfig.create({
          cle: "APP_ACTIF",
          valeur: newVal,
          description: "App active pour clients et livreurs (true/false)",
          actif: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["system-config-app-actif"] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={toggle}
      disabled={loading}
      size="sm"
      className={`gap-2 font-semibold ${
        isActive
          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
          : "bg-red-600 hover:bg-red-700 text-white"
      }`}
    >
      {isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
      {loading ? "..." : isActive ? "App ON" : "App OFF"}
    </Button>
  );
}
