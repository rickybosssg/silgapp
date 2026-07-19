import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListChecks, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function QueueTab() {
  const { data: queueData, isLoading } = useQuery({
    queryKey: ['venus-queue'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_queue_stats' }),
      });
      const json = await res.json();
      return json.success ? json.stats : {};
    },
    refetchInterval: 10000,
  });

  const stats = queueData || {};

  const cards = [
    { label: 'En attente', value: stats.en_attente || 0, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'En cours', value: stats.en_cours || 0, icon: ListChecks, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Terminées', value: stats.termine || 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Échecs', value: stats.echec || 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Retry', value: stats.retry || 0, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">File d'attente persistante</h2>
        <p className="text-sm text-gray-500">Messages, notifications, QR/PIN, WhatsApp — aucune demande perdue</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i} className={c.bg + ' border-0'}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-6 h-6 mx-auto mb-2 ${c.color}`} />
                <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-600 mt-1">{c.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comment fonctionne la file d'attente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5">1</Badge>
            <p>Chaque tâche (message entrant, notification, envoi QR/PIN, envoi WhatsApp) est persistée dans l'entité <code className="text-xs bg-gray-100 px-1 rounded">VenusQueueItem</code> avec sa priorité.</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5">2</Badge>
            <p>Les workers traitent les tâches par ordre de priorité (critique → basse), avec un retry exponentiel en cas d'échec.</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5">3</Badge>
            <p>Après 3 tentatives échouées, la tâche passe en <Badge variant="destructive" className="text-xs">mort</Badge> et reste journalisée pour investigation.</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5">4</Badge>
            <p>L'architecture multi-workers permet de scaler horizontalement : plusieurs instances peuvent traiter la file en parallèle.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}