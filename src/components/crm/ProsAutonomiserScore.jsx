import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Target, Flame, CircleDot, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProsAutonomiserScore — Charge et affiche le score CRM "Pros à autonomiser"
 * pour les clients "Sans App" (sans user_email).
 *
 * Le score est calculé côté backend (getProsAutonomiser) à partir des données
 * de courses réelles. Aucune donnée historique n'est modifiée.
 *
 * Niveaux :
 *   priorite_forte (🔥) : score ≥ 10 — à autonomiser en priorité
 *   potentiel (🟠)      : score 6-9
 *   occasionnel (⚪)    : score < 6
 *
 * Les clients avec user_email (déjà app) ne sont pas scorés.
 */
export default function ProsAutonomiserScore({ onProsLoaded }) {
  const [showDetails, setShowDetails] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pros-autonomiser"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getProsAutonomiser", {});
      return res?.data || res;
    },
    refetchInterval: 120000,
  });

  // Map client_id → score pour utilisation par le parent
  const scoreMap = useMemo(() => {
    const m = new Map();
    if (data?.pros) {
      for (const p of data.pros) {
        m.set(p.client_id, p);
      }
    }
    return m;
  }, [data]);

  // Transmettre la map au parent
  useEffect(() => {
    if (onProsLoaded) onProsLoaded(scoreMap);
  }, [scoreMap, onProsLoaded]);

  const stats = data?.stats || {};

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500">Analyse des pros à autonomiser...</p>
      </div>
    );
  }

  if (!data || !data.pros || data.pros.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            <p className="text-sm font-bold text-slate-700">Pros à autonomiser</p>
          </div>
          <button
            onClick={() => setShowDetails(true)}
            className="text-xs font-bold text-blue-500 hover:underline"
          >
            Détails
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Éligibles</p>
            <p className="text-lg font-black text-slate-700">{stats.eligible || 0}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-red-600 uppercase">🔥 Forte</p>
            <p className="text-lg font-black text-red-700">{stats.priorite_forte || 0}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-amber-600 uppercase">🟠 Potent.</p>
            <p className="text-lg font-black text-amber-700">{stats.potentiel || 0}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-gray-500 uppercase">⚪ Occas.</p>
            <p className="text-lg font-black text-gray-600">{stats.occasionnel || 0}</p>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Score calculé à partir des courses réelles (volume, récurrence, départ récurrent, diversité destinations, % admin, fréquence, montant).
          Aucune donnée historique modifiée.
        </p>
      </div>

      {/* Modal détails */}
      {showDetails && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowDetails(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-4 flex items-center justify-between text-white">
              <div>
                <p className="text-sm font-black flex items-center gap-2"><Target className="w-4 h-4" /> Pros à autonomiser</p>
                <p className="text-[10px] opacity-80">{stats.eligible || 0} clients éligibles (Sans App + ≥2 courses)</p>
              </div>
              <button onClick={() => setShowDetails(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
              {data.pros.slice(0, 50).map((p, i) => (
                <div key={p.client_id} className={cn(
                  "rounded-xl border p-2.5",
                  p.niveau === "priorite_forte" ? "border-red-200 bg-red-50/50" :
                  p.niveau === "potentiel" ? "border-amber-200 bg-amber-50/50" :
                  "border-gray-200 bg-gray-50/50"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700 truncate">{i + 1}. {p.nom}</span>
                    <span className="text-xs font-black text-slate-600">{p.score} pts</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{p.nb_courses} courses</span>
                    <span>·</span>
                    <span>{p.pct_admin}% admin</span>
                    <span>·</span>
                    <span>{p.nb_destinations} dest.</span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">{p.raisons}</p>
                </div>
              ))}
              {data.pros.length > 50 && (
                <p className="text-center text-xs text-slate-400 py-2">
                  Affichage des 50 premiers sur {data.pros.length}
                </p>
              )}
            </div>
            <div className="border-t border-slate-100 p-3 bg-slate-50">
              <p className="text-[10px] text-slate-500 font-semibold mb-1">Critères de scoring :</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-slate-400">
                <span>≥3 courses: +1</span>
                <span>≥5 courses: +3</span>
                <span>≥10 courses: +5</span>
                <span>≥20 courses: +6</span>
                <span>≤30j récent: +3</span>
                <span>≤90j récent: +2</span>
                <span>départ ≥60%: +2</span>
                <span>départ ≥80%: +3</span>
                <span>≥3 destinations: +2</span>
                <span>≥5 destinations: +3</span>
                <span>≥50% admin: +2</span>
                <span>100% admin: +3</span>
                <span>fréquence ≤7j: +2</span>
                <span>fréquence ≤3j: +3</span>
                <span>montant ≥10k: +1</span>
                <span>montant ≥50k: +2</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Badge de niveau pour un client donné (utilisé dans la liste CRM).
 * Affiche 🔥 / 🟠 / ⚪ selon le score.
 */
export function ProsBadge({ scoreData }) {
  if (!scoreData) return null;
  const { niveau, score } = scoreData;
  if (niveau === "priorite_forte") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded" title={`Score: ${score} — ${scoreData.raisons}`}>
        <Flame className="w-2.5 h-2.5" /> {score}
      </span>
    );
  }
  if (niveau === "potentiel") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded" title={`Score: ${score} — ${scoreData.raisons}`}>
        <CircleDot className="w-2.5 h-2.5" /> {score}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-gray-400 bg-gray-50 px-1 py-0.5 rounded" title={`Score: ${score} — ${scoreData.raisons}`}>
      <Circle className="w-2.5 h-2.5" /> {score}
    </span>
  );
}