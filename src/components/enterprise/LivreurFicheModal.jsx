import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Phone, Mail, Bike, MapPin, Activity, Shield, Ban, CheckCircle,
  Loader2, Send, Clock, Package, Navigation,
} from "lucide-react";

export default function LivreurFicheModal({ livreur, open, onClose, onAction }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [ficheData, setFicheData] = useState(null);
  const [loadingFiche, setLoadingFiche] = useState(false);

  // Charger les détails (stats de courses) quand le modal s'ouvre
  useEffect(() => {
    if (open && livreur?.id) {
      loadFiche(livreur.id);
    } else {
      setFicheData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, livreur?.id]);

  const loadFiche = async (livreurId) => {
    setLoadingFiche(true);
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", {
        action: "get_livreur_fiche",
        livreur_id: livreurId,
      });
      setFicheData(res);
    } catch (err) {
      // Non-bloquant : on affiche les données de base
      console.error("Erreur get_livreur_fiche:", err);
    } finally {
      setLoadingFiche(false);
    }
  };

  if (!livreur) return null;

  const isSuspended = livreur.actif === false;
  const userActivated = ficheData?.stats?.user_activated ?? false;

  const handleSuspend = async () => {
    if (!confirm("Suspendre ce livreur ? Il ne recevra plus de nouvelles courses mais pourra terminer sa course en cours.")) return;
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

  const handleResendInvitation = async () => {
    setProcessing(true);
    setError("");
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "resend_invitation",
        livreur_id: livreur.id,
      });
      onAction?.();
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

  const stats = ficheData?.stats || {};

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isSuspended ? "bg-red-100 text-red-700" :
                  livreur.statut === "disponible" ? "bg-emerald-100 text-emerald-700" :
                  livreur.statut === "en_course" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-500"
                }`}>{statutLabel}</span>
                {userActivated && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    Compte activé
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Validation */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Validation
            </span>
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

          {/* Infos contact */}
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
            {livreur.numero_plaque && (
              <div className="flex items-center gap-2 text-xs">
                <Activity className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-900">Plaque: {livreur.numero_plaque}</span>
              </div>
            )}
            {(livreur.ville || livreur.quartier) && (
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-900">{livreur.quartier || "—"}, {livreur.ville || "—"}</span>
              </div>
            )}
          </div>

          {/* Stats de courses */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <Package className="w-3 h-3 text-gray-400 mx-auto mb-1" />
              <p className="text-gray-400 text-[10px]">Du jour</p>
              <p className="text-sm font-bold text-gray-900">{livreur.courses_du_jour || 0}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <Clock className="w-3 h-3 text-gray-400 mx-auto mb-1" />
              <p className="text-gray-400 text-[10px]">En traitement</p>
              <p className="text-sm font-bold text-gray-900">
                {loadingFiche ? "—" : (stats.courses_en_traitement ?? 0)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <CheckCircle className="w-3 h-3 text-gray-400 mx-auto mb-1" />
              <p className="text-gray-400 text-[10px]">Livrées</p>
              <p className="text-sm font-bold text-gray-900">
                {loadingFiche ? "—" : (stats.courses_livrees ?? 0)}
              </p>
            </div>
          </div>

          {/* Note */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <span className="text-xs text-gray-500">Note moyenne</span>
            <span className="text-xs font-bold text-gray-900">
              {livreur.note_moyenne?.toFixed(1) || "—"} / 5 ({livreur.nombre_avis || 0} avis)
            </span>
          </div>

          {/* Dernière activité + position */}
          {livreur.last_seen_at && (
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-gray-500">Dernière activité: {new Date(livreur.last_seen_at).toLocaleString("fr-FR")}</span>
            </div>
          )}
          {livreur.latitude != null && livreur.longitude != null && (
            <div className="flex items-center gap-2 text-xs">
              <Navigation className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-gray-500">
                Position: {livreur.latitude.toFixed(4)}, {livreur.longitude.toFixed(4)}
                {livreur.derniere_position_date && (
                  <span className="text-gray-400"> · {new Date(livreur.derniere_position_date).toLocaleTimeString("fr-FR")}</span>
                )}
              </span>
            </div>
          )}

          {/* Courses récentes */}
          {ficheData?.recent_courses?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-900 mb-1">Courses récentes</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {ficheData.recent_courses.slice(0, 5).map((c) => (
                  <div key={c.id} className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1">
                    <span className="font-mono">#{c.id?.slice(-6)}</span>
                    {" · "}
                    {c.client_nom || "Client"}
                    {" · "}
                    <span className={c.statut === "livree" ? "text-emerald-600" : "text-amber-600"}>
                      {c.statut}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions */}
          <div className="border-t pt-3 space-y-2">
            {/* Renvoyer invitation si non activé */}
            {livreur.validation === "valide" && !userActivated && (
              <Button
                onClick={handleResendInvitation}
                disabled={processing}
                variant="outline"
                className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                size="sm"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {processing ? "Envoi..." : "Renvoyer l'invitation email"}
              </Button>
            )}

            {/* Suspendre / Réactiver */}
            {livreur.validation === "valide" && (
              isSuspended ? (
                <Button
                  onClick={handleReactivate}
                  disabled={processing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  size="sm"
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
                  size="sm"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  {processing ? "Traitement..." : "Suspendre"}
                </Button>
              )
            )}
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            enterprise_id et user_email ne peuvent pas être modifiés.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}