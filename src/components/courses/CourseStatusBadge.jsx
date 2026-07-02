import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig = {
  nouvelle: { label: "🔵 Nouvelle", className: "bg-blue-100 text-blue-700 border-blue-200" },
  en_attente_livreur: { label: "🟡 En attente livreur", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  acceptee: { label: "🟢 Acceptée", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  en_route_recuperation: { label: "🟡 En route vers l'expéditeur", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  recherche_livreur: { label: "🔍 Recherche livreur", className: "bg-orange-100 text-orange-700 border-orange-200" },
  livreur_en_route: { label: "🟡 En route vers l'expéditeur", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  arrive_prise_en_charge: { label: "🟡 Arrivé chez l'expéditeur", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  colis_recupere: { label: "🟠 Colis récupéré", className: "bg-orange-100 text-orange-700 border-orange-200" },
  passager_embarque: { label: "🟠 Passager embarqué", className: "bg-teal-100 text-teal-700 border-teal-200" },
  pris_en_charge: { label: "🟠 Pris en charge", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  en_livraison: { label: "🔵 En route vers le destinataire", className: "bg-blue-100 text-blue-700 border-blue-200" },
  arrivee: { label: "🟢 Arrivé à destination", className: "bg-amber-100 text-amber-700 border-amber-200" },
  livree: { label: "🟢 Livré", className: "bg-green-100 text-green-700 border-green-200" },
  annulee: { label: "🔴 Annulé", className: "bg-red-100 text-red-700 border-red-200" },
};

export default function CourseStatusBadge({ statut, dispatchStatus }) {
  // Priorité au statut dispatch pour affichage "Recherche livreur"
  if (dispatchStatus === 'propose') {
    return (
      <Badge variant="outline" className={cn("text-[11px] font-medium border", "bg-orange-100 text-orange-700 border-orange-200")}>
         Recherche livreur
      </Badge>
    );
  }

  const config = statusConfig[statut] || { label: statut, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium border", config.className)}>
      {config.label}
    </Badge>
  );
}
