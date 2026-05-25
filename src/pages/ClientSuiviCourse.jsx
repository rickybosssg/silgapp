import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Navigation, Package, CheckCircle2, Clock, User, Star, QrCode } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurRatingDialog from "@/components/client/LivreurRatingDialog";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";

export default function ClientSuiviCourse() {
  const [maCourse, setMaCourse] = useState(null);
  const [showRating, setShowRating] = useState(false);

  // Récupérer la course en cours (dernière course créée)
  const { data: courses = [] } = useQuery({
    queryKey: ["mes-courses-externes"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 1),
    initialData: [],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (courses && courses.length > 0) {
      setMaCourse(courses[0]);
    }
  }, [courses]);

  const handleRated = () => {
    setShowRating(false);
    // Rafraîchir les données
    window.location.reload();
  };

  if (!maCourse) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Aucune course en cours</h2>
          <p className="text-sm text-muted-foreground">
            Vous n'avez pas de course active pour le moment
          </p>
        </Card>
      </div>
    );
  }

  const statutLabels = {
    nouvelle: "Nouvelle course",
    recherche_livreur: "Recherche de livreur...",
    livreur_en_route: "Livreur en route vers récupération",
    colis_recupere: "Colis récupéré",
    en_livraison: "Livreur en route vers livraison",
    livree: "Course livrée",
    annulee: "Course annulée",
  };

  const statutColors = {
    nouvelle: "bg-gray-100 text-gray-700",
    recherche_livreur: "bg-orange-100 text-orange-700",
    livreur_en_route: "bg-blue-100 text-blue-700",
    colis_recupere: "bg-purple-100 text-purple-700",
    en_livraison: "bg-blue-100 text-blue-700",
    livree: "bg-green-100 text-green-700",
    annulee: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Statut course */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-foreground">Suivi de course</h1>
            <Badge className={statutColors[maCourse.statut]}>
              {statutLabels[maCourse.statut]}
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Créée</span>
            <span>Récupération</span>
            <span>Livraison</span>
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute h-full bg-primary transition-all duration-500 ${
                maCourse.statut === "nouvelle" || maCourse.statut === "recherche_livreur"
                  ? "w-1/3"
                  : maCourse.statut === "livreur_en_route" || maCourse.statut === "colis_recupere"
                  ? "w-2/3"
                  : maCourse.statut === "en_livraison"
                  ? "w-full"
                  : maCourse.statut === "livree"
                  ? "w-full bg-green-500"
                  : "w-0"
              }`}
            />
          </div>
        </Card>

        {/* Infos livreur */}
        {maCourse.livreur_id && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              {maCourse.livreur_photo_url ? (
                <img
                  src={maCourse.livreur_photo_url}
                  alt={maCourse.livreur_nom}
                  className="w-14 h-14 rounded-full object-cover border-2 border-primary"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-7 h-7 text-primary" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-bold text-foreground">{maCourse.livreur_nom}</p>
                <p className="text-xs text-muted-foreground">
                  {maCourse.livreur_telephone}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <a
                    href={`tel:${maCourse.livreur_telephone}`}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Phone className="w-3 h-3" />
                    Appeler
                  </a>
                  <a
                    href={`https://wa.me/${maCourse.livreur_telephone?.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Trajet */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Récupération</p>
              <p className="text-sm font-bold text-foreground">{maCourse.adresse_depart}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Livraison</p>
              <p className="text-sm font-bold text-foreground">{maCourse.adresse_arrivee}</p>
            </div>
          </div>
        </Card>

        {/* QR Codes pour validation */}
        {maCourse.livreur_id && ["livreur_en_route", "colis_recupere", "en_livraison"].includes(maCourse.statut) && (
          <div className="space-y-4">
            {/* QR Code de récupération - visible si colis pas encore récupéré */}
            {maCourse.statut === "livreur_en_route" && (
              <QRCodeDisplay course={maCourse} type="pickup" />
            )}

            {/* QR Code de livraison - visible si colis récupéré mais pas livré */}
            {["colis_recupere", "en_livraison"].includes(maCourse.statut) && (
              <QRCodeDisplay course={maCourse} type="delivery" />
            )}
          </div>
        )}

        {/* Détails course */}
        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type de colis</span>
              <span className="font-medium">{maCourse.type_colis}</span>
            </div>
            {maCourse.prix_estimate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix estimé</span>
                <span className="font-medium">{maCourse.prix_estimate.toLocaleString()} FCFA</span>
              </div>
            )}
            {maCourse.heure_acceptation && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acceptée à</span>
                <span className="font-medium">
                  {format(new Date(maCourse.heure_acceptation), "HH:mm", { locale: fr })}
                </span>
              </div>
            )}
            {maCourse.heure_livraison && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Livré à</span>
                <span className="font-medium text-green-600">
                  {format(new Date(maCourse.heure_livraison), "HH:mm", { locale: fr })}
                </span>
              </div>
            )}
            {maCourse.prix_final && (
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground font-semibold">Prix final</span>
                <span className="font-bold text-lg text-primary">
                  {maCourse.prix_final.toLocaleString()} FCFA
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Info tarification */}
        {maCourse.statut === "livree" && maCourse.prix_final && (
          <>
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-green-900">Course terminée</h3>
              </div>
              <div className="space-y-1 text-sm text-green-800">
                {maCourse.distance_reelle_km && (
                  <p>Distance parcourue : {maCourse.distance_reelle_km.toFixed(1)} km</p>
                )}
                <p>Montant total : {maCourse.prix_final.toLocaleString()} FCFA</p>
                {maCourse.commission_silga && (
                  <p className="text-xs text-green-600">
                    Commission Silga (30%) : {maCourse.commission_silga.toLocaleString()} FCFA
                  </p>
                )}
              </div>
            </Card>

            {/* Bouton de notation */}
            {!maCourse.note_livreur && (
              <Card className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <Star className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-yellow-900">Comment s'est passée la livraison ?</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Aidez-nous à améliorer nos services en évaluant {maCourse.livreur_nom}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
                  onClick={() => setShowRating(true)}
                >
                  <Star className="w-4 h-4 mr-2 fill-white" />
                  Évaluer le livreur
                </Button>
              </Card>
            )}

            {/* Déjà noté */}
            {maCourse.note_livreur && (
              <Card className="p-4 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-emerald-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-green-900">Merci pour votre évaluation !</p>
                    <div className="flex items-center gap-1 mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < maCourse.note_livreur
                              ? "fill-yellow-400 text-yellow-400"
                              : "fill-gray-200 text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    {maCourse.commentaire_livreur && (
                      <p className="text-xs text-green-700 mt-2 italic">
                        "{maCourse.commentaire_livreur}"
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Dialog de notation */}
        {showRating && (
          <LivreurRatingDialog
            course={maCourse}
            onClose={() => setShowRating(false)}
            onRated={handleRated}
          />
        )}
      </div>
    </div>
  );
}