import React, { useState, useEffect } from "react";
import { MapPin, Phone, Navigation, Package, Check, X, AlertTriangle, ChevronRight, QrCode, Clock, Ruler } from "lucide-react";
import MultiColisProgressBadge from "@/components/multi-colis/MultiColisProgressBadge";
import MultiColisLivreurView from "@/components/multi-colis/MultiColisLivreurView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import LivraisonResume from "./LivraisonResume";
import QRScannerModal from "./QRScannerModal";
import NavigationGPS from "./NavigationGPS";

// Haversine
function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Badge ETA affiché en haut de la carte, calculé depuis la position GPS réelle du livreur
function ETABadge({ course, colisRecupere }) {
  const [livreurPos, setLivreurPos] = useState(null);

  // ✅ CORRECTION : watchPosition créé UNE SEULE FOIS au mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLivreurPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    console.log(`[ETABadge] Watch GPS démarré pour course ${course.id}`);
    return () => {
      navigator.geolocation.clearWatch(id);
      console.log(`[ETABadge] Watch GPS nettoyé pour course ${course.id}`);
    };
  }, [course.id]); // ✅ Dépend de course.id uniquement

  // Cible : vers la récupération si colis pas encore pris, sinon vers la livraison
  // Si destination inconnue → pas de cible GPS pour la livraison
  const targetLat = colisRecupere
    ? (course.destination_inconnue ? null : (course.gps_arrivee_lat || course.latitude_arrivee_livraison))
    : course.gps_depart_lat;
  const targetLng = colisRecupere
    ? (course.destination_inconnue ? null : (course.gps_arrivee_lng || course.longitude_arrivee_livraison))
    : course.gps_depart_lng;

  if (!livreurPos || !targetLat || !targetLng) return null;

  const dist = haversine(livreurPos.lat, livreurPos.lng, targetLat, targetLng);
  if (dist === null || dist < 0) return null;

  const etaMin = dist < 0.1 ? 1 : Math.round((dist / 25) * 60);
  const distLabel = dist < 0.1 ? `${Math.round(dist * 1000)} m` : dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;

  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-bold text-blue-900">~ {etaMin} min</span>
      </div>
      <div className="w-px h-4 bg-blue-200" />
      <div className="flex items-center gap-1.5">
        <Ruler className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-blue-700">{distLabel}</span>
      </div>
      <span className="ml-auto text-xs text-blue-500">{colisRecupere ? "→ Livraison" : "→ Récupération"}</span>
    </div>
  );
}

const STEPS = [
  { key: "acceptee", label: "Accepté", icon: "✅" },
  { key: "colis_recupere", label: "Récupérer", icon: "📦" },
  { key: "livree", label: "Livré", icon: "🎉" },
];

