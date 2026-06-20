import React from "react";
import { Package, CheckCircle } from "lucide-react";

/**
 * Badge compact affichant la progression multi-colis.
 * Utilisé sur les cartes de course côté livreur, client et admin.
 *
 * Props:
 * nbColis - nombre total de colis
 * nbLivres - nombre livrés
 * nbAnnules - nombre annulés
 * showDetails - afficher la barre de progression (défaut false)
 * size - "sm" | "md" (défaut "md")
 */
export default function MultiColisProgressBadge({
  nbColis = 1,
  nbLivres = 0,
  nbAnnules = 0,
  showDetails = false,
  size = "md",
}) {
  // Ne rien afficher pour les courses simples
  if (!nbColis || nbColis <= 1) return null;

  const nbActifs = nbColis - nbAnnules;
  const pourcentage = nbActifs > 0 ? Math.round((nbLivres / nbActifs) * 100) : 100;
  const tousTermines = nbLivres + nbAnnules >= nbColis;

  const isSm = size === "sm";

  return (
    <div className="flex flex-col gap-1">
      {/* Badge principal */}
      <div className={`inline-flex items-center gap-1.5 ${isSm ? "px-2 py-0.5" : "px-2.5 py-1"} rounded-full font-bold ${
        tousTermines
          ? "bg-green-100 text-green-800"
          : "bg-purple-100 text-purple-800"
      }`}>
        {tousTermines
          ? <CheckCircle className={`${isSm ? "w-3 h-3" : "w-3.5 h-3.5"}`} />
          : <Package className={`${isSm ? "w-3 h-3" : "w-3.5 h-3.5"}`} />}
        <span className={isSm ? "text-[10px]" : "text-xs"}>
          {tousTermines
            ? `${nbColis} colis livrés`
            : `${nbLivres}/${nbColis} colis`}
        </span>
      </div>

      {/* Barre de progression */}
      {showDetails && nbColis > 1 && (
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tousTermines ? "bg-green-500" : "bg-purple-500"}`}
              style={{ width: `${pourcentage}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            {pourcentage}% — {nbLivres} livré{nbLivres > 1 ? "s" : ""}
            {nbAnnules > 0 ? `, ${nbAnnules} annulé${nbAnnules > 1 ? "s" : ""}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}