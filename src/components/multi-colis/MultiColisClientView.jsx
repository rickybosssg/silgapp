import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapPin, Clock, Package, Banknote } from "lucide-react";
import MultiColisProgressBadge from "./MultiColisProgressBadge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { normalizeCommissionPct, splitAmountByCommission } from "@/lib/commissionUtils";

const STATUT_LABELS = {
  en_attente: "En attente",
  recupere: "Récupéré",
  en_livraison: "En livraison",
  livre: "Livré",
  annule: "Annulé",
};

const STATUT_COLORS = {
  en_attente: "bg-gray-100 text-gray-600",
  recupere: "bg-blue-100 text-blue-700",
  en_livraison: "bg-purple-100 text-purple-700",
  livre: "bg-green-100 text-green-700",
  annule: "bg-red-100 text-red-600",
};

/**
 * Vue multi-colis pour le client — affiche la progression et les montants par colis.
 * Props:
 *   course - CourseExterne
 */
export default function MultiColisClientView({ course }) {
  const { data: colis = [], isLoading } = useQuery({
    queryKey: ["colis-externes-client", course.id],
    queryFn: () => base44.entities.ColisExterne.filter({ course_id: course.id }, "numero_ordre", 20),
    enabled: !!course.id,
    refetchInterval: 5000,
    initialData: [],
  });
  const { data: countryCommissionRows = [] } = useQuery({
    queryKey: ["country-commission", course.country_code],
    queryFn: () => base44.entities.Country.filter({ code: course.country_code, actif: true }),
    enabled: !!course.country_code,
    staleTime: 30000,
  });

  if (!course.is_multi_colis || !course.nb_colis || course.nb_colis <= 1) return null;

  const nbLivres = colis.filter(c => c.statut === "livre").length;
  const nbAnnules = colis.filter(c => c.statut === "annule").length;
  const nbTotal = colis.length || course.nb_colis;
  const totalEncaisse = colis.filter(c => c.statut === "livre").reduce((s, c) => s + (c.montant_a_encaisser || 0), 0);
  const commissionPct = normalizeCommissionPct(countryCommissionRows?.[0]?.commission_pct);
  const split = splitAmountByCommission(totalEncaisse, commissionPct);
  const gainLivreur = split.montant_livreur || 0;
  const commission = split.commission_silga || 0;

  if (isLoading) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-purple-700">Chargement des colis...</p>
      </div>
    );
  }

  if (!colis.length) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-purple-100 border-b border-purple-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-700" />
          <span className="text-sm font-black text-purple-900">Tournée multi-colis</span>
        </div>
        <MultiColisProgressBadge
          nbColis={nbTotal}
          nbLivres={nbLivres}
          nbAnnules={nbAnnules}
          size="sm"
        />
      </div>

      {/* Barre de progression */}
      <div className="h-1.5 bg-purple-100">
        <div
          className={`h-full transition-all duration-500 ${nbLivres === nbTotal ? "bg-green-500" : "bg-purple-500"}`}
          style={{ width: `${nbTotal > 0 ? (nbLivres / nbTotal) * 100 : 0}%` }}
        />
      </div>

      {/* Liste colis */}
      <div className="divide-y divide-purple-100">
        {colis.map((colisItem, idx) => (
          <div key={colisItem.id} className={`px-4 py-3 space-y-1.5 ${
            colisItem.statut === "livre" ? "bg-green-50" :
            colisItem.statut === "annule" ? "bg-gray-50 opacity-60" :
            "bg-white"
          }`}>
            {/* Numéro + nom + statut */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${
                  colisItem.statut === "livre" ? "bg-green-500" :
                  colisItem.statut === "annule" ? "bg-gray-400" :
                  "bg-purple-600"
                }`}>
                  {colisItem.statut === "livre" ? "✓" :
                   colisItem.statut === "annule" ? "✕" :
                   colisItem.colis_uid || idx + 1}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 truncate max-w-[160px]">
                    {colisItem.destinataire_nom || `Destinataire ${idx + 1}`}
                  </p>
                  {colisItem.adresse_livraison && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                      <p className="text-[10px] text-gray-500 truncate max-w-[140px]">{colisItem.adresse_livraison}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_COLORS[colisItem.statut] || "bg-gray-100 text-gray-600"}`}>
                  {STATUT_LABELS[colisItem.statut] || colisItem.statut}
                </span>
                {colisItem.statut === "livre" && (colisItem.montant_a_encaisser || 0) > 0 && (
                  <p className="text-xs font-black text-green-700">
                    {colisItem.montant_a_encaisser.toLocaleString()} {course.devise || "F"}
                  </p>
                )}
              </div>
            </div>

            {/* Heure de livraison */}
            {colisItem.heure_livraison && (
              <div className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                <p className="text-[10px] text-green-600 font-semibold">
                  Livré à {format(new Date(colisItem.heure_livraison), "HH:mm", { locale: fr })}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer — totaux */}
      <div className="px-4 py-3 bg-purple-50 border-t border-purple-100 space-y-2">
        <p className="text-xs text-purple-700 font-semibold text-center">
          {nbLivres === nbTotal
            ? "✅ Tous les colis ont été livrés"
            : `${nbLivres}/${nbTotal} colis livré${nbLivres > 1 ? "s" : ""}`}
        </p>
        {totalEncaisse > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-white rounded-xl p-2 text-center border border-purple-100">
              <Banknote className="w-3 h-3 mx-auto mb-0.5 text-gray-600" />
              <p className="text-[9px] text-gray-600 font-bold uppercase">Total encaissé</p>
              <p className="text-xs font-black text-gray-800">{totalEncaisse.toLocaleString()} {course.devise || "F"}</p>
            </div>
            <div className="bg-white rounded-xl p-2 text-center border border-green-100">
              <p className="text-[9px] text-gray-600 font-bold uppercase">Gain livreur</p>
              <p className="text-xs font-black text-green-700">{gainLivreur.toLocaleString()} {course.devise || "F"}</p>
            </div>
            <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
              <p className="text-[9px] text-gray-600 font-bold uppercase">Commission</p>
              <p className="text-xs font-black text-gray-500">{commission.toLocaleString()} {course.devise || "F"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
