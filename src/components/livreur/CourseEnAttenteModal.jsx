import React, { useEffect, useRef, useState } from "react";
import { MapPin, Phone, Navigation, Check, X, Package, Clock, Truck, AlertCircle } from "lucide-react";

function useVibration(active) {
  const intervalRef = useRef(null);
  useEffect(() => {
    if (active && navigator.vibrate) {
      navigator.vibrate([500, 150, 500, 150, 500]);
      intervalRef.current = setInterval(() => {
        navigator.vibrate([500, 150, 500, 150, 500]);
      }, 3000);
    } else {
      navigator.vibrate?.(0);
      clearInterval(intervalRef.current);
    }
    return () => {
      navigator.vibrate?.(0);
      clearInterval(intervalRef.current);
    };
  }, [active]);
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

export default function CourseEnAttenteModal({ 
  course, 
  livreurId, 
  onAccepter, 
  onRefuser, 
  isPending,
  onExpire 
}) {
  useVibration(true);
  const [showRaison, setShowRaison] = useState(false);
  const [raison, setRaison] = useState("");
  const [tempsRestant, setTempsRestant] = useState(60);
  const [courseDejaPrise, setCourseDejaPrise] = useState(false);
  const [courseExpiree, setCourseExpiree] = useState(false);

  // Sonnerie répétée
  useEffect(() => {
    playNotificationSound();
    const t = setInterval(playNotificationSound, 5000);
    return () => clearInterval(t);
  }, []);

  // Timer 60 secondes
  useEffect(() => {
    if (tempsRestant <= 0) {
      setCourseExpiree(true);
      onExpire?.();
      return;
    }

    const timer = setInterval(() => {
      setTempsRestant(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [tempsRestant, onExpire]);

  // Vérifier expiration backend
  useEffect(() => {
    const checkExpiration = async () => {
      try {
        const res = await fetch('/functions/dispatchExterneAuto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verifier_expiration',
            course_id: course.id,
          }),
        });
        const data = await res.json();
        
        if (data.expired && !courseExpiree) {
          setCourseExpiree(true);
          onExpire?.();
        }
        
        if (data.livreur_id && data.livreur_id !== livreurId) {
          setCourseDejaPrise(true);
        }
      } catch (err) {
        console.error('Erreur vérification expiration:', err);
      }
    };

    const interval = setInterval(checkExpiration, 2000);
    checkExpiration(); // Check immédiat
    
    return () => clearInterval(interval);
  }, [course.id, livreurId, courseExpiree, onExpire]);

  const handleAccepter = async () => {
    try {
      const res = await fetch('/functions/dispatchExterneAuto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accepter_course',
          course_id: course.id,
          livreur_id: livreurId,
        }),
      });
      const data = await res.json();

      if (data.already_taken) {
        setCourseDejaPrise(true);
        return;
      }

      if (data.expired) {
        setCourseExpiree(true);
        return;
      }

      if (data.success) {
        onAccepter(course);
      } else {
        alert(data.error || 'Erreur lors de l\'acceptation');
      }
    } catch (err) {
      console.error('Erreur acceptation:', err);
      alert('Erreur réseau');
    }
  };

  const handleRefuser = async () => {
    if (!raison && showRaison) return;
    
    try {
      const res = await fetch('/functions/dispatchExterneAuto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refuser_course',
          course_id: course.id,
          livreur_id: livreurId,
          raison: raison || 'Course refusée',
        }),
      });
      const data = await res.json();

      if (data.success) {
        onRefuser(course, raison);
      }
    } catch (err) {
      console.error('Erreur refuser:', err);
    }
  };

  // Affichage état course déjà prise
  if (courseDejaPrise) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      >
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-gray-400 to-gray-600 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-xl leading-tight">Course déjà prise</p>
                <p className="text-white/70 text-xs">Un autre livreur l'a acceptée</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-600 text-center mb-4">
              Cette course n'est plus disponible. De nouvelles courses arriveront bientôt !
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Affichage état course expirée
  if (courseExpiree) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      >
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-xl leading-tight">Course expirée</p>
                <p className="text-white/70 text-xs">Temps écoulé</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-600 text-center mb-4">
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
      {/* Glow animé */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "1.5s" }} />
      </div>

      <div className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header rouge animé */}
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

        {/* Barre de progression timer */}
        <div className="bg-gray-100 h-2 relative">
          <div 
            className={`h-full transition-all duration-1000 ${
              tempsRestant <= 10 ? 'bg-red-500' : tempsRestant <= 30 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${(tempsRestant / 60) * 100}%` }}
          />
        </div>

        {/* Timer */}
        <div className="px-5 py-2 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${tempsRestant <= 10 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
            <span className={`text-sm font-bold ${tempsRestant <= 10 ? 'text-red-500' : 'text-gray-600'}`}>
              {tempsRestant}s restantes
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {tempsRestant <= 10 ? '⚠️ Dépêchez-vous !' : tempsRestant <= 30 ? '⏰ Temps limité' : '⏱️ 60s pour accepter'}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Client */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Client</p>
              <p className="text-lg font-black text-gray-900">{course.client_nom || "Client"}</p>
            </div>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/${course.client_telephone?.replace(/[^0-9]/g, "")}`}
                target="_blank" rel="noreferrer"
              >
                <button className="w-11 h-11 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-600">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.126 1.535 5.862L0 24l6.335-1.656A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.374l-.36-.214-3.762.983 1.004-3.663-.233-.374A9.818 9.818 0 1112 21.818z" />
                  </svg>
                </button>
              </a>
              <a href={`tel:${course.client_telephone}`}>
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
                <p className="text-sm font-bold text-gray-800 leading-tight">{course.adresse_arrivee}</p>
              </div>
              {course.gps_arrivee_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_arrivee_lat},${course.gps_arrivee_lng}`} target="_blank" rel="noreferrer">
                  <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Navigation className="w-3.5 h-3.5 text-green-600" />
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Infos cours */}
          <div className="flex items-center justify-between">
            <div>
              {course.prix ? (
                <p className="text-2xl font-black text-gray-900">{course.prix.toLocaleString()} <span className="text-base font-semibold text-gray-400">FCFA</span></p>
              ) : null}
              {course.type_colis && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Package className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">{typeColisLabel[course.type_colis] || course.type_colis}</span>
                </div>
              )}
            </div>
            {course.urgence === "tres_urgente" && (
              <span className="bg-red-100 text-red-700 text-xs font-black px-3 py-1.5 rounded-xl">⚡ TRÈS URGENT</span>
            )}
            {course.urgence === "urgente" && (
              <span className="bg-amber-100 text-amber-700 text-xs font-black px-3 py-1.5 rounded-xl">⚡ URGENT</span>
            )}
          </div>

          {course.notes && (
            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl leading-relaxed">{course.notes}</p>
          )}

          {/* Boutons */}
          {!showRaison ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                className="h-16 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                onClick={handleAccepter}
                disabled={isPending}
              >
                <Check className="w-6 h-6" />
                <span className="text-xs font-bold">Oui, je prends !</span>
              </button>
              <button
                className="h-16 rounded-2xl bg-gray-100 text-gray-700 font-black text-base border border-gray-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                onClick={() => setShowRaison(true)}
                disabled={isPending}
              >
                <X className="w-6 h-6 text-gray-500" />
                <span className="text-xs font-bold text-gray-500">Non, occupé</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <p className="text-sm font-bold text-gray-700 text-center">Pourquoi êtes-vous occupé ?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`h-14 rounded-2xl border-2 font-semibold text-sm transition-all ${
                    raison === "en_course"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setRaison("en_course")}
                >
                  <Truck className="w-4 h-4 mx-auto mb-0.5" />
                  En cours
                </button>
                <button
                  className={`h-14 rounded-2xl border-2 font-semibold text-sm transition-all ${
                    raison === "indisponible"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setRaison("indisponible")}
                >
                  <Clock className="w-4 h-4 mx-auto mb-0.5-auto mb-0.5" />
                  Indisponible
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm"
                  onClick={() => {
                    setShowRaison(false);
                    setRaison("");
                  }}
                >
                  Annuler
                </button>
                <button
                  className="h-12 rounded-2xl bg-gray-800 text-white font-bold text-sm disabled:opacity-50"
                  onClick={handleRefuser}
                  disabled={!raison || isPending}
                >
                  Envoyer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}