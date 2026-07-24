import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, ClipboardCheck } from 'lucide-react';

const CATEGORIE_LABELS = {
  course: 'Course',
  programmation: 'Programmation',
  partenaire: 'Partenaire',
  securite: 'Sécurité',
  support: 'Support',
  suivi: 'Suivi',
  communication: 'Communication',
  gps: 'GPS',
  resilience: 'Résilience',
  dispatch: 'Dispatch',
  paiement: 'Paiement',
};

export default function FunctionalTestsTab() {
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
  if (!auditData) return <div className="text-center py-8 text-gray-500">Aucun audit disponible.</div>;

  const tests = typeof auditData.tests_fonctionnels === 'string' ? JSON.parse(auditData.tests_fonctionnels) : (auditData.tests_fonctionnels || []);
  const successCount = tests.filter(t => t.statut === 'succes').length;
  const errorCount = tests.filter(t => t.statut === 'erreur').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tests Fonctionnels</h2>
        <p className="text-sm text-gray-500">{tests.length} scénarios de test couvrant l'ensemble des flux VENUS</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-0">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-600" />
            <p className="text-3xl font-bold text-green-600">{successCount}</p>
            <p className="text-xs text-gray-600">Succès</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-0">
          <CardContent className="p-4 text-center">
            <XCircle className="w-6 h-6 mx-auto mb-1 text-red-600" />
            <p className="text-3xl font-bold text-red-600">{errorCount}</p>
            <p className="text-xs text-gray-600">Échecs</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-0">
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="w-6 h-6 mx-auto mb-1 text-blue-600" />
            <p className="text-3xl font-bold text-blue-600">{tests.length}</p>
            <p className="text-xs text-gray-600">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Scénarios par catégorie */}
      <Card>
        <CardHeader><CardTitle className="text-base">Détail des scénarios testés</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tests.map((t, i) => (
            <div key={i} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {t.statut === 'succes' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                  <p className="text-sm font-medium text-gray-900">{t.nom}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{CATEGORIE_LABELS[t.categorie] || t.categorie}</Badge>
                  <Badge variant={t.statut === 'succes' ? 'default' : 'destructive'} className="text-xs">{t.statut}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap ml-6">
                {t.steps.map((step, j) => (
                  <span key={j} className="text-xs text-gray-500">
                    {j > 0 && <span className="mx-1 text-gray-300">→</span>}
                    {step}
                  </span>
                ))}
              </div>
              {t.details && <p className="text-xs text-gray-400 mt-1 ml-6">{t.details}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}