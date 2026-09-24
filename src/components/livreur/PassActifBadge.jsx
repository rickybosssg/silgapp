import React, { useState, useEffect } from "react";
import { useDashboardTheme } from "./DashboardThemeProvider";

function formatRemaining(ms) {
  if (ms <= 0) return "Expiré";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (days > 0) return `${days}j ${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h ${mins}min ${secs}s`;
  if (mins > 0) return `${mins}min ${secs}s`;
  return `${secs}s`;
}

export default function PassActifBadge() {
  const { passActif } = useDashboardTheme();
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!passActif?.expiration_at) return;
    const update = () => {
      const ms = new Date(passActif.expiration_at).getTime() - Date.now();
      setRemaining(formatRemaining(ms));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [passActif?.expiration_at]);

  if (!passActif) return null;

  return (
    <div className="bg-gradient-to-r from-red-600 to-red-500 rounded-2xl p-4 text-white shadow-lg shadow-red-200">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">🔥</span>
        <div>
          <p className="font-black text-sm">ZÉRO COMMISSION ACTIF</p>
          <p className="text-xs opacity-90">🎫 {passActif.nom || "Pass"}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs opacity-80">Commission actuelle</p>
          <p className="text-2xl font-black">0 %</p>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-80">⏱️ Expire dans</p>
          <p className="text-sm font-bold">{remaining}</p>
        </div>
      </div>
    </div>
  );
}