import React, { useState, useEffect } from "react";
import { useDashboardTheme } from "./DashboardThemeProvider";

function formatRemaining(ms) {
  if (ms <= 0) return "Terminé";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}min`;
  if (mins > 0) return `${mins}min ${secs}s`;
  return `${secs}s`;
}

export default function HappyHourBadge() {
  const { happyHourActif, passActif } = useDashboardTheme();
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!happyHourActif?.fin_at) return;
    const update = () => {
      const ms = new Date(happyHourActif.fin_at).getTime() - Date.now();
      setRemaining(formatRemaining(ms));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [happyHourActif?.fin_at]);

  if (!happyHourActif) return null;

  return (
    <div className="bg-gradient-to-r from-red-600 to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-red-200">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">🔥</span>
        <div>
          <p className="font-black text-sm">HAPPY HOUR EN COURS</p>
          <p className="text-xs opacity-90">{happyHourActif.nom || ""}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs opacity-80">Commission actuelle</p>
          <p className="text-2xl font-black">{happyHourActif.taux ?? 0} %</p>
          <p className="text-xs opacity-80">Gardez 100% de vos gains</p>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-80">⏱️ Fin dans</p>
          <p className="text-sm font-bold">{remaining}</p>
        </div>
      </div>
      {passActif && (
        <div className="mt-2 pt-2 border-t border-white/20">
          <p className="text-xs opacity-90">🎫 Votre Pass Zéro Commission est également actif</p>
        </div>
      )}
    </div>
  );
}