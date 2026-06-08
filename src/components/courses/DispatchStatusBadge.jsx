import React from "react";
import { cn } from "@/lib/utils";

const CONFIG = {
  en_attente_admin:  { label: "En attente admin",       color: "bg-gray-100 text-gray-600 border-gray-200" },
  recherche_livreur: { label: "Recherche livreur...",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  propose:           { label: "Proposé au livreur",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  accepte:           { label: "Accepté",                color: "bg-green-100 text-green-700 border-green-200" },
  expire:            { label: "Expiré / Non accepté",   color: "bg-red-100 text-red-700 border-red-200" },
  assigne_manuel:    { label: "Assigné manuellement",   color: "bg-purple-100 text-purple-700 border-purple-200" },
};

export default function DispatchStatusBadge({ status }) {
  const cfg = CONFIG[status] || CONFIG.en_attente_admin;
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.color)}>
      {cfg.label}
    </span>
  );
}