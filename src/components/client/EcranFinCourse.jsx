import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MessageSquare, FileText, RotateCcw, X, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function EcranFinCourse({ course, onNoter, onRefaire, onFermer }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Vibration native Android
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-gradient-to-b from-emerald-50 via-white to-white flex flex-col items-center justify-center px-6"
    >
      {/* Bouton fermer */}
      <button
        onClick={onFermer}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow"
      >
        <X className="w-5 h-5 text-gray-600" />
      </button>

      {/* Animation de réussite */}
      <div className="relative flex items-center justify-center mb-8">
        {/* Cercles de célébration */}
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2 border-emerald-400/40"
            initial={{ width: 80, height: 80, opacity: 0.6 }}
            animate={{ width: 220, height: 220, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
          />
        ))}
        {/* Check géant */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-200"
        >
          <CheckCircle2 className="w-16 h-16 text-white" strokeWidth={2.5} />
        </motion.div>

        {/* Étoiles qui tournoient */}
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            className="absolute"
            initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.2, 0],
              x: Math.cos((i * 72 - 90) * Math.PI / 180) * 120,
              y: Math.sin((i * 72 - 90) * Math.PI / 180) * 120,
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.5, delay: 0.5 + i * 0.1 }}
          >
            <Sparkles className="w-6 h-6 text-amber-400 fill-amber-300" />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-sm w-full"
          >
            <h2 className="text-2xl font-black text-gray-900 mb-2">Livraison terminée !</h2>
            <p className="text-sm text-gray-500 mb-1">
              {course?.type_course === "deplacement"
                ? "Vous êtes bien arrivé à destination."
                : "Votre colis a été livré avec succès."}
            </p>
            <p className="text-xs text-gray-400 mb-8">
              Merci d'avoir utilisé SILGAPP ✨
            </p>

            {/* Boutons d'action */}
            <div className="space-y-3">
              <button
                onClick={onNoter}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold shadow-lg shadow-amber-200 active:scale-[0.97] transition-transform"
              >
                <Star className="w-5 h-5 fill-white" />
                Noter le livreur
              </button>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => toast.info("Commentaire envoyé, merci !")}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform"
                >
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  <span className="text-[10px] font-semibold text-gray-600">Commenter</span>
                </button>
                <button
                  onClick={() => toast.info("Reçu téléchargé")}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform"
                >
                  <FileText className="w-5 h-5 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-gray-600">Reçu</span>
                </button>
                <button
                  onClick={onRefaire}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform"
                >
                  <RotateCcw className="w-5 h-5 text-primary" />
                  <span className="text-[10px] font-semibold text-gray-600">Refaire</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}