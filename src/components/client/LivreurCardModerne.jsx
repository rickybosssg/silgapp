import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, MessageCircle, Star, Bike, TrendingUp, Calendar, Package, Award } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function LivreurCardModerne({ course, onCall, onMessage, onTrack }) {
  const [livreur, setLivreur] = useState(null);
  const [stats, setStats] = useState(null);

  const nom = course.livreur_nom || "Livreur";
  const photo = course.livreur_photo_url;
  const note = course.livreur_note_moyenne || livreur?.note_moyenne || 0;
  const nbAvis = course.livreur_nombre_avis || livreur?.nombre_avis || 0;
  const vehicule = course.livreur_vehicule || livreur?.vehicule || livreur?.type_vehicule || "moto";

  // Fetch full livreur entity + stats
  useEffect(() => {
    if (!course.livreur_id) return;
    let active = true;
    const fetchData = async () => {
      try {
        const l = await base44.entities.Livreur.get(course.livreur_id);
        if (!active) return;
        setLivreur(l);

        // Compter les livraisons terminées
        const coursesLivrees = await base44.entities.CourseExterne.filter({
          livreur_id: course.livreur_id,
          statut: "livree",
        });
        const coursesAnnulees = await base44.entities.CourseExterne.filter({
          livreur_id: course.livreur_id,
          statut: "annulee",
        });
        if (!active) return;
        const total = (coursesLivrees?.length || 0) + (coursesAnnulees?.length || 0);
        const tauxReussite = total > 0 ? Math.round(((coursesLivrees?.length || 0) / total) * 100) : 100;
        setStats({
          totalLivraisons: coursesLivrees?.length || 0,
          tauxReussite,
        });
      } catch (e) {
        console.warn("[LivreurCard] Erreur fetch:", e.message);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [course.livreur_id]);

  // Ancienneté
  const anciennete = livreur?.created_date
    ? (() => {
        const diff = Date.now() - new Date(livreur.created_date).getTime();
        const mois = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
        if (mois >= 12) return `${Math.floor(mois / 12)} an${Math.floor(mois / 12) > 1 ? "s" : ""}`;
        if (mois > 0) return `${mois} mois`;
        return "Nouveau";
      })()
    : null;

  const vehiculeLabel = { moto: "Moto", velo: "Vélo", voiture: "Voiture", a_pied: "À pied" }[vehicule] || "Moto";

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
          {/* Badge véhicule */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center">
            <Bike className="w-3.5 h-3.5 text-gray-600" />
          </div>
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{nom}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {note > 0 && (
              <div className="flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-gray-700">{note.toFixed(1)}</span>
                {nbAvis > 0 && <span className="text-[10px] text-gray-400">({nbAvis})</span>}
              </div>
            )}
            <span className="text-[10px] text-gray-400">·</span>
            <span className="text-xs text-gray-500">{vehiculeLabel}</span>
          </div>
        </div>
      </div>

      {/* Stats enrichies */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {/* Total livraisons */}
        <div className="bg-gray-50 rounded-xl py-2 px-1 text-center">
          <Package className="w-3.5 h-3.5 text-blue-500 mx-auto mb-0.5" />
          <p className="text-sm font-black text-gray-900">{stats?.totalLivraisons ?? "—"}</p>
          <p className="text-[8px] text-gray-500 font-medium leading-tight">Livraisons</p>
        </div>
        {/* Taux de réussite */}
        <div className="bg-gray-50 rounded-xl py-2 px-1 text-center">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mx-auto mb-0.5" />
          <p className="text-sm font-black text-gray-900">{stats?.tauxReussite != null ? `${stats.tauxReussite}%` : "—"}</p>
          <p className="text-[8px] text-gray-500 font-medium leading-tight">Réussite</p>
        </div>
        {/* Ancienneté */}
        <div className="bg-gray-50 rounded-xl py-2 px-1 text-center">
          <Calendar className="w-3.5 h-3.5 text-purple-500 mx-auto mb-0.5" />
          <p className="text-sm font-black text-gray-900">{anciennete ?? "—"}</p>
          <p className="text-[8px] text-gray-500 font-medium leading-tight">Ancienneté</p>
        </div>
      </div>

      {/* Badge vérifié */}
      {livreur?.validation === "valide" && (
        <div className="flex items-center gap-1.5 mt-2">
          <Award className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[10px] font-semibold text-emerald-600">Livreur vérifié SILGAPP</span>
        </div>
      )}

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