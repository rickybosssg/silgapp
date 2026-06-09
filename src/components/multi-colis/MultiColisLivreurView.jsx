import React, { useState } from "react";
import { Phone, Navigation, MapPin, CheckCircle, Lock, Package, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MultiColisProgressBadge from "./MultiColisProgressBadge";

// Bouton WhatsApp SVG inline
function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// Dialogue de confirmation inline (sans window.confirm)
function ConfirmDialog({ colis, onConfirm, onCancel, isPending }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3 text-3xl">
            📦
          </div>
          <p className="text-lg font-black text-gray-900">Confirmer la livraison ?</p>
          <p className="text-sm text-gray-500 mt-1">
            Colis <strong>{colis.colis_uid}</strong> — {colis.destinataire_nom || "Destinataire"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{colis.adresse_livraison}</p>
        </div>
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
            onClick={onConfirm}
            disabled={isPending}
          >
            ✅ Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vue multi-colis pour le livreur externe.
 * Affichée dans CourseActiveCard quand course.is_multi_colis === true ET colis récupéré.
 *
 * Props:
 *   course       - CourseExterne
 *   colisRecupere - boolean
 *   onAllLivres  - callback quand tous les colis sont livrés
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

  // Mutation : livrer un colis individuel
  const livrerColisMutation = useMutation({
    mutationFn: async (colisItem) => {
      const now = new Date().toISOString();
      // 1. Mettre à jour le colis
      await base44.entities.ColisExterne.update(colisItem.id, {
        statut: "livre",
        heure_livraison: now,
        delivery_confirmed_by: "livreur",
        delivery_confirmed_at: now,
      });
      // 2. Recalculer nb_colis_livres sur la course parente
      const nbLivres = (course.nb_colis_livres || 0) + 1;
      const nbTotal = course.nb_colis || 1;
      const nbAnnules = course.nb_colis_annules || 0;
      const tousTermines = nbLivres + nbAnnules >= nbTotal;
      const updateData = { nb_colis_livres: nbLivres };
      if (tousTermines) {
        updateData.statut = "livree";
        updateData.heure_livraison = now;
      }
      await base44.entities.CourseExterne.update(course.id, updateData);
      return { nbLivres, tousTermines };
    },
    onSuccess: ({ tousTermines }) => {
      queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      setConfirmColis(null);
      if (tousTermines) {
        toast.success("🎉 Tous les colis ont été livrés !");
        onAllLivres?.();
      } else {
        toast.success("Colis livré ✅");
      }
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const handleLivrer = (colisItem) => {
    if (colisItem.statut === "livre" || colisItem.statut === "annule") return;
    setConfirmColis(colisItem);
  };

  const handleConfirmer = () => {
    if (!confirmColis) return;
    livrerColisMutation.mutate(confirmColis);
  };

  // Progression
  const nbTotal = colis.length || course.nb_colis || 1;
  const nbLivres = colis.filter(c => c.statut === "livre").length;
  const nbAnnules = colis.filter(c => c.statut === "annule").length;

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
      {/* Dialogue de confirmation */}
      {confirmColis && (
        <ConfirmDialog
          colis={confirmColis}
          onConfirm={handleConfirmer}
          onCancel={() => setConfirmColis(null)}
          isPending={livrerColisMutation.isPending}
        />
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-2xl overflow-hidden">
        {/* Header multi-colis avec progression */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-purple-100 border-b border-purple-200"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-700" />
            <span className="text-sm font-black text-purple-900">Tournée multi-colis</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progression globale */}
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

              // URL Google Maps vers ce destinataire
              const mapsUrl = colisItem.gps_livraison_lat && colisItem.gps_livraison_lng
                ? `https://www.google.com/maps/dir/?api=1&destination=${colisItem.gps_livraison_lat},${colisItem.gps_livraison_lng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(colisItem.adresse_livraison || "")}`;

              const telRaw = (colisItem.destinataire_telephone || colisItem.destinataire_phone_normalized || "").replace(/\D/g, "");
              const waMsg = encodeURIComponent(`Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis (${colisItem.colis_uid || idx + 1}).`);

              return (
                <div
                  key={colisItem.id}
                  className={`p-4 space-y-3 transition-all ${
                    estVerrouille ? "opacity-60 bg-gray-50" : "bg-white"
                  }`}
                >
                  {/* Numéro + statut */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${
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
                    {/* Icône verrouillage */}
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
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-700 font-medium leading-tight">{colisItem.adresse_livraison}</p>
                    </div>
                  )}

                  {/* Actions — masquées si verrouillé */}
                  {!estVerrouille && colisRecupere && (
                    <div className="flex gap-2">
                      {/* Appeler */}
                      <a href={`tel:${colisItem.destinataire_telephone}`} className="flex-none">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
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
                        <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                          <WhatsAppIcon className="w-4 h-4 text-green-600" />
                        </div>
                      </a>

                      {/* Google Maps */}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-none"
                      >
                        <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
                          <Navigation className="w-4 h-4 text-red-500" />
                        </div>
                      </a>

                      {/* Bouton Livrer */}
                      <button
                        className="flex-1 h-10 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        onClick={() => handleLivrer(colisItem)}
                        disabled={livrerColisMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Livrer ce colis
                      </button>
                    </div>
                  )}

                  {/* Heure de livraison si livré */}
                  {estLivre && colisItem.heure_livraison && (
                    <p className="text-[10px] text-green-600 font-semibold text-center">
                      ✅ Livré à {new Date(colisItem.heure_livraison).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer progression globale */}
        <div className="px-4 py-2.5 bg-purple-50 border-t border-purple-100">
          <MultiColisProgressBadge
            nbColis={nbTotal}
            nbLivres={nbLivres}
            nbAnnules={nbAnnules}
            showDetails={true}
            size="sm"
          />
        </div>
      </div>
    </>
  );
}