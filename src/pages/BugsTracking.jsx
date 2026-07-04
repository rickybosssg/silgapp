import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bug, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITY_CONFIG = {
  critique: { label: "Critique", color: "bg-red-500", text: "text-red-600", border: "border-red-200", bg: "bg-red-50" },
  elevee: { label: "Élevée", color: "bg-orange-500", text: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50" },
  moyenne: { label: "Moyenne", color: "bg-yellow-500", text: "text-yellow-600", border: "border-yellow-200", bg: "bg-yellow-50" },
  faible: { label: "Faible", color: "bg-green-500", text: "text-green-600", border: "border-green-200", bg: "bg-green-50" },
};

const STATUS_CONFIG = {
  nouveau: { label: "Nouveau", color: "bg-blue-100 text-blue-700" },
  en_cours: { label: "En cours", color: "bg-amber-100 text-amber-700" },
  corrige: { label: "Corrigé", color: "bg-emerald-100 text-emerald-700" },
  ignore: { label: "Ignoré", color: "bg-gray-100 text-gray-500" },
};

export default function BugsTracking() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("nouveau");

  const { data: bugs = [], isLoading } = useQuery({
    queryKey: ["bugs-signales", filter],
    queryFn: () => base44.entities.BugSignale.filter(
      filter === "all" ? {} : { statut: filter },
      "-derniere_occurrence",
      200
    ),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => ({
    total: bugs.length,
    nouveau: bugs.filter(b => b.statut === "nouveau").length,
    critique: bugs.filter(b => b.priorite === "critique" && b.statut !== "corrige").length,
    corrige: bugs.filter(b => b.statut === "corrige").length,
  }), [bugs]);

  const handleAction = async (bugId, statut) => {
    try {
      await base44.entities.BugSignale.update(bugId, {
        statut,
        date_correction: statut === "corrige" ? new Date().toISOString() : null,
      });
      queryClient.invalidateQueries({ queryKey: ["bugs-signales"] });
      toast.success(statut === "corrige" ? "Bug marqué comme corrigé ✓" : "Bug ignoré");
    } catch (err) {
      toast.error("Erreur: " + (err?.message || ""));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
            <Bug className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">Suivi des bugs</h1>
            <p className="text-xs text-gray-500">Erreurs capturées automatiquement sur la plateforme</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <div className="text-2xl font-black text-gray-900">{stats.total}</div>
            <div className="text-[10px] font-bold uppercase text-gray-400">Total</div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <div className="text-2xl font-black text-blue-500">{stats.nouveau}</div>
            <div className="text-[10px] font-bold uppercase text-gray-400">Nouveaux</div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <div className="text-2xl font-black text-red-500">{stats.critique}</div>
            <div className="text-[10px] font-bold uppercase text-gray-400">Critiques</div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <div className="text-2xl font-black text-emerald-500">{stats.corrige}</div>
            <div className="text-[10px] font-bold uppercase text-gray-400">Corrigés</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {[
            { id: "nouveau", label: "🔵 Nouveaux" },
            { id: "en_cours", label: "⏳ En cours" },
            { id: "critique", label: "🔴 Critiques", custom: true },
            { id: "corrige", label: "✅ Corrigés" },
            { id: "all", label: "Tous" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                filter === f.id ? "bg-slate-900 text-white" : "bg-white text-gray-500 border border-gray-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bug list */}
        {isLoading ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center">
            <p className="text-sm text-gray-400">Chargement...</p>
          </div>
        ) : bugs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700">Aucun bug dans cette catégorie 🎉</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {bugs.map((bug) => {
              const pConfig = PRIORITY_CONFIG[bug.priorite] || PRIORITY_CONFIG.moyenne;
              const sConfig = STATUS_CONFIG[bug.statut] || STATUS_CONFIG.nouveau;
              const isResolved = bug.statut === "corrige" || bug.statut === "ignore";
              const displayBug = filter === "critique" ? bug : bug; // filter logic handled by query

              return (
                <div key={bug.id} className={cn("rounded-2xl border shadow-sm overflow-hidden transition-all", pConfig.border, isResolved && "opacity-60")}>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", pConfig.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white", pConfig.color)}>
                            {pConfig.label}
                          </span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", sConfig.color)}>
                            {sConfig.label}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400 uppercase">
                            {bug.type_erreur}
                          </span>
                          {bug.occurrences > 1 && (
                            <span className="text-[10px] font-bold text-orange-600 flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> {bug.occurrences}x
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-900 break-words">{bug.message}</p>
                        {bug.fichier && (
                          <p className="text-[11px] text-gray-400 mt-1 font-mono truncate">
                            {bug.fichier}{bug.ligne ? `:${bug.ligne}` : ""}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {bug.derniere_occurrence ? new Date(bug.derniere_occurrence).toLocaleString("fr-FR") : "—"}
                          </span>
                          {bug.user_type && bug.user_type !== "anonyme" && (
                            <span className="font-semibold uppercase">{bug.user_type}</span>
                          )}
                          {bug.page_url && (
                            <span className="truncate max-w-[150px]">{new URL(bug.page_url, window.location.origin).pathname}</span>
                          )}
                        </div>
                        {bug.stack && (
                          <details className="mt-2">
                            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Stack trace</summary>
                            <pre className="text-[10px] text-gray-500 mt-1 whitespace-pre-wrap break-all bg-gray-50 rounded-lg p-2 max-h-40 overflow-y-auto">{bug.stack}</pre>
                          </details>
                        )}
                      </div>
                    </div>

                    {!isResolved && (
                      <div className="flex gap-2 mt-3 pl-5">
                        <button
                          onClick={() => handleAction(bug.id, "corrige")}
                          className="flex-1 h-8 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-700 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Marquer corrigé
                        </button>
                        <button
                          onClick={() => handleAction(bug.id, "ignore")}
                          className="flex-1 h-8 rounded-xl bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center gap-1 hover:bg-gray-300 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Ignorer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}