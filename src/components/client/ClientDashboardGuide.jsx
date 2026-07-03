import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, HelpCircle } from "lucide-react";

const GUIDE_KEY = "silgapp_client_guide_done";

const STEPS = [
  {
    icon: "📦",
    title: "Expédier un colis",
    text: "Besoin d'envoyer un colis ? Touchez « Expédier » pour créer une livraison en quelques secondes.",
    color: "from-red-500 to-rose-600",
  },
  {
    icon: "📥",
    title: "Recevoir un colis",
    text: "Quelqu'un doit vous envoyer quelque chose ? Utilisez « Recevoir » pour demander un livreur.",
    color: "from-emerald-500 to-green-600",
  },
  {
    icon: "👤",
    title: "Déplacement",
    text: "Besoin d'un chauffeur ? « Déplacement » vous permet de réserver une course pour vous déplacer.",
    color: "from-sky-500 to-blue-600",
  },
  {
    icon: "💬",
    title: "Messages",
    text: "Communiquez avec vos livreurs et contacts SILGAPP via l'onglet « Messages ».",
    color: "from-purple-500 to-violet-600",
  },
  {
    icon: "🏪",
    title: "Boutiques & Restaurants",
    text: "Commandez depuis vos boutiques et restaurants préférés, livrés directement chez vous.",
    color: "from-orange-500 to-amber-600",
  },
  {
    icon: "⭐",
    title: "Votre avis compte",
    text: "Utilisez « Mon avis » pour noter votre expérience et aider SILGAPP à s'améliorer.",
    color: "from-indigo-500 to-purple-600",
  },
];

export default function ClientDashboardGuide() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(GUIDE_KEY);
    } catch {
      return true;
    }
  });
  const [step, setStep] = useState(0);

  const handleClose = () => {
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {}
    setOpen(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const current = STEPS[step];

  return (
    <>
      {/* Bouton d'aide persistant */}
      {!open && (
        <button
          onClick={() => { setStep(0); setOpen(true); }}
          className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900 active:scale-90 transition-all"
          aria-label="Guide d'utilisation"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
            onClick={handleClose}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">
                    {step + 1} / {STEPS.length}
                  </span>
                </div>
                <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={"h-1 flex-1 rounded-full transition-colors " + (i <= step ? "bg-primary" : "bg-gray-200")}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="text-center py-2">
                <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${current.color} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  <span className="text-4xl">{current.icon}</span>
                </div>
                <h3 className="font-black text-gray-900 text-lg">{current.title}</h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{current.text}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors"
                  >
                    Retour
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex-1 h-11 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-1 hover:bg-primary/90 transition-colors"
                >
                  {step < STEPS.length - 1 ? "Suivant" : "Terminer"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Skip */}
              {step < STEPS.length - 1 && (
                <button
                  onClick={handleClose}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium"
                >
                  Passer le guide
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}