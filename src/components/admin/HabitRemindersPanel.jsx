import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, TrendingUp, Bell, Target, Percent, RotateCcw, Play } from "lucide-react";

export default function HabitRemindersPanel() {
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("moteurRappelsHabitude", { action: "stats" });
      setStats(res?.data || res);
    } catch (err) {
      console.error("Erreur stats:", err);
    }
    setLoading(false);
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await base44.functions.invoke("moteurRappelsHabitude", { action: "audit" });
      setAudit(res?.data || res);
    } catch (err) {
      console.error("Erreur audit:", err);
    }
    setAuditLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const StatCard = ({ icon: Icon, label, value, sublabel, color }) => (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color + "20" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Rappels d'habitude — Phase 4</h2>
          <p className="text-sm text-slate-500">Indicateurs de fréquence et habitudes clients</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={loadAudit} disabled={auditLoading}>
            <Play className="w-3.5 h-3.5 mr-1" />
            Audit habitudes
          </Button>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Users}
              label="Clients actifs 30j"
              value={stats.clients_actifs_30j}
              color="#007AFF"
            />
            <StatCard
              icon={Activity}
              label="Courses/client actif"
              value={stats.courses_par_client_actif}
              sublabel={`${stats.courses_livrees_30j} courses livrées`}
              color="#34C759"
            />
            <StatCard
              icon={TrendingUp}
              label="Clients réguliers"
              value={stats.segments?.regulier || 0}
              sublabel={`+${stats.segments?.tres_regulier || 0} très réguliers`}
              color="#FF9500"
            />
            <StatCard
              icon={Bell}
              label="Rappels envoyés"
              value={stats.rappels?.envoyes || 0}
              sublabel={`${stats.rappels?.controles || 0} en contrôle`}
              color="#8B5CF6"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Target}
              label="Commandes après rappel"
              value={stats.rappels?.convertis || 0}
              color="#34C759"
            />
            <StatCard
              icon={Percent}
              label="Taux conversion rappel"
              value={`${stats.rappels?.taux_conversion || 0}%`}
              color="#007AFF"
            />
            <StatCard
              icon={Users}
              label="Nouveaux clients"
              value={stats.segments?.nouveau || 0}
              color="#64748B"
            />
            <StatCard
              icon={TrendingUp}
              label="En développement"
              value={stats.segments?.en_developpement || 0}
              color="#FF9500"
            />
          </div>
        </>
      )}

      {audit && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            Audit des habitudes détectées ({audit.eligible_count} clients éligibles)
          </h3>
          {audit.eligible_count === 0 ? (
            <p className="text-sm text-slate-500">Aucune habitude éligible pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {audit.details?.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{d.client_id.substring(0, 8)}</span>
                    <span className="text-xs font-bold text-slate-700">{d.segment}</span>
                    <span className="text-xs text-slate-500">{d.habit_type}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">{d.delivered_count} courses</span>
                    <span className="text-slate-600">{d.habit_occurrences} occ.</span>
                    <span className="text-slate-600">{Math.round(d.habit_ratio * 100)}%</span>
                    {d.is_control && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">contrôle</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">
            ⚠️ Aucun envoi réel n'est déclenché. Le moteur est désactivé par défaut (HABIT_REMINDER_ENABLED).
            Activez via AppConfig après validation manuelle.
          </p>
        </Card>
      )}

      {!stats && !loading && (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500">Chargement des indicateurs...</p>
        </Card>
      )}
    </div>
  );
}