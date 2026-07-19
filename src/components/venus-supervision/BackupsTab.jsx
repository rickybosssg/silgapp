import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Database, Download, Upload, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

const TYPES = [
  { id: 'knowledge_base', label: 'Base de connaissances' },
  { id: 'scenarios', label: 'Scénarios' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'long_term_memory', label: 'Mémoire longue' },
  { id: 'documents', label: 'Documents' },
  { id: 'improvement_data', label: 'Données d\'amélioration' },
  { id: 'full', label: 'Sauvegarde complète' },
];

const STATUT_CONFIG = {
  en_cours: { label: 'En cours', icon: Clock, color: 'text-amber-600' },
  terminé: { label: 'Terminé', icon: CheckCircle, color: 'text-green-600' },
  échoué: { label: 'Échoué', icon: XCircle, color: 'text-red-600' },
};

export default function BackupsTab() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const fetchBackups = async () => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'list_backups' });
      setBackups(res.data.backups);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleCreate = async (type) => {
    try {
      setCreating(type);
      await base44.functions.invoke('supervisionVenus', { action: 'create_backup', type });
      await fetchBackups();
    } catch (e) { console.error(e); }
    finally { setCreating(null); }
  };

  const handleRestore = async (id) => {
    if (!confirm('Voulez-vous vraiment restaurer cette sauvegarde ? Les données existantes ne seront pas supprimées.')) return;
    try {
      setRestoring(id);
      await base44.functions.invoke('supervisionVenus', { action: 'restore_backup', backup_id: id });
      await fetchBackups();
    } catch (e) { console.error(e); }
    finally { setRestoring(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Sauvegardes</h2>
        <p className="text-sm text-gray-500">Sauvegarde et restauration des données VENUS</p>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Créer une sauvegarde</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TYPES.map((t) => (
            <Button key={t.id} variant="outline" size="sm" onClick={() => handleCreate(t.id)} disabled={creating === t.id}>
              {creating === t.id ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              {t.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">Date</th>
                <th className="text-left p-3 font-semibold text-gray-600">Type</th>
                <th className="text-left p-3 font-semibold text-gray-600">Statut</th>
                <th className="text-left p-3 font-semibold text-gray-600">Records</th>
                <th className="text-left p-3 font-semibold text-gray-600">Taille</th>
                <th className="text-left p-3 font-semibold text-gray-600">Par</th>
                <th className="text-right p-3 font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></td></tr>
              ) : backups.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Aucune sauvegarde
                </td></tr>
              ) : (
                backups.map((b) => {
                  const config = STATUT_CONFIG[b.statut] || STATUT_CONFIG.en_cours;
                  const Icon = config.icon;
                  return (
                    <tr key={b.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(b.date_creation).toLocaleString('fr-FR')}
                      </td>
                      <td className="p-3 text-xs font-medium">{TYPES.find(t => t.id === b.type)?.label || b.type}</td>
                      <td className="p-3">
                        <span className={`flex items-center gap-1 text-xs font-medium ${config.color}`}>
                          <Icon className="w-3 h-3" /> {config.label}
                        </span>
                      </td>
                      <td className="p-3 text-xs">{b.nb_records || 0}</td>
                      <td className="p-3 text-xs">{b.taille_kb || 0} KB</td>
                      <td className="p-3 text-xs">{b.auto ? 'Auto' : b.declenche_par}</td>
                      <td className="p-3 text-right">
                        {b.statut === 'terminé' && !b.restauree && (
                          <Button size="sm" variant="ghost" onClick={() => handleRestore(b.id)} disabled={restoring === b.id}>
                            {restoring === b.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Restaurer
                          </Button>
                        )}
                        {b.restauree && <span className="text-xs text-green-600">Restaurée</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}