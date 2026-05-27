import React, { useState, useEffect } from "react";
import { MapPin, Phone, Navigation, Package, Check, X, AlertTriangle, ChevronRight, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import LivraisonResume from "./LivraisonResume";
import QRScannerModal from "./QRScannerModal";
import LivraisonRecapitulatif from "./LivraisonRecapitulatif";
import NavigationGPS from "./NavigationGPS";

const STEPS = [
  { key: "acceptee", label: "Acceptée", icon: "✅" },
  { key: "colis_recupere", label: "Récupéré", icon: "📦" },
  { key: "en_livraison", label: "En livraison", icon: "🏃" },
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

export default function CourseActiveCard({ course, onColisRecupere, onColisLivre, onClientAnnule, isPending, isExterne = false }) {
  const [prixReel, setPrixReel] = useState("");
  const [showPrixModal, setShowPrixModal] = useState(false);
  const [remarque, setRemarque] = useState("");
  const [showRemarque, setShowRemarque] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [gpsDepart, setGpsDepart] = useState(null);
  const [gpsArrivee, setGpsArrivee] = useState(null);
  const [gpsWatchId, setGpsWatchId] = useState(null);
  const [showQRScanner, setShowQRScanner] = useState(null); // "pickup" | "delivery" | null
  const [showRecapitulatif, setShowRecapitulatif] = useState(false);
  const [courseLivreeData, setCourseLivreeData] = useState(null);

  const colisRecupere = course.statut === "colis_recupere" || course.statut === "en_livraison";
  const colisLivre = course.statut === "livree";

  // Nettoyer le GPS watch quand le composant se démonte
  useEffect(() => {
    return () => {
      if (gpsWatchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
      }
    };
  }, [gpsWatchId]);

  const handleConfirmerLivraison = () => {
    if (isExterne) {
      // Externe : le prix est calculé depuis le GPS, pas saisi manuellement
      onColisLivre(course, gpsArrivee);
    } else {
      const montant = parseFloat(prixReel);
      if (!prixReel || isNaN(montant) || montant <= 0) {
        toast.error("Entrez le montant reçu du client");
        return;
      }
      onColisLivre(course, montant, gpsArrivee);
    }
    setShowPrixModal(false);
    setPrixReel("");
    setGpsArrivee(null);
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

  // Handler succès scan QR pickup (externe)
  const handleQRPickupSuccess = (courseData) => {
    setShowQRScanner(null);
    navigator.geolocation?.getCurrentPosition(
      (pos) => onColisRecupere({ ...course, _gps: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => onColisRecupere(course),
      { enableHighAccuracy: true, timeout: 8000 }
    );
    toast.success("Colis récupéré avec succès ! 📦");
  };

  // Handler succès scan QR delivery (externe) — livraison confirmée par le backend
  const handleQRDeliverySuccess = (courseData) => {
    setShowQRScanner(null);

    // Fusionner les données backend avec la course locale — priorité aux données backend
    let prixFinal = courseData?.prix_final ?? course.prix_final ?? 0;
    let distanceKm = courseData?.distance_reelle_km ?? course.distance_reelle_km ?? 0;
    let montantLivreur = courseData?.montant_livreur ?? course.montant_livreur ?? 0;
    let commissionSilga = courseData?.commission_silga ?? course.commission_silga ?? 0;

    // Fallback local : si le backend n'a pas pu calculer (GPS manquant),
    // recalculer uniquement depuis GPS récupération → GPS livraison (règle métier)
    if ((!distanceKm || distanceKm <= 0) && course.latitude_recuperation && course.longitude_recuperation &&
        courseData?.latitude_livraison && courseData?.longitude_livraison) {
      const latR = course.latitude_recuperation, lngR = course.longitude_recuperation;
      const latL = courseData.latitude_livraison, lngL = courseData.longitude_livraison;
      const R = 6371;
      const dLat = ((latL - latR) * Math.PI) / 180;
      const dLon = ((lngL - lngR) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((latR * Math.PI) / 180) * Math.cos((latL * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = Math.max(dist, 0.1);
      prixFinal = Math.round(distanceKm * 100);
      montantLivreur = Math.round(prixFinal * 0.7);
      commissionSilga = Math.round(prixFinal * 0.3);
      base44.entities.CourseExterne.update(course.id, {
        distance_reelle_km: distanceKm,
        prix_final: prixFinal,
        montant_livreur: montantLivreur,
        commission_silga: commissionSilga,
      }).catch(() => null);
    }

    const merged = {
      ...course,
      ...courseData,
      statut: "livree",
      prix_final: prixFinal,
      distance_reelle_km: distanceKm,
      montant_livreur: montantLivreur,
      commission_silga: commissionSilga,
    };
    setCourseLivreeData(merged);
    setShowRecapitulatif(true);
  };

  const handleFermerCourse = () => {
    setShowRecapitulatif(false);
    onColisLivre({ ...course, ...(courseLivreeData || {}), statut: "livree" }, gpsArrivee);
    setCourseLivreeData(null);
  };

  return (
    <>
      {/* Récapitulatif post-livraison (externe) */}
      {showRecapitulatif && courseLivreeData && (
        <LivraisonRecapitulatif
          course={courseLivreeData}
          onClose={handleFermerCourse}
        />
      )}

      {/* Modal scan QR (externe) */}
      {showQRScanner && (
        <QRScannerModal
          course={course}
          type={showQRScanner}
          onSuccess={showQRScanner === "pickup" ? handleQRPickupSuccess : handleQRDeliverySuccess}
          onClose={() => setShowQRScanner(null)}
        />
      )}

      {/* Modal résumé livraison */}
      {showResume && (
        <LivraisonResume
          course={course}
          gpsDepart={gpsDepart || { lat: course.latitude_depart_livraison, lng: course.longitude_depart_livraison }}
          gpsArrivee={gpsArrivee}
          onContinuer={() => {
            setShowResume(false);
            setShowPrixModal(true);
          }}
          onCancel={() => {
            setShowResume(false);
            setGpsArrivee(null);
          }}
        />
      )}

      {/* Modal montant — uniquement pour l'interne (externe calcule via GPS) */}
      {showPrixModal && !isExterne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3 text-3xl">
                💰
              </div>
              <p className="text-xl font-black text-gray-900">Montant reçu</p>
              <p className="text-sm text-gray-500 mt-1">Entrez le montant exact payé par le client</p>
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
                Confirmer ✅
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Externe : confirmation automatique sans saisie de montant */}
      {showPrixModal && isExterne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto text-3xl">🎉</div>
            <p className="text-xl font-black text-gray-900">Confirmer la livraison ?</p>
            <p className="text-sm text-gray-500">Le prix final sera calculé automatiquement selon la distance GPS réelle.</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm" onClick={() => setShowPrixModal(false)}>Annuler</button>
              <button className="h-12 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-sm shadow-lg shadow-red-200 disabled:opacity-50" onClick={handleConfirmerLivraison} disabled={isPending}>Livré ✅</button>
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
          </div>
          <span className="text-white/50 text-xs">#{course.id?.slice(-6)}</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Barre de progression */}
          <ProgressBar statut={course.statut} />

          {/* Client */}
          <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3">
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase">Client</p>
              <p className="font-black text-gray-900 text-base">{course.client_nom}</p>
              <p className="text-xs text-gray-500">{course.client_telephone}</p>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${course.client_telephone}`}>
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
              </a>
              <button onClick={() => {
                let num = course.client_telephone?.replace(/\D/g, "") || "";
                if (num.startsWith("226") && num.length === 11) { /* ok */ }
                else if (num.startsWith("0") && num.length === 9) num = "226" + num.slice(1);
                else if (num.length === 8) num = "226" + num;
                window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
              }}>
                <div className="w-11 h-11 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-600" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
              </button>
            </div>
          </div>

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
              {course.gps_depart_lat && !colisRecupere && (
                <a href={`https://www.google.com/maps?q=${course.gps_depart_lat},${course.gps_depart_lng}`} target="_blank" rel="noreferrer">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-primary" />
                  </div>
                </a>
              )}
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
            course.prix_estimate && course.prix_estimate > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-blue-700 font-semibold">Prix estimé</span>
                  <span className="text-lg font-black text-blue-900">~{course.prix_estimate.toLocaleString()} F</span>
                </div>
                <p className="text-[10px] text-blue-600">
                  Prix final calculé à la livraison (100 F/km réel)
                </p>
                <div className="mt-2 pt-2 border-t border-blue-200 flex items-center justify-between text-xs">
                  <span className="text-blue-700">Votre gain (70%)</span>
                  <span className="font-bold text-green-700">
                    {Math.round(course.prix_estimate * 0.7).toLocaleString()} F
                  </span>
                </div>
              </div>
            )
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

          {/* Navigation GPS — affiché si coordonnées GPS disponibles */}
          {!colisLivre && (
            !colisRecupere ? (
              (course.gps_depart_lat && course.gps_depart_lng) && (
                <NavigationGPS
                  phase="recuperation"
                  destLat={course.gps_depart_lat}
                  destLng={course.gps_depart_lng}
                  destLabel={course.adresse_depart}
                  destinataireTelephone={course.expediteur_telephone || course.client_telephone}
                />
              )
            ) : (
              <NavigationGPS
                phase="livraison"
                destLat={course.gps_arrivee_lat}
                destLng={course.gps_arrivee_lng}
                destLabel={course.adresse_arrivee}
                destinataireTelephone={course.destinataire_telephone}
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
                    onClick={() => onColisRecupere(course)}
                    disabled={isPending}
                  >
                    <Package className="w-6 h-6" />
                    Colis récupéré
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )
              ) : (
                isExterne ? (
                  /* ── EXTERNE : Scanner QR pour livrer ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => setShowQRScanner("delivery")}
                    disabled={isPending}
                  >
                    <QrCode className="w-6 h-6" />
                    Scanner pour livrer ✅
                  </button>
                ) : (
                  /* ── INTERNE : bouton classique avec GPS + récapitulatif ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        // Pas de GPS → confirmation directe avec récapitulatif
                        onColisLivre(course, null);
                        setCourseLivreeData(course);
                        setShowRecapitulatif(true);
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const gpsArrivee = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                          setGpsArrivee(gpsArrivee);
                          // Confirmer livraison avec GPS → récapitulatif
                          onColisLivre(course, gpsArrivee);
                          setCourseLivreeData({ ...course, latitude_livraison: pos.coords.latitude, longitude_livraison: pos.coords.longitude });
                          setShowRecapitulatif(true);
                        },
                        () => {
                          // GPS échec → confirmation quand même avec récapitulatif
                          onColisLivre(course, null);
                          setCourseLivreeData(course);
                          setShowRecapitulatif(true);
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
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
            const dist = Number(course.distance_reelle_km) > 0 ? Number(course.distance_reelle_km) : null;
            const prix = Number(course.prix_final) > 0 ? Number(course.prix_final) : (dist ? Math.round(dist * 100) : null);
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
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">Prix final</p>
                      <p className="text-sm font-black text-blue-700">
                        {prix !== null ? `${prix.toLocaleString()} F` : "—"}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">Ton gain</p>
                      <p className="text-sm font-black text-green-700">
                        {gain !== null ? `+${gain.toLocaleString()} F` : "—"}
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
                    Commission Silga : {commission.toLocaleString()} F (30%)
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