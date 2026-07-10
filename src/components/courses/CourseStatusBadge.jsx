import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig = {
  nouvelle: { label: "🔵 Nouvelle", className: "bg-blue-100 text-blue-700 border-blue-200" },
  en_attente_livreur: { label: "🟡 En attente livreur", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  acceptee: { label: "🟢 Acceptée", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  en_route_recuperation: { label: "🟡 En route vers l'expéditeur", className: "bg-yellow-400 text-black border-yellow-500" },
  recherche_livreur: { label: "🔍 Recherche livreur", className: "bg-red-500 text-white font-bold border-red-600" },
  livreur_en_route: { label: "🟡 En route vers l'expéditeur", className: "bg-yellow-400 text-black border-yellow-500" },
  arrive_prise_en_charge: { label: "🟡 Arrivé chez l'expéditeur", className: "bg-cyan-500 text-white border-cyan-600" },
  colis_recupere: { label: "🟢 Colis récupéré", className: "bg-green-500 text-black border-green-600" },
  passager_embarque: { label: "🟠 Passager embarqué", className: "bg-teal-500 text-white border-teal-600" },
  pris_en_charge: { label: "🟠 Pris en charge", className: "bg-cyan-500 text-white border-cyan-600" },
  en_livraison: { label: "🌸 En route vers le destinataire", className: "bg-pink-400 text-black border-pink-500" },
  arrivee: { label: "🟢 Arrivé à destination", className: "bg-green-500 text-black border-green-600" },
  livree: { label: "🟢 Livré", className: "bg-green-600 text-white border-green-700" },
  annulee: { label: "🔴 Annulé", className: "bg-red-600 text-white font-bold border-red-700" },
};

export default function CourseStatusBadge({ statut, dispatchStatus }) {
  // Priorité au statut dispatch pour affichage "Recherche livreur"
  if (dispatchStatus === 'propose') {
    return (
      <Badge variant="outline" className={cn("text-[11px] font-bold border", "bg-red-500 text-white border-red-600")}>
        🔍 Recherche livreur
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