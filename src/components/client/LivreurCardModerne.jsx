import React from "react";
import { motion } from "framer-motion";
import { Phone, MessageCircle, Star, Bike, MapPin } from "lucide-react";

export default function LivreurCardModerne({ course, onCall, onMessage, onTrack }) {
  const nom = course.livreur_nom || "Livreur";
  const photo = course.livreur_photo_url;
  const note = course.livreur_note_moyenne || 0;
  const nbAvis = course.livreur_nombre_avis || 0;
  const vehicule = course.livreur_vehicule || "Moto";

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4"
    >
      <div className="flex items-center gap-3">
        {/* Photo */}
        <div className="relative flex-shrink-0">
          {photo ? (
            <img src={photo} alt={nom} className="w-14 h-14 rounded-2xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center">
              <span className="text-xl font-black text-white">{nom.charAt(0).toUpperCase()}</span>
            </div>
          )}
          {/* Badge véhi */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center">
            <Bike className="w-3.5 h-3.5 text-gray-600" />
          </div>
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{nom}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {note > 0 && (
              <div className="flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-gray-700">{note.toFixed(1)}</span>
                {nbAvis > 0 && <span className="text-[10px] text-gray-400">({nbAvis})</span>}
              </div>
            )}
            <span className="text-[10px] text-gray-400">·</span>
            <span className="text-xs text-gray-500">{vehicule}</span>
          </div>
        </div>

        {/* Bouton track */}
        {onTrack && (
          <button
            onClick={onTrack}
            className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <MapPin className="w-5 h-5 text-blue-600" />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onCall}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 active:scale-95 transition-transform"
        >
          <Phone className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">Appeler</span>
        </button>
        <button
          onClick={onMessage}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 active:scale-95 transition-transform"
        >
          <MessageCircle className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-blue-700">Discuter</span>
        </button>
      </div>
    </motion.div>
  );
}