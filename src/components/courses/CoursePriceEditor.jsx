import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Éditeur de prix de course — modifie `prix_propose_admin`.
 * Utilisable côté admin (CourseDetailDialog) et côté client (ClientSuiviCourse).
 *
 * Props:
 * - course: l'entité CourseExterne
 * - disabled: boolean — true si l'édition doit être verrouillée (ex: course déjà livrée)
 * - context: "admin" | "client" — pour le message de feedback
 */
export default function CoursePriceEditor({ course, disabled = false, context = "admin" }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [prix, setPrix] = useState("");
  const [saving, setSaving] = useState(false);

  const currentPrix = course?.prix_propose_admin || course?.prix_estimate || course?.prix_final || 0;
  const devise = course?.devise || "FCFA";
  const canEdit = !disabled && !["livree", "annulee"].includes(course?.statut);

  const handleSave = async () => {
    const montant = parseInt(prix);
    if (!montant || montant < 100) {
      toast.error("Le prix doit être d'au moins 100 FCFA");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.CourseExterne.update(course.id, {
        prix_propose_admin: montant,
        pricing_mode: "admin_manuel",
      });
      queryClient.invalidateQueries();
      toast.success(context === "admin"
        ? "Prix mis à jour — visible par le livreur"
        : "Prix mis à jour");
      setEditing(false);
      setPrix("");
    } catch (err) {
      toast.error("Erreur : " + (err?.message || "mise à jour impossible"));
    } finally {
      setSaving(false);
    }
  };

  if (!course) return null;

  if (editing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-bold text-blue-700 uppercase">Prix de la course</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              placeholder={String(currentPrix)}
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
          {context === "admin"
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
            {currentPrix > 0 ? `${currentPrix.toLocaleString()} ${devise}` : "Non défini"}
          </p>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={() => { setEditing(true); setPrix(String(currentPrix || "")); }}
          className="h-9 px-3 rounded-lg border border-blue-300 text-blue-700 text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100 transition flex-shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
          Modifier
        </button>
      )}
    </div>
  );
}