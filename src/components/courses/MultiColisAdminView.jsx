import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Package, CheckCircle, XCircle, Clock, Banknote, MapPin } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUT_CONFIG = {
  en_attente:  { label: "En attente",   cls: "bg-gray-100 text-gray-600" },
  recupere:    { label: "Récupéré",     cls: "bg-blue-100 text-blue-700" },
  en_livraison:{ label: "En livraison", cls: "bg-purple-100 text-purple-700" },
  livre:       { label: "Livré ✓",      cls: "bg-green-100 text-green-700" },
  annule:      { label: "Annulé",       cls: "bg-red-100 text-red-500" },
};

/**
 * Section affichée dans CourseDetailDialog pour les courses externes multi-colis.
 * Affiche chaque sous-colis avec : destinataire, statut, montant encaissé.
 * + Totaux : total encaissé, gain livreur, commission SILGAPP (dynamique par pays).
 */
export default function MultiColisAdminView({ course }) {
  const { data: colis = [], isLoading } = useQuery({
    queryKey: ["colis-externes-admin", course.id],
    queryFn: () => base44.entities.ColisExterne.filter({ course_id: course.id }, "numero_ordre", 20),
    enabled: !!course.id && course.is_multi_colis,
    initialData: [],
  });

  const [countryCommissionPct, setCountryCommissionPct] = useState(0);
  useEffect(() => {
    if (!course?.country_code) return;
    base44.entities.Country.filter({ code: course.country_code, actif: true })
      .then(countries => { if (countries?.[0]?.commission_pct) setCountryCommissionPct(countries[0].commission_pct); })
      .catch(() => {});
  }, [course?.country_code]);

  if (!course.is_multi_colis || course.nb_colis <= 1) return null;

  const devise = course.devise || "F";
  const totalEncaisse = colis.filter(c => c.statut === "livre").reduce((s, c) => s + (c.montant_a_encaisser || 0), 0);
  const gainLivreur = Math.round(totalEncaisse * ((100 - countryCommissionPct) / 100));
  const commissionSilga = Math.round(totalEncaisse * (countryCommissionPct / 100));
  const nbLivres = colis.filter(c => c.statut === "livre").length;
  const nbAnnules = colis.filter(c => c.statut === "annule").length;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-purple-100 border-b border-purple-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-700" />
          <span className="text-sm font-black text-purple-900">
            Tournée multi-colis — {colis.length || course.nb_colis} colis
          </span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          nbLivres + nbAnnules >= (colis.length || course.nb_colis)
            ? "bg-green-500 text-white"
            : "bg-purple-200 text-purple-800"
        }`}>
          {nbLivres}/{colis.length || course.nb_colis} livré{nbLivres > 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="p-4 flex items-center gap-2 justify-center">
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-purple-600">Chargement...</p>
        </div>
      ) : (
        <>
          {/* Liste des colis */}
          <div className="divide-y divide-purple-100">
            {colis.map((c, idx) => {
              const cfg = STATUT_CONFIG[c.statut] || STATUT_CONFIG.en_attente;
              const estLivre = c.statut === "livre";
              const estAnnule = c.statut === "annule";
              return (
                <div
                  key={c.id}
                  className={`px-4 py-3 space-y-1 ${estLivre ? "bg-green-50" : estAnnule ? "bg-gray-50 opacity-70" : "bg-white"}`}
                >
                  <div className="flex items-center justify-between">
                    {/* Identité */}
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${
                        estLivre ? "bg-green-500" : estAnnule ? "bg-gray-400" : "bg-purple-600"
                      }`}>
                        {estLivre ? <CheckCircle className="w-3.5 h-3.5" /> : estAnnule ? <XCircle className="w-3.5 h-3.5" /> : c.colis_uid || idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {c.destinataire_nom || `Destinataire ${idx + 1}`}
                        </p>
                        <p className="text-[10px] text-gray-500">{c.destinataire_telephone}</p>
                      </div>
                    </div>

                    {/* Statut + montant */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      {estLivre && (
                        <p className="text-xs font-black text-green-700">
                          {(c.montant_a_encaisser || 0).toLocaleString()} {devise}
                        </p>
                      )}
                      {estAnnule && (
                        <p className="text-[10px] text-gray-600 font-semibold">0 {devise}</p>
                      )}
                    </div>
                  </div>

                  {/* Adresse */}
                  {c.adresse_livraison && (
                    <div className="flex items-center gap-1.5 ml-9">
                      <MapPin className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                      <p className="text-[10px] text-gray-500 truncate">{c.adresse_livraison}</p>
                    </div>
                  )}

                  {/* Heure livraison */}
                  {c.heure_livraison && (
                    <div className="flex items-center gap-1.5 ml-9">
                      <Clock className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                      <p className="text-[10px] text-green-600 font-semibold">
                        Livré le {format(new Date(c.heure_livraison), "dd/MM à HH:mm", { locale: fr })}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer — totaux financiers */}
          {totalEncaisse > 0 && (
            <div className="px-4 py-3 bg-purple-50 border-t border-purple-100 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-xs font-black text-purple-800 uppercase tracking-wide">Récapitulatif financier</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl p-2 text-center border border-purple-100">
                  <p className="text-[9px] text-gray-600 font-bold uppercase">Total encaissé</p>
                  <p className="text-sm font-black text-gray-800">{totalEncaisse.toLocaleString()} {devise}</p>
                </div>
                <div className="bg-white rounded-xl p-2 text-center border border-green-100">
                  <p className="text-[9px] text-gray-600 font-bold uppercase">Gain livreur</p>
                  <p className="text-sm font-black text-green-700">{gainLivreur.toLocaleString()} {devise}</p>
                  <p className="text-[8px] text-green-500">{100 - countryCommissionPct}%</p>
                </div>
                <div className="bg-white rounded-xl p-2 text-center border border-orange-100">
                  <p className="text-[9px] text-gray-600 font-bold uppercase">Commission</p>
                  <p className="text-sm font-black text-orange-600">{commissionSilga.toLocaleString()} {devise}</p>
                  <p className="text-[8px] text-orange-400">{countryCommissionPct}%</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}