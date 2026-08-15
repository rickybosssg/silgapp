import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { getPrixAffichable } from "@/utils/getPrixAffichable";

/**
 * Éditeur de prix de course — Phase 2 (règle métier verrouillée).
 *
 * Phase A (avant acceptation) : prix_propose_admin modifiable uniquement.
 * Phase B (après acceptation, avant livraison) : modifiable + notif livreur + client.
 * Phase C (après livraison / annulée) : verrouillé.
 * Si manual_price accepté : verrouillé.
 *
 * Ne recalculer jamais commission_silga / montant_livreur ici.
 */
export default function CoursePriceEditor({ course, disabled = false, context = "admin" }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [prix, setPrix] = useState("");
  const [saving, setSaving] = useState(false);

  const prixAffiche = getPrixAffichable(course);
  const devise = course?.devise || "FCFA";

  const phase = useMemo(() => {
    if (!course) return "C";
    if (["livree", "annulee"].includes(course.statut)) return "C";
    if (course.pricing_mode === "manual" && course.manual_price_status === "accepted") return "locked_manual";
    if (course.livreur_id) return "B";
    return "A";
  }, [course]);

  const canEdit = !disabled && phase !== "C" && phase !== "locked_manual";

  const handleSave = async () => {
    const montant = parseInt(prix);
    if (!montant || montant < 100) {
      toast.error("Le prix doit être d'au moins 100 FCFA");
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("modifierPrixCourseAdmin", {
        course_id: course.id,
        nouveau_prix: montant,
      });
      const data = res?.data || {};
      if (data.blocked) {
        toast.error(data.error || "Édition verrouillée");
        setEditing(false);
        return;
      }
      queryClient.invalidateQueries();
      toast.success(data.message || "Prix mis à jour");
      setEditing(false);
      setPrix("");
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "mise à jour impossible";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!course) return null;

  // ── Phase C / locked_manual : lecture seule ──
  if (!canEdit) {
    const lockReason = phase === "C"
      ? (course.statut === "livree" ? "Course livrée — prix verrouillé" : "Course annulée — prix verrouillé")
      : "Prix manuel accepté — verrouillé";
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase">Prix de la course</p>
            <p className="text-lg font-black text-gray-700">
              {prixAffiche > 0 ? `${prixAffiche.toLocaleString()} ${devise}` : "Non défini"}
            </p>
          </div>
        </div>
        <span className="text-[10px] text-gray-400 font-medium">{lockReason}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-bold text-blue-700 uppercase">Prix de la course</span>
          {phase === "B" && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              Livreur notifié
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              placeholder={String(prixAffiche || "")}
              autoFocus
              className="w-full h-11 rounded-xl border-2 border-blue-200 px-3 text-base font-bold text-gray-900 focus:border-blue-400 focus:outline-none pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">{devise}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { setEditing(false); setPrix(""); }}
            className="h-11 w-11 rounded-xl border border-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-blue-600">
          {phase === "B"
            ? "Le livreur et le client seront notifiés de ce changement."
            : context === "admin"
              ? "Le prix sera immédiatement visible par le livreur."
              : "Le prix sera proposé au livreur avant acceptation."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Banknote className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase">Prix de la course</p>
          <p className="text-lg font-black text-blue-900">
            {prixAffiche > 0 ? `${prixAffiche.toLocaleString()} ${devise}` : "Non défini"}
          </p>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={() => { setEditing(true); setPrix(String(prixAffiche || "")); }}
          className="h-9 px-3 rounded-lg border border-blue-300 text-blue-700 text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100 transition flex-shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
          Modifier
        </button>
      )}
    </div>
  );
}
