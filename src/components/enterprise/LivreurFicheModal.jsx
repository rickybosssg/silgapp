import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Bike, MapPin, Activity, Shield, Ban, CheckCircle, Loader2 } from "lucide-react";

export default function LivreurFicheModal({ livreur, open, onClose, onAction }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  if (!livreur) return null;

  const isSuspended = livreur.actif === false;

  const handleSuspend = async () => {
    if (!confirm("Suspendre ce livreur ? Il ne recevra plus de courses.")) return;
    setProcessing(true);
    setError("");
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "suspend_driver",
        livreur_id: livreur.id,
      });
      onAction?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setProcessing(false);
    }
  };

  const handleReactivate = async () => {
    setProcessing(true);
    setError("");
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "reactivate_driver",
        livreur_id: livreur.id,
      });
      onAction?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setProcessing(false);
    }
  };

  const statutLabel = isSuspended ? "Suspendu" :
    livreur.statut === "disponible" ? "Disponible" :
    livreur.statut === "en_course" ? "En course" :
    "Hors ligne";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Fiche livreur</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* En-tête */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              {livreur.photo_url ? (
                <img src={livreur.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-gray-500">
                  {(livreur.prenom?.[0] || "") + (livreur.nom?.[0] || "")}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{livreur.prenom} {livreur.nom}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isSuspended ? "bg-red-100 text-red-700" :
                  livreur.statut === "disponible" ? "bg-emerald-100 text-emerald-700" :
                  livreur.statut === "en_course" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-500"
                }`}>{statutLabel}</span>
              </div>
            </div>
          </div>

          {/* Validation */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <span className="text-xs text-gray-500">Validation</span>
            <span className={`text-xs font-bold ${
              livreur.validation === "valide" ? "text-emerald-600" :
              livreur.validation === "refuse" ? "text-red-600" :
              "text-amber-600"
            }`}>
              {livreur.validation === "valide" ? "Validé" :
               livreur.validation === "refuse" ? "Refusé" :
               "En attente"}
            </span>
          </div>

          {/* Infos */}
          <div className="space-y-2">
            {livreur.user_email && (
              <div className="flex items-center gap-2 text-xs">
                <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-900 truncate">{livreur.user_email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <Phone className="w-3 h-3 text-gray-400 shrink-0" />
              <a href={`tel:${livreur.telephone}`} className="text-blue-600">{livreur.telephone}</a>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Bike className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-gray-900">{livreur.vehicule || livreur.type_vehicule || "moto"}</span>
            </div>
            {(livreur.ville || livreur.quartier) && (
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-900">{livreur.quartier || "—"}, {livreur.ville || "—"}</span>
              </div>
            )}
            {livreur.numero_plaque && (
              <div className="flex items-center gap-2 text-xs">
                <Activity className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-900">Plaque: {livreur.numero_plaque}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-gray-400">Courses du jour</p>
              <p className="text-sm font-bold text-gray-900">{livreur.courses_du_jour || 0}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-gray-400">Note</p>
              <p className="text-sm font-bold text-gray-900">{livreur.note_moyenne?.toFixed(1) || "—"}/5</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions */}
          {livreur.validation === "valide" && (
            <div className="border-t pt-3">
              {isSuspended ? (
                <Button
                  onClick={handleReactivate}
                  disabled={processing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {processing ? "Traitement..." : "Réactiver"}
                </Button>
              ) : (
                <Button
                  onClick={handleSuspend}
                  disabled={processing}
                  variant="outline"
                  className="w-full text-red-500 border-red-200 hover:bg-red-50"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  {processing ? "Traitement..." : "Suspendre"}
                </Button>
              )}
            </div>
          )}

          <p className="text-[10px] text-gray-400 text-center">
            enterprise_id et user_email ne peuvent pas être modifiés.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}