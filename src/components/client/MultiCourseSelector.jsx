import React from "react";
import { X, ChevronRight, MapPin } from "lucide-react";
import MultiColisProgressBadge from "@/components/multi-colis/MultiColisProgressBadge";
import { getPrixAffichable } from "@/utils/getPrixAffichable";

const STATUT_LABELS = {
  nouvelle: "Nouvelle",
  en_attente: "En attente",
  recherche_livreur: "Recherche livreur",
  livreur_en_route: "Livreur en route",
  client_contacto: "Client contacté",
  en_route_expediteur: "En route",
  arrive_prise_en_charge: "Arrivé au point de prise",
  colis_recupere: "Colis récupéré",
  pris_en_charge: "Pris en charge",
  en_livraison: "En livraison",
  arrivee: "Arrivé",
  livree: "Livré",
  annulee: "Annulée",
};

const STATUT_COLORS = {
  nouvelle: "bg-amber-100 text-amber-700",
  en_attente: "bg-amber-100 text-amber-700",
  recherche_livreur: "bg-orange-100 text-orange-700",
  livreur_en_route: "bg-blue-100 text-blue-700",
  colis_recupere: "bg-purple-100 text-purple-700",
  en_livraison: "bg-indigo-100 text-indigo-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

export default function MultiCourseSelector({ courses, onSelect, onClose }) {
  // Compteurs par statut
  const nbRecherche = courses.filter(c => c.statut === "recherche_livreur" || c.statut === "nouvelle" || c.statut === "en_attente").length;
  const nbEnCours = courses.filter(c => ["livreur_en_route", "en_route_expediteur", "arrive_prise_en_charge", "pris_en_charge", "en_livraison", "colis_recupere"].includes(c.statut)).length;
  const nbLivrees = courses.filter(c => c.statut === "livree").length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg max-h-[80vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#00a86b]/10 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[#00a86b]" />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-sm">
                Mes livraisons
              </h2>
              <p className="text-[11px] text-gray-500">Sélectionnez une course à suivre</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 font-black flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compteurs par statut */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex gap-2">
          <div className="flex-1 text-center">
            <p className="text-lg font-black text-orange-600">{nbRecherche}</p>
            <p className="text-[9px] font-bold text-gray-500 uppercase">En recherche</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex-1 text-center">
            <p className="text-lg font-black text-blue-600">{nbEnCours}</p>
            <p className="text-[9px] font-bold text-gray-500 uppercase">En cours</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex-1 text-center">
            <p className="text-lg font-black text-green-600">{nbLivrees}</p>
            <p className="text-[9px] font-bold text-gray-500 uppercase">Livrées</p>
          </div>
        </div>

        {/* Liste des courses */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {courses.map((course, idx) => {
            const statutLabel = STATUT_LABELS[course.statut] || course.statut;
            const statutColor = STATUT_COLORS[course.statut] || "bg-gray-100 text-gray-700";
            const prix = getPrixAffichable(course);

            return (
              <button
                key={course.id}
                onClick={() => onSelect(course.id)}
                className="w-full text-left p-3.5 rounded-2xl border-2 border-gray-100 hover:border-[#00a86b]/40 hover:bg-[#00a86b]/5 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    Course #{idx + 1}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statutColor}`}>
                    {statutLabel}
                  </span>
                </div>

                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      <span className="text-gray-400">De:</span> {course.adresse_depart || "—"}
                    </p>
                    <p className="text-xs font-bold text-gray-900 truncate mt-0.5">
                      <span className="text-gray-400">À:</span> {course.adresse_arrivee || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    {course.livreur_id ? (
                      <>
                        <div className="w-6 h-6 rounded-full bg-[#00a86b]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-black text-[#00a86b]">
                            {(course.livreur_nom || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700 truncate">
                          {course.livreur_nom || "Livreur"}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-400 italic">En attente de livreur</span>
                    )}
                  </div>
                  {prix > 0 && (
                    <span className="text-xs font-black text-gray-900 flex-shrink-0">
                      {prix.toLocaleString()} {course.devise || "F"}
                    </span>
                  )}
                </div>

                {course.is_multi_colis && (
                  <div className="mt-2">
                    <MultiColisProgressBadge
                      nbColis={course.nb_colis || 1}
                      nbLivres={course.nb_colis_livres || 0}
                      nbAnnules={course.nb_colis_annules || 0}
                      size="sm"
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}