import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Package, CheckCircle2, Clock, User, Star, XCircle, ArrowLeft, Share2, Download, Ruler, Banknote } from "lucide-react";

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
import LivreurAssigneCard from "@/components/client/LivreurAssigneCard";

// Ouvre WhatsApp via wa.me (fonctionne sur Android/iOS, ouvre l'app si installée)
function openWhatsApp(phone, message = "") {
  let num = phone?.replace(/\D/g, "") || "";
  if (num.startsWith("0") && num.length <= 9) num = "226" + num.slice(1);
  if (num.length === 8) num = "226" + num;
  const encoded = message ? encodeURIComponent(message) : "";
  const url = `https://wa.me/${num}${encoded ? `?text=${encoded}` : ""}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurRatingDialog from "@/components/client/LivreurRatingDialog";
import DestinataireReactionButton from "@/components/client/DestinataireReactionButton";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";
import AnnulerCourseDialog from "@/components/client/AnnulerCourseDialog";
import ETADisplay from "@/components/client/ETADisplay";

const APK_URL = "/telecharger-app";

function buildWhatsAppMessage(course) {
  const trackingUrl = course.tracking_token
    ? `${window.location.origin}/suivi-public/${course.tracking_token}`
    : `${window.location.origin}/suivi-public/${course.id}`;
  const appUrl = `${window.location.origin}/telecharger-app`;
  return `Bonjour 👋\nUn colis SILGAPP est en route pour vous.\n\n📍 Suivre la livraison :\n${trackingUrl}\n\n📲 Télécharger SILGAPP :\n${appUrl}\n\nMerci.`;
}

export default function ClientSuiviCourse() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [showRating, setShowRating] = useState(false);
  const [showAnnulerDialog, setShowAnnulerDialog] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setUserEmail(u?.email)).catch(() => null);
  }, []);

  // Récupérer l'ID user pour filtrer correctement
  useEffect(() => {
    base44.auth.me().then(u => setUserId(u?.id)).catch(() => null);
  }, []);

  const [clientProfilId, setClientProfilId] = useState(null);

  useEffect(() => {
    if (!userId) return;
    base44.auth.me().then(async (user) => {
      try {
        const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
        if (clients?.length > 0) setClientProfilId(clients[0].id);
      } catch (_) {}
    }).catch(() => null);
  }, [userId]);

  // Charger les courses créées par l'utilisateur + celles où il est destinataire
  const { data: courses = [], refetch } = useQuery({
    queryKey: ["mes-courses-externes", userId, clientProfilId],
    queryFn: async () => {
      const byCreator = await base44.entities.CourseExterne.filter(
        { created_by_id: userId }, "-created_date", 20
      );
      let byDest = [];
      if (clientProfilId) {
        byDest = await base44.entities.CourseExterne.filter(
          { destinataire_client_id: clientProfilId }, "-created_date", 20
        );
      }
      // Fusionner sans doublons
      const map = new Map();
      [...(byCreator || []), ...(byDest || [])].forEach(c => map.set(c.id, c));
      const courses = [...map.values()].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

      // Enrichir avec note_moyenne + nombre_avis + GPS temps réel du livreur
      const livreurIds = [...new Set(courses.filter(c => c.livreur_id).map(c => c.livreur_id))];
      if (livreurIds.length > 0) {
        const livreursData = await Promise.all(
          livreurIds.map(id => base44.entities.Livreur.filter({ id }).then(r => r?.[0]).catch(() => null))
        );
        const livreurMap = {};
        livreursData.forEach(l => { if (l) livreurMap[l.id] = l; });
        return courses.map(c => {
          if (!c.livreur_id || !livreurMap[c.livreur_id]) return c;
          const l = livreurMap[c.livreur_id];
          return {
            ...c,
            // Bug #9 : priorité à la photo de l'entité Livreur (source de vérité admin)
            livreur_photo_url: l.photo_url || c.livreur_photo_url || null,
            livreur_note_moyenne: l.note_moyenne || 0,
            livreur_nombre_avis: l.nombre_avis || 0,
            livreur_vehicule: l.vehicule || l.type_vehicule || c.livreur_vehicule || null,
            _livreur: l,
          };
        });
      }
      return courses;
    },
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
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div
          className="text-[22vw] leading-none select-none"
          style={{ animation: "pulse 2s ease-in-out infinite" }}
        >
          😊
        </div>
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}`}</style>
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

        {/* Bouton retour — sticky, gros, accessible au pouce */}
        <div className="sticky top-0 z-20 pt-2 pb-1">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 shadow-md rounded-2xl px-5 h-14 text-base font-bold text-gray-800 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-primary flex-shrink-0" />
            <span>← Retour au dashboard</span>
          </button>
        </div>

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

        {/* Infos livreur — Card style Uber dès acceptation */}
        {maCourse.livreur_id && (
          <LivreurAssigneCard course={maCourse} />
        )}

        {/* ETA temps réel — affiché si livreur a position GPS et course active */}
        {["livreur_en_route", "colis_recupere", "en_livraison"].includes(maCourse.statut) && maCourse.livreur_id && (
          (() => {
            // Position du livreur (depuis les champs Livreur mis à jour en temps réel)
            const livreurLat = maCourse._livreur?.latitude;
            const livreurLng = maCourse._livreur?.longitude;
            const isVersRecup = maCourse.statut === "livreur_en_route";
            const targetLat = isVersRecup ? maCourse.gps_depart_lat : maCourse.gps_arrivee_lat;
            const targetLng = isVersRecup ? maCourse.gps_depart_lng : maCourse.gps_arrivee_lng;
            return (
              <ETADisplay
                livreurLat={livreurLat}
                livreurLng={livreurLng}
                targetLat={targetLat}
                targetLng={targetLng}
                livreurNom={maCourse.livreur_nom}
                phase={isVersRecup ? "vers_recuperation" : "vers_livraison"}
                statut={maCourse.statut}
              />
            );
          })()
        )}

        {/* Trajet + Estimation */}
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
              {/* Bug #1 — si destination_inconnue et livraison faite, afficher adresse réelle ou coordonnées */}
              <p className="text-sm font-bold text-foreground">
                {maCourse.statut === "livree" && maCourse.destination_inconnue
                  ? maCourse.adresse_arrivee && maCourse.adresse_arrivee !== "Destination à définir"
                    ? maCourse.adresse_arrivee
                    : maCourse.latitude_livraison
                      ? `📍 GPS : ${Number(maCourse.latitude_livraison).toFixed(4)}, ${Number(maCourse.longitude_livraison).toFixed(4)}`
                      : maCourse.latitude_arrivee_livraison
                        ? `📍 GPS : ${Number(maCourse.latitude_arrivee_livraison).toFixed(4)}, ${Number(maCourse.longitude_arrivee_livraison).toFixed(4)}`
                        : "Destination enregistrée à la livraison"
                  : maCourse.adresse_arrivee || "—"}
              </p>
            </div>
          </div>

          {/* Estimation distance / temps / prix */}
          {(() => {
            const distEst = maCourse.distance_reelle_km
              || haversineKm(maCourse.gps_depart_lat, maCourse.gps_depart_lng, maCourse.gps_arrivee_lat, maCourse.gps_arrivee_lng);
            const prix = maCourse.prix_final || (distEst ? Math.round(distEst * 100) : maCourse.prix_estimate || null);
            const temps = distEst ? Math.round((distEst / 25) * 60) : null;
            const isFinal = !!maCourse.prix_final;
            if (!distEst && !prix) return null;
            return (
              <div className={`grid grid-cols-3 gap-2 pt-2 border-t border-dashed ${isFinal ? "border-green-200" : "border-gray-200"}`}>
                {distEst && (
                  <div className={`rounded-xl p-2.5 text-center ${isFinal ? "bg-blue-50" : "bg-gray-50"}`}>
                    <Ruler className="w-3.5 h-3.5 mx-auto mb-1 text-blue-500" />
                    <p className="text-xs font-black text-gray-800">{Number(distEst).toFixed(1)} km</p>
                    <p className="text-[9px] text-gray-400">{isFinal ? "Réelle" : "Estimée"}</p>
                  </div>
                )}
                {temps && (
                  <div className={`rounded-xl p-2.5 text-center ${isFinal ? "bg-purple-50" : "bg-gray-50"}`}>
                    <Clock className="w-3.5 h-3.5 mx-auto mb-1 text-purple-500" />
                    <p className="text-xs font-black text-gray-800">{temps} min</p>
                    <p className="text-[9px] text-gray-400">{isFinal ? "Réel" : "Estimé"}</p>
                  </div>
                )}
                {prix && (
                  <div className={`rounded-xl p-2.5 text-center ${isFinal ? "bg-green-50" : "bg-gray-50"}`}>
                    <Banknote className="w-3.5 h-3.5 mx-auto mb-1 text-green-600" />
                    <p className="text-xs font-black text-gray-800">{prix.toLocaleString()} F</p>
                    <p className="text-[9px] text-gray-400">{isFinal ? "À payer" : "~Estimé"}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </Card>

        {/* QR Codes — dès que les codes existent */}
        {!["livree", "annulee"].includes(maCourse.statut) && (
          <div className="space-y-4">
            {/* Pickup QR — visible avant récupération */}
            {maCourse.pickup_qr_token && !maCourse.pickup_confirmed_at && (
              <QRCodeDisplay course={maCourse} type="pickup" />
            )}
            {/* Delivery QR — visible après récupération ou dès que le code existe */}
            {maCourse.delivery_qr_token && (maCourse.pickup_confirmed_at || ["colis_recupere", "en_livraison"].includes(maCourse.statut)) && !maCourse.delivery_confirmed_at && (
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
              onClick={() => openWhatsApp(maCourse.destinataire_telephone, buildWhatsAppMessage(maCourse))}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Envoyer le lien WhatsApp au destinataire
            </Button>
          </Card>
        )}

        {/* Timeline / Détails — Bug #4 : heure récupération manquante */}
        <Card className="p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Historique</p>
          <div className="space-y-2.5 text-sm">
            {maCourse.type_colis && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type de colis</span>
                <span className="font-medium capitalize">{maCourse.type_colis?.replace(/_/g, " ")}</span>
              </div>
            )}
            {maCourse.heure_acceptation && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-green-500">✅</span> Acceptée à</span>
                <span className="font-semibold">{format(new Date(maCourse.heure_acceptation), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_recuperation && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-blue-500">📦</span> Récupérée à</span>
                <span className="font-semibold">{format(new Date(maCourse.heure_recuperation), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_livraison && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-green-600">🏁</span> Livrée à</span>
                <span className="font-semibold text-green-600">{format(new Date(maCourse.heure_livraison), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.prix_estimate && !maCourse.prix_final && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix estimé</span>
                <span className="font-medium">{maCourse.prix_estimate.toLocaleString()} FCFA</span>
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
        {maCourse.statut === "livree" && (() => {
          // Déterminer le rôle de l'utilisateur dans cette course
          const isExpediteur = maCourse.type_course === "expedier"
            || (maCourse.expediteur_client_id && maCourse.created_by_id === userId)
            || (!maCourse.destinataire_client_id);

          const isDestinataire = !isExpediteur && (
            maCourse.destinataire_client_id === clientProfilId
            || maCourse.created_by_id !== userId
          );

          return (
            <>
              {/* Résumé final livraison — bugs #3 #7 #8 */}
              <Card className="overflow-hidden border-2 border-green-300 shadow-lg">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <p className="text-white font-bold">Livraison terminée avec succès !</p>
                </div>
                <div className="p-4 bg-green-50">
                  {/* 3 métriques toujours visibles */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                      <Ruler className="w-4 h-4 mx-auto mb-1 text-blue-500" />
                      <p className="text-sm font-black text-gray-900">
                        {maCourse.distance_reelle_km != null
                          ? `${Number(maCourse.distance_reelle_km).toFixed(1)} km`
                          : "—"}
                      </p>
                      <p className="text-[9px] text-gray-400 font-semibold uppercase">Distance</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                      <Clock className="w-4 h-4 mx-auto mb-1 text-purple-500" />
                      <p className="text-sm font-black text-gray-900">
                        {maCourse.heure_livraison && maCourse.heure_acceptation
                          ? `${Math.round((new Date(maCourse.heure_livraison) - new Date(maCourse.heure_acceptation)) / 60000)} min`
                          : "—"}
                      </p>
                      <p className="text-[9px] text-gray-400 font-semibold uppercase">Durée</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                      <Banknote className="w-4 h-4 mx-auto mb-1 text-green-600" />
                      <p className="text-sm font-black text-green-700">
                        {maCourse.prix_final ? `${maCourse.prix_final.toLocaleString()} F` : "—"}
                      </p>
                      <p className="text-[9px] text-gray-400 font-semibold uppercase">Prix final</p>
                    </div>
                  </div>
                  <p className="text-center text-xs text-green-700 font-medium">
                    Merci d'avoir utilisé SILGAPP 🙏
                  </p>
                </div>
              </Card>

              {/* ⭐ Note officielle expéditeur */}
              {isExpediteur && !maCourse.note_livreur && (
                <Card className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-2">⭐ Note officielle · Expéditeur</p>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <Star className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-900">Comment s'est passée votre livraison ?</p>
                      <p className="text-xs text-yellow-700 mt-1">Votre note impacte la réputation de {maCourse.livreur_nom || "le livreur"}</p>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
                    onClick={() => setShowRating(true)}
                  >
                    <Star className="w-4 h-4 mr-2 fill-white" />
                    Donner ma note officielle
                  </Button>
                </Card>
              )}

              {isExpediteur && maCourse.note_livreur && (
                <Card className="p-4 border-l-4 border-l-green-500 bg-green-50">
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2">⭐ Note officielle · Expéditeur</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < maCourse.note_livreur ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300"}`} />
                      ))}
                    </div>
                    <p className="text-sm font-bold text-green-900">{maCourse.note_livreur}/5 — Merci !</p>
                  </div>
                </Card>
              )}

              {/* 👍/👎 Feedback destinataire — ne compte pas dans la note */}
              {isDestinataire && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👍/👎 Retour destinataire · Ne compte pas dans la note</p>
                  <DestinataireReactionButton course={maCourse} onDone={refetch} />
                </div>
              )}
            </>
          );
        })()}

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