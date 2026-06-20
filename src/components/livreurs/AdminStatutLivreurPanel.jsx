import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PowerOff, Power, AlertTriangle, History, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Panel de gestion administrative du statut ON/OFF d'un livreur externe.
 * Permet de mettre hors ligne ou réactiver avec traçabilité complète.
 */
export default function AdminStatutLivreurPanel({ livreur, coursesActives = [] }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [showConfirmForce, setShowConfirmForce] = useState(false);
  const [showHistorique, setShowHistorique] = useState(false);

  const isAdminOff = !!livreur.admin_hors_ligne;
  const enCourse = livreur.statut === "en_course" || coursesActives.length > 0;

  // Parser le log existant
  const historique = (() => {
    try { return JSON.parse(livreur.admin_statut_log || "[]"); } catch { return []; }
  })();

  const ajouterLog = (action, adminNote = "") => {
    const newEntry = {
      date: new Date().toISOString(),
      action,
      admin: adminNote || "Administration",
    };
    return JSON.stringify([newEntry, ...historique].slice(0, 20));
  };

  const mettrHorsLigne = async (force = false) => {
    setLoading(true);
    try {
      const newLog = ajouterLog("OFF par administration");
      await base44.entities.Livreur.update(livreur.id, {
        admin_hors_ligne: true,
        statut: "hors_ligne",
        admin_statut_log: newLog,
      });
      // Notifier le livreur si email connu
      if (livreur.user_email) {
        base44.integrations.Core.SendEmail({
          to: livreur.user_email,
          subject: " Compte mis hors ligne",
          body: `Bonjour ${livreur.prenom || livreur.nom},\n\n Votre compte a été mis hors ligne par l'administration SILGAPP.\n\nVous ne recevrez plus de nouvelles courses jusqu'à réactivation.\n\nContactez l'administration pour plus d'informations.`,
        }).catch(() => null);
      }
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success(`${livreur.nom} mis hors ligne par l'administration`);
      setShowConfirmForce(false);
    } catch {
      toast.error("Erreur lors de la mise hors ligne");
    } finally {
      setLoading(false);
    }
  };

  const remettreLigne = async () => {
    setLoading(true);
    try {
      const newLog = ajouterLog("ON par administration");
      await base44.entities.Livreur.update(livreur.id, {
        admin_hors_ligne: false,
        statut: "disponible",
        admin_statut_log: newLog,
      });
      if (livreur.user_email) {
        base44.integrations.Core.SendEmail({
          to: livreur.user_email,
          subject: " Compte remis en ligne",
          body: `Bonjour ${livreur.prenom || livreur.nom},\n\n Votre compte a été remis en ligne par l'administration SILGAPP.\n\nVous pouvez à nouveau recevoir des courses. Bonne journée !`,
        }).catch(() => null);
      }
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success(`${livreur.nom} remis en ligne`);
    } catch {
      toast.error("Erreur lors de la réactivation");
    } finally {
      setLoading(false);
    }
  };

  const handleMettreHorsLigne = () => {
    if (enCourse) {
      setShowConfirmForce(true);
    } else {
      mettrHorsLigne(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Statut actuel */}
      <div className={`rounded-xl p-3 flex items-center gap-3 ${
        isAdminOff
          ? "bg-red-50 border border-red-200"
          : "bg-green-50 border border-green-200"
      }`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isAdminOff ? "bg-red-100" : "bg-green-100"
        }`}>
          {isAdminOff
            ? <PowerOff className="w-4 h-4 text-red-600" />
            : <Power className="w-4 h-4 text-green-600" />
          }
        </div>
        <div className="flex-1">
          <p className={`text-sm font-bold ${isAdminOff ? "text-red-700" : "text-green-700"}`}>
            {isAdminOff ? " OFF par l'administration" : livreur.statut === "en_course" ? " En course (livreur)" : livreur.statut === "disponible" ? " ON par le livreur" : " OFF par le livreur"}
          </p>
          <p className={`text-xs ${isAdminOff ? "text-red-500" : "text-green-600"}`}>
            {isAdminOff ? "Non dispatchable — hors service admin" : "Éligible au dispatch"}
          </p>
        </div>
      </div>

      {/* Avertissement course en cours */}
      {enCourse && !isAdminOff && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 font-medium">
             Ce livreur est actuellement en mission active.
          </p>
        </div>
      )}

      {/* Confirmation force (en course) */}
      {showConfirmForce && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-700"> Livreur en mission</p>
          <p className="text-xs text-red-600">
            Ce livreur a une course en cours. Forcer la mise hors ligne l'exclura du dispatch immédiatement.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setShowConfirmForce(false)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={() => mettrHorsLigne(true)}
              disabled={loading}
            >
              <PowerOff className="w-3 h-3 mr-1" />
              Forcer hors ligne
            </Button>
          </div>
        </div>
      )}

      {/* Bouton action principal */}
      {!showConfirmForce && (
        isAdminOff ? (
          <Button
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            onClick={remettreLigne}
            disabled={loading}
          >
            <Power className="w-4 h-4" />
            {loading ? "Réactivation..." : " Remettre en ligne"}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleMettreHorsLigne}
            disabled={loading}
          >
            <PowerOff className="w-4 h-4" />
            {loading ? "Mise hors ligne..." : " Mettre hors ligne"}
          </Button>
        )
      )}

      {/* Historique */}
      {historique.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
            onClick={() => setShowHistorique(!showHistorique)}
          >
            <History className="w-3.5 h-3.5" />
            <span className="font-medium">Historique admin ({historique.length})</span>
            {showHistorique ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showHistorique && (
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
              {historique.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 bg-gray-50">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.action.startsWith("ON") ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-muted-foreground flex-shrink-0">
                    {format(new Date(entry.date), "dd/MM/yyyy - HH'h'mm", { locale: fr })}
                  </span>
                  <span className="font-medium text-foreground">{entry.action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}