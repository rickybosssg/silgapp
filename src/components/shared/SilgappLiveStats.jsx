import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bike, Users, Package, Trophy } from "lucide-react";

/**
 * SilgappLiveStats — Composant partagé « SILGAPP en direct »
 *
 * Affiche 4 compteurs agrégés en temps quasi réel :
 *   - Livreurs en ligne (heartbeat récent + statut actif)
 *   - Clients SILGAPP (comptes enregistrés)
 *   - Courses aujourd'hui (livrées depuis 00:00)
 *   - Courses au total (livrées depuis le début)
 *
 * Source unique : fonction backend getSilgappLiveStats (sécurisée, cachée 45s).
 * Rafraîchissement automatique toutes les 60s.
 * Aucun chiffre codé en dur.
 */
export default function SilgappLiveStats({ countryCode }) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["silgapp-live-stats", countryCode || "auto"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getSilgappLiveStats", {
        country_code: countryCode || null,
      });
      return res?.data || res;
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const stats = [
    {
      icon: Bike,
      label: "Livreurs en ligne",
      value: data?.livreurs_en_ligne,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      icon: Users,
      label: "Utilisateurs inscrits",
      value: data?.clients_silgapp,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: Package,
      label: "Courses aujourd'hui",
      value: data?.courses_aujourdhui,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      icon: Trophy,
      label: "Courses au total",
      value: data?.courses_total,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-black text-gray-900">SILGAPP en direct</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            En direct
          </span>
        </div>
      </div>

      {/* Grille 2×2 */}
      <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          const loading = isLoading || stat.value === undefined;
          return (
            <div
              key={i}
              className="p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <div className="min-w-0">
                {loading ? (
                  <div className="h-7 w-16 bg-gray-100 rounded-lg animate-pulse" />
                ) : (
                  <p className="text-2xl font-black text-gray-900 tabular-nums leading-none truncate">
                    {formatNumber(stat.value)}
                  </p>
                )}
                <p className="text-[11px] font-medium text-gray-500 mt-1 leading-tight">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicateur de mise à jour */}
      {data?.updated_at && !isLoading && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-right">
            {isFetching ? "Mise à jour…" : `Mis à jour ${formatTimeAgo(data.updated_at)}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function formatNumber(n) {
  if (n === undefined || n === null) return "0";
  return n.toLocaleString("fr-FR");
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)}h`;
}