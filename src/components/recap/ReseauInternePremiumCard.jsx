import React, { useState, useEffect, useRef } from "react";
import { Package, TrendingUp, Landmark, Users, Bike, Wifi, WifiOff, UserCheck, Clock, CheckCircle2, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Animated counter hook
function useAnimatedNumber(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;

    if (from === to) return;

    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return display;
}

const STAT_CONFIGS = [
  {
    key: "coursesLivrees",
    label: "Courses livrées",
    icon: Package,
    activeColor: "text-blue-600",
    activeBg: "bg-blue-50",
    activeBorder: "border-blue-200",
    iconColor: "text-blue-500",
  },
  {
    key: "totalEncaisse",
    label: "Encaissements",
    icon: TrendingUp,
    activeColor: "text-emerald-600",
    activeBg: "bg-emerald-50",
    activeBorder: "border-emerald-200",
    iconColor: "text-emerald-500",
    isMoney: true,
  },
  {
    key: "totalDuSILGAPP",
    label: "Dû à SILGAPP",
    icon: Landmark,
    activeColor: "text-orange-600",
    activeBg: "bg-orange-50",
    activeBorder: "border-orange-200",
    iconColor: "text-orange-500",
    isMoney: true,
  },
  {
    key: "disponibles",
    label: "Disponibles",
    icon: UserCheck,
    activeColor: "text-green-600",
    activeBg: "bg-green-50",
    activeBorder: "border-green-200",
    iconColor: "text-green-500",
  },
  {
    key: "enCourse",
    label: "En course",
    icon: Bike,
    activeColor: "text-blue-800",
    activeBg: "bg-blue-50",
    activeBorder: "border-blue-300",
    iconColor: "text-blue-700",
  },
  {
    key: "enLigne",
    label: "En ligne",
    icon: Wifi,
    activeColor: "text-green-700",
    activeBg: "bg-green-50",
    activeBorder: "border-green-200",
    iconColor: "text-green-600",
  },
  {
    key: "horsLigne",
    label: "Hors ligne",
    icon: WifiOff,
    activeColor: "text-gray-500",
    activeBg: "bg-gray-50",
    activeBorder: "border-gray-200",
    iconColor: "text-gray-400",
  },
  {
    key: "totalLivreurs",
    label: "Total livreurs",
    icon: Users,
    activeColor: "text-violet-600",
    activeBg: "bg-violet-50",
    activeBorder: "border-violet-200",
    iconColor: "text-violet-500",
  },
  {
    key: "paiementsValides",
    label: "Paiements validés",
    icon: CheckCircle2,
    activeColor: "text-emerald-700",
    activeBg: "bg-emerald-50",
    activeBorder: "border-emerald-200",
    iconColor: "text-emerald-600",
  },
  {
    key: "paiementsEnAttente",
    label: "Paiements en attente",
    icon: Clock,
    activeColor: "text-orange-600",
    activeBg: "bg-orange-50",
    activeBorder: "border-orange-200",
    iconColor: "text-orange-500",
  },
];

function StatCard({ config, value }) {
  const animated = useAnimatedNumber(typeof value === "number" ? value : 0);
  const isZero = value === 0 || value === "0";
  const Icon = config.icon;

  const displayValue = config.isMoney
    ? (typeof value === "number" ? animated.toLocaleString() : value)
    : (typeof value === "number" ? animated : value);

  return (
    <motion.div
      layout
      className={`
        relative flex flex-col items-center justify-center p-4 rounded-2xl border bg-white shadow-sm
        transition-all duration-300
        ${isZero ? "border-gray-100" : config.activeBorder}
        ${isZero ? "bg-white" : config.activeBg}
      `}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2
        ${isZero ? "bg-gray-100" : "bg-white shadow-sm border " + config.activeBorder}
      `}>
        <Icon className={`w-5 h-5 ${isZero ? "text-gray-300" : config.iconColor}`} />
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={displayValue}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={`text-3xl font-black leading-none ${isZero ? "text-gray-300" : config.activeColor}`}
        >
          {displayValue}
        </motion.span>
      </AnimatePresence>
      {config.isMoney && !isZero && (
        <span className={`text-[10px] font-semibold ${config.activeColor} opacity-70 mt-0.5`}>FCFA</span>
      )}
      <p className={`text-xs mt-1.5 font-medium text-center leading-tight ${isZero ? "text-gray-300" : "text-gray-500"}`}>
        {config.label}
      </p>
    </motion.div>
  );
}

export default function ReseauInternePremiumCard({ livreurs, coursesLivrees }) {
  const totalLivreurs = livreurs.length;
  const enLigne = livreurs.filter(l => l.statut === "disponible" || l.statut === "en_course").length;
  const disponibles = livreurs.filter(l => l.statut === "disponible").length;
  const enCourse = livreurs.filter(l => l.statut === "en_course").length;
  const horsLigne = livreurs.filter(l => l.statut === "hors_ligne" || !l.statut).length;
  const paiementsValides = livreurs.filter(l => l.statut_paiement === "paye").length;
  const paiementsEnAttente = livreurs.filter(l => l.statut_paiement !== "paye").length;

  const totalEncaisse = coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || c.prix || 0), 0);
  const totalDuSILGAPP = totalEncaisse;
  const netLivreurs = Math.round(totalEncaisse * 0.7);

  const stats = {
    coursesLivrees: coursesLivrees.length,
    totalEncaisse,
    totalDuSILGAPP,
    disponibles,
    enCourse,
    enLigne,
    horsLigne,
    totalLivreurs,
    paiementsValides,
    paiementsEnAttente,
  };

  return (
    <div className="bg-white rounded-3xl border border-blue-100 shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white font-black text-lg tracking-wide">SILGAPP INTERNE</h2>
          </div>
          <p className="text-blue-200 text-xs mt-1">{totalLivreurs} livreur{totalLivreurs > 1 ? "s" : ""} enregistré{totalLivreurs > 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white text-xs font-semibold">Temps réel</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_CONFIGS.map(cfg => (
          <StatCard key={cfg.key} config={cfg} value={stats[cfg.key]} />
        ))}
      </div>

      {/* Financial banner */}
      <div className="mx-4 mb-4 bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-yellow-400" />
          <span className="text-white font-bold text-sm">Bilan financier</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Encaissements</p>
            <p className="text-emerald-400 font-black text-lg leading-none">{totalEncaisse.toLocaleString()}</p>
            <p className="text-gray-500 text-[10px]">FCFA</p>
          </div>
          <div className="text-center border-x border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Dû à SILGAPP</p>
            <p className="text-orange-400 font-black text-lg leading-none">{totalDuSILGAPP.toLocaleString()}</p>
            <p className="text-gray-500 text-[10px]">FCFA</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Net livreurs</p>
            <p className="text-blue-400 font-black text-lg leading-none">{netLivreurs.toLocaleString()}</p>
            <p className="text-gray-500 text-[10px]">FCFA</p>
          </div>
        </div>
      </div>
    </div>
  );
}