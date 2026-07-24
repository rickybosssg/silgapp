import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Search, Bike, Box, Truck, CheckCircle2, User, MapPin, Navigation } from "lucide-react";

const REASSURANCE_MESSAGES = {
  recherche: [
    "🔍 Nous recherchons le meilleur livreur...",
    "🛵 Un livreur consulte votre demande...",
    "⚡ Mise en relation en cours...",
  ],
  en_route: [
    "🛵 Le livreur est en route vers vous.",
    "📍 Il arrive bientôt.",
    "📦 Préparez votre colis.",
  ],
  recupere: [
    "📦 Votre colis est entre de bonnes mains.",
    "✨ Le livreur a bien récupéré votre colis.",
  ],
  livraison: [
    "🚚 Votre colis est en route vers la destination.",
    "📍 Le livreur se rapproche de l'arrivée.",
    "🎉 Bientôt livré !",
  ],
};

function getBarContent(course) {
  const t = course.type_course;
  const s = course.statut;
  const isDeplacement = t === "deplacement";

  if (s === "nouvelle" || (s === "recherche_livreur" && !course.livreur_id)) {
    return { icon: Search, emoji: "🔍", text: "Recherche d'un livreur...", color: "bg-amber-500", phase: "recherche" };
  }
  if (s === "livreur_en_route" || s === "arrive_prise_en_charge") {
    if (isDeplacement && s === "arrive_prise_en_charge") {
      return { icon: MapPin, emoji: "📍", text: "Chauffeur arrivé au point de départ", color: "bg-blue-500", phase: "en_route" };
    }
    return { icon: Bike, emoji: "🛵", text: course.livreur_nom ? `${course.livreur_nom} arrive` : "Livreur en route", color: "bg-blue-500", phase: "en_route" };
  }
  if (s === "colis_recupere" || s === "passager_embarque" || s === "pris_en_charge") {
    return { icon: isDeplacement ? User : Box, emoji: isDeplacement ? "👤" : "📦", text: isDeplacement ? "Passager à bord" : "Colis récupéré", color: "bg-indigo-500", phase: "recupere" };
  }
  if (s === "en_livraison" || s === "arrivee") {
    return { icon: Truck, emoji: "🚚", text: "Votre colis est en route", color: "bg-purple-500", phase: "livraison" };
  }
  return { icon: CheckCircle2, emoji: "📦", text: "Course en cours", color: "bg-primary", phase: "recherche" };
}

export default function SuiviBarreFlottante({ course, onClick, etaMinutes }) {
  const [msgIdx, setMsgIdx] = useState(0);

  const content = getBarContent(course);
  const messages = REASSURANCE_MESSAGES[content.phase] || [];

  // Rotation des messages rassurants
  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % messages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [content.phase]);

  if (!course) return null;
  const reassuranceMsg = messages[msgIdx] || content.text;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[env(safe-area-inset-bottom)]"
        onClick={onClick}
      >
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform">
          {/* Progress line animée */}
          <div className="h-1 bg-gray-100">
            <motion.div
              className={`h-full ${content.color}`}
              initial={{ width: "10%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 8, repeat: Infinity, repeatType: "reverse" }}
            />
          </div>
          <div className="p-3.5 flex items-center gap-3">
            {/* Icône animée */}
            <motion.div
              key={content.phase}
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`w-10 h-10 rounded-xl ${content.color} flex items-center justify-center flex-shrink-0`}
            >
              <content.icon className="w-5 h-5 text-white" />
            </motion.div>
            <div className="flex-1 min-w-0">
              {/* Texte principal qui change avec animation */}
              <AnimatePresence mode="wait">
                <motion.p
                  key={reassuranceMsg}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm font-bold text-gray-900"
                >
                  {reassuranceMsg}
                </motion.p>
              </AnimatePresence>
              <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                {etaMinutes != null && (
                  <>
                    <Navigation className="w-3 h-3" />
                    {etaMinutes} min restantes
                  </>
                )}
                {etaMinutes == null && (course.adresse_arrivee || "Suivi de la course")}
              </p>
            </div>
            <div className="flex items-center gap-1 text-primary">
              <span className="text-xs font-bold">Suivre</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}