import React from "react";
import { Flame, MapPin, X, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Bannière affichée lorsqu'un livreur clique sur une notification "Zone chaude".
 * Montre le nom de la zone, le nombre de courses disponibles, et un bouton
 * pour ouvrir la navigation GPS vers la zone.
 *
 * Ne dépend pas du Dispatch V2 ni des notifications nouvelle_course.
 */
export default function ZoneChaudeAlert({ zone, onClose }) {
  if (!zone) return null;

  const niveauLabel = zone.niveau === "tres_forte" ? "Très forte demande" : "Forte demande";
  const niveauColor = zone.niveau === "tres_forte" ? "#ef4444" : "#f97316";
  const mapsUrl = zone.lat && zone.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${zone.lat},${zone.lng}`
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.25 }}
        className="fixed top-0 left-0 right-0 z-50 px-3 pt-3"
      >
        <div
          className="rounded-2xl shadow-lg border-2 overflow-hidden bg-white"
          style={{ borderColor: niveauColor }}
        >
          <div className="flex items-start gap-3 p-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${niveauColor}20` }}
            >
              <Flame className="w-5 h-5" style={{ color: niveauColor }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-black text-sm text-gray-900 truncate">{zone.nom}</p>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `${niveauColor}20`, color: niveauColor }}
                >
                  {niveauLabel}
                </span>
              </div>
              <p className="text-xs text-gray-600">
                {zone.nb_courses} course{zone.nb_courses > 1 ? "s" : ""} disponible{zone.nb_courses > 1 ? "s" : ""} dans cette zone.
                Rapprochez-vous pour augmenter vos chances de courses.
              </p>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-white px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: niveauColor }}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Y aller
                </a>
              )}
            </div>

            <button
              onClick={onClose}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}