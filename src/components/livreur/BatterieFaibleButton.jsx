import React from "react";
import { Button } from "@/components/ui/button";
import { BatteryWarning } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyBatterieFaible } from "@/lib/notificationsHelpers";

export default function BatterieFaibleButton({ livreur }) {
  const queryClient = useQueryClient();

  const alerterMutation = useMutation({
    mutationFn: async () => {
      const alerte = await base44.entities.BatterieAlerte.create({
        livreur_id: livreur.id,
        livreur_nom: `${livreur.prenom} ${livreur.nom}`,
        livreur_telephone: livreur.telephone,
        latitude: livreur.latitude,
        longitude: livreur.longitude,
        quartier: livreur.quartier,
        statut_livreur: livreur.statut,
        heure_signalement: new Date().toISOString(),
      });

      await notifyBatterieFaible({
        ...alerte,
        livreur_id: livreur.id,
        livreur_nom: `${livreur.prenom} ${livreur.nom}`,
        quartier: livreur.quartier,
      }, "admin@silgapp2.local");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batterie-alertes"] });
      toast.success("Alerte batterie faible envoyee a l'admin");
    },
    onError: () => {
      toast.error("Erreur lors de l'envoi de l'alerte");
    },
  });

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => alerterMutation.mutate()}
      disabled={alerterMutation.isPending}
      className="gap-2 bg-pink-500 hover:bg-pink-600 text-white"
    >
      <BatteryWarning className="w-4 h-4" />
      Signaler Batterie moto Faible
    </Button>
  );
}
