import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Badge "Prix à confirmer" — affiché sur les courses dont le prix
 * n'a pas pu être calculé automatiquement et nécessite une confirmation admin.
 */
export default function PrixAConfirmerBadge({ course, size = "sm" }) {
  if (!course?.prix_a_confirmer) return null;

  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0.5",
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-300 ${sizeClasses[size]}`}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      PRIX À CONFIRMER
    </span>
  );
}