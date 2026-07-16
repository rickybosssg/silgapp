import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, Filter, Activity, Clock, User, MapPin, Ban, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const EVENEMENT_STYLES = {
  vague: { label: "Vague envoyée", color: "bg-blue-100 text-blue-700", icon: Activity },
  cycle_epuise: { label: "Cycle épuisé", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  reset: { label: "Reset cycle", color: "bg-purple-100 text-purple-700", icon: RefreshCw },
  aucun_livreur: { label: "Aucun livreur", color: "bg-red-100 text-red-700", icon: Ban },
  acceptation: { label: "Acceptation", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  refus: { label: "Refus", color: "bg-gray-100 text-gray-700", icon: Ban },
  expiration: { label: "Expiration", color: "bg-amber-100 text-amber-700", icon: Clock },
};

const PICKUP_LABELS = {
  gps: "GPS précis",
  quartier: "Quartier",
  ville: "Ville",
  none: "Aucun (tri par fraîcheur)",
  "": "—",
};

function formatHeure(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return dateStr; }
}

function LogCard({ log }) {
  const [expanded, setExpanded] = useState(false);
  const style = EVENEMENT_STYLES[log.evenement] || EVENEMENT_STYLES.vague;
  const Icon = style.icon;

  let livreursSelectionnes = [];
  try { livreursSelectionnes = JSON.parse(log.livreurs_selectionnes || "[]"); } catch {}

  let ordreTri = [];
  try { ordreTri = JSON.parse(log.ordre_tri || "[]"); } catch {}

  let raisonsExclusion = [];
  try { raisonsExclusion = JSON.parse(log.raisons_exclusion || "[]"); } catch {}

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${style.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.color}`}>{style.label}</span>
            <span className="text-xs text-gray-500">Vague {log.vague}</span>
            {log.pickup_source && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />{PICKUP_LABELS[log.pickup_source] || log.pickup_source}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            <Clock className="w-3 h-3 inline mr-1" />{formatHeure(log.heure)}
            <span className="ml-2 font-mono text-gray-400">{log.course_id?.slice(-8)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {log.livreur_acceptant_nom && (
            <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <User className="w-3 h-3" />{log.livreur_acceptant_nom}
              {log.temps_avant_acceptation_sec != null && (
                <span className="text-gray-500 ml-1">({log.temps_avant_acceptation_sec}s)</span>
              )}
            </span>
          )}
          {log.total_candidats > 0 && (
            <span className="text-xs text-gray-500">
              {log.total_candidats} candidats · {log.total_exclus} exclus
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
          {/* Livreurs sélectionnés */}
          {livreursSelectionnes.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1.5">Livreurs notifiés ({livreursSelectionnes.length})</p>
              <div className="space-y-1">
                {livreursSelectionnes.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border border-gray-100">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                    <span className="font-medium text-gray-900 flex-1">{l.nom || l.id?.slice(-8)}</span>
                    {l.distance_km != null && (
                      <span className="text-gray-500">{l.distance_km} km</span>
                    )}
                    {l.gps_age_min != null && (
                      <span className={`text-[10px] ${l.gps_age_min < 10 ? "text-green-600" : "text-gray-400"}`}>
                        GPS {l.gps_age_min}min
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ordre de tri complet */}
          {ordreTri.length > livreursSelectionnes.length && (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1.5">Ordre de tri complet ({ordreTri.length})</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {ordreTri.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1">
                    <span className="w-4 text-gray-400 text-[10px]">{i + 1}.</span>
                    <span className="text-gray-600 flex-1 truncate">{l.nom || l.id?.slice(-8)}</span>
                    {l.distance_km != null && <span className="text-gray-400">{l.distance_km} km</span>}
                    {l.gps_age_min != null && <span className="text-gray-400 text-[10px]">{l.gps_age_min}min</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raisons d'exclusion */}
          {raisonsExclusion.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1.5">Livreurs exclus ({raisonsExclusion.length})</p>
              <div className="space-y-0.5">
                {raisonsExclusion.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1">
                    <Ban className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span className="text-gray-600 flex-1 truncate">{r.nom || r.livreur_id?.slice(-8)}</span>
                    <span className="text-[10px] text-red-500 font-medium">{r.raison}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acceptation */}
          {log.livreur_acceptant_id && (
            <div className="bg-green-50 rounded-lg px-3 py-2 border border-green-100">
              <p className="text-xs font-bold text-green-800">✅ Accepté par {log.livreur_acceptant_nom}</p>
              {log.temps_avant_acceptation_sec != null && (
                <p className="text-xs text-green-700 mt-0.5">Temps de réponse : {log.temps_avant_acceptation_sec} secondes</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DispatchLogs() {
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterEvenement, setFilterEvenement] = useState("");
  const [limit, setLimit] = useState(50);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dispatch-logs", filterCourseId, filterEvenement, limit],
    queryFn: () => {
      const filter = {};
      if (filterCourseId.trim()) filter.course_id = filterCourseId.trim();
      if (filterEvenement) filter.evenement = filterEvenement;
      return base44.entities.DispatchLog.filter(filter, "-heure", limit);
    },
    refetchInterval: 15000,
  });

  const stats = useMemo(() => {
    const byEvent = {};
    for (const l of logs) {
      byEvent[l.evenement] = (byEvent[l.evenement] || 0) + 1;
    }
    const totalAcceptations = byEvent.acceptation || 0;
    const totalVagues = byEvent.vague || 0;
    const tauxAcceptation = totalVagues > 0 ? Math.round((totalAcceptations / totalVagues) * 100) : 0;
    const tempsMoyen = logs
      .filter(l => l.temps_avant_acceptation_sec != null)
      .reduce((acc, l, _, arr) => acc + l.temps_avant_acceptation_sec / arr.length, 0);
    return { total: logs.length, byEvent, tauxAcceptation, tempsMoyen: Math.round(tempsMoyen) };
  }, [logs]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 pt-5 pb-6">
        <div className="max-w-4xl mx-auto">
          <Link to="/">
            <button className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" />Retour
            </button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Journal de Dispatch</h1>
              <p className="text-white/50 text-xs">Traçabilité complète du moteur de dispatch automatique</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="bg-white/8 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-white">{stats.total}</p>
              <p className="text-[9px] text-white/50">Événements</p>
            </div>
            <div className="bg-white/8 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-blue-400">{stats.byEvent.vague || 0}</p>
              <p className="text-[9px] text-white/50">Vagues</p>
            </div>
            <div className="bg-white/8 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-green-400">{stats.byEvent.acceptation || 0}</p>
              <p className="text-[9px] text-white/50">Acceptations</p>
            </div>
            <div className="bg-white/8 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-amber-400">{stats.tempsMoyen || 0}s</p>
              <p className="text-[9px] text-white/50">Temps moyen</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrer par ID de course..."
              value={filterCourseId}
              onChange={(e) => setFilterCourseId(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={filterEvenement}
            onChange={(e) => setFilterEvenement(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Tous les événements</option>
            <option value="vague">Vagues</option>
            <option value="acceptation">Acceptations</option>
            <option value="cycle_epuise">Cycles épuisés</option>
            <option value="reset">Resets</option>
            <option value="aucun_livreur">Aucun livreur</option>
            <option value="expiration">Expirations</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Logs list */}
        {isLoading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">Chargement des logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">Aucun log de dispatch trouvé</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <LogCard key={log.id} log={log} />
            ))}
            {logs.length >= limit && (
              <button
                onClick={() => setLimit(l => l + 50)}
                className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Charger plus ({limit}+)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}