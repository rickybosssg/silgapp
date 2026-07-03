import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";

const ONBOARDING_KEY = "venus_onboarding_seen";

export default function VenusOnboardingTooltip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-24 right-6 z-50 w-72 max-w-[calc(100vw-3rem)]"
        >
          <div className="relative bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden">
            <button
              onClick={dismiss}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center z-10"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-black text-white text-sm">Rencontrez VENUS</h3>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-gray-600 leading-relaxed">
                Votre assistante IA SILGAPP est là pour vous aider 24h/24 :
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-purple-500 font-bold">📦</span>
                  <span>Créer et suivre vos courses</span>
                </li>
                <li className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-purple-500 font-bold">💰</span>
                  <span>Estimer les prix automatiquement</span>
                </li>
                <li className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-purple-500 font-bold">🚚</span>
                  <span>Suivre vos livraisons en temps réel</span>
                </li>
                <li className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-purple-500 font-bold">💬</span>
                  <span>Répondre à toutes vos questions</span>
                </li>
              </ul>
              <button
                onClick={dismiss}
                className="w-full h-9 mt-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold hover:opacity-90 transition-opacity"
              >
                J'ai compris !
              </button>
            </div>
            {/* Flèche pointant vers le bas */}
            <div className="absolute -bottom-2 right-8 w-4 h-4 bg-white rotate-45 border-r border-b border-purple-100" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}