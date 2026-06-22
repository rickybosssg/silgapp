import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { PowerOff } from "lucide-react";

/**
 * Entoure les pages clients/livreurs.
 * Si APP_ACTIF = "false" → écran de maintenance.
 * Si APP_ACTIF = "true" ou pas de config → affiche children normalement.
 */
export default function AppMaintenanceGate({ children }) {
  const { data: config = [], isLoading } = useQuery({
    queryKey: ["system-config-app-actif"],
    queryFn: () => base44.entities.SystemConfig.filter({ cle: "APP_ACTIF" }),
    initialData: [],
    refetchInterval: 15000,
  });

  // Pendant le chargement, on affiche normalement pour ne pas bloquer
  if (isLoading) return <>{children}</>;

  const record = config[0];
  const isActive = !record || record.valeur === "true";

  if (!isActive) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6 z-50">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto">
            <PowerOff className="w-10 h-10 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Application en pause</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            SILGAPP est temporairement indisponible pour maintenance.<br />
            Veuillez réessayer dans quelques minutes.
          </p>
          <p className="text-xs text-muted-foreground"> Support : +226 66 92 51 90</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline"
          >
            Rafraîchir
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
