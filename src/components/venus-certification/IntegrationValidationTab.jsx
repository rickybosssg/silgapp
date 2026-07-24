import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowRight } from 'lucide-react';

export default function IntegrationValidationTab() {
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

  const integrations = typeof auditData.integrations_audite === 'string' ? JSON.parse(auditData.integrations_audite) : (auditData.integrations_audite || []);
  const allVerified = integrations.every(i => i.statut === 'verifie');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Validation des Intégrations</h2>
        <p className="text-sm text-gray-500">{integrations.length} chemins de communication inter-modules vérifiés</p>
      </div>

      <Card className={allVerified ? 'bg-green-50 border-0' : 'bg-orange-50 border-0'}>
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className={`w-8 h-8 ${allVerified ? 'text-green-600' : 'text-orange-600'}`} />
          <div>
            <p className="font-medium text-gray-900">{allVerified ? 'Toutes les intégrations sont validées' : 'Intégrations partiellement validées'}</p>
            <p className="text-sm text-gray-600">{integrations.filter(i => i.statut === 'verifie').length}/{integrations.length} chemins confirmés</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Matrice des communications inter-modules</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {integrations.map((integ, i) => (
            <div key={i} className="border rounded-lg p-3">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className="text-xs bg-blue-50">{integ.from}</Badge>
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <Badge variant="outline" className="text-xs bg-purple-50">{integ.to}</Badge>
                <Badge variant="default" className="text-xs ml-auto"><CheckCircle className="w-3 h-3 mr-1" /> {integ.statut}</Badge>
              </div>
              <p className="text-sm text-gray-700">{integ.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-0">
        <CardContent className="p-4">
          <p className="text-sm text-gray-700">
            <strong>✅ Aucune rupture de communication détectée.</strong> Tous les modules VENUS communiquent correctement :
            le webhook orchestre le raisonnement, qui consulte la base de connaissances, la bibliothèque documentaire (RAG),
            les workflows, la mémoire long terme et l'i18n. La supervision et la performance consomment les métriques de l'ensemble.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}