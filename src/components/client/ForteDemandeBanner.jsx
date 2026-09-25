import React from "react";
import { Flame } from "lucide-react";

/**
 * ForteDemandeBanner — Bannière rouge affichée en haut du dashboard client
 * lorsque le mode Forte Demande est actif pour le pays du client.
 *
 * Affiche le titre et le message configurés par l'admin (modifiables sans rebuild).
 * Ne modifie jamais le prix du client — information uniquement.
 */
export default function ForteDemandeBanner({ config }) {
  if (!config) return null;

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-red-300/50">
      <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">
              {config.titre || "🔥 FORTE DEMANDE EN COURS"}
            </p>
            <p className="text-xs text-white/90 mt-1 leading-relaxed">
              {config.message || "Plusieurs commandes sont en cours. Proposez un prix attractif pour augmenter vos chances de trouver rapidement un livreur."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}