import React, { useEffect, useRef, useState } from "react";
import { MapPin, Phone, Navigation, Check, X, Package, Clock, MessageCircle, Ruler, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import ManualPriceModal from "./ManualPriceModal";
import { stopUrgentCourseAlert, useUrgentCourseAlert } from "@/lib/livreurUrgentAlert";

function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const typeColisLabel = {
  petit_colis: "Petit colis",
  moyen_colis: "Moyen colis",
  gros_colis: "Gros colis",
  document: "Document",
  nourriture: "Nourriture",
  autre: "Autre",
};

export default function CourseEnAttenteModalExterne({ 
  course, 
  livreurId, 
  onAccepter, 
  onRefuser,
  onExpire,
  pricingMode = "automatic", // "automatic" | "manual"
  alertDurationSeconds = 60,
  alertIntervalSeconds = 5,
}) {
  useUrgentCourseAlert(true, {
    courseId: course?.id,
    source: "course-modal",
    durationSeconds: alertDurationSeconds,
    intervalSeconds: alertIntervalSeconds,
  });

  const [tempsRestant, setTempsRestant] = useState(alertDurationSeconds);
  const [courseDejaPrise, setCourseDejaPrise] = useState(false);
  const [courseExpiree, setCourseExpiree] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualPriceModal, setShowManualPriceModal] = useState(false);

  // Sonnerie répétée
  useEffect(() => {
    setTempsRestant(alertDurationSeconds);
    setCourseDejaPrise(false);
    setCourseExpiree(false);
  }, [course?.id, alertDurationSeconds]);

  // Timer 60 secondes
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTempsRestant(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setCourseExpiree(true);
          stopUrgentCourseAlert("course-expired");
          // Ne pas appeler onExpire ici — le useEffect dédié ci-dessous gère le délai 3s
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [course?.id]);

  // Souscription temps réel — détection immédiate "course déjà prise"
  useEffect(() => {
    const unsubscribe = base44.entities.CourseExterne.subscribe((event) => {
      if (event.id !== course.id || event.type !== 'update') return;
      const updated = event.data;
      // Course assignée à un autre livreur
      if (updated.livreur_id && String(updated.livreur_id) !== String(livreurId)) {
        stopUrgentCourseAlert("course-taken-realtime");
        setCourseDejaPrise(true);
        return;
      }
      // Course passée en statut final ou annulée
      if (['livree', 'annulee'].includes(updated.statut)) {
        courseExpireeSentRef.current = true;
        stopUrgentCourseAlert("course-finalized-realtime");
        setCourseExpiree(true);
      }
    });
    return unsubscribe;
  }, [course.id, livreurId]);

  // Vérifier expiration backend
  const courseExpireeSentRef = useRef(false);
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await base44.functions.invoke('dispatchExterneAuto', {
          action: 'check_course_pour_livreur',
          course_id: course.id,
          livreur_id: livreurId,
        });
        const d = data?.data;
        // 🔧 CORRECTION : si c'est NOUS qui avons accepté, ne pas afficher "Course déjà prise"
        if (d?.you_accepted) {
          return; // Tout va bien, on attend que onAccepter() soit appelé par handleAccepterAuto
        }
        if (d?.already_taken || (d?.found === false && !d?.expired)) {
          stopUrgentCourseAlert("course-already-taken");
          setCourseDejaPrise(true);
          return;
        }
        if (d?.expired && !courseExpireeSentRef.current) {
          courseExpireeSentRef.current = true;
          stopUrgentCourseAlert("course-expired-backend");
          setCourseExpiree(true);
        }
      } catch (_) {}
    };

    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [course.id, livreurId]);

  const handleAccepterClick = () => {
    if (isSubmitting) return;
    // Si mode manuel → afficher le modal de saisie du prix d'abord
    if (pricingMode === "manual") {
      setShowManualPriceModal(true);
    } else {
      handleAccepterAuto();
    }
  };

  const handleAccepterAuto = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await base44.functions.invoke('dispatchExterneAuto', {
        action: 'accepter_course',
        course_id: course.id,
        livreur_id: livreurId,
      });
      const data = res?.data;

      // 🔧 CORRECTION : already_accepted = requête concurrente du même livreur déjà traitée
      if (data?.already_accepted) {
        stopUrgentCourseAlert("course-accepted");
        onAccepter();
        return;
      }
      if (data?.already_taken || data?.reason === "already_taken") { stopUrgentCourseAlert("course-already-taken"); setCourseDejaPrise(true); return; }
      if (data?.expired) { stopUrgentCourseAlert("course-expired"); setCourseExpiree(true); return; }
      if (data?.success && data?.accepted !== false) {
        stopUrgentCourseAlert("course-accepted");
        onAccepter();
      } else {
        alert(data?.error || "Erreur lors de l'acceptation");
      }
    } catch (err) {
      console.error('Erreur acceptation:', err);
      alert('Erreur réseau');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccepterManuel = async (montant) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 1. Accepter la course côté dispatch (livreur assigné, statuts mis à jour)
      const res = await base44.functions.invoke('dispatchExterneAuto', {
        action: 'accepter_course',
        course_id: course.id,
        livreur_id: livreurId,
        pricing_mode: "manual",
        manual_price: montant,
      });
      const data = res?.data;

      // 🔧 CORRECTION : already_accepted = requête concurrente du même livreur déjà traitée
      if (data?.already_accepted) {
        stopUrgentCourseAlert("course-accepted-manual");
        setShowManualPriceModal(false);
        onAccepter(true); // pending_client_validation = true (mode manuel)
        return;
      }
      if (data?.already_taken || data?.reason === "already_taken") { stopUrgentCourseAlert("course-already-taken"); setCourseDejaPrise(true); return; }
      if (data?.expired) { stopUrgentCourseAlert("course-expired"); setCourseExpiree(true); return; }
      if (data?.success && data?.accepted !== false) {
        stopUrgentCourseAlert("course-accepted-manual");
        setShowManualPriceModal(false);
        onAccepter(data?.pending_client_validation === true);
      } else {
        alert(data?.error || "Erreur lors de l'acceptation");
      }
    } catch (err) {
      console.error('Erreur acceptation manuelle:', err);
      alert('Erreur réseau');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefuser = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    // Fermer la modale IMMÉDIATEMENT — le livreur ne doit jamais rester bloqué
    stopUrgentCourseAlert("course-refused");
    onRefuser();
    // Appel backend en arrière-plan (best-effort)
    try {
      await base44.functions.invoke('dispatchExterneAuto', {
        action: 'refuser_course',
        course_id: course.id,
        livreur_id: livreurId,
      });
    } catch (err) {
      console.error('Erreur refuser (non bloquant):', err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fermeture auto après 3s + remettre le livreur disponible via onExpire
  useEffect(() => {
    if (!courseDejaPrise && !courseExpiree) return;
    const t = setTimeout(() => {
      onExpireRef.current?.();
    }, 3000);
    return () => clearTimeout(t);
  }, [courseDejaPrise, courseExpiree]);

  // Écran "Course déjà prise"
  if (courseDejaPrise) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      >
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-gray-400 to-gray-600 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-xl leading-tight">Course déjà prise</p>
                <p className="text-white/70 text-xs">Un autre livreur l'a acceptée</p>
              </div>
            </div>
          </div>
          <div className="p-5 text-center">
            <p className="text-sm text-gray-600">
              Cette course n'est plus disponible. De nouvelles courses arriveront bientôt !
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Écran "Course expirée"
  if (courseExpiree) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      >
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-xl leading-tight">Course expirée</p>
                <p className="text-white/70 text-xs">Temps écoulé</p>
              </div>
            </div>
          </div>
          <div className="p-5 text-center">
            <p className="text-sm text-gray-600">
              Le temps d'acceptation est écoulé. La course a été proposée à un autre livreur.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    {showManualPriceModal && (
      <ManualPriceModal
        course={course}
        onConfirm={handleAccepterManuel}
        onCancel={() => setShowManualPriceModal(false)}
        isSubmitting={isSubmitting}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-3"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "1.5s" }} />
      </div>

      <div className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-red-600 px-5 pt-5 pb-4 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl animate-bounce">
              🚨
            </div>
            <div>
              <p className="text-white font-black text-xl leading-tight">NOUVELLE COURSE !</p>
              <p className="text-white/70 text-xs">Répondez rapidement</p>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="bg-gray-100 h-2 relative">
          <div 
            className={`h-full transition-all duration-1000 ${
              tempsRestant <= 10 ? 'bg-red-500' : tempsRestant <= 30 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${(tempsRestant / alertDurationSeconds) * 100}%` }}
          />
        </div>

        <div className="px-5 py-2 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${tempsRestant <= 10 ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />
            <span className={`text-sm font-bold ${tempsRestant <= 10 ? 'text-red-500' : 'text-gray-600'}`}>
              {tempsRestant}s restantes
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Client */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Client</p>
              <p className="text-lg font-black text-gray-900">{course.expediteur_nom || "Client"}</p>
            </div>
            <div className="flex gap-2">
              <a href={`https://wa.me/${course.expediteur_telephone?.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <button className="w-11 h-11 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-green-600" />
                </button>
              </a>
              <a href={`tel:${course.expediteur_telephone}`}>
                <button className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </button>
              </a>
            </div>
          </div>

          {/* Trajet */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 uppercase font-semibold tracking-wide">Récupérer</p>
                <p className="text-sm font-bold text-gray-800 leading-tight">{course.adresse_depart}</p>
              </div>
              {course.gps_depart_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_depart_lat},${course.gps_depart_lng}`} target="_blank" rel="noreferrer">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Navigation className="w-3.5 h-3.5 text-primary" />
                  </div>
                </a>
              )}
            </div>

            <div className="flex justify-center">
              <div className="w-0.5 h-5 bg-gray-200 rounded" />
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 uppercase font-semibold tracking-wide">Livrer</p>
                <p className="text-sm font-bold text-gray-800 leading-tight">{course.adresse_arrivee || "Destination inconnue"}</p>
              </div>
            </div>
          </div>

          {/* Prix + Distance */}
          <div className="flex items-center justify-between">
            <div>
              {(() => {
                const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
                const prixBase = isPrixManuel ? Number(course.manual_price) : (course.prix_estimate || 0);
                if (!prixBase) return null;
                return (
                  <>
                    <p className={cn("text-2xl font-black", isPrixManuel ? "text-green-700" : "text-gray-900")}>
                      {isPrixManuel 
                        ? `${prixBase.toLocaleString()} `
                        : `~${prixBase.toLocaleString()} `
                      }
                      <span className={cn("text-base font-semibold", isPrixManuel ? "text-green-600" : "text-gray-600")}>FCFA</span>
                    </p>
                    {isPrixManuel && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-xs text-green-600 font-bold">Prix convenu avec le client</span>
                      </div>
                    )}
                    {course.type_colis && !isPrixManuel && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Package className="w-3.5 h-3.5 text-gray-600" />
                        <span className="text-xs text-gray-500">{typeColisLabel[course.type_colis] || course.type_colis}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {(() => {
              const dist = haversine(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
              if (!dist || dist <= 0) return null;
              const etaMin = dist < 0.1 ? 1 : Math.round((dist / 25) * 60);
              const distLabel = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
              return (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-sm font-black text-blue-900">~ {etaMin} min</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Ruler className="w-3 h-3" />
                    {distLabel}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Badge mode tarification */}
          {pricingMode === "manual" && (
            <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
              <span className="text-xs font-bold text-blue-700">💰 Mode prix manuel activé — vous allez saisir votre prix</span>
            </div>
          )}

          {/* Boutons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              className="h-16 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
              onClick={handleAccepterClick}
              disabled={isSubmitting}
            >
              <Check className="w-6 h-6" />
              <span className="text-xs font-bold">Oui, je prends !</span>
            </button>
            <button
              className="h-16 rounded-2xl bg-gray-100 text-gray-700 font-black text-base border border-gray-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
              onClick={handleRefuser}
              disabled={isSubmitting}
            >
              <X className="w-6 h-6 text-gray-500" />
              <span className="text-xs font-bold text-gray-500">Non, occupé</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}