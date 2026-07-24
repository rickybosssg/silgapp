import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Bike, Clock, MapPin, X } from "lucide-react";

const STATUS_MESSAGES = [
  "Recherche du meilleur livreur...",
  (count) => count > 0 ? `${count} livreur${count > 1 ? "s" : ""} en cours de notification.` : "Mise en relation avec les livreurs...",
  "En attente d'une réponse...",
  "Mise en relation en cours...",
];

function parseNotifiedCount(course) {
  try {
    if (course.dispatch_notified_ids) {
      const ids = JSON.parse(course.dispatch_notified_ids);
      return Array.isArray(ids) ? ids.length : 0;
    }
  } catch {}
  return 0;
}

export default function RechercheLivreurScreen({ course, position, onClose }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const notifiedCount = parseNotifiedCount(course);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % STATUS_MESSAGES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const currentMsg = typeof STATUS_MESSAGES[msgIndex] === "function"
    ? STATUS_MESSAGES[msgIndex](notifiedCount)
    : STATUS_MESSAGES[msgIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gradient-to-b from-slate-50 to-white flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-xs text-gray-500 font-medium">Course en cours</p>
          <p className="text-sm font-bold text-gray-900">{course.adresse_depart}</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Animation radar */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Cercles radar pulsants */}
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full border-2 border-primary/30"
              initial={{ width: 60, height: 60, opacity: 0.6 }}
              animate={{ width: 180, height: 180, opacity: 0 }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
          {/* Centre */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-xl shadow-red-200">
            <Bike className="w-8 h-8 text-white" />
          </div>
          {/* Point de départ */}
          {position && (
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center shadow-lg">
              <MapPin className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        {/* Statut dynamique */}
        <div className="mt-8 text-center min-h-[60px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={msgIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <p className="text-base font-bold text-gray-900">{currentMsg}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Infos dispatch */}
        <div className="mt-6 flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <span className="text-lg font-black text-amber-600">{notifiedCount}</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1 font-medium">Notifiés</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-[10px] text-gray-500 mt-1 font-medium">~2 min</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Search className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-[10px] text-gray-500 mt-1 font-medium">En cours</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="bg-gray-50 rounded-2xl p-4 text-center">
          <p className="text-xs text-gray-500">
            Vous serez notifié dès qu'un livreur acceptera votre demande.
          </p>
        </div>
      </div>
    </motion.div>
  );
}