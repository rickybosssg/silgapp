import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle, Clock, Zap } from 'lucide-react';

const STATUT_CONFIG = {
  operationnel: { label: 'Opérationnel', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  degradation: { label: 'Dégradation', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle },
  indisponible: { label: 'Indisponible', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  inconnu: { label: 'Inconnu', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: HelpCircle },
};

const OUTIL_LABELS = {
  creer_course: 'Création de course',
  recherche_livreur: 'Recherche de livreur',
  qr_code: 'QR Code',
  pin: 'Code PIN',
  gps: 'GPS',
  paiement: 'Paiement',
  whatsapp: 'WhatsApp',
  notifications: 'Notifications Push',
  knowledge_base: 'Base de connaissances',
  document_library: 'Bibliothèque documentaire',
  workflow_engine: 'Moteur de workflows',
  rag_engine: 'Moteur RAG',
  reasoning_engine: 'Moteur de raisonnement',
  tts: 'Synthèse vocale (TTS)',
  transcription: 'Transcription audio',
};

export default function ToolHealthTab({ tools, onRefresh }) {
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    try {
      setChecking(true);
      await base44.functions.invoke('supervisionVenus', { action: 'check_tools' });
      await onRefresh();
    } catch (e) {
      console.error('Erreur vérification:', e);
    } finally {
      setChecking(false);
    }
  };

  const items = tools?.items || [];
  const operationnels = items.filter(t => t.statut === 'operationnel').length;
  const sante = items.length > 0 ? Math.round((operationnels / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Surveillance des outils</h2>
          <p className="text-sm text-gray-500">
            {operationnels}/{items.length} outils opérationnels — Santé: {sante}%
          </p>
        </div>
        <Button onClick={handleCheck} disabled={checking}>
          <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
          Vérifier les outils
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((tool) => {
          const config = STATUT_CONFIG[tool.statut] || STATUT_CONFIG.inconnu;
          const Icon = config.icon;
          return (
            <Card key={tool.outil} className={`p-4 border-2 ${config.color}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  <div>
                    <p className="font-semibold text-sm">{OUTIL_LABELS[tool.outil] || tool.outil}</p>
                    <p className="text-xs opacity-75">{tool.outil}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="opacity-70">Statut</span>
                  <span className="font-semibold">{config.label}</span>
                </div>
                {tool.temps_reponse_ms > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="opacity-70 flex items-center gap-1"><Clock className="w-3 h-3" /> Réponse</span>
                    <span className="font-semibold">{tool.temps_reponse_ms}ms</span>
                  </div>
                )}
                {tool.nb_incidents_24h > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Incidents 24h</span>
                    <span className="font-semibold text-red-600">{tool.nb_incidents_24h}</span>
                  </div>
                )}
                {tool.message_erreur && (
                  <p className="mt-2 p-2 rounded bg-black/5 text-xs">{tool.message_erreur}</p>
                )}
                {tool.procedure_secours_activee && (
                  <p className="mt-2 p-2 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                    ⚠ Procédure de secours activée
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}