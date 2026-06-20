import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";

const NIVEAU_CONFIG = {
  information: {
    emoji: "",
    label: "Information",
    bg: "from-green-50 to-emerald-50",
    border: "border-green-300",
    headerBg: "bg-green-500",
    btnBg: "bg-green-500 hover:bg-green-600 shadow-green-200",
    icon: Info,
    iconColor: "text-green-600",
  },
  important: {
    emoji: "",
    label: "Important",
    bg: "from-orange-50 to-amber-50",
    border: "border-orange-300",
    headerBg: "bg-orange-500",
    btnBg: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
    icon: AlertTriangle,
    iconColor: "text-orange-500",
  },
  urgent: {
    emoji: "",
    label: "URGENT",
    bg: "from-red-50 to-rose-50",
    border: "border-red-400",
    headerBg: "bg-red-600",
    btnBg: "bg-red-600 hover:bg-red-700 shadow-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-600",
  },
};

// Clé localStorage pour suivre les "snooze" locaux (affichage temporaire)
const SNOOZE_KEY = "silgapp_alertes_snooze";

function getSnoozeMap() {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setSnooze(alerteId, minutes) {
  const map = getSnoozeMap();
  map[alerteId] = Date.now() + minutes * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

function isSnoozed(alerteId) {
  const map = getSnoozeMap();
  const until = map[alerteId];
  if (!until) return false;
  return Date.now() < until;
}

export default function AlertesLivreurModal({ livreurId, livreurNom, livreurReseau }) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch alertes actives selon le réseau
  const { data: alertes = [] } = useQuery({
    queryKey: ["alertes-actives", livreurReseau],
    queryFn: async () => {
      const toutes = await base44.entities.AlerteLivreur.filter({ actif: true }, "-created_date", 50);
      const now = new Date();
      return (toutes || []).filter(a => {
        // Filtrer par réseau
        if (a.reseau !== "tous" && a.reseau !== livreurReseau) return false;
        // Filtrer par expiration
        if (a.date_expiration && new Date(a.date_expiration) < now) return false;
        return true;
      });
    },
    refetchInterval: 60000, // Recheck toutes les minutes
    enabled: !!livreurId,
  });

  // Fetch lectures du livreur
  const { data: lectures = [] } = useQuery({
    queryKey: ["alertes-lectures", livreurId],
    queryFn: () => base44.entities.AlerteLecture.filter({ livreur_id: livreurId }, "-lue_at", 200),
    enabled: !!livreurId,
    refetchInterval: 60000,
  });

  // Mutation marquer comme lu
  const marquerLuMutation = useMutation({
    mutationFn: async (alerteId) => {
      await base44.entities.AlerteLecture.create({
        alerte_id: alerteId,
        livreur_id: livreurId,
        livreur_nom: livreurNom || "",
        livreur_reseau: livreurReseau || "externe",
        lue_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertes-lectures", livreurId] });
    },
  });

  // Alertes non lues et non snoozées
  const alertesNonLues = alertes.filter(a => {
    const dejaLue = lectures.some(l => l.alerte_id === a.id);
    if (dejaLue) return false;
    // Pour les alertes importantes, vérifier snooze
    if (a.niveau !== "urgent" && isSnoozed(a.id)) return false;
    return true;
  });

  const alerte = alertesNonLues[currentIndex] || alertesNonLues[0];

  const handleCompris = useCallback(() => {
    if (!alerte) return;
    marquerLuMutation.mutate(alerte.id);
    // Passer à la suivante
    setTimeout(() => {
      setCurrentIndex(0);
    }, 200);
  }, [alerte, marquerLuMutation]);

  // Réinitialiser index si la liste change
  useEffect(() => {
    setCurrentIndex(0);
  }, [alertesNonLues.length]);

  if (!alerte || alertesNonLues.length === 0) return null;

  const cfg = NIVEAU_CONFIG[alerte.niveau] || NIVEAU_CONFIG.information;
  const Icon = cfg.icon;
  const isUrgent = alerte.niveau === "urgent";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`absolute inset-0 ${isUrgent ? "bg-red-900/60" : "bg-black/50"} backdrop-blur-sm`}
          onClick={isUrgent ? undefined : handleCompris}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`relative w-full max-w-sm rounded-3xl border-2 ${cfg.border} bg-gradient-to-br ${cfg.bg} shadow-2xl overflow-hidden`}
        >
          {/* Header coloré */}
          <div className={`${cfg.headerBg} px-5 py-4 flex items-center gap-3`}>
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base">{cfg.emoji}</span>
                <span className="text-xs font-black text-white/80 uppercase tracking-wider">{cfg.label}</span>
                {isUrgent && (
                  <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                    ACTION REQUISE
                  </span>
                )}
              </div>
              <p className="text-white font-black text-base leading-tight mt-0.5 truncate">{alerte.titre}</p>
            </div>
            {alertesNonLues.length > 1 && (
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black">{alertesNonLues.length}</span>
              </div>
            )}
          </div>

          {/* Corps */}
          <div className="px-5 py-5">
            <p className="text-gray-800 text-sm leading-relaxed font-medium whitespace-pre-wrap">
              {alerte.message}
            </p>

            {/* Compteur si plusieurs alertes */}
            {alertesNonLues.length > 1 && (
              <p className="text-xs text-gray-400 mt-3 text-center font-medium">
                Alerte {(currentIndex % alertesNonLues.length) + 1} sur {alertesNonLues.length}
              </p>
            )}
          </div>

          {/* Bouton Compris */}
          <div className="px-5 pb-5">
            <button
              onClick={handleCompris}
              disabled={marquerLuMutation.isPending}
              className={`w-full h-14 rounded-2xl ${cfg.btnBg} text-white font-black text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2.5 disabled:opacity-60`}
            >
              <CheckCircle className="w-5 h-5" />
               Compris
            </button>

            {/* Info urgent : pas de fermeture sans clic */}
            {isUrgent && (
              <p className="text-center text-xs text-red-600 font-semibold mt-2.5">
                 Vous devez appuyer sur "Compris" pour continuer
              </p>
            )}
          </div>

          {/* Indicateurs de niveaux */}
          {alertesNonLues.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-4">
              {alertesNonLues.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === currentIndex % alertesNonLues.length
                      ? "w-5 bg-gray-600"
                      : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}