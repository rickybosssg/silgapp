import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, Truck, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const MOTIFS = [
  { id: "trompe", label: "Je me suis trompé", icon: "🤔" },
  { id: "besoin", label: "Plus besoin", icon: "❌" },
  { id: "adresse", label: "Mauvaise adresse", icon: "📍" },
  { id: "livreur", label: "Livreur trop long", icon: "⏱️" },
  { id: "autre", label: "Autre", icon: "💬" },
];

export default function AnnulerCourseDialog({ course, open, onClose, onSuccess }) {
  const [motif, setMotif] = useState(null);
  const [loading, setLoading] = useState(false);

  const getStatutInfo = () => {
    if (!course) return { bloquee: false, message: "", type: "info" };
    switch (course.statut) {
      case "nouvelle":
      case "recherche_livreur":
        return { bloquee: false, message: "Annulation gratuite - Aucun livreur n'a encore accepté", type: "success" };
      case "livreur_en_route":
        return { bloquee: false, message: "Le livreur est déjà en route vers le point de récupération", type: "warning" };
      case "colis_recupere":
      case "en_livraison":
        return { bloquee: true, message: "Le colis a déjà été récupéré. Contactez le support SILGAPP.", type: "error" };
      default:
        return { bloquee: true, message: "Course terminée", type: "info" };
    }
  };

  const statutInfo = getStatutInfo();

  const handleAnnuler = async () => {
    if (!motif) {
      toast.error("Veuillez sélectionner un motif");
      return;
    }
    setLoading(true);
    try {
      await base44.entities.CourseExterne.update(course.id, {
        statut: "annulee",
        notes: `Annulée par le client. Motif: ${motif}`
      });

      // Notification au livreur si assigné — paramètre corrigé
      if (course.livreur_id && course.livreur_nom) {
        try {
          await base44.functions.invoke("envoiNotificationPush", {
            email: course.livreur_telephone,
            titre: "Course annulée",
            message: `La course ${course.id.substring(0, 8)} a été annulée par le client.`,
            course_id: course.id
          });
        } catch (err) {
          console.error("Erreur notification livreur:", err);
        }
      }

      toast.success("Course annulée");
      if (navigator.vibrate) navigator.vibrate(200);
      onClose();
      onSuccess();
    } catch (err) {
      console.error("Erreur annulation:", err);
      toast.error("Erreur lors de l'annulation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Annuler la course
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            {/* Statut actuel */}
            <div className={`p-4 rounded-lg border ${
              statutInfo.type === "success" ? "bg-green-50 border-green-200" :
              statutInfo.type === "warning" ? "bg-yellow-50 border-yellow-200" :
              "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-3">
                {statutInfo.type === "success" ? <CheckCircle className="w-6 h-6 text-green-600" /> :
                 statutInfo.type === "warning" ? <AlertTriangle className="w-6 h-6 text-yellow-600" /> :
                 <XCircle className="w-6 h-6 text-red-600" />}
                <p className={`font-semibold text-sm ${
                  statutInfo.type === "success" ? "text-green-900" :
                  statutInfo.type === "warning" ? "text-yellow-900" : "text-red-900"
                }`}>
                  {statutInfo.message}
                </p>
              </div>
            </div>

            {/* Infos course */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{course?.type_course === "expedier" ? "Expédition" : "Réception"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{course?.livreur_nom || "En recherche..."}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline">{course?.statut}</Badge>
              </div>
            </div>

            {/* Motifs */}
            {!statutInfo.bloquee && (
              <div className="space-y-3 pt-2">
                <p className="text-sm font-semibold text-foreground">Motif d'annulation :</p>
                <div className="grid gap-2">
                  {MOTIFS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMotif(m.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        motif === m.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"
                      }`}
                    >
                      <span className="text-lg mr-2">{m.icon}</span>
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Retour</AlertDialogCancel>
          {!statutInfo.bloquee && (
            <AlertDialogAction
              onClick={handleAnnuler}
              disabled={loading || !motif}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Annulation...
                </>
              ) : "Annuler la course"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}