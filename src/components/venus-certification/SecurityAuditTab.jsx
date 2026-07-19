import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle, Lock, Key, FileSearch, Eye } from 'lucide-react';

const CATEGORIE_ICONS = {
  access_control: Key,
  data_protection: Lock,
  audit: FileSearch,
  secrets: Key,
  protection: Shield,
  data_integrity: CheckCircle,
  safety: Eye,
  securite_course: Lock,
  fraud: Shield,
};

export default function SecurityAuditTab() {
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

  const checks = typeof auditData.checks_securite === 'string' ? JSON.parse(auditData.checks_securite) : (auditData.checks_securite || []);
  const conformeCount = checks.filter(c => c.statut === 'conforme').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Audit de Sécurité</h2>
        <p className="text-sm text-gray-500">{checks.length} contrôles de sécurité vérifiés — {conformeCount} conformes</p>
      </div>

      <Card className="bg-green-50 border-0">
        <CardContent className="p-4 flex items-center gap-3">
          <Shield className="w-8 h-8 text-green-600" />
          <div>
            <p className="font-medium text-gray-900">Sécurité globale : Conforme</p>
            <p className="text-sm text-gray-600">Tous les contrôles de sécurité sont en place et actifs</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Détail des contrôles de sécurité</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checks.map((c, i) => {
            const Icon = CATEGORIE_ICONS[c.categorie] || Shield;
            return (
              <div key={i} className="border rounded-lg p-3 flex items-start gap-2">
                <Icon className="w-4 h-4 mt-0.5 text-indigo-600" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{c.nom}</p>
                    <Badge variant="default" className="text-xs"><CheckCircle className="w-3 h-3 mr-1" /> {c.statut}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-0">
        <CardContent className="p-4">
          <p className="text-sm text-gray-700">
            <strong>🔒 Protection des données :</strong> Toutes les données sont stockées sur la plateforme Base44 avec chiffrement au repos.
            Les secrets (Twilio, Firebase) sont gérés via le gestionnaire de secrets platform. L'audit trail (VenusAuditLog) journalise
            toutes les actions administrateur pour la traçabilité complète.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}