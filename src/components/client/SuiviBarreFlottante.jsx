import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Search, Bike, Box, Truck, CheckCircle2, User, MapPin } from "lucide-react";

function getBarContent(course) {
  const t = course.type_course;
  const s = course.statut;
  const isDeplacement = t === "deplacement";

  if (s === "nouvelle" || (s === "recherche_livreur" && !course.livreur_id)) {
    return { icon: Search, emoji: "🔍", text: "Recherche d'un livreur...", color: "bg-amber-500" };
  }
  if (s === "livreur_en_route" || s === "arrive_prise_en_charge") {
    if (isDeplacement && s === "arrive_prise_en_charge") {
      return { icon: MapPin, emoji: "📍", text: "Chauffeur arrivé au point de départ", color: "bg-blue-500" };
    }
    return { icon: Bike, emoji: "🛵", text: course.livreur_nom ? `${course.livreur_nom} arrive` : "Livreur en route", color: "bg-blue-500" };
  }
  if (s === "colis_recupere" || s === "passager_embarque" || s === "pris_en_charge") {
    return { icon: isDeplacement ? User : Box, emoji: isDeplacement ? "👤" : "📦", text: isDeplacement ? "Passager à bord" : "Colis récupéré", color: "bg-indigo-500" };
  }
  if (s === "en_livraison" || s === "arrivee") {
    return { icon: Truck, emoji: "🚚", text: "Votre colis est en route", color: "bg-purple-500" };
  }
  return { icon: CheckCircle2, emoji: "📦", text: "Course en cours", color: "bg-primary" };
}

export default function SuiviBarreFlottante({ course, onClick, etaMinutes }) {
  if (!course) return null;
  const content = getBarContent(course);

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
          {/* Progress line */}
          <div className="h-1 bg-gray-100">
            <motion.div
              className={`h-full ${content.color}`}
              initial={{ width: "10%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 8, repeat: Infinity, repeatType: "reverse" }}
            />
          </div>
          <div className="p-3.5 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${content.color} flex items-center justify-center flex-shrink-0`}>
              <content.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{content.text}</p>
              <p className="text-xs text-gray-500 truncate">
                {etaMinutes != null ? `${etaMinutes} min restantes` : course.adresse_arrivee || "Suivi de la course"}
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