function ProgressBar({ statut }) {
  const idx = STEPS.findIndex(s => s.key === statut);
  const current = idx === -1 ? 0 : idx;

  return (
    <div className="flex items-center gap-1 py-1">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className={cn(
            "flex flex-col items-center gap-1 flex-shrink-0",
          )}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
              i <= current ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-gray-100 text-gray-400"
            )}>
              {i <= current ? step.icon : <span className="text-xs">{i + 1}</span>}
            </div>
            <p className={cn("text-[9px] font-semibold", i <= current ? "text-primary" : "text-gray-300")}>
              {step.label}
            </p>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 rounded mb-4 transition-all",
              i < current ? "bg-primary" : "bg-gray-100"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function CourseActiveCard({ course, onColisRecupere, onColisLivre, onClientAnnule, onMettrePause, isPending, isExterne = false, livreurLat, livreurLng }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prixReel, setPrixReel] = useState("");
  const [showPrixModal, setShowPrixModal] = useState(false);
  const [remarque, setRemarque] = useState("");
  const [showRemarque, setShowRemarque] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseMotif, setPauseMotif] = useState("");
  // Optimistic status — overrides course.statut immediately on tap
  const [optimisticStatut, setOptimisticStatut] = useState(null);

  const effectiveStatut = optimisticStatut || course.statut;

  // OPTIMISTIC UI helper for status updates
  const updateOptimisticStatut = (newStatut, courseData = {}) => {
    setOptimisticStatut(newStatut);
    queryClient.setQueryData(['mes-courses-externes'], (old) => 
      (old || []).map(c => c.id === course.id ? { ...c, statut: newStatut, ...courseData } : c)
    );
  };
  const colisRecupere = effectiveStatut === "colis_recupere" || effectiveStatut === "en_livraison";
  const colisLivre = course.statut === "livree";

  const handleConfirmerLivraison = () => {
    if (isExterne) {
      onColisLivre(course);
    } else {
      const montant = parseFloat(prixReel);
      if (!prixReel || isNaN(montant) || montant <= 0) {
        toast.error("Entrez le montant reçu du client");
        return;
      }
      onColisLivre(course, montant);
    }
    setShowPrixModal(false);
    setPrixReel("");
  };

  const handleRemarque = () => {
    if (!remarque.trim()) return;
    // Utilise CourseExterne pour le réseau externe, Course pour l'interne
    const entity = isExterne ? base44.entities.CourseExterne : base44.entities.Course;
    entity.update(course.id, { remarque_livreur: remarque });
    setRemarque("");
    setShowRemarque(false);
    toast.success("Remarque enregistrée");
  };

  // Handler succès scan QR pickup (externe) — GPS déjà validé côté QRScannerModal
  const handleQRPickupSuccess = (courseData) => {
    setShowQRScanner(null);
    // OPTIMISTIC UI: Update cache immediately
    updateOptimisticStatut("colis_recupere", { 
      heure_recuperation: new Date().toISOString(),
      ...courseData 
    });
    onColisRecupere({ ...course, ...courseData });
    toast.success("Colis récupéré avec succès ! 📦");
  };

  // Handler succès scan QR delivery (externe) — livraison confirmée par le backend
  // → Redirection immédiate vers la page récapitulatif dédiée
  const handleQRDeliverySuccess = (courseData) => {
    setShowQRScanner(null);
    // OPTIMISTIC UI: Update cache immediately
    updateOptimisticStatut("livree", {
      heure_livraison: new Date().toISOString(),
      ...courseData
    });
    onColisLivre(course, null);
    const courseId = courseData?.id || course.id;
    navigate(`/livreur/recap-course/${courseId}`);
  };

  const handlePauseSubmit = () => {
    if (!pauseMotif) {
      toast.error("Veuillez sélectionner un motif");
      return;
    }
    onMettrePause?.(course, pauseMotif);
    setShowPauseModal(false);
    setPauseMotif("");
  };

  return (
    <>
      {/* Modal scan QR (externe) */}
      {showQRScanner && (
        <QRScannerModal
          course={course}
          type={showQRScanner}
          onSuccess={showQRScanner === "pickup" ? handleQRPickupSuccess : handleQRDeliverySuccess}
          onClose={() => setShowQRScanner(null)}
          livreurLat={livreurLat}
          livreurLng={livreurLng}
        />
      )}

      {/* Modal mise en pause */}
      {showPauseModal && !isExterne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3 text-3xl">
                ⏸️
              </div>
              <p className="text-xl font-black text-gray-900">Mettre en pause</p>
              <p className="text-sm text-gray-500 mt-1">Pourquoi souhaitez-vous mettre cette course en pause ?</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "client_injoignable", label: "Client injoignable", icon: "📞" },
                { id: "client_absent", label: "Client absent", icon: "🏠" },
                { id: "adresse_a_confirmer", label: "Adresse à confirmer", icon: "📍" },
                { id: "autre", label: "Autre", icon: "💬" },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`h-20 rounded-2xl border-2 font-semibold text-sm transition-all flex flex-col items-center justify-center gap-1 ${
                    pauseMotif === m.id
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setPauseMotif(m.id)}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-xs">{m.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm"
                onClick={() => { setShowPauseModal(false); setPauseMotif(""); }}
              >
                Annuler
              </button>
              <button
                className="h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50"
                onClick={handlePauseSubmit}
                disabled={!pauseMotif}
              >
                Mettre en pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal montant — uniquement pour l'interne */}
      {showPrixModal && !isExterne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3 text-3xl">
                🎉
              </div>
              <p className="text-xl font-black text-gray-900">Course terminée !</p>
              <p className="text-sm text-gray-500 mt-1">Quel montant avez-vous reçu du client ?</p>
            </div>
            <div className="relative">
              <Input
                type="number"
                placeholder="1 500"
                value={prixReel}
                onChange={(e) => setPrixReel(e.target.value)}
                className="text-center text-2xl font-black h-16 rounded-2xl border-2 border-gray-100 focus:border-primary pr-16"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">FCFA</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm"
                onClick={() => setShowPrixModal(false)}
              >
                Annuler
              </button>
              <button
                className="h-12 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-sm shadow-lg shadow-red-200 disabled:opacity-50"
                onClick={handleConfirmerLivraison}
                disabled={isPending}
              >
                OK ✅
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carte principale */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
        {/* Header de la carte */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-white text-sm font-bold">Course en cours</p>
            {course.is_multi_colis && (
              <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-bold">
                {course.nb_colis} colis
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {course.is_multi_colis && (
              <MultiColisProgressBadge
                nbColis={course.nb_colis || 1}
                nbLivres={course.nb_colis_livres || 0}
                nbAnnules={course.nb_colis_annules || 0}
                size="sm"
              />
            )}
            <span className="text-white/50 text-xs">#{course.id?.slice(-6)}</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Barre de progression */}
          <ProgressBar statut={effectiveStatut} />

          {/* Badge ETA temps réel */}
          {!colisLivre && (
            <ETABadge course={course} colisRecupere={colisRecupere} />
          )}

          {/* Contact dynamique : expéditeur avant récupération, destinataire après */}
          {(() => {
            const contactNom = colisRecupere
              ? (course.destinataire_nom || "Destinataire")
              : (course.expediteur_nom || course.client_nom || "Expéditeur");
            const contactTel = colisRecupere
              ? (course.destinataire_telephone || course.destinataire_phone_normalized)
              : (course.expediteur_telephone || course.client_telephone);
            const contactRole = colisRecupere ? "Destinataire" : "Expéditeur";

            const handleWhatsApp = () => {
              // Normalisation multi-pays : si le numéro a déjà un indicatif international (10+ chiffres), ok
              // Sinon on laisse le numéro tel quel — wa.me gère les numéros locaux avec indicatif
              let num = (contactTel || "").replace(/\D/g, "");
              // Rien à faire si déjà un numéro international (≥10 chiffres)
              const msg = encodeURIComponent(
                colisRecupere
                  ? "Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis."
                  : "Bonjour, je suis votre livreur SILGAPP. Je suis en route pour récupérer votre colis."
              );
              const lien = `https://wa.me/${num}?text=${msg}`;
              const popup = window.open(lien, "_blank", "noopener,noreferrer");
              if (!popup || popup.closed || typeof popup.closed === "undefined") {
                window.location.href = lien;
              }
            };

            return (
              <div className={cn(
                "flex items-center justify-between rounded-2xl p-3 transition-all",
                colisRecupere ? "bg-green-50 border border-green-200" : "bg-gray-50"
              )}>
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">{contactRole}</p>
                  <p className="font-black text-gray-900 text-base">{contactNom}</p>
                  <p className="text-xs text-gray-500">{contactTel}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${contactTel}`}>
                    <div className={cn(
                      "w-11 h-11 rounded-2xl border flex items-center justify-center",
                      colisRecupere ? "bg-blue-50 border-blue-200" : "bg-blue-50 border-blue-100"
                    )}>
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                  </a>
                  <button onClick={handleWhatsApp}>
                    <div className={cn(
                      "w-11 h-11 rounded-2xl border flex items-center justify-center",
                      colisRecupere ? "bg-green-100 border-green-300" : "bg-green-50 border-green-100"
                    )}>
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-600" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Trajet */}
          <div className="space-y-2">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-2xl transition-all",
              colisRecupere ? "bg-gray-50 opacity-60" : "bg-primary/5 border border-primary/20"
            )}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                colisRecupere ? "bg-gray-200" : "bg-primary/10"
              )}>
                <MapPin className={cn("w-4 h-4", colisRecupere ? "text-gray-400" : "text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase">Récupérer</p>
                <p className={cn("text-sm font-bold", colisRecupere ? "line-through text-gray-400" : "text-gray-800")}>
                  {course.adresse_depart}
                </p>
              </div>
              {/* Lien navigation statique supprimé — NavigationGPS gère la navigation avec GPS live */}
            </div>

            <div className="flex items-center gap-3 px-4">
              <div className="w-0.5 h-4 bg-gray-200 ml-4 rounded" />
            </div>

            <div className={cn(
              "flex items-center gap-3 p-3 rounded-2xl",
              colisRecupere ? "bg-green-50 border border-green-200" : "bg-gray-50"
            )}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                colisRecupere ? "bg-green-100" : "bg-gray-200"
              )}>
                <MapPin className={cn("w-4 h-4", colisRecupere ? "text-green-600" : "text-gray-400")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase">Livrer</p>
                <p className="text-sm font-bold text-gray-800">
                  {colisRecupere && course.destination_inconnue
                    ? "📍 GPS du destinataire requis"
                    : course.adresse_arrivee || "Destination"}
                </p>
              </div>
            </div>
          </div>

          {/* Prix */}
          {isExterne ? (
            (() => {
              const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
              const prixBase = isPrixManuel ? Number(course.manual_price) : (course.prix_estimate || 0);
              const gain = Math.round(prixBase * 0.7);
              
              if (prixBase <= 0) return null;
              
              return (
                <div className={cn(
                  "rounded-xl p-3 border",
                  isPrixManuel 
                    ? "bg-green-50 border-green-200" 
                    : "bg-blue-50 border-blue-200"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-xs font-semibold", isPrixManuel ? "text-green-700" : "text-blue-700")}>
                      {isPrixManuel ? "Prix validé ✓" : "Prix estimé"}
                    </span>
                    <span className={cn("text-lg font-black", isPrixManuel ? "text-green-900" : "text-blue-900")}>
                      {isPrixManuel 
                        ? `${prixBase.toLocaleString()} ${course.devise || "F"}`
                        : `~${prixBase.toLocaleString()} ${course.devise || "F"}`
                      }
                    </span>
                  </div>
                  {isPrixManuel ? (
                    <p className="text-[10px] text-green-600 font-medium">
                      Prix convenu avec le client
                    </p>
                  ) : (
                    <p className="text-[10px] text-blue-600">
                      Prix final calculé à la livraison selon le tarif du pays
                    </p>
                  )}
                  <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs"
                    style={{ borderColor: isPrixManuel ? "rgb(200, 235, 215)" : "rgb(191, 226, 255)" }}
                  >
                    <span className={cn("font-semibold", isPrixManuel ? "text-green-700" : "text-blue-700")}>Votre gain (70%)</span>
                    <span className={cn("font-bold", isPrixManuel ? "text-green-800" : "text-green-700")}>
                      +{gain.toLocaleString()} {course.devise || "F"}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            course.prix > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-gray-500 text-sm">Prix estimé</span>
                <span className="text-xl font-black text-gray-900">{course.prix.toLocaleString()} <span className="text-sm font-semibold text-gray-400">FCFA</span></span>
              </div>
            )
          )}

          {course.notes && (
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 p-3 rounded-2xl leading-relaxed">
              📝 {course.notes}
            </p>
          )}

          {/* Vue multi-colis livreur — remplace le bouton "Scanner pour livrer" côté externe */}
          {isExterne && course.is_multi_colis && colisRecupere && !colisLivre && (
            <MultiColisLivreurView
              course={course}
              colisRecupere={colisRecupere}
              onAllLivres={() => onColisLivre(course, null)}
            />
          )}

          {/* Navigation GPS — affiché si coordonnées GPS disponibles */}
          {!colisLivre && (
            !colisRecupere ? (
              // ✅ CORRECTION AUDIT : NavigationGPS relit le GPS de l'expéditeur toutes les 5s via ClientExterne
              // destLat/destLng sont les coords fixes enregistrées à la création (fallback)
              // Le GPS live de l'expéditeur est prioritaire si disponible
              <NavigationGPS
                key={`nav-recup-${course.id}`}
                phase="recuperation"
                destLat={course.gps_depart_lat}
                destLng={course.gps_depart_lng}
                destLabel={course.adresse_depart}
                destinataireTelephone={course.expediteur_telephone || course.client_telephone}
                contactClientId={course.expediteur_client_id || null}
              />
            ) : (
              // ✅ CORRECTION AUDIT : NavigationGPS relit le GPS du destinataire toutes les 5s via ClientExterne
              // destLat/destLng sont les coords fixes enregistrées à la création (fallback)
              // Le GPS live du destinataire est prioritaire si disponible
              <NavigationGPS
                key={`nav-livraison-${course.id}`}
                phase="livraison"
                destLat={course.gps_arrivee_lat}
                destLng={course.gps_arrivee_lng}
                destLabel={course.adresse_arrivee}
                destinataireTelephone={
                  course.destinataire_telephone ||
                  course.destinataire_phone_normalized ||
                  course.client_telephone
                }
                contactClientId={course.destinataire_client_id || null}
                destinationInconnue={!!course.destination_inconnue}
              />
            )
          )}

          {/* Boutons d'action */}
          {!colisLivre && (
            <div className="space-y-3 pt-1">
              {!colisRecupere ? (
                isExterne ? (
                  /* ── EXTERNE : Scanner QR pour récupérer ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => setShowQRScanner("pickup")}
                    disabled={isPending}
                  >
                    <QrCode className="w-6 h-6" />
                    Scanner pour récupérer le colis
                  </button>
                ) : (
                  /* ── INTERNE : bouton classique ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => {
                      // OPTIMISTIC UI: Update cache immediately
                      updateOptimisticStatut("colis_recupere", { heure_recuperation: new Date().toISOString() });
                      onColisRecupere(course);
                    }}
                    disabled={isPending}
                  >
                    <Package className="w-6 h-6" />
                    Colis récupéré
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )
              ) : (
                isExterne ? (
                  /* ── EXTERNE multi-colis : géré par MultiColisLivreurView ci-dessus ── */
                  /* ── EXTERNE colis unique : Scanner QR pour livrer ── */
                  !course.is_multi_colis && (
                    <button
                      className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                      onClick={() => setShowQRScanner("delivery")}
                      disabled={isPending}
                    >
                      <QrCode className="w-6 h-6" />
                      Scanner pour livrer ✅
                    </button>
                  )
                ) : (
                  /* ── INTERNE : bouton classique avec GPS + récapitulatif ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        () => setShowPrixModal(true),
                        () => setShowPrixModal(true),
                        { enableHighAccuracy: true, timeout: 5000 }
                      );
                    }}
                    disabled={isPending}
                  >
                    <Check className="w-6 h-6" />
                    Colis livré ✅
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )
              )}

              {/* Bouton annulation client — uniquement pour l'interne */}
              {!isExterne && (
                <button
                  className="w-full h-11 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors disabled:opacity-50"
                  onClick={() => onClientAnnule?.(course)}
                  disabled={isPending}
                >
                  <X className="w-4 h-4" /> Le client a annulé
                </button>
              )}

              {/* Bouton mettre en pause — uniquement pour l'interne */}
              {!isExterne && (
                <button
                  className="w-full h-11 rounded-2xl border border-amber-200 text-amber-600 font-semibold text-sm flex items-center justify-center gap-2 active:bg-amber-50 transition-colors disabled:opacity-50"
                  onClick={() => setShowPauseModal(true)}
                  disabled={isPending}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Mettre en pause
                </button>
              )}

              {!showRemarque ? (
                <button
                  className="w-full text-xs text-gray-400 flex items-center justify-center gap-1.5 py-1 hover:text-gray-600 transition-colors"
                  onClick={() => setShowRemarque(true)}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Signaler un problème
                </button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Décrivez le problème..."
                    value={remarque}
                    onChange={(e) => setRemarque(e.target.value)}
                    className="text-sm rounded-2xl border-gray-200 min-h-[70px]"
                  />
                  <div className="flex gap-2">
                    <button className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={() => setShowRemarque(false)}>Annuler</button>
                    <button className="flex-1 h-10 rounded-xl bg-gray-800 text-white text-sm font-semibold" onClick={handleRemarque}>Envoyer</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {colisLivre && (() => {
            // ⚠️ CORRECTION PRIX MANUEL : Si la course utilise un prix manuel accepté,
            // ce montant devient le prix officiel. Ne JAMAIS recalculer.
            const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
            
            const dist = Number(course.distance_reelle_km) > 0 ? Number(course.distance_reelle_km) : null;
            const prix = isPrixManuel
              ? Number(course.manual_price)
              : (Math.max(1000, Number(course.prix_final) || (dist ? Math.round(dist * 100) : 0)) || null);
            const gain = Number(course.montant_livreur) > 0 ? Number(course.montant_livreur) : (prix ? Math.round(prix * 0.7) : null);
            const commission = Number(course.commission_silga) > 0 ? Number(course.commission_silga) : (prix ? Math.round(prix * 0.3) : null);
            return (
              <div className="py-4 bg-green-50 rounded-2xl border border-green-200 space-y-3 px-4">
                <div className="text-center">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="font-black text-green-700 text-base">Course terminée !</p>
                </div>
                {isExterne ? (
                  <div className="grid grid-cols-3 gap-2">
                    {dist !== null && (
                      <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Distance</p>
                        <p className="text-sm font-black text-gray-800">{dist.toFixed(1)} km</p>
                      </div>
                    )}
                    <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">
                        Prix final {isPrixManuel && "✓"}
                      </p>
                      <p className="text-sm font-black text-blue-700">
                        {prix !== null ? `${prix.toLocaleString()} ${course.devise || "F"}` : "—"}
                      </p>
                      {isPrixManuel && (
                        <p className="text-[9px] text-green-600 font-semibold mt-0.5">Prix convenu</p>
                      )}
                    </div>
                    <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">Ton gain</p>
                      <p className="text-sm font-black text-green-700">
                        {gain !== null ? `+${gain.toLocaleString()} ${course.devise || "F"}` : "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  course.prix_reel && (
                    <p className="text-center text-green-600 text-sm font-semibold">
                      {course.prix_reel.toLocaleString()} FCFA encaissés
                    </p>
                  )
                )}
                {isExterne && commission !== null && (
                  <p className="text-center text-xs text-gray-400">
                    Commission Silga : {commission.toLocaleString()} {course.devise || "F"}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}