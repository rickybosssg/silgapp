import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Check, X, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRIORITY_CONFIG = {
  critique: { label: "Critique", color: "bg-red-500", text: "text-red-600", border: "border-red-200", bg: "bg-red-50" },
  elevee: { label: "Élevée", color: "bg-orange-500", text: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50" },
  moyenne: { label: "Moyenne", color: "bg-yellow-500", text: "text-yellow-600", border: "border-yellow-200", bg: "bg-yellow-50" },
  faible: { label: "Faible", color: "bg-green-500", text: "text-green-600", border: "border-green-200", bg: "bg-green-50" },
};

const CATEGORY_LABELS = {
  bug: "Bug", performance: "Performance", design: "Design", ux: "UX",
  dispatch: "Dispatch", notifications: "Notifications", gps: "GPS",
  securite: "Sécurité", architecture: "Architecture", evolution: "Évolution",
  processus_metier: "Processus",
};

function RecCard({ rec, onAction, index }) {
  const [expanded, setExpanded] = useState(false);
  const config = PRIORITY_CONFIG[rec.priorite] || PRIORITY_CONFIG.moyenne;
  const isTreated = rec.statut === "appliquee" || rec.statut === "ignoree";

  return (
    <div className={cn("rounded-2xl border shadow-sm overflow-hidden transition-all", config.border, isTreated && "opacity-60")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-black text-gray-300 flex-shrink-0">#{index}</span>
            <span className={cn("text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white", config.color)}>
              {config.label}
            </span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase">
              {CATEGORY_LABELS[rec.categorie] || rec.categorie}
            </span>
            {rec.statut === "appliquee" && (
              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Appliquée
              </span>
            )}
            {rec.statut === "ignoree" && (
              <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                <X className="w-3 h-3" /> Ignorée
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-gray-900 leading-tight">{rec.titre}</h4>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{rec.probleme}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 bg-gray-50/50">
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Problème</p>
            <p className="text-xs text-gray-700">{rec.probleme}</p>
          </div>
          {rec.raison && (
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Raison</p>
              <p className="text-xs text-gray-700">{rec.raison}</p>
            </div>
          )}
          {rec.impact && (
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Impact</p>
              <p className="text-xs text-gray-700">{rec.impact}</p>
            </div>
          )}
          {rec.solution && (
            <div className={cn("rounded-xl p-3", config.bg)}>
              <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Solution recommandée</p>
              <p className="text-xs text-gray-800 font-medium">{rec.solution}</p>
            </div>
          )}
          {rec.benefices && (
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Bénéfices attendus</p>
              <p className="text-xs text-emerald-700 font-medium">{rec.benefices}</p>
            </div>
          )}

          {rec.statut === "nouvelle" || rec.statut === "lue" ? (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onAction(rec.id, "appliquee")}
                className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Marquer appliquée
              </button>
              <button
                onClick={() => onAction(rec.id, "ignoree")}
                className="flex-1 h-9 rounded-xl bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Ignorer
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function NeoRecommendationsList({ recommendations, onAction, filter, onFilterChange }) {
  const filters = [
    { id: "all", label: "Toutes", count: recommendations.length },
    { id: "nouvelle", label: "Non lues", count: recommendations.filter(r => r.statut === "nouvelle").length },
    { id: "critique", label: "🔴 Critiques", count: recommendations.filter(r => r.priorite === "critique").length },
    { id: "appliquee", label: "✓ Appliquées", count: recommendations.filter(r => r.statut === "appliquee").length },
  ];

  const filtered = recommendations.filter(r => {
    if (filter === "all") return true;
    if (filter === "nouvelle") return r.statut === "nouvelle";
    if (filter === "appliquee") return r.statut === "appliquee";
    return r.priorite === filter;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
              filter === f.id ? "bg-slate-900 text-white" : "bg-white text-gray-500 border border-gray-200"
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400">Aucune recommandation dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((rec, idx) => (
            <RecCard key={rec.id} rec={rec} onAction={onAction} index={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}