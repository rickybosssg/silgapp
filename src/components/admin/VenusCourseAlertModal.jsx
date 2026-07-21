import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bot, X, MapPin, User, Clock, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function VenusCourseAlertModal() {
  const [alerts, setAlerts] = useState([]);
  const [current, setCurrent] = useState(0);

  const fetchAlerts = async () => {
    try {
      const data = await base44.entities.Notification.filter(
        { type: "nouvelle_course_venus", lue: false },
        "-created_date", 10
      );
      setAlerts(data || []);
      if ((data || []).length === 0) setCurrent(0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 10000);
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
          className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="relative bg-gradient-to-br from-purple-600 to-indigo-700 p-5 text-white overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
              <div className="absolute -right-4 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <Bot className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg leading-tight">Nouvelle course VENUS</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-bold">
                    🤖 Créée par VENUS
                  </span>
                  <p className="text-xs text-white/80 mt-1">
                    {alerts.length} course{alerts.length > 1 ? "s" : ""} en attente
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

            <div className="p-5 space-y-3">
              {alert.message?.split("\n").map((line, i) => {
                if (!line.trim()) return null;
                const isLabel = line.includes(":");
                const [label, ...rest] = isLabel ? line.split(":") : [line];
                const value = rest.join(":").trim();
                const Icon = label.toLowerCase().includes("client") ? User
                  : label.toLowerCase().includes("réf") ? ExternalLink
                  : label.toLowerCase().includes("départ") || label.toLowerCase().includes("arrivée") ? MapPin
                  : label.toLowerCase().includes("date") ? Clock : null;
                return (
                  <div key={i} className="flex items-start gap-2">
                    {Icon && <Icon className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-400 font-medium">{label}:</span>{" "}
                      <span className="text-sm text-gray-900 font-medium">{value}</span>
                    </div>
                  </div>
                );
              })}

              {alert.course_id && (
                <div className="bg-purple-50 rounded-xl p-2.5 text-xs text-purple-600 font-mono">
                  ID: {alert.course_id.slice(-12)}
                </div>
              )}

              {alerts.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {alerts.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === current ? "w-6 bg-purple-500" : "w-1.5 bg-gray-300"}`}
                    />
                  ))}
                </div>
              )}

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
                  className="flex-1 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white text-sm font-bold transition shadow-md shadow-purple-500/20"
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