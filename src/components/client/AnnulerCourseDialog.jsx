import React, { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Package, Truck, Clock,
  XCircle, CheckCircle, Info, CreditCard, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// Distance Haversine en km
function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MOTIFS = [
  { id: "trompe", label: "Je me suis trompé", icon: "🤔" },
  { id: "besoin", label: "Plus besoin", icon: "❌" },
  { id: "adresse", label: "Mauvaise adresse", icon: "📍" },
  { id: "livreur", label: "Livreur trop long", icon: "⏱️" },
  { id: "autre", label: "Autre", icon: "💬" },
];

// step: "info" | "motif"
// situation: { type: "gratuit" | "payant" | "impossible", raison? }
export default function AnnulerCourseDialog({ course, open, onClose, onSuccess, clientId }) {
  const [step, setStep] = useState("info");
  const [motif, setMotif] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [situation, setSituation] = useState(null); // null = en cours d'analyse

  useEffect(() => {
    if (!open || !course) return;
    setStep("info");
    setMotif(null);
    setSituation(null);
    analyserSituation();
  }, [open, course?.id]);

  const analyserSituation = async () => {
    if (!course) return;
    setAnalysing(true);
    try {
      const statut = course.statut;

      // Cas 1 : aucun livreur ou course en recherche → gratuit
      if (!course.livreur_id || ["nouvelle", "recherche_livreur"].includes(statut)) {
        setSituation({ type: "gratuit" });
        return;
      }

      // Cas 3 : colis déjà récupéré ou en livraison → impossible
      if (["colis_recupere", "en_livraison", "livree"].includes(statut)) {
        setSituation({ type: "impossible", raison: "Le colis a déjà été récupéré par le livreur." });
        return;
      }

      // Cas 2 : livreur accepté et en route → vérifier % trajet parcouru
      // On récupère la position GPS actuelle du livreur
      const livreurs = await base44.entities.Livreur.filter({ id: course.livreur_id });
      const livreur = livreurs?.[0];

      if (livreur?.latitude && livreur?.longitude && course.gps_depart_lat && course.gps_depart_lng) {
        // Distance actuelle livreur → point de récupération
        const distActuelle = haversineKm(
          livreur.latitude, livreur.longitude,
          course.gps_depart_lat, course.gps_depart_lng
        );

        // Estimer la distance initiale livreur → récupération au moment de l'acceptation
        // On utilise les coordonnées GPS du livreur stockées dans le profil
        // Si moins de 300m restants → considéré > 50% parcouru
        if (distActuelle !== null && distActuelle < 0.3) {
          setSituation({
            type: "impossible",
            raison: "Le livreur est déjà trop avancé vers le point de récupération (moins de 300m)."
          });
          return;
        }

        // Calculer % avec distance de référence estimée
        // Pour une distance actuelle donnée, on estime que le livreur partait d'une zone urbaine (max 3km)
        // Si dist < 50% de la distance estimée initiale → > 50% parcouru
        // Distance initiale estimée = distActuelle + distance parcourue (difficile à mesurer sans historique)
        // Approche conservative : si dist actuelle < 1.5km → on suppose > 50% (zone urbaine dense)
        if (distActuelle !== null && distActuelle < 1.5) {
          setSituation({
            type: "impossible",
            raison: "Annulation impossible : le livreur est déjà trop avancé vers le point de récupération."
          });
          return;
        }
      }

      // Livreur accepté mais pas encore trop avancé → frais d'annulation
      // Montant basé sur la devise du pays (250 pour FCFA, sinon fallback)
      setSituation({ type: "payant", montant: 250 });
    } catch (err) {
      console.error("Erreur analyse situation:", err);
      // En cas d'erreur → autoriser avec frais par précaution
      setSituation({ type: "payant", montant: 250 });
    } finally {
      setAnalysing(false);
    }
  };

  const handleConfirmer = async () => {
    if (!motif) { toast.error("Veuillez sélectionner un motif"); return; }
    setLoading(true);
    try {
      // 1. Annuler la course
      await base44.entities.CourseExterne.update(course.id, {
        statut: "annulee",
        notes: `Annulée par le client. Motif: ${motif}${situation?.type === "payant" ? ` | Frais: ${situation.montant} ${course.devise || "FCFA"}` : ""}`,
      });

      // 2. Si frais → créer l'enregistrement FraisAnnulation
      if (situation?.type === "payant" && clientId) {
        await base44.entities.FraisAnnulation.create({
          country_code: course.country_code || "",
          course_id: course.id,
          client_id: clientId,
          client_nom: course.client_nom || "",
          client_telephone: course.client_telephone || "",
          livreur_id: course.livreur_id || "",
          livreur_nom: course.livreur_nom || "",
          montant: 250,
          statut_paiement: "impaye",
          raison: "Annulation après acceptation livreur",
          date_annulation: new Date().toISOString(),
        });

        // Vérifier si le client dépasse le seuil de blocage (2000 FCFA)
        const allFrais = await base44.entities.FraisAnnulation.filter({ client_id: clientId, statut_paiement: "impaye" });
        const totalImpaye = (allFrais || []).reduce((s, f) => s + (f.montant || 0), 0);
        if (totalImpaye >= 2000) {
          await base44.entities.ClientExterne.update(clientId, { bloque_frais_annulation: true });
          toast.error(`Compte bloqué : ${totalImpaye.toLocaleString()} FCFA de frais impayés. Régularisez via Payer SILGAPP.`);
        }
      }

      // 3. Notifier le livreur
      if (course.livreur_id) {
        base44.functions.invoke("envoiNotificationPush", {
          livreur_id: course.livreur_id,
          titre: "Course annulée",
          message: "La course a été annulée par le client.",
          course_id: course.id,
        }).catch(() => {});
      }

      if (situation?.type === "payant") {
        toast.warning(`Course annulée — Frais d'annulation de ${situation.montant} ${course.devise || "FCFA"} ajoutés à votre compte.`);
      } else {
        toast.success("Course annulée gratuitement.");
      }
      if (navigator.vibrate) navigator.vibrate(200);
      onClose();
      onSuccess?.();
    } catch (err) {
      console.error("Erreur annulation:", err);
      toast.error("Erreur lors de l'annulation");
    } finally {
      setLoading(false);
    }
  };

  if (!course) return null;

  const situationBadge = () => {
    if (analysing || !situation) return null;
    if (situation.type === "gratuit") return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm font-semibold text-green-800">
        <CheckCircle className="w-4 h-4 flex-shrink-0" /> Votre annulation est gratuite
      </div>
    );
    if (situation.type === "payant") return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm font-semibold text-orange-800">
        <CreditCard className="w-4 h-4 flex-shrink-0" /> Frais d'annulation : {situation.montant} {course.devise || "FCFA"}
      </div>
    );
    if (situation.type === "impossible") return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-800">
        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{situation.raison || "Annulation impossible"}</span>
      </div>
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Annuler la course
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">

              {/* ── ÉTAPE INFO : règles ── */}
              {step === "info" && (
                <>
                  {/* Bloc règles toujours visible */}
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-bold text-blue-900">Politique d'annulation SILGAPP</p>
                    </div>
                    <ul className="space-y-2 text-sm text-blue-800">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Avant acceptation par un livreur</strong>, l'annulation est <strong>gratuite</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CreditCard className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Après acceptation par un livreur</strong>, des <strong>frais d'annulation</strong> sont appliqués.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Si le livreur a déjà parcouru <strong>au moins 50 %</strong> du trajet vers le point de récupération, <strong>l'annulation n'est plus possible</strong>.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Situation actuelle */}
                  {analysing ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
                      <Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours...
                    </div>
                  ) : situationBadge()}

                  {/* Infos course */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Package className="w-4 h-4" />
                      <span>{course.type_course === "expedier" ? "Expédition" : "Réception"}</span>
                    </div>
                    {course.livreur_nom && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Truck className="w-4 h-4" />
                        <span>{course.livreur_nom}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <Badge variant="outline" className="text-xs">{course.statut}</Badge>
                    </div>
                  </div>
                </>
              )}

              {/* ── ÉTAPE MOTIF ── */}
              {step === "motif" && (
                <>
                  {situation?.type === "payant" && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800">
                      <CreditCard className="w-4 h-4 flex-shrink-0" />
                      <span>Des frais de <strong>{situation?.montant || 250} {course.devise || "FCFA"}</strong> seront ajoutés à votre compte (statut : Impayé).</span>
                    </div>
                  )}
                  {situation?.type === "gratuit" && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Cette annulation est <strong>gratuite</strong>.</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Motif d'annulation :</p>
                    <div className="grid gap-2">
                      {MOTIFS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMotif(m.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            motif === m.id
                              ? "border-primary bg-primary/5"
                              : "border-gray-200 hover:border-primary/50"
                          }`}
                        >
                          <span className="text-lg mr-2">{m.icon}</span>
                          <span className="text-sm font-medium">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onClose}>Retour</AlertDialogCancel>

          {/* Étape INFO → Continuer (si pas impossible et analyse terminée) */}
          {step === "info" && !analysing && situation && situation.type !== "impossible" && (
            <button
              type="button"
              onClick={() => setStep("motif")}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white h-9 px-4 transition-colors"
            >
              Continuer
            </button>
          )}

          {/* Étape MOTIF → Confirmer */}
          {step === "motif" && (
            <button
              type="button"
              onClick={handleConfirmer}
              disabled={loading || !motif}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white h-9 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer l'annulation
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}