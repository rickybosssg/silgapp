import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { ScrollText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const ACTION_LABELS = {
  create: 'Création', update: 'Modification', delete: 'Suppression', restore: 'Restauration',
  validate: 'Validation', archive: 'Archivage', export: 'Export', import: 'Import',
  login: 'Connexion', logout: 'Déconnexion', configuration_change: 'Changement de config',
  maintenance_toggle: 'Mode maintenance', backup_create: 'Sauvegarde', backup_restore: 'Restauration',
  alert_resolve: 'Résolution alerte', escalation_handle: 'Gestion escalade', role_change: 'Changement de rôle',
  other: 'Autre',
};

const CATEGORIE_LABELS = {
  configuration: 'Configuration', knowledge: 'Connaissances', scenario: 'Scénarios',
  workflow: 'Workflows', document: 'Documents', memory: 'Mémoire',
  maintenance: 'Maintenance', securite: 'Sécurité', supervision: 'Supervision',
  escalation: 'Escalade', autre: 'Autre',
};

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700', update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700', restore: 'bg-purple-100 text-purple-700',
  validate: 'bg-emerald-100 text-emerald-700', backup_create: 'bg-indigo-100 text-indigo-700',
  backup_restore: 'bg-cyan-100 text-cyan-700', maintenance_toggle: 'bg-amber-100 text-amber-700',
  alert_resolve: 'bg-teal-100 text-teal-700', escalation_handle: 'bg-orange-100 text-orange-700',
};

export default function AuditLogTab({ initialLogs }) {
  const [logs, setLogs] = useState(initialLogs || []);
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { setLogs(initialLogs || []); }, [initialLogs]);

  const fetchLogs = async (cat) => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', {
        action: 'get_audit_log', limit: 200, categorie: cat || null,
      });
      setLogs(res.data.logs);
    } catch (e) { console.error(e); }
  };

  const handleCatFilter = (cat) => {
    setCatFilter(cat);
    fetchLogs(cat);
  };

  const filtered = logs.filter(l => {
    if (search) {
      const s = search.toLowerCase();
      if (!l.utilisateur?.toLowerCase().includes(s) && !l.details?.toLowerCase().includes(s) && !l.action?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Journal d'audit complet</h2>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9" />
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        <button onClick={() => handleCatFilter('')}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${!catFilter ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Toutes
        </button>
        {Object.entries(CATEGORIE_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => handleCatFilter(key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${catFilter === key ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">Date</th>
                <th className="text-left p-3 font-semibold text-gray-600">Utilisateur</th>
                <th className="text-left p-3 font-semibold text-gray-600">Action</th>
                <th className="text-left p-3 font-semibold text-gray-600">Catégorie</th>
                <th className="text-left p-3 font-semibold text-gray-600">Détails</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">
                  <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Aucune entrée d'audit
                </td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.date_action).toLocaleString('fr-FR')}
                    </td>
                    <td className="p-3">
                      <p className="font-medium text-gray-900 text-xs">{log.utilisateur}</p>
                      {log.role && <p className="text-xs text-gray-400">{log.role}</p>}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-600">{CATEGORIE_LABELS[log.categorie] || log.categorie}</td>
                    <td className="p-3 text-xs text-gray-600 max-w-md truncate">{log.details || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}