import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, X, AlertCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function SystemAlertModal() {
  const [alerts, setAlerts] = useState([]);
  const [current, setCurrent] = useState(0);
  // 🛡️ Anti-double-clic : empêche les taps multiples pendant le dismiss async
  const dismissingRef = useRef(false);
  // 🛡️ Pause du re-fetch pendant le dismiss pour éviter la réinjection de l'alerte
  const pauseFetchRef = useRef(false);

  const fetchAlerts = useCallback(async () => {
    if (pauseFetchRef.current) return;
    try {
      const data = await base44.entities.Notification.filter({
        type: "alerte_critique_dispatch",
        lue: false,
      }, "-created_date", 10);
      setAlerts(data || []);
      if ((data || []).length === 0) setCurrent(0);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 15000);
    return () => clearInterval(iv);
  }, [fetchAlerts]);

  // ✅ Retrait optimiste IMMÉDIAT + marquage DB en arrière-plan
  // L'alerte disparaît de l'écran AVANT l'await, empêchant le double-clic.
  const handleDismiss = useCallback(async (index) => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    pauseFetchRef.current = true;

    const alert = alerts[index];
    if (!alert) {
      dismissingRef.current = false;
      pauseFetchRef.current = false;
      return;
    }

    // Retrait optimiste immédiat — la modale se ferme MAINTENANT
    setAlerts(prev => prev.filter((_, i) => i !== index));
    setCurrent(0);

    // Marquage DB en arrière-plan (non bloquant pour l'UI)
    try {
      await base44.entities.Notification.update(alert.id, { lue: true });
    } catch (_) {
      // Si l'update échoue, l'alerte restera non lue en DB et réapparaîtra au prochain fetch
      // — c'est acceptable : mieux vaut une alerte persistante qu'une UI qui semble cassée.
    } finally {
      dismissingRef.current = false;
      pauseFetchRef.current = false;
    }
  }, [alerts]);

  const handleDismissAll = useCallback(async () => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    pauseFetchRef.current = true;

    const allAlerts = alerts;
    setAlerts([]);
    setCurrent(0);

    for (const a of allAlerts) {
      try {
        await base44.entities.Notification.update(a.id, { lue: true });
      } catch (_) {}
    }

    dismissingRef.current = false;
    pauseFetchRef.current = false;
  }, [alerts]);

  const alert = alerts[current];

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            {/* Header rouge pulsant */}
            <div className="relative bg-gradient-to-br from-red-600 to-red-700 p-5 text-white overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 animate-pulse" />
              <div className="absolute -right-4 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg leading-tight">Alerte système</p>
                  <p className="text-xs text-white/80 mt-0.5">
                    {alerts.length} alerte{alerts.length > 1 ? "s" : ""} critique{alerts.length > 1 ? "s" : ""}
                  </p>
                </div>
                {/* ✅ Bouton X — même handler que "J'ai compris", ferme en 1 appui */}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(current); }}
                  className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition shrink-0 touch-manipulation"
                  aria-label="Fermer l'alerte"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{alert.titre}</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{alert.message}</p>
                </div>
              </div>

              {/* ── Explication du livreur (extraite du message — UNIQUEMENT le texte du livreur) ── */}
              {(() => {
                const msg = alert.message || "";
                const match = msg.match(/Détail:\s*(.+)$/i);
                const detail = match ? match[1].trim().replace(/\.$/, "") : null;
                if (!detail || detail.startsWith("Aucun détail")) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">
                       Explication du livreur
                    </p>
                    <p className="text-sm text-amber-900 font-semibold leading-relaxed">{detail}</p>
                  </div>
                );
              })()}

              {/* ── Action requise — SÉPARÉE selon le type d'alerte ── */}
              {alert.type === "alerte_critique_dispatch" && (() => {
                const isInfraAlert = (alert.titre || "").includes("Surcharge API") || (alert.message || "").includes("rate limit");
                const isFatalAlert = (alert.titre || "").includes("Erreur fatale");
                const hasCourseId = !!alert.course_id;

                if (isInfraAlert) {
                  // ALERTE INFRASTRUCTURE — problème technique temporaire (rate limit, timeout)
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">
                        Problème technique temporaire
                      </p>
                      <p className="text-sm text-amber-900 font-medium leading-relaxed">
                        Le moteur de dispatch a temporairement atteint une limite d'appels API. Le prochain cycle reprendra automatiquement. Aucune action métier requise — les courses ne sont pas affectées.
                      </p>
                    </div>
                  );
                }

                if (isFatalAlert) {
                  // ALERTE ERREUR FATALE — intervention technique requise
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-1">
                        Intervention technique requise
                      </p>
                      <p className="text-sm text-red-900 font-medium leading-relaxed">
                        Le moteur de dispatch automatique a rencontré une erreur persistante. Vérifiez les logs et relancez le dispatch si nécessaire.
                      </p>
                    </div>
                  );
                }

                // ALERTE REDISPATCH — course précise avec livreur ayant annulé
                if (hasCourseId) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-1">
                        Action requise — Redispatch
                      </p>
                      <p className="text-sm text-red-900 font-medium leading-relaxed">
                        Cette course est passée en Redispatch. Elle ne sera pas reproposée automatiquement. Relancez manuellement la recherche d'un livreur si nécessaire (le livreur ayant annulé reste exclu).
                      </p>
                    </div>
                  );
                }

                // Alerte générique sans course_id — pas d'action métier spécifique
                return null;
              })()}

              {alert.course_id && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                  Course ID : <span className="font-mono">{alert.course_id.slice(-12)}</span>
                </div>
              )}

              {alerts.length > 1 && (
                <div className="flex items-center justify-center gap-1.5">
                  {alerts.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === current ? "w-6 bg-red-500" : "w-1.5 bg-gray-300"}`}
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              {/* ✅ Hauteur 56px (h-14) — surface tactile confortable */}
              {/* ✅ touch-manipulation — élimine le délai 300ms sur Android WebView */}
              {/* ✅ Flag anti-double-clic via dismissingRef */}
              <div className="flex gap-2 pt-1">
                {alerts.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismissAll(); }}
                    className="flex-1 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition touch-manipulation"
                  >
                    Tout ignorer ({alerts.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(current); }}
                  className="flex-1 h-14 rounded-xl bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-bold transition shadow-md shadow-red-500/20 active:scale-95 touch-manipulation"
                >
                  J'ai compris
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}