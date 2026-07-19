import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, FileText, Box, Code, Database, Globe } from 'lucide-react';

export default function ArchitectureAuditTab() {
  const { data: auditData, isLoading } = useQuery({
    queryKey: ['venus-certification-latest'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_latest' }),
      });
      const json = await res.json();
      return json.success ? json.report : null;
    },
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;
  if (!auditData) return <div className="text-center py-8 text-gray-500">Aucun audit disponible. Lancez un audit depuis le tableau de bord.</div>;

  const modules = typeof auditData.modules_audite === 'string' ? JSON.parse(auditData.modules_audite) : (auditData.modules_audite || []);

  const typeIcons = {
    function: Code,
    shared: Box,
    entity: Database,
    page: FileText,
  };

  const statutConfig = {
    operationnel: { icon: CheckCircle, color: 'text-green-600', badge: 'default' },
    deploye: { icon: CheckCircle, color: 'text-green-600', badge: 'default' },
    vide: { icon: AlertCircle, color: 'text-orange-600', badge: 'secondary' },
    indisponible: { icon: XCircle, color: 'text-red-600', badge: 'destructive' },
  };

  // Grouper par type
  const byType = {};
  for (const m of modules) {
    if (!byType[m.type]) byType[m.type] = [];
    byType[m.type].push(m);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Audit d'Architecture</h2>
        <p className="text-sm text-gray-500">{modules.length} modules audités — shared engines, fonctions backend, entités et pages</p>
      </div>

      {/* Diagramme d'architecture (textuel) */}
      <Card className="bg-gray-900 text-white">
        <CardHeader><CardTitle className="text-base text-white">Diagramme d'Architecture VENUS</CardTitle></CardHeader>
        <CardContent className="font-mono text-xs space-y-1 overflow-x-auto">
          <div className="text-green-400">┌─────────────────────────────────────────────────────┐</div>
          <div className="text-green-400">│              WHATSAPP / TWILIO API                   │</div>
          <div className="text-green-400">│                    (Entrée)                          │</div>
          <div className="text-green-400">└──────────────────────┬──────────────────────────────┘</div>
          <div className="text-green-400">                       ▼</div>
          <div className="text-cyan-400">┌──────────────────────────────────────────────────────┐</div>
          <div className="text-cyan-400">│           WEBHOOK WHATSAPP VENUS                     │</div>
          <div className="text-cyan-400">│  (Maintenance guard → i18n → Rate limit → Queue)     │</div>
          <div className="text-cyan-400">└──────────────────────┬───────────────────────────────┘</div>
          <div className="text-cyan-400">                       ▼</div>
          <div className="text-yellow-400">┌──────────────────────────────────────────────────────┐</div>
          <div className="text-yellow-400">│           MOTEUR DE RAISONNEMENT                     │</div>
          <div className="text-yellow-400">│  (Intention → Entités → Source sélectionnée)         │</div>
          <div className="text-yellow-400">└──┬──────┬──────┬──────┬──────┬────────────────────────┘</div>
          <div className="text-yellow-400">   ▼      ▼      ▼      ▼      ▼</div>
          <div className="text-purple-400">  📚KB   📄RAG  ⚙️WF   🧠MEM  🌍i18n</div>
          <div className="text-purple-400">         │      │</div>
          <div className="text-purple-400">         ▼      ▼</div>
          <div className="text-pink-400">    📄Docs  🔄Workflows → QR/PIN/Dispatch</div>
          <div className="text-gray-400">─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
          <div className="text-blue-400">  📊Supervision ← 📈Performance ← 🔄Amélioration</div>
        </CardContent>
      </Card>

      {/* Modules par type */}
      {Object.entries(byType).map(([type, mods]) => {
        const TypeIcon = typeIcons[type] || Box;
        const typeLabels = { function: 'Fonctions Backend', shared: 'Shared Engines', entity: 'Entités de Données', page: 'Pages Admin' };
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TypeIcon className="w-4 h-4 text-indigo-600" /> {typeLabels[type] || type} ({mods.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {mods.map((m) => {
                  const cfg = statutConfig[m.statut] || { icon: AlertCircle, color: 'text-gray-600', badge: 'secondary' };
                  const Icon = cfg.icon;
                  return (
                    <div key={m.code} className="border rounded-lg p-3 flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.nom}</p>
                          <Badge variant={cfg.badge} className="text-xs capitalize ml-2">{m.statut}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                        {m.details && <p className="text-xs text-gray-400 mt-0.5">{m.details}</p>}
                        <code className="text-xs text-gray-400">{m.path}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}