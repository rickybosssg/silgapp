import React, { useState } from "react";
import { Phone, Copy, MapPin, CheckCircle, Lock, Package, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MultiColisProgressBadge from "./MultiColisProgressBadge";
import { normalizeCommissionPct, splitAmountByCommission } from "@/lib/commissionUtils";

// Bouton WhatsApp SVG inline
function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// Dialogue : Confirmation + saisie montant
function ConfirmMontantDialog({ colis, devise, onConfirm, onCancel, isPending }) {
  const [montant, setMontant] = useState("");

  const handleSubmit = () => {
    const val = parseFloat(montant);
    if (!montant || isNaN(val) || val <= 0) {
      return; // bouton désactivé si invalide
    }
    onConfirm(val);
  };

  const isValid = montant !== "" && !isNaN(parseFloat(montant)) && parseFloat(montant) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3 text-3xl">
            📦
          </div>
          <p className="text-lg font-black text-gray-900">Livraison confirmée ?</p>
          <p className="text-sm text-gray-600 mt-1">
            <strong>{colis.colis_uid || "Colis"}</strong> — {colis.destinataire_nom || "Destinataire"}
          </p>
          {colis.adresse_livraison && (
            <p className="text-xs text-gray-600 mt-0.5">{colis.adresse_livraison}</p>
          )}
        </div>

        {/* Saisie montant */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Montant encaissé pour ce colis
          </p>
          <div className="relative">
            <input
              type="number"
              placeholder="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="w-full text-center text-2xl font-black h-14 rounded-2xl border-2 border-gray-200 focus:border-green-400 focus:outline-none pr-16 pl-4"
              autoFocus
              min="0"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-600">
              {devise || "F"}
            </span>
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-1">
            Entrez 0 si aucun montant n'est à encaisser
          </p>
        </div>

        {/* Boutons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </button>
          <button
            className="h-12 rounded-2xl bg-gradient-to-b from-green-500 to-green-700 text-white font-black text-sm shadow-lg disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!isValid || isPending}
          >
            ✅ Valider
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vue multi-colis pour le livreur externe.
 * - Pas de QR Code ni de PIN Code
 * - Bouton "✅ Livrer ce colis" → dialogue confirmation + saisie montant
 * - Calcul automatique : total, gain livreur, commission Silga
 * - Fin de course automatique quand tous les colis sont livrés/annulés
 */
export default function MultiColisLivreurView({ course, colisRecupere, onAllLivres }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [confirmColis, setConfirmColis] = useState(null); // colis en attente de confirmation

  // Charger les sous-colis
  const { data: colis = [], isLoading } = useQuery({
    queryKey: ["colis-externes", course.id],
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
  const commissionPct = normalizeCommissionPct(countryCommissionRows?.[0]?.commission_pct);

  // Mutation : livrer un colis individuel + mettre à jour les totaux de la course
  const livrerColisMutation = useMutation({
    mutationFn: async ({ colisItem, montantEncaisse }) => {
      const now = new Date().toISOString();

      // 1. Mettre à jour le colis
      await base44.entities.ColisExterne.update(colisItem.id, {
        statut: "livre",
        heure_livraison: now,
        delivery_confirmed_by: "livreur",
        delivery_confirmed_at: now,
        montant_a_encaisser: montantEncaisse,
      });

      // 2. Recalculer les totaux sur la course parente
      const colisActuel = colis;
      const montantTotal = colisActuel.reduce((sum, c) => {
        if (c.id === colisItem.id) return sum + montantEncaisse;
        if (c.statut === "livre") return sum + (c.montant_a_encaisser || 0);
        return sum;
      }, 0);

      const nbLivres = colisActuel.filter(c => c.id === colisItem.id || c.statut === "livre").length;
      const nbAnnules = course.nb_colis_annules || 0;
      const nbTotal = course.nb_colis || 1;
      const tousTermines = nbLivres + nbAnnules >= nbTotal;

      const split = splitAmountByCommission(montantTotal, commissionPct);
      if (split.commission_silga === null || split.montant_livreur === null) {
        throw new Error(`Commission non configuree pour ${course.country_code || "ce pays"}`);
      }
      const gainLivreur = split.montant_livreur;
      const commissionSilga = split.commission_silga;

      const updateData = {
        nb_colis_livres: nbLivres,
        prix_final: montantTotal,
        montant_livreur: gainLivreur,
        commission_silga: commissionSilga,
      };

      if (tousTermines) {
        updateData.statut = "livree";
        updateData.heure_livraison = now;
        updateData.colis_livre_at = now;
      }

      await base44.entities.CourseExterne.update(course.id, updateData);
      return {
        nbLivres,
        tousTermines,
        montantTotal,
        gainLivreur,
        courseData: {
          ...course,
          ...updateData,
          id: course.id,
          colis_livre_at: updateData.colis_livre_at || course.colis_livre_at,
          heure_livraison: updateData.heure_livraison || course.heure_livraison,
        },
      };
    },
    onSuccess: ({ tousTermines, montantTotal, gainLivreur, courseData }) => {
      setConfirmColis(null);
      if (tousTermines) {
        toast.success(`🎉 Tournée terminée ! Total : ${montantTotal.toLocaleString()} ${course.devise || "F"}`);
        onAllLivres?.(courseData);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
          queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        }, 1200);
      } else {
        queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        toast.success(`Colis livré ✅ — +${gainLivreur.toLocaleString()} ${course.devise || "F"}`);
      }
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const annulerColisMutation = useMutation({
    mutationFn: async (colisItem) => {
      const now = new Date().toISOString();
      await base44.entities.ColisExterne.update(colisItem.id, {
        statut: "annule",
        montant_a_encaisser: 0,
      });

      const montantTotal = colis.reduce((sum, c) => {
        if (c.id === colisItem.id) return sum;
        if (c.statut === "livre") return sum + (c.montant_a_encaisser || 0);
        return sum;
      }, 0);
      const nbLivres = colis.filter(c => c.statut === "livre").length;
      const nbAnnules = colis.filter(c => c.id === colisItem.id || c.statut === "annule").length;
      const nbTotal = course.nb_colis || 1;
      const tousTermines = nbLivres + nbAnnules >= nbTotal;
      const split = splitAmountByCommission(montantTotal, commissionPct);
      if (split.commission_silga === null || split.montant_livreur === null) {
        throw new Error(`Commission non configuree pour ${course.country_code || "ce pays"}`);
      }
      const gainLivreur = split.montant_livreur;
      const commissionSilga = split.commission_silga;

      const updateData = {
        nb_colis_livres: nbLivres,
        nb_colis_annules: nbAnnules,
        prix_final: montantTotal,
        montant_livreur: gainLivreur,
        commission_silga: commissionSilga,
      };

      if (tousTermines) {
        updateData.statut = nbLivres > 0 ? "livree" : "annulee";
        updateData.heure_livraison = now;
        updateData.colis_livre_at = now;
      }

      await base44.entities.CourseExterne.update(course.id, updateData);
      return {
        tousTermines,
        courseData: {
          ...course,
          ...updateData,
          id: course.id,
          colis_livre_at: updateData.colis_livre_at || course.colis_livre_at,
          heure_livraison: updateData.heure_livraison || course.heure_livraison,
        },
      };
    },
    onSuccess: ({ tousTermines, courseData }) => {
      toast.success("Colis annule");
      if (tousTermines) {
        onAllLivres?.(courseData);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
          queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        }, 1200);
      } else {
        queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      }
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  });

  const handleLivrer = (colisItem) => {
    if (colisItem.statut === "livre" || colisItem.statut === "annule") return;
    setConfirmColis(colisItem);
  };

  const handleAnnuler = (colisItem) => {
    if (colisItem.statut === "livre" || colisItem.statut === "annule") return;
    if (!window.confirm("Annuler ce colis ? Le montant sera fixe a 0 F.")) return;
    annulerColisMutation.mutate(colisItem);
  };

  const handleConfirmer = (montant) => {
    if (!confirmColis) return;
    livrerColisMutation.mutate({ colisItem: confirmColis, montantEncaisse: montant });
  };

  // Progression + totaux
  const nbTotal = colis.length || course.nb_colis || 1;
  const nbLivres = colis.filter(c => c.statut === "livre").length;
  const nbAnnules = colis.filter(c => c.statut === "annule").length;
  const totalEncaisse = colis.filter(c => c.statut === "livre").reduce((s, c) => s + (c.montant_a_encaisser || 0), 0);
  const split = splitAmountByCommission(totalEncaisse, commissionPct);
  const gainLivreur = split.montant_livreur || 0;
  const commission = split.commission_silga || 0;

  if (isLoading) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center">
        <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-purple-600 mt-2">Chargement des colis...</p>
      </div>
    );
  }

  if (!colis.length) return null;

  return (
    <>
      {/* Dialogue confirmation + montant */}
      {confirmColis && (
        <ConfirmMontantDialog
          colis={confirmColis}
          devise={course.devise || "F"}
          onConfirm={handleConfirmer}
          onCancel={() => setConfirmColis(null)}
          isPending={livrerColisMutation.isPending}
        />
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-2xl overflow-hidden">
        {/* Header collapsible */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-purple-100 border-b border-purple-200"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-700" />
            <span className="text-sm font-black text-purple-900">
              📦 {nbTotal} colis à livrer
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              nbLivres === nbTotal ? "bg-green-500 text-white" : "bg-purple-200 text-purple-800"
            }`}>
              {nbLivres}/{nbTotal} livré{nbLivres > 1 ? "s" : ""}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-600" />}
          </div>
        </button>

        {/* Barre de progression */}
        <div className="h-1.5 bg-purple-100">
          <div
            className={`h-full transition-all duration-500 ${nbLivres === nbTotal ? "bg-green-500" : "bg-purple-500"}`}
            style={{ width: `${nbTotal > 0 ? (nbLivres / nbTotal) * 100 : 0}%` }}
          />
        </div>

        {/* Liste des colis */}
        {expanded && (
          <div className="divide-y divide-purple-100">
            {colis.map((colisItem, idx) => {
              const estLivre = colisItem.statut === "livre";
              const estAnnule = colisItem.statut === "annule";
              const estVerrouille = estLivre || estAnnule;

              const telRaw = (colisItem.destinataire_telephone || colisItem.destinataire_phone_normalized || "").replace(/\D/g, "");
              const waMsg = encodeURIComponent(`Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis (${colisItem.colis_uid || idx + 1}).`);

              return (
                <div
                  key={colisItem.id}
                  className={`p-4 space-y-3 transition-all ${
                    estVerrouille ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  {/* Numéro + nom + statut */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0 ${
                        estLivre ? "bg-green-500" :
                        estAnnule ? "bg-gray-400" :
                        "bg-purple-600"
                      }`}>
                        {estLivre ? "✓" : estAnnule ? "✕" : colisItem.colis_uid || idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900">
                          {colisItem.destinataire_nom || `Destinataire ${idx + 1}`}
                        </p>
                        <p className="text-[10px] text-gray-500">{colisItem.destinataire_telephone}</p>
                      </div>
                    </div>
                    {estVerrouille && (
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        estLivre ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {estLivre ? <CheckCircle className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {estLivre ? "Livré" : "Annulé"}
                      </div>
                    )}
                  </div>

                  {/* Adresse */}
                  {colisItem.adresse_livraison && (
                    <div className="flex items-start gap-2 bg-gray-50 rounded-xl p-2.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-700 font-medium leading-tight">{colisItem.adresse_livraison}</p>
                    </div>
                  )}

                  {/* Récapitulatif si livré */}
                  {estLivre && (
                    <div className="bg-green-50 rounded-xl px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        <p className="text-[10px] text-green-700 font-semibold">
                          Livré à {new Date(colisItem.heure_livraison).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {(colisItem.montant_a_encaisser || 0) > 0 && (
                        <p className="text-xs font-black text-green-800">
                          {colisItem.montant_a_encaisser.toLocaleString()} {course.devise || "F"}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Boutons d'action — masqués si verrouillé */}
                  {!estVerrouille && colisRecupere && (
                    <div className="flex gap-2">
                      {/* Appeler */}
                      <a href={`tel:${colisItem.destinataire_telephone}`} className="flex-none">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                          <Phone className="w-4 h-4 text-blue-600" />
                        </div>
                      </a>

                      {/* WhatsApp */}
                      <a
                        href={`https://wa.me/${telRaw}?text=${waMsg}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-none"
                      >
                        <div className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                          <WhatsAppIcon className="w-4 h-4 text-green-600" />
                        </div>
                      </a>

                      {/* Copier le numéro */}
                      <button
                        className="flex-none"
                        onClick={() => {
                          navigator.clipboard.writeText(colisItem.destinataire_telephone || "");
                          toast.success("Numéro copié !");
                        }}
                      >
                        <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                          <Copy className="w-4 h-4 text-gray-500" />
                        </div>
                      </button>

                      {/* Bouton Livrer */}
                      <button
                        className="flex-1 h-11 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        onClick={() => handleLivrer(colisItem)}
                        disabled={livrerColisMutation.isPending || annulerColisMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4" />
                        ✅ Colis {colisItem.colis_uid || idx + 1} livré
                      </button>
                      <button
                        className="flex-none h-11 px-3 rounded-xl bg-red-50 border border-red-200 text-red-600 font-black text-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                        onClick={() => handleAnnuler(colisItem)}
                        disabled={livrerColisMutation.isPending || annulerColisMutation.isPending}
                      >
                        <XCircle className="w-4 h-4" />
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer — progression + totaux financiers */}
        <div className="px-4 py-3 bg-purple-50 border-t border-purple-100 space-y-2">
          <MultiColisProgressBadge
            nbColis={nbTotal}
            nbLivres={nbLivres}
            nbAnnules={nbAnnules}
            showDetails={true}
            size="sm"
          />
          {totalEncaisse > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-white rounded-xl p-2 text-center border border-purple-100">
                <p className="text-[9px] text-gray-600 font-bold uppercase">Total</p>
                <p className="text-xs font-black text-gray-800">{totalEncaisse.toLocaleString()} {course.devise || "F"}</p>
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-green-100">
                <p className="text-[9px] text-gray-600 font-bold uppercase">Ton gain</p>
                <p className="text-xs font-black text-green-700">+{gainLivreur.toLocaleString()} {course.devise || "F"}</p>
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                <p className="text-[9px] text-gray-600 font-bold uppercase">Commission</p>
                <p className="text-xs font-black text-gray-500">{commission.toLocaleString()} {course.devise || "F"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
