import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BatteryWarning, CheckCircle2, MapPin, Phone, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function BatterieAlertesPanel({ currentUser }) {
  const queryClient = useQueryClient();

  const { data: alertes = [] } = useQuery({
    queryKey: ["batterie-alertes"],
    queryFn: () => base44.entities.BatterieAlerte.list("-heure_signalement", 50),
    initialData: [],
    refetchInterval: 10000,
  });

  const alertesNonTraitees = alertes.filter(a => !a.traitee);

  const traiterMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.BatterieAlerte.update(id, {
        traitee: true,
        heure_traitement: new Date().toISOString(),
        admin_traitement: currentUser?.full_name || currentUser?.email || "admin",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batterie-alertes"] });
      toast.success("Alerte marquée comme traitée ");
    },
  });

  if (alertesNonTraitees.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 border-2 border-orange-300 bg-orange-50">
      <div className="flex items-center gap-2 mb-3">
        <BatteryWarning className="w-5 h-5 text-orange-600" />
        <h2 className="font-bold text-orange-800">Alertes batterie faible ({alertesNonTraitees.length})</h2>
      </div>
      <div className="space-y-2">
        {alertesNonTraitees.map(alerte => (
          <div key={alerte.id} className="bg-white rounded-lg p-3 border border-orange-200 flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm text-orange-900">{alerte.livreur_nom}</p>
                <Badge className="bg-orange-500 text-white text-[10px]">Batterie faible</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {alerte.livreur_telephone}
                </span>
                {alerte.quartier && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {alerte.quartier}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(alerte.heure_signalement), "HH:mm", { locale: fr })}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {alerte.statut_livreur === "disponible" ? "Disponible" : alerte.statut_livreur === "en_course" ? "En course" : "Hors ligne"}
                </Badge>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 border-green-300 bg-green-50 hover:bg-green-100 text-green-700"
              onClick={() => traiterMutation.mutate(alerte.id)}
              disabled={traiterMutation.isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Traité
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
