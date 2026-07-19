import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, Wrench, Bell, UserCheck, ScrollText, AlertTriangle, Database, Settings } from 'lucide-react';
import SupervisionOverviewTab from '@/components/venus-supervision/SupervisionOverviewTab';
import ToolHealthTab from '@/components/venus-supervision/ToolHealthTab';
import AlertsTab from '@/components/venus-supervision/AlertsTab';
import EscalationsTab from '@/components/venus-supervision/EscalationsTab';
import AuditLogTab from '@/components/venus-supervision/AuditLogTab';
import AnomaliesTab from '@/components/venus-supervision/AnomaliesTab';
import BackupsTab from '@/components/venus-supervision/BackupsTab';
import MaintenanceTab from '@/components/venus-supervision/MaintenanceTab';

const TABS = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: Activity },
  { id: 'tools', label: 'Outils', icon: Wrench },
  { id: 'alerts', label: 'Alertes', icon: Bell },
  { id: 'escalations', label: 'Escalades', icon: UserCheck },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
  { id: 'backups', label: 'Sauvegardes', icon: Database },
  { id: 'maintenance', label: 'Maintenance', icon: Settings },
];

export default function VenusSupervisionCenter() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_dashboard' });
      setDashboard(res.data);
    } catch (e) {
      console.error('Erreur dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const alertCount = dashboard?.alerts?.length || 0;
  const anomalyCount = dashboard?.anomalies?.length || 0;
  const escalationCount = dashboard?.escalations?.length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              Centre de Supervision VENUS
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Surveillance, sécurité et gouvernance en temps réel
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={fetchDashboard} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {dashboard?.maintenance?.active && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
            <Settings className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Mode maintenance activé</p>
              <p className="text-sm text-amber-700">{dashboard.maintenance.message || 'VENUS fonctionne en mode dégradé'}</p>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const badge = tab.id === 'alerts' ? alertCount : tab.id === 'anomalies' ? anomalyCount : tab.id === 'escalations' ? escalationCount : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {badge > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.id ? 'bg-white/20' : 'bg-red-100 text-red-600'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <SupervisionOverviewTab dashboard={dashboard} onRefresh={fetchDashboard} />}
            {activeTab === 'tools' && <ToolHealthTab tools={dashboard?.tools} onRefresh={fetchDashboard} />}
            {activeTab === 'alerts' && <AlertsTab initialAlerts={dashboard?.alerts} />}
            {activeTab === 'escalations' && <EscalationsTab initialEscalations={dashboard?.escalations} />}
            {activeTab === 'audit' && <AuditLogTab initialLogs={dashboard?.audit_recent} />}
            {activeTab === 'anomalies' && <AnomaliesTab initialAnomalies={dashboard?.anomalies} />}
            {activeTab === 'backups' && <BackupsTab />}
            {activeTab === 'maintenance' && <MaintenanceTab maintenance={dashboard?.maintenance} roles={dashboard?.roles} userInfo={dashboard?.user_info} onRefresh={fetchDashboard} />}
          </>
        )}
      </div>
    </div>
  );
}