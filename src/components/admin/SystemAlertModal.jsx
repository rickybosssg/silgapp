import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, X, AlertCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function SystemAlertModal() {
  const [alerts, setAlerts] = useState([]);
  const [current, setCurrent] = useState(0);

  const fetchAlerts = async () => {
    try {
      const data = await base44.entities.Notification.filter({
        type: "alerte_critique_dispatch",
        lue: false,
      }, "-created_date", 10);
      setAlerts(data || []);
      if ((data || []).length === 0) setCurrent(0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 15000);
    return () => clearInterval(iv);
  }, []);

  const handleDismiss = async () => {
    const alert = alerts[current];
    if (!alert) return;
    try {
      await base44.entities.Notification.update(alert.id, { lue: true });
    } catch (_) {}
    const remaining = alerts.filter((_, i) => i !== current);
    setAlerts(remaining);
    setCurrent(0);
  };

  const handleDismissAll = async () => {
    for (const a of alerts) {
      try {
        await base44.entities.Notification.update(a.id, { lue: true });
      } catch (_) {}
    }
    setAlerts([]);
    setCurrent(0);
  };

  const alert = alerts[current];

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
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
                <button
                  onClick={handleDismiss}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition shrink-0"
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
              <div className="flex gap-2 pt-1">
                {alerts.length > 1 && (
                  <button
                    onClick={handleDismissAll}
                    className="flex-1 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition"
                  >
                    Tout ignorer ({alerts.length})
                  </button>
                )}
                <button
                  onClick={handleDismiss}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-bold transition shadow-md shadow-red-500/20"
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