import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Modal admin pour confirmer le prix d'une course en état "prix_a_confirmer".
 *
 * Propose :
 *   - Le prix suggéré (provenant de TarifZone/Country)
 *   - Le palier 1 de TarifZone (si configuré)
 *   - Le palier 2 de TarifZone (si configuré)
 *   - Un montant manuel
 *
 * Appelle la fonction backend confirmerPrixCourseAdmin qui :
 *   - vérifie les permissions admin
 *   - calcule commission_silga + montant_livreur
 *   - est idempotente
 *   - appelle verifierEncoursLivreur
 */
export default function PrixAConfirmerModal({ course, open, onClose, onConfirmed }) {
  const [montantChoisi, setMontantChoisi] = useState(null);
  const [montantManuel, setMontantManuel] = useState("");
  const [loading, setLoading] = useState(false);
  const [tarifZone, setTarifZone] = useState(null);

  // Charger TarifZone pour proposer les paliers
  useEffect(() => {
    if (!open || !course) return;
    let cancelled = false;
    base44.functions.invoke("getTarifZones", { country_code: course.country_code })
      .then(res => {
        if (cancelled) return;
        const data = res?.data || res;
        const zones = data?.zones || [];
        if (zones[0]) setTarifZone(zones[0]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, course]);

  // Initialiser le montant choisi avec le prix suggéré
  useEffect(() => {
    if (open && course) {
      setMontantChoisi(course.prix_suggere_admin || null);
      setMontantManuel("");
    }
  }, [open, course]);

  if (!course) return null;

  const raisonLabel = course.raison_prix_a_confirmer
    ? RAISON_LABELS[course.raison_prix_a_confirmer] || course.raison_prix_a_confirmer
    : "Raison inconnue";

  const palier1 = tarifZone?.palier_1_prix;
  const palier2 = tarifZone?.palier_2_prix;
  const suggere = course.prix_suggere_admin || palier1;

  const montantFinal = montantChoisi || (montantManuel ? Number(montantManuel) : null);

  const handleConfirm = async () => {
    if (!montantFinal || montantFinal <= 0) {
      toast.error("Veuillez sélectionner ou saisir un montant");
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke("confirmerPrixCourseAdmin", {
        course_id: course.id,
        prix_final: montantFinal,
      });
      const data = res?.data || res;
      if (data?.success) {
        toast.success(`Prix confirmé : ${montantFinal.toLocaleString()} F`);
        onConfirmed?.(data.course || course);
        onClose?.();
      } else {
        toast.error(data?.error || "Erreur lors de la confirmation");
      }
    } catch (err) {
      toast.error(err?.message || "Erreur lors de la confirmation");
    } finally {
      setLoading(false);
    }
  };

  const montantRapideOptions = [];
  if (palier1) montantRapideOptions.push({ label: `Palier 1`, value: palier1 });
  if (palier2) montantRapideOptions.push({ label: `Palier 2`, value: palier2 });
  if (suggere && !montantRapideOptions.find(o => o.value === suggere)) {
    montantRapideOptions.unshift({ label: "Suggéré", value: suggere });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            Prix à confirmer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Infos course */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-sm font-bold text-gray-900">{course.client_nom || "Client"}</p>
            <p className="text-xs text-gray-500">
              {course.quartier_depart || course.adresse_depart || "?"} → {course.quartier_arrivee || course.adresse_arrivee || "?"}
            </p>
            <p className="text-xs text-gray-500">
              Statut : <span className="font-semibold">{course.statut}</span>
              {course.livreur_nom && <> · Livreur : {course.livreur_nom}</>}
            </p>
          </div>

          {/* Raison */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Raison du calcul impossible :</p>
            <p className="text-xs text-amber-700">{raisonLabel}</p>
          </div>

          {/* Montants rapides */}
          {montantRapideOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 uppercase">Montants rapides</p>
              <div className="grid grid-cols-3 gap-2">
                {montantRapideOptions.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => { setMontantChoisi(opt.value); setMontantManuel(""); }}
                    className={`py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${
                      montantChoisi === opt.value
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-primary/40"
                    }`}
                  >
                    {opt.value.toLocaleString()} F
                    <span className="block text-[9px] font-normal opacity-70">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Montant manuel */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-600 uppercase">Autre montant</p>
            <Input
              type="number"
              placeholder="Saisir un montant en FCFA"
              value={montantManuel}
              onChange={e => { setMontantManuel(e.target.value); setMontantChoisi(null); }}
              className="h-12 text-base font-bold"
            />
          </div>

          {/* Récapitulatif */}
          {montantFinal && montantFinal > 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-xs text-green-600 font-semibold">Prix final</p>
              <p className="text-2xl font-black text-green-700">{montantFinal.toLocaleString()} F CFA</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Aucun montant sélectionné</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!montantFinal || montantFinal <= 0 || loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <AlertTriangle className="w-4 h-4 mr-1" />}
            Confirmer le prix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RAISON_LABELS = {
  gps_arrivee_manquant: "Coordonnées GPS d'arrivée manquantes — distance tarifaire impossible à calculer",
  gps_depart_manquant: "Coordonnées GPS de départ manquantes — distance tarifaire impossible à calculer",
  distance_tarifaire_impossible: "Distance tarifaire impossible à calculer (GPS manquants)",
  commission_pct_manquant: "Commission non configurée pour le pays — calcul automatique bloqué",
  distance_exceeds_tarif_zone: "Distance supérieure au palier maximum — tarif personnalisé requis",
};