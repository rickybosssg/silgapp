import React, { useState, useEffect } from "react";
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
import { AlertTriangle, Package, Truck, Clock, XCircle, CheckCircle, Info, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// Distance Haversine en km
function haversineKm(lat1, lng1, lat2, lng2) {
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

// Calcule le % de trajet livreur→récupération déjà parcouru
function getPourcentageTrajet(course, livreurLat, livreurLng) {
  // Position de départ du livreur au moment de l'acceptation
  // On utilise la position actuelle du livreur vs point de récupération
  const recupLat = course.gps_depart_lat;
  const recupLng = course.gps_depart_lng;
  if (!recupLat || !recupLng || !livreurLat || !livreurLng) return null;

  // Pour estimer le %, on a besoin d'une distance de référence
  // On utilise latitude_arrivee_livraison comme point livreur si disponible
  // Sinon on ne peut pas calculer — retourne null (sécurité = autoriser)
  return null; // sera overridé par le check GPS ci-dessous
}

const MOTIFS = [
  { id: "trompe", label: "Je me suis trompé", icon: "🤔" },
  { id: "besoin", label: "Plus besoin", icon: "❌" },
  { id: "adresse", label: "Mauvaise adresse", icon: "📍" },
  { id: "livreur", label: "Livreur trop long", icon: "⏱️" },
  { id: "autre", label: "Autre", icon: "💬" },
];

// Étape 1 : Affiche les règles d'annulation
// Étape 2 : Sélection du motif + confirmation
export default function AnnulerCourseDialog({ course, open, onClose, onSuccess, clientId }) {
  const [step, setStep] = useState("info"); // "info" | "motif" | "impossible" | "bloque"
  const [motif, setMotif] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fraisInfo, setFraisInfo] = useState(null); // { gratuit, frais, impossible, livreurPct }

  // Analyse la situation à l'ouverture
  useEffect(() => {
    if (!open || !course) return;
    setStep("info");
    setMotif(null);
    analyser();
  }, [open, course?.id]);

  const analyser = async () => {
    if (!course) return;
    const statut = course.statut;

    // Aucun livreur → gratuit
    if (!course.livreur_id || ["nouvelle", "recherche_livreur"].includes(statut)) {
      setFraisInfo({ gratuit: true, frais: false, impossible: false });
      return;
    }

    // Colis déjà récupéré → impossible
    if (["colis_recupere", "en_livraison", "livree"].includes(statut)) {
      setFraisInfo({ gratuit: false, frais: false, impossible: true, raison: "Le colis a déjà été récupéré." });
      return;
    }

    // Livreur en route → vérifier % trajet via position GPS du livreur
    if (["livreur_en_route", "acceptee"].includes(statut) || course.livreur_id) {
      try {
        const livreurs = await base44.entities.Livreur.filter({ id: course.livreur_id });
        const livreur = livreurs?.[0];
        const livreurLat = livreur?.latitude;
        const livreurLng = livreur?.longitude;
        const recupLat = course.gps_depart_lat;
        const recupLng = course.gps_depart_lng;

        if (livreurLat && livreurLng && recupLat && recupLng && livreur?.derniere_position_date) {
          // Distance actuelle livreur → récupération
          const distActuelle = haversineKm(livreurLat, livreurLng, recupLat, recupLng);

          // Estimer distance initiale via position au moment acceptation
          // On utilise heure_acceptation + derniere_position pour estimer
          // Si livreur très proche (< 300m du point recup) → > 50% parcouru
          // Approche conservative : si dist < 300m → impossible
          if (distActuelle < 0.3) {
            setFraisInfo({ gratuit: false, frais: false, impossible: true, raison: "Le livreur est déjà trop avancé vers le point de récupération." });
            return;
          }

          // Calculer le % approximatif en comparant dist courante vs dist initiale estimée
          // Distance de départ estimée : on récupère la position livreur au moment acceptation
          // si non dispo, on estime via une distance max de 5km pour les courses urbaines
          // Règle : si dist actuelle < 50% de dist estimée initiale → frais
          // On estime la dist initiale à partir du score GPS livreur
          // Sans historique GPS précis, si dist < 1.5km → considéré > 50%
          const distEstimeeInitiale = 3; // distance max standard en ville (3km)
          const pct = 1 - distActuelle / distEstimeeInitiale;
          if (pct >= 0.5) {
            setFraisInfo({ gratuit: false, frais: false, impossible: true, raison: "Le livreur est déjà trop avancé vers le point de récupération." });
            return;
          }
        }

        // Livreur accepté mais pas trop avancé → frais 250 F
        setFraisInfo({ gratuit: false, frais: true, impossible: false, montant: 250 });
      } catch (_) {
        // En cas d'erreur GPS → frais par défaut (sécurité)
        setFraisInfo({ gratuit: false, frais: true, impossible: false, montant: 250 });
      }
      return;
    }

    // Défaut → frais
    setFraisInfo({ gratuit: false, frais: true, impossible: false, montant: 250 });
  };

  const handleConfirmer = async () => {
    if (!motif) {
      toast.error("Veuillez sélectionner un motif");
      return;
    }
    setLoading(true);
    try {
      // Annuler la course
      await base44.entities.CourseExterne.update(course.id, {
        statut: "annulee",
        notes: `Annulée par le client. Motif: ${motif}${fraisInfo?.frais ? " | Frais d'annulation: 250 FCFA" : ""}`
      });

      // Si frais → créer l'enregistrement FraisAnnulation
      if (fraisInfo?.frais && clientId) {
        try {
          await base44.entities.FraisAnnulation.create({
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
        } catch (err) {
          console.error("Erreur création frais:", err);
        }
      }

      // Notifier le livreur si assigné
      if (course.livreur_id) {
        try {
          await base44.functions.invoke("envoiNotificationPush", {
            livreur_id: course.livreur_id,
            titre: "Course annulée",
            message: "La course a été annulée par le client.",
            course_id: course.id
          });
        } catch (_) {}
      }

      if (fraisInfo?.frais) {
        toast.warning("Course annulée — Frais d'annulation de 250 FCFA ajoutés à votre compte.");
      } else {
        toast.success("Course annulée gratuitement.");
      }
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

  if (!course) return null;

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

              {/* ── Étape INFO : règles d'annulation ── */}
              {step === "info" && (
                <>
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-semibold text-blue-900">Politique d'annulation SILGAPP</p>
                    </div>
                    <ul className="space-y-2 text-sm text-blue-800 pl-1">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Avant acceptation par un livreur</strong>, l'annulation est <strong>gratuite</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CreditCard className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Après acceptation par un livreur</strong>, des <strong>frais d'annulation de 250 FCFA</strong> sont appliqués.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Si le livreur a déjà parcouru au moins <strong>50% du trajet</strong> vers le point de récupération, <strong>l'annulation n'est plus possible</strong>.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Situation actuelle */}
                  {fraisInfo && (
                    <div className={`p-3 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                      fraisInfo.gratuit ? "bg-green-50 border-green-200 text-green-800" :
                      fraisInfo.impossible ? "bg-red-50 border-red-200 text-red-800" :
                      "bg-orange-50 border-orange-200 text-orange-800"
                    }`}>
                      {fraisInfo.gratuit && <><CheckCircle className="w-4 h-4" /> Votre annulation est gratuite</>}
                      {fraisInfo.frais && <><CreditCard className="w-4 h-4" /> Frais d'annulation : 250 FCFA</>}
                      {fraisInfo.impossible && <><XCircle className="w-4 h-4" /> {fraisInfo.raison || "Annulation impossible"}</>}
                    </div>
                  )}

                  {/* Infos course */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span>{course.type_course === "expedier" ? "Expédition" : "Réception"}</span>
                    </div>
                    {course.livreur_nom && (
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-muted-foreground" />
                        <span>{course.livreur_nom}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline">{course.statut}</Badge>
                    </div>
                  </div>
                </>
              )}

              {/* ── Étape MOTIF ── */}
              {step === "motif" && (
                <>
                  {fraisInfo?.frais && (
                    <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 flex-shrink-0" />
                      <span>Des frais de <strong>250 FCFA</strong> seront ajoutés à votre compte (statut : Impayé).</span>
                    </div>
                  )}
                  {fraisInfo?.gratuit && (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
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
                            motif === m.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"
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

          {/* Étape INFO → bouton Continuer (si pas impossible) */}
          {step === "info" && fraisInfo && !fraisInfo.impossible && (
            <button
              type="button"
              onClick={() => setStep("motif")}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white h-9 px-4 py-2 transition-colors"
            >
              Continuer
            </button>
          )}

          {/* Étape MOTIF → bouton Confirmer */}
          {step === "motif" && (
            <button
              type="button"
              onClick={handleConfirmer}
              disabled={loading || !motif}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white h-9 px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Annulation...
                </span>
              ) : "Confirmer l'annulation"}
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}