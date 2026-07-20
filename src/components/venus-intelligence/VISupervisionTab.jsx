import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wrench, Bell, UserCheck, ScrollText, AlertTriangle, Database, Settings, Lock, ShieldCheck } from 'lucide-react';
import SubTabNav from './SubTabNav';
import SupervisionOverviewTab from '@/components/venus-supervision/SupervisionOverviewTab';
import ToolHealthTab from '@/components/venus-supervision/ToolHealthTab';
import AlertsTab from '@/components/venus-supervision/AlertsTab';
import EscalationsTab from '@/components/venus-supervision/EscalationsTab';
import AuditLogTab from '@/components/venus-supervision/AuditLogTab';
import AnomaliesTab from '@/components/venus-supervision/AnomaliesTab';
import BackupsTab from '@/components/venus-supervision/BackupsTab';
import MaintenanceTab from '@/components/venus-supervision/MaintenanceTab';
import SecurityAuditTab from '@/components/venus-certification/SecurityAuditTab';
import ProductionReadinessTab from '@/components/venus-certification/ProductionReadinessTab';

const SUB_TABS = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: Activity },
  { id: 'tools', label: 'Outils', icon: Wrench },
  { id: 'alerts', label: 'Alertes', icon: Bell },
  { id: 'escalations', label: 'Escalades', icon: UserCheck },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
  { id: 'backups', label: 'Sauvegardes', icon: Database },
  { id: 'security', label: 'Sécurité', icon: Lock },
  { id: 'readiness', label: 'Production', icon: ShieldCheck },
  { id: 'maintenance', label: 'Maintenance', icon: Settings },
];

export default function VISupervisionTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_dashboard' });
      setDashboard(res.data);
    } catch (e) {
      console.error('Erreur dashboard:', e);
    } finally {
      setLoading(false);
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

  const tabsWithBadges = SUB_TABS.map(t => ({
    ...t,
    badge: t.id === 'alerts' ? alertCount : t.id === 'anomalies' ? anomalyCount : t.id === 'escalations' ? escalationCount : 0,
  }));

  return (
    <div>
      <SubTabNav tabs={tabsWithBadges} activeTab={activeTab} onChange={setActiveTab} />
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Activity className="w-8 h-8 animate-spin text-primary" />
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
          {activeTab === 'security' && <SecurityAuditTab />}
          {activeTab === 'readiness' && <ProductionReadinessTab />}
          {activeTab === 'maintenance' && <MaintenanceTab maintenance={dashboard?.maintenance} roles={dashboard?.roles} userInfo={dashboard?.user_info} onRefresh={fetchDashboard} />}
        </>
      )}
    </div>
  );
}