import React, { useEffect, useRef, useState } from "react";
import { MapPin, Phone, Navigation, Check, X, Package, Clock, MessageCircle, Ruler, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Vibration continue
function useVibration(active) {
  const intervalRef = useRef(null);
  useEffect(() => {
    if (active && navigator.vibrate) {
      navigator.vibrate([500, 150, 500, 150, 500]);
      intervalRef.current = setInterval(() => {
        navigator.vibrate([500, 150, 500, 150, 500]);
      }, 3000);
    }
    return () => {
      navigator.vibrate?.(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);
}

let sharedAudioCtx = null;
function getAudioCtx() {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    const notes = [880, 1100, 880, 1100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.13);
    });
  } catch (_) {}
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
  onExpire 
}) {
  useVibration(true);
  const [tempsRestant, setTempsRestant] = useState(60);
  const [courseDejaPrise, setCourseDejaPrise] = useState(false);
  const [courseExpiree, setCourseExpiree] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sonnerie répétée
  useEffect(() => {
    playNotificationSound();
    const t = setInterval(playNotificationSound, 5000);
    return () => clearInterval(t);
  }, []);

  // Timer 60 secondes
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTempsRestant(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setCourseExpiree(true);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Vérifier expiration backend
  const courseExpireeSentRef = useRef(false);
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await base44.functions.invoke('dispatchExterneAuto', {
          action: 'verifier_expiration',
          course_id: course.id,
        });
        const d = data?.data;
        if (d?.livreur_id && d.livreur_id !== livreurId && d.dispatch_status === 'accepte') {
          setCourseDejaPrise(true);
        }
        if (d?.expired && !courseExpireeSentRef.current && !d?.livreur_id) {
          courseExpireeSentRef.current = true;
          setCourseExpiree(true);
          base44.functions.invoke('dispatchExterneAuto', {
            action: 'verifier_expiration',
            course_id: course.id,
          }).catch(() => null);
        }
      } catch (_) {}
    };

    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [course.id, livreurId]);

  const handleAccepter = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await base44.functions.invoke('dispatchExterneAuto', {
        action: 'accepter_course',
        course_id: course.id,
        livreur_id: livreurId,
      });
      const data = res?.data;

      if (data?.already_taken) {
        setCourseDejaPrise(true);
        return;
      }
      if (data?.expired) {
        setCourseExpiree(true);
        return;
      }
      if (data?.success) {
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

  const handleRefuser = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await base44.functions.invoke('dispatchExterneAuto', {
        action: 'refuser_course',
        course_id: course.id,
        livreur_id: livreurId,
      });
      const data = res?.data;
      if (data?.success) {
        onRefuser();
      }
    } catch (err) {
      console.error('Erreur refuser:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fermeture auto après 3s
  useEffect(() => {
    if (courseDejaPrise || courseExpiree) {
      const t = setTimeout(() => {
        onExpireRef.current?.();
      }, 3000);
      return () => clearTimeout(t);
    }
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
            style={{ width: `${(tempsRestant / 60) * 100}%` }}
          />
        </div>

        <div className="px-5 py-2 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${tempsRestant <= 10 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
            <span className={`text-sm font-bold ${tempsRestant <= 10 ? 'text-red-500' : 'text-gray-600'}`}>
              {tempsRestant}s restantes
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Client */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Client</p>
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
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Récupérer</p>
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
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Livrer</p>
                <p className="text-sm font-bold text-gray-800 leading-tight">{course.adresse_arrivee || "Destination inconnue"}</p>
              </div>
            </div>
          </div>

          {/* Prix + Distance */}
          <div className="flex items-center justify-between">
            <div>
              {course.prix_estimate ? (
                <p className="text-2xl font-black text-gray-900">{course.prix_estimate.toLocaleString()} <span className="text-base font-semibold text-gray-400">FCFA</span></p>
              ) : null}
              {course.type_colis && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Package className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">{typeColisLabel[course.type_colis] || course.type_colis}</span>
                </div>
              )}
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
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Ruler className="w-3 h-3" />
                    {distLabel}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Boutons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              className="h-16 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
              onClick={handleAccepter}
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
  );
}