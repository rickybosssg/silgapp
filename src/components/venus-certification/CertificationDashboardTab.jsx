import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, TrendingUp, Award } from 'lucide-react';

export default function CertificationDashboardTab() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

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

  const runAudit = async () => {
    setRunning(true);
    try {
      await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_audit' }),
      });
      queryClient.invalidateQueries({ queryKey: ['venus-certification-latest'] });
    } finally {
      setRunning(false);
    }
  };

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement du rapport de certification...</div>;

  if (!auditData) {
    return (
      <div className="text-center py-12">
        <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Aucun audit effectué</h2>
        <p className="text-gray-500 mb-4">Lancez le premier audit complet de VENUS pour certifier l'architecture.</p>
        <Button onClick={runAudit} disabled={running} size="lg">
          <RefreshCw className={`w-5 h-5 mr-2 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Audit en cours...' : 'Lancer l\'audit complet'}
        </Button>
      </div>
    );
  }

  const report = auditData;
  const score = report.score_global || 0;
  const niveau = report.niveau_maturite || 'initial';
  const scores = [
    { label: 'Architecture', value: report.score_architecture, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Intégrations', value: report.score_integrations, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Fonctionnel', value: report.score_fonctionnel, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Sécurité', value: report.score_securite, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Performance', value: report.score_performance, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Qualité', value: report.score_qualite, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Readiness', value: report.score_readiness, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const scoreColor = score >= 75 ? 'text-green-600' : score >= 60 ? 'text-orange-600' : 'text-red-600';
  const scoreBg = score >= 75 ? 'from-green-500 to-emerald-600' : score >= 60 ? 'from-orange-500 to-amber-600' : 'from-red-500 to-rose-600';

  const recommandations = typeof report.recommandations === 'string' ? JSON.parse(report.recommandations) : (report.recommandations || []);
  const risques = typeof report.risques === 'string' ? JSON.parse(report.risques) : (report.risques || []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Santé globale de VENUS</h2>
          <p className="text-sm text-gray-500">Dernier audit : {report.date_audit ? new Date(report.date_audit).toLocaleString('fr-FR') : '—'}</p>
        </div>
        <Button onClick={runAudit} disabled={running}>
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Audit en cours...' : 'Relancer l\'audit'}
        </Button>
      </div>

      {/* Score global */}
      <Card className={`bg-gradient-to-br ${scoreBg} text-white border-0`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-6 h-6" />
                <span className="text-sm font-medium opacity-90">Score Global de Maturité</span>
              </div>
              <p className="text-6xl font-bold">{score}<span className="text-2xl opacity-70">/100</span></p>
              <Badge className="mt-2 bg-white/20 text-white border-0 capitalize">{niveau.replace('_', ' ')}</Badge>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90 mb-2">Niveau de certification</p>
              {score >= 90 && <p className="text-3xl font-bold">Certifiée ✅</p>}
              {score >= 75 && score < 90 && <p className="text-3xl font-bold">Mature 🟢</p>}
              {score >= 60 && score < 75 && <p className="text-3xl font-bold">Opérationnelle 🟡</p>}
              {score < 60 && <p className="text-3xl font-bold">En développement 🔴</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sous-scores */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {scores.map((s, i) => (
          <Card key={i} className={s.bg + ' border-0'}>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-600 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Résumé */}
      <Card>
        <CardHeader><CardTitle className="text-base">Résumé exécutif</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-700">{report.resume}</p></CardContent>
      </Card>

      {/* Recommandations + Risques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-4 h-4 text-blue-600" /> Recommandations</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {recommandations.map((r, i) => (
              <div key={i} className="border rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={r.priorite === 'haute' ? 'destructive' : r.priorite === 'moyenne' ? 'default' : 'secondary'} className="text-xs capitalize">{r.priorite}</Badge>
                </div>
                <p className="text-sm font-medium text-gray-900">{r.titre}</p>
                <p className="text-xs text-gray-500 mt-1">{r.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="w-4 h-4 text-orange-600" /> Risques identifiés</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {risques.map((r, i) => (
              <div key={i} className="border rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={r.severite === 'haute' ? 'destructive' : r.severite === 'moyenne' ? 'default' : 'secondary'} className="text-xs capitalize">{r.severite}</Badge>
                </div>
                <p className="text-sm font-medium text-gray-900">{r.titre}</p>
                <p className="text-xs text-gray-500 mt-1">Mitigation : {r.mitigation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}