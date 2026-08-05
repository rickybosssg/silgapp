import React, { useMemo } from "react";
import { Clock, AlertTriangle, MapPin, Zap } from "lucide-react";

/**
 * Carte "Santé du dispatch" — remplace l'ancienne section Téléchargements.
 * Affiche 4 indicateurs actionnables :
 *  - Temps moyen d'acceptation des courses du jour
 *  - Courses bloquées > 5 min sans livreur
 *  - % de livreurs "disponible" avec GPS frais (< 30 min)
 *  - Nombre de livreurs exclus du dispatch pour GPS périmé
 *
 * Reçoit les données déjà chargées par le tableau de bord (pas de requête dédiée).
 */
export default function DispatchHealthPanel({ courses = [], livreurs = [] }) {
  const GPS_FRESH_MS = 30 * 60 * 1000; // 30 min — seuil du moteur de dispatch
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

  // 1. Temps moyen d'acceptation (des courses du jour ayant été acceptées)
  const tempsMoyenAcceptation = useMemo(() => {
    const today = courses.filter(c => {
      const d = new Date(c.created_date);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    const withAccept = today.filter(c => c.heure_sollicitation && c.heure_acceptation);
    if (withAccept.length === 0) return null;
    const totalSec = withAccept.reduce((sum, c) => {
      const diff = new Date(c.heure_acceptation).getTime() - new Date(c.heure_sollicitation).getTime();
      return sum + Math.max(0, diff);
    }, 0);
    return Math.round(totalSec / withAccept.length / 1000); // secondes
  }, [courses]);

  // 2. Courses bloquées > 5 min en recherche_livreur sans acceptation
  const coursesBloquees = useMemo(() => {
    const now = Date.now();
    return courses.filter(c => {
      if (!["recherche_livreur", "nouvelle"].includes(c.statut)) return false;
      if (!c.dispatch_status || ["accepte", "cycle_epuise"].includes(c.dispatch_status)) return false;
      const ageMs = now - new Date(c.created_date).getTime();
      return ageMs > STUCK_THRESHOLD_MS;
    });
  }, [courses]);

  // 3. & 4. Qualité GPS des livreurs "disponible"
  const gpsStats = useMemo(() => {
    const now = Date.now();
    const dispos = livreurs.filter(l =>
      l.statut === "disponible" &&
      l.validation === "valide" &&
      l.actif !== false
    );
    const fresh = dispos.filter(l => {
      if (!l.derniere_position_date) return false;
      return (now - new Date(l.derniere_position_date).getTime()) < GPS_FRESH_MS;
    });
    const pct = dispos.length > 0 ? Math.round((fresh.length / dispos.length) * 100) : 0;
    return {
      total: dispos.length,
      fresh: fresh.length,
      stale: dispos.length - fresh.length,
      pct,
    };
  }, [livreurs]);

  const formatTemps = (sec) => {
    if (sec === null) return "—";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m${s.toString().padStart(2, "0")}`;
  };

  const tempsColor = tempsMoyenAcceptation === null
    ? "text-white/40"
    : tempsMoyenAcceptation < 60 ? "text-[#00a86b]"
    : tempsMoyenAcceptation < 180 ? "text-amber-400"
    : "text-red-400";

  const bloqueesColor = coursesBloquees.length === 0 ? "text-[#00a86b]"
    : coursesBloquees.length <= 2 ? "text-amber-400"
    : "text-red-400";

  const gpsColor = gpsStats.pct >= 80 ? "text-[#00a86b]"
    : gpsStats.pct >= 50 ? "text-amber-400"
    : "text-red-400";

  return (
    <div className="bg-[#1f2429] rounded-2xl border border-white/8 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Santé du dispatch</h3>
          <p className="text-[10px] text-white/40">Indicateurs temps réel</p>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Temps moyen d'acceptation */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Temps accept.
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${tempsColor}`}>
            {formatTemps(tempsMoyenAcceptation)}
          </p>
          <p className="text-[10px] text-white/40 mt-1">moyenne du jour</p>
        </div>

        {/* Courses bloquées */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Bloquées {">"}5min
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${bloqueesColor}`}>
            {coursesBloquees.length}
          </p>
          <p className="text-[10px] text-white/40 mt-1">sans livreur</p>
        </div>

        {/* % GPS frais */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <MapPin className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              GPS frais
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${gpsColor}`}>
            {gpsStats.pct}%
          </p>
          <p className="text-[10px] text-white/40 mt-1">
            {gpsStats.fresh}/{gpsStats.total} dispo
          </p>
        </div>

        {/* Exclus GPS périmé */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Exclus GPS
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${gpsStats.stale === 0 ? "text-[#00a86b]" : "text-amber-400"}`}>
            {gpsStats.stale}
          </p>
          <p className="text-[10px] text-white/40 mt-1">GPS {">"}30min</p>
        </div>
      </div>

      {/* Barre de santé globale */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
            Indice de santé global
          </span>
          <span className={`text-xs font-bold ${gpsColor}`}>
            {gpsStats.pct >= 80 && coursesBloquees.length === 0 ? "🟢 Optimal" : "🟡 À surveiller"}
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              gpsStats.pct >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : gpsStats.pct >= 50 ? "bg-gradient-to-r from-amber-400 to-orange-400"
              : "bg-gradient-to-r from-rose-400 to-red-500"
            }`}
            style={{ width: `${gpsStats.pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}