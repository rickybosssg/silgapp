import React from "react";
import { Button } from "@/components/ui/button";
import { BatteryWarning } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function BatterieFaibleButton({ livreur }) {
  const queryClient = useQueryClient();

  const alerterMutation = useMutation({
    mutationFn: async () => {
      // Créer l'alerte
      await base44.entities.BatterieAlerte.create({
        livreur_id: livreur.id,
        livreur_nom: `${livreur.prenom} ${livreur.nom}`,
        livreur_telephone: livreur.telephone,
        latitude: livreur.latitude,
        longitude: livreur.longitude,
        quartier: livreur.quartier,
        statut_livreur: livreur.statut,
        heure_signalement: new Date().toISOString(),
      });

      // Créer une notification pour l'admin
      await base44.entities.Notification.create({
        titre: "🔋 Batterie faible",
        message: `Le livreur ${livreur.prenom} ${livreur.nom} a signalé une batterie faible.`,
        type: "course_bloquee",
        destinataire_email: "admin@silga.bf",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batterie-alertes"] });
      toast.success("Alerte batterie faible envoyée à l'admin ✅");
    },
    onError: () => {
      toast.error("Erreur lors de l'envoi de l'alerte");
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => alerterMutation.mutate()}
      disabled={alerterMutation.isPending}
      className="gap-2 border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700"
    >
      <BatteryWarning className="w-4 h-4" />
      Batterie faible
    </Button>
  );
}