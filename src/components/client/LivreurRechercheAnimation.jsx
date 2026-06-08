import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, Package, User, CheckCircle2, Loader2, Navigation, XCircle } from "lucide-react";
import AnnulerCourseDialog from "./AnnulerCourseDialog";
import PrixManuelInlineCard from "./PrixManuelInlineCard";

const typeColisLabels = {
  petit_colis: "Petit colis",
  moyen_colis: "Moyen colis",
  gros_colis: "Gros colis",
  document: "Document",
  nourriture: "Nourriture",
  autre: "Autre"
};

const messages = [
  "Recherche des livreurs disponibles...",
  "Vérification des positions GPS...",
  "Analyse des distances...",
  "Contact des livreurs les plus proches...",
  "En attente de confirmation...",
];

export default function LivreurRechercheAnimation({ course }) {
  const navigate = useNavigate();
  const [showAnnulerDialog, setShowAnnulerDialog] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(0);

  // Rotation des messages
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Polling sur la course — redirection automatique dès qu'un livreur accepte
  const { data: courseData } = useQuery({
    queryKey: ["suivi-course-recherche", course.id],
    queryFn: () => base44.entities.CourseExterne.filter({ id: course.id }),
    select: (data) => Array.isArray(data) ? data[0] : null,
    enabled: !!course.id,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!courseData) return;
    // Rediriger si un livreur a accepté
    if (courseData.statut === "livreur_en_route" || courseData.dispatch_status === "accepte") {
      navigate("/client/suivi");
    }
    // Rediriger aussi si annulée
    if (courseData.statut === "annulee") {
      navigate("/client");
    }
  }, [courseData, navigate]);

  const liveCourse = courseData || course;
  const hasPrixManuel =
    liveCourse?.manual_price_status === "pending_client_validation" &&
    liveCourse?.manual_price > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 p-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Prix manuel proposé par le livreur — prioritaire */}
        {hasPrixManuel ? (
          <PrixManuelInlineCard
            course={liveCourse}
            devise={liveCourse.devise || "FCFA"}
            onAccepted={() => navigate("/client/suivi")}
            onRefused={() => { /* le polling reprendra automatiquement */ }}
            onAnnuler={() => setShowAnnulerDialog(true)}
          />
        ) : (
        /* Header animé recherche */
        <Card className="p-6 bg-gradient-to-r from-primary to-red-600 text-white border-0 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Truck className="w-6 h-6" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Recherche en cours</h1>
                <p className="text-xs text-white/80">Nous trouvons le meilleur livreur</p>
              </div>
            </div>
            <Loader2 className="w-8 h-8 animate-spin opacity-80" />
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <p className="text-sm font-medium animate-pulse">{messages[currentMessage]}</p>
          </div>
        </Card>
        )}

        {/* Résumé de la course */}
        <Card className="p-5 bg-gradient-to-br from-white to-gray-50">
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Votre course
          </h2>
          <div className="space-y-3">
            {[
              { icon: <Truck className="w-4 h-4 text-primary" />, bg: "bg-primary/10", label: "Type", value: course.type_course === "expedier" ? "📦 Expédition" : "📥 Réception" },
              { icon: <MapPin className="w-4 h-4 text-red-600" />, bg: "bg-red-100", label: "Récupération", value: course.adresse_depart },
              { icon: <MapPin className="w-4 h-4 text-green-600" />, bg: "bg-green-100", label: "Livraison", value: course.adresse_arrivee },
              { icon: <User className="w-4 h-4 text-blue-600" />, bg: "bg-blue-100", label: "Contact", value: course.type_course === "expedier" ? `${course.destinataire_nom} - ${course.destinataire_telephone}` : `${course.expediteur_nom} - ${course.expediteur_telephone}` },
              { icon: <Package className="w-4 h-4 text-purple-600" />, bg: "bg-purple-100", label: "Colis", value: typeColisLabels[course.type_colis] || course.type_colis },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border">
                <div className={`w-8 h-8 rounded-lg ${row.bg} flex items-center justify-center flex-shrink-0`}>{row.icon}</div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">{row.label}</p>
                  <p className="font-medium text-foreground text-sm">{row.value}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg border border-primary/20">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Navigation className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Tarif</p>
                <p className="font-bold text-primary text-sm">Calculé à la livraison selon le tarif local</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Statut */}
        <div className="space-y-4">
          <Card className="p-4 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-40" />
              </div>
              <div>
                <p className="font-bold text-green-900">Course créée avec succès</p>
                <p className="text-xs text-green-700">Vous serez redirigé automatiquement dès qu'un livreur accepte</p>
              </div>
            </div>
          </Card>

          <Button
            variant="outline"
            className="w-full border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setShowAnnulerDialog(true)}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Annuler la course
          </Button>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">⏱️ Temps d'attente moyen : 2-5 minutes</p>
        </div>

        <AnnulerCourseDialog
          course={course}
          open={showAnnulerDialog}
          onClose={() => setShowAnnulerDialog(false)}
          onSuccess={() => navigate("/client")}
        />
      </div>
    </div>
  );
}