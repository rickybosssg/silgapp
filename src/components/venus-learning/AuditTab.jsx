import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, User, Calendar, Shield } from 'lucide-react';

const ACTION_LABELS = {
  create: { label: 'Création', color: 'bg-green-100 text-green-700' },
  update: { label: 'Modification', color: 'bg-blue-100 text-blue-700' },
  delete: { label: 'Suppression', color: 'bg-red-100 text-red-700' },
  restore: { label: 'Restauration', color: 'bg-purple-100 text-purple-700' },
  validate: { label: 'Validation', color: 'bg-emerald-100 text-emerald-700' },
  archive: { label: 'Archivage', color: 'bg-gray-100 text-gray-600' },
};

const ENTITY_LABELS = {
  knowledge: 'Connaissance',
  scenario: 'Scénario',
  correction: 'Correction',
};

export default function AuditTab() {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['venus-audits'],
    queryFn: () => base44.entities.VenusAudit.list('-created_date', 200),
  });

  const filtered = audits.filter(a => {
    const matchSearch = !search || (a.utilisateur || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.details || '').toLowerCase().includes(search.toLowerCase());
    const matchAction = filterAction === 'all' || a.action === filterAction;
    const matchEntity = filterEntity === 'all' || a.entite_type === filterEntity;
    return matchSearch && matchAction && matchEntity;
  });

  const parseValue = (str) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return str; }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par utilisateur ou détail..." className="pl-9" />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes actions</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Entité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes entités</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-slate-500">{filtered.length} entrée(s) d'audit</div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Aucune entrée d'audit.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const action = ACTION_LABELS[a.action] || { label: a.action, color: 'bg-gray-100 text-gray-600' };
            const oldValue = parseValue(a.ancienne_valeur);
            const newValue = parseValue(a.nouvelle_valeur);
            return (
              <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Shield className="w-4 h-4 text-slate-400" />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${action.color}`}>{action.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ENTITY_LABELS[a.entite_type] || a.entite_type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{a.utilisateur}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(a.created_date).toLocaleString('fr-FR')}</span>
                    </div>
                    {a.details && <p className="text-xs text-slate-500">{a.details}</p>}
                    {oldValue && (
                      <div className="mt-2 text-xs">
                        <span className="text-red-500 font-medium">Avant:</span>
                        <span className="text-slate-500 ml-1">{typeof oldValue === 'object' ? JSON.stringify(oldValue).substring(0, 100) : String(oldValue).substring(0, 100)}</span>
                      </div>
                    )}
                    {newValue && (
                      <div className="text-xs">
                        <span className="text-green-500 font-medium">Après:</span>
                        <span className="text-slate-500 ml-1">{typeof newValue === 'object' ? JSON.stringify(newValue).substring(0, 100) : String(newValue).substring(0, 100)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}