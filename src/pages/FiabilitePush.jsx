import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Radio, AlertTriangle, CheckCircle2, XCircle, Smartphone,
  Truck, Users, RefreshCw, Zap, TrendingDown, Activity, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import LivreursInjoignablesList from "@/components/admin/LivreursInjoignablesList";

const NIVEAU_COLORS = {
  sain: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2, label: "Sain" },
  a_surveiller: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: AlertTriangle, label: "À surveiller" },
  critique: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: XCircle, label: "Critique" },
};

function MetricCard({ icon: Icon, label, value, sub, color = "text-gray-700" }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

export default function FiabilitePush() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["push-health"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPushHealth", {});
      return res?.data || res;
    },
    refetchInterval: 30000,
  });

  const metrics = data?.metrics;
  const niveau = metrics?.niveau || "sain";
  const niveauConfig = NIVEAU_COLORS[niveau] || NIVEAU_COLORS.sain;
  const NiveauIcon = niveauConfig.icon;

  const handleCleanup = async () => {
    try {
      const res = await base44.functions.invoke("nettoyerTokensInactifs", {});
      const d = res?.data || res;
      if (d?.success) {
        toast.success(d.resume || "Nettoyage terminé");
        refetch();
      } else {
        toast.error(d?.error || "Erreur lors du nettoyage");
      }
    } catch (err) {
      toast.error("Erreur: " + (err.message || "inconnue"));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Impossible de charger les métriques push</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-gray-900">Fiabilité Push</h1>
              <p className="text-[10px] text-gray-400">Surveillance temps réel des notifications</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-xl"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Banner statut global */}
        <div className={cn("rounded-2xl border-2 p-4 flex items-center gap-4", niveauConfig.bg, niveauConfig.border)}>
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", niveauConfig.bg)}>
            <NiveauIcon className={cn("w-6 h-6", niveauConfig.text)} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-gray-900">Statut: {niveauConfig.label}</h2>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", niveauConfig.bg, niveauConfig.text)}>
                Score {metrics.degradation_score}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{metrics.action_recommandee}</p>
          </div>
        </div>

        {/* Dégradations détectées */}
        {metrics.degradations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">
              Dégradations détectées ({metrics.degradations.length})
            </p>
            {metrics.degradations.map((deg, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-start gap-3">
                <AlertTriangle className={cn("w-4 h-4 mt-0.5 shrink-0", niveau === "critique" ? "text-red-500" : "text-amber-500")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{deg.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{deg.description}</p>
                </div>
                <span className="text-[10px] font-bold text-gray-400 shrink-0">
                  {deg.metric_value}{deg.metric_unit}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* KPIs principaux */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">Vue d'ensemble</p>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={Activity} label="Tokens actifs" value={metrics.tokens_actifs} sub={`${metrics.taux_actif_pct}% du total (${metrics.total_tokens})`} color="text-blue-500" />
            <MetricCard icon={TrendingDown} label="Taux échec 1h" value={`${metrics.taux_echec_1h_pct}%`} sub={`${metrics.notifs_recentes_failed} échecs / ${metrics.notifs_recentes_total} envois`} color={metrics.taux_echec_1h_pct > 20 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard icon={TrendingDown} label="Taux échec 24h" value={`${metrics.taux_echec_24h_pct}%`} sub={`${metrics.notifs_24h_failed} échecs / ${metrics.notifs_24h_total} envois`} color={metrics.taux_echec_24h_pct > 20 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard icon={XCircle} label="Tokens en erreur" value={metrics.tokens_avec_erreur_fcm} sub="Tokens actifs avec erreur FCM" color={metrics.tokens_avec_erreur_fcm > 5 ? "text-red-500" : "text-gray-500"} />
          </div>
        </div>

        {/* Livreurs joignables */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">Livreurs joignables</p>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon={Truck} label="Actifs" value={metrics.livreurs_actifs_total} color="text-blue-500" />
            <MetricCard icon={CheckCircle2} label="Joignables" value={metrics.livreurs_avec_token_valide} sub={`${metrics.taux_livreurs_joignables_pct}%`} color="text-emerald-500" />
            <MetricCard icon={XCircle} label="Injoignables" value={metrics.livreurs_sans_token} color={metrics.livreurs_sans_token > 3 ? "text-red-500" : "text-gray-500"} />
          </div>
          {(metrics.livreurs_actifs_recents_sans_token > 0 || metrics.livreurs_inactifs_sans_token > 0) && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className={cn(
                "rounded-xl border p-3 flex items-center gap-2",
                metrics.livreurs_actifs_recents_sans_token > 0
                  ? "bg-red-50 border-red-200"
                  : "bg-gray-50 border-gray-100"
              )}>
                <AlertTriangle className={cn("w-4 h-4", metrics.livreurs_actifs_recents_sans_token > 0 ? "text-red-500" : "text-gray-300")} />
                <div>
                  <p className="text-sm font-black text-gray-900">{metrics.livreurs_actifs_recents_sans_token}</p>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">Actifs sans token (critique)</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-black text-gray-900">{metrics.livreurs_inactifs_sans_token}</p>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">Inactifs sans token</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Liste détaillée des livreurs non joignables */}
        <LivreursInjoignablesList />

        {/* Répartition par plateforme */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">Par plateforme</p>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon={Smartphone} label="Android" value={metrics.tokens_android} color="text-emerald-500" />
            <MetricCard icon={Smartphone} label="iOS" value={metrics.tokens_ios} color="text-gray-500" />
            <MetricCard icon={Users} label="Web" value={metrics.tokens_web} color="text-gray-400" />
          </div>
        </div>

        {/* Répartition par type */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">Par type d'utilisateur</p>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard icon={Truck} label="Livreurs" value={metrics.tokens_livreurs} color="text-blue-500" />
            <MetricCard icon={Users} label="Clients" value={metrics.tokens_clients} color="text-purple-500" />
            <MetricCard icon={Users} label="Admins" value={metrics.tokens_admins} color="text-amber-500" />
            <MetricCard icon={Users} label="Partenaires" value={metrics.tokens_partenaires} color="text-gray-500" />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <Button
            onClick={handleCleanup}
            variant="outline"
            className="w-full rounded-xl h-12 gap-2"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Nettoyer les tokens invalides ({metrics.tokens_avec_erreur_fcm})
          </Button>
        </div>
      </div>
    </div>
  );
}