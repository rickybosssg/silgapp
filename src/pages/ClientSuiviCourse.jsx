import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Package, CheckCircle2, Clock, User, Star, XCircle, ArrowLeft, Share2, Download } from "lucide-react";

// Deep link WhatsApp natif avec fallback navigateur
function openWhatsApp(phone, message = "") {
  const num = phone?.replace(/\D/g, "") || "";
  const encoded = message ? encodeURIComponent(message) : "";
  const txt = encoded ? `&text=${encoded}` : "";
  const deepLink = `whatsapp://send?phone=${num}${txt}`;
  const fallback = `https://wa.me/${num}${encoded ? `?text=${encoded}` : ""}`;
  window.location.href = deepLink;
  setTimeout(() => { window.open(fallback, "_blank"); }, 1500);
}
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurRatingDialog from "@/components/client/LivreurRatingDialog";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";
import AnnulerCourseDialog from "@/components/client/AnnulerCourseDialog";

const APK_URL = "/telecharger-app";

function buildWhatsAppMessage(course, clientProfil) {
  const trackingUrl = `${window.location.origin}/suivi-public/${course.tracking_token || course.id}`;
  const expediteur = course.expediteur_nom || clientProfil?.nom || "Quelqu'un";
  // Retourne le texte brut — openWhatsApp se charge de l'encodage
  return `Bonjour 👋\n${expediteur} vous envoie un colis via SILGAPP.\n\nSuivez la livraison en direct ici :\n${trackingUrl}\n\nSi vous n'avez pas encore l'application, téléchargez SILGAPP ici :\n${APK_URL}`;
}

export default function ClientSuiviCourse() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [showRating, setShowRating] = useState(false);
  const [showAnnulerDialog, setShowAnnulerDialog] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  // Récupérer l'ID user pour filtrer correctement
  useEffect(() => {
    base44.auth.me().then(u => setUserId(u?.id)).catch(() => null);
  }, []);

  // Charger uniquement les courses créées par l'utilisateur connecté
  const { data: courses = [], refetch } = useQuery({
    queryKey: ["mes-courses-externes", userId],
    queryFn: () => base44.entities.CourseExterne.filter(
      { created_by_id: userId },
      "-created_date",
      20
    ),
    enabled: !!userId,
    initialData: [],
    refetchInterval: 5000,
  });

  // Toutes les courses actives
  const coursesActives = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  // Course sélectionnée : celle choisie ou la première active ou la dernière
  const maCourse = (selectedCourseId ? courses.find(c => c.id === selectedCourseId) : null)
    || coursesActives[0] || courses[0] || null;

  const handleRated = () => {
    setShowRating(false);
    refetch();
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </Card>
      </div>
    );
  }

  if (!maCourse) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Aucune course en cours</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Vous n'avez pas de course active pour le moment
          </p>
          <Button onClick={() => navigate("/")} variant="outline" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au dashboard
          </Button>
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

        {/* Bouton retour */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour au dashboard
        </Button>

        {/* Sélecteur de course si plusieurs actives */}
        {coursesActives.length > 1 && (
          <Card className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {coursesActives.length} courses actives — sélectionnez
            </p>
            <div className="space-y-2">
              {coursesActives.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    maCourse?.id === c.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground truncate max-w-[200px]">
                      {c.adresse_depart} → {c.adresse_arrivee}
                    </span>
                    <Badge className={`text-xs ml-2 flex-shrink-0 ${
                      c.statut === "recherche_livreur" ? "bg-orange-100 text-orange-700" :
                      c.statut === "livreur_en_route" ? "bg-blue-100 text-blue-700" :
                      "bg-purple-100 text-purple-700"
                    }`}>
                      {c.statut === "recherche_livreur" ? "🔍" : c.statut === "livreur_en_route" ? "🚀" : "📦"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

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
              className={`absolute h-full transition-all duration-500 ${
                maCourse.statut === "livree" ? "bg-green-500 w-full" :
                maCourse.statut === "en_livraison" ? "bg-primary w-full" :
                maCourse.statut === "livreur_en_route" || maCourse.statut === "colis_recupere" ? "bg-primary w-2/3" :
                maCourse.statut === "annulee" ? "bg-red-400 w-0" :
                "bg-primary w-1/3"
              }`}
            />
          </div>

          {/* Bouton Annuler */}
          {!["livree", "annulee"].includes(maCourse.statut) && (
            <Button
              variant="outline"
              className="w-full mt-4 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setShowAnnulerDialog(true)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Annuler la course
            </Button>
          )}
        </Card>

        {/* Infos livreur */}
        {maCourse.livreur_id && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              {maCourse.livreur_photo_url ? (
                <img src={maCourse.livreur_photo_url} alt={maCourse.livreur_nom} className="w-14 h-14 rounded-full object-cover border-2 border-primary" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-7 h-7 text-primary" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-bold text-foreground">{maCourse.livreur_nom}</p>
                <p className="text-xs text-muted-foreground">{maCourse.livreur_telephone}</p>
                <div className="flex items-center gap-2 mt-2">
                  <a href={`tel:${maCourse.livreur_telephone}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Phone className="w-3 h-3" />
                    Appeler
                  </a>
                  <button
                    onClick={() => openWhatsApp(maCourse.livreur_telephone)}
                    className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                  >
                    WhatsApp
                  </button>
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

        {/* QR Codes — affichage automatique dès que livreur assigné */}
        {maCourse.livreur_id && !["livree", "annulee"].includes(maCourse.statut) && (
          <div className="space-y-4">
            {/* Pickup QR — visible jusqu'à récupération confirmée */}
            {["livreur_en_route", "recherche_livreur"].includes(maCourse.statut) && (
              <QRCodeDisplay course={maCourse} type="pickup" />
            )}
            {/* Delivery QR — visible dès colis récupéré */}
            {["colis_recupere", "en_livraison"].includes(maCourse.statut) && (
              <QRCodeDisplay course={maCourse} type="delivery" />
            )}
          </div>
        )}

        {/* Bouton partage WhatsApp destinataire — si expéditeur */}
        {maCourse.type_course === "expedier" && maCourse.destinataire_telephone && !["livree", "annulee"].includes(maCourse.statut) && (
          <Card className="p-4 bg-green-50 border-green-200">
            <p className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Informer le destinataire
            </p>
            <p className="text-xs text-green-700 mb-3">
              Envoyez le lien de suivi à {maCourse.destinataire_nom || "votre destinataire"} pour qu'il puisse suivre la livraison.
            </p>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 gap-2"
              onClick={() => openWhatsApp(maCourse.destinataire_telephone, buildWhatsAppMessage(maCourse, null))}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Envoyer le lien WhatsApp au destinataire
            </Button>
          </Card>
        )}

        {/* Détails */}
        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type de colis</span>
              <span className="font-medium">{maCourse.type_colis}</span>
            </div>
            {maCourse.prix_estimate ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix estimé</span>
                <span className="font-medium">{maCourse.prix_estimate.toLocaleString()} FCFA</span>
              </div>
            ) : null}
            {maCourse.heure_acceptation && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acceptée à</span>
                <span className="font-medium">{format(new Date(maCourse.heure_acceptation), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_livraison && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Livré à</span>
                <span className="font-medium text-green-600">{format(new Date(maCourse.heure_livraison), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.prix_final ? (
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground font-semibold">Prix final</span>
                <span className="font-bold text-lg text-primary">{maCourse.prix_final.toLocaleString()} FCFA</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Course terminée */}
        {maCourse.statut === "livree" && maCourse.prix_final && (
          <>
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-green-900">Course terminée</h3>
              </div>
              <div className="space-y-1 text-sm text-green-800">
                {maCourse.distance_reelle_km != null && (
                  <p>Distance parcourue : {Number(maCourse.distance_reelle_km || 0).toFixed(1)} km</p>
                )}
                <p>Montant total : {maCourse.prix_final.toLocaleString()} FCFA</p>
                {maCourse.commission_silga && (
                  <p className="text-xs text-green-600">
                    Commission Silga (30%) : {maCourse.commission_silga.toLocaleString()} FCFA
                  </p>
                )}
              </div>
            </Card>

            {!maCourse.note_livreur && (
              <Card className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <Star className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-yellow-900">Comment s'est passée la livraison ?</p>
                    <p className="text-xs text-yellow-700 mt-1">Évaluez {maCourse.livreur_nom || "le livreur"}</p>
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
                        <Star key={i} className={`w-4 h-4 ${i < maCourse.note_livreur ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300"}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {showRating && (
          <LivreurRatingDialog
            course={maCourse}
            onClose={() => setShowRating(false)}
            onRated={handleRated}
          />
        )}

        {/* Bandeau téléchargement — après livraison pour le destinataire */}
        {maCourse.statut === "livree" && maCourse.type_course === "recevoir" && (
          <Card className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border-red-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">Suivez vos prochaines livraisons</p>
                <p className="text-xs text-gray-500">Téléchargez SILGAPP pour commander et suivre en direct</p>
              </div>
            </div>
            <a href={APK_URL} className="block mt-3">
              <Button className="w-full bg-primary hover:bg-primary/90 font-semibold text-sm rounded-xl">
                <Download className="w-4 h-4 mr-2" />
                Télécharger SILGAPP
              </Button>
            </a>
          </Card>
        )}

        <AnnulerCourseDialog
          course={maCourse}
          open={showAnnulerDialog}
          onClose={() => setShowAnnulerDialog(false)}
          onSuccess={() => navigate("/client")}
        />
      </div>
    </div>
  );
}