import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Loader2, Phone, MessageSquare, Bot, Package, XCircle, MapPin, AlertTriangle, FileText, Zap } from 'lucide-react';

const VALIDATION_STEPS = [
  {
    id: 'reception',
    icon: MessageSquare,
    label: 'Réception des messages',
    description: 'Un message envoyé au +226 55 48 38 38 arrive dans le webhook et crée une conversation.',
    manual: 'Envoyez "Bonjour" au +226 55 48 38 38 depuis votre téléphone.',
  },
  {
    id: 'reponse_ia',
    icon: Bot,
    label: 'Réponses IA (VENUS)',
    description: 'VENUS répond automatiquement avec le moteur OpenAI + RAG SILGAPP.',
    manual: 'Vérifiez que VENUS répond à votre message de salutation.',
  },
  {
    id: 'creation_course',
    icon: Package,
    label: 'Création de course',
    description: 'VENUS collecte les informations et crée une course dans la base de données.',
    manual: 'Envoyez "Je voudrais envoyer un colis de Karpala à Pissy" et suivez le flux.',
  },
  {
    id: 'annulation',
    icon: XCircle,
    label: 'Annulation de course',
    description: 'Le client peut annuler sa course et la DB confirme l\'annulation.',
    manual: 'Envoyez "Annule ma course" pendant une course active.',
  },
  {
    id: 'suivi',
    icon: MapPin,
    label: 'Suivi de course',
    description: 'Le client peut demander le statut de sa course et recevoir le lien de suivi.',
    manual: 'Envoyez "Où est mon livreur ?" pendant une course active.',
  },
  {
    id: 'erreurs',
    icon: AlertTriangle,
    label: 'Gestion des erreurs',
    description: 'Les erreurs techniques renvoient un message d\'erreur au client (jamais un faux succès).',
    manual: 'Vérifiez les logs en cas de comportement inattendu.',
  },
  {
    id: 'journaux',
    icon: FileText,
    label: 'Journaux et traçabilité',
    description: 'Chaque interaction est journalisée dans VenusReasoningLog et VenusInteraction.',
    manual: 'Consultez les journaux ci-dessous pour vérifier la traçabilité.',
  },
];

const VENUS_NUMBER = '+226 55 48 38 38';
const MAIN_NUMBER = '+226 67 57 28 57';

export default function VenusValidationChecklist() {
  const [diagnostic, setDiagnostic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [checkedSteps, setCheckedSteps] = useState({});

  useEffect(() => {
    loadDiagnostic();
    loadLogs();
  }, []);

  const loadDiagnostic = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosticOpenAI', {});
      setDiagnostic(res);
    } catch (e) {
      setDiagnostic({ error: e.message });
    }
    setLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const recentLogs = await base44.entities.VenusReasoningLog.list('-created_date', 10);
      setLogs(recentLogs || []);
    } catch (e) {
      console.error('Erreur chargement logs:', e);
    }
    setLogsLoading(false);
  };

  const toggleStep = (id) => {
    setCheckedSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const allChecked = VALIDATION_STEPS.every(s => checkedSteps[s.id]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Checklist de validation VENUS</h1>
            <p className="text-sm text-gray-500">Numéro de test en production : {VENUS_NUMBER}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Phone className="w-3 h-3 mr-1" /> VENUS : {VENUS_NUMBER}
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Phone className="w-3 h-3 mr-1" /> Principal : {MAIN_NUMBER} (inchangé)
          </Badge>
          {allChecked && (
            <Badge className="bg-green-600 text-white">✓ Tous les tests validés</Badge>
          )}
        </div>
      </div>

      {/* Configuration Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-red-600" />
            État de la configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Vérification...
            </div>
          ) : diagnostic?.error ? (
            <p className="text-sm text-red-600">Erreur: {diagnostic.error}</p>
          ) : diagnostic ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <ConfigRow label="OpenAI activé" value={diagnostic.interrupteur_actif ? 'Oui' : 'Non'} ok={diagnostic.interrupteur_actif} />
              <ConfigRow label="Connexion OpenAI" value={diagnostic.connexion_ok ? 'OK' : 'Échec'} ok={diagnostic.connexion_ok} />
              <ConfigRow label="Modèle OpenAI" value={diagnostic.modele_configure || 'N/A'} ok={true} />
              <ConfigRow label="Statut global" value={diagnostic.statut_global || 'N/A'} ok={diagnostic.connexion_ok} />
              <ConfigRow label="Latence API" value={`${diagnostic.latence_ms || 0}ms`} ok={(diagnostic.latence_ms || 0) < 3000} />
              <ConfigRow label="RAG SILGAPP" value="Injecté dans le prompt" ok={true} />
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDiagnostic} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Relancer le diagnostic
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action requise Twilio/Meta */}
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 mb-1">Action manuelle requise (console Twilio + Meta)</p>
              <p className="text-amber-700 mb-2">Les étapes suivantes ne peuvent pas être automatisées depuis l'app :</p>
              <ol className="list-decimal list-inside space-y-1 text-amber-700">
                <li>Enregistrer {VENUS_NUMBER} dans <strong>Meta WhatsApp Business Manager</strong></li>
                <li>Ajouter {VENUS_NUMBER} comme numéro WhatsApp Business dans <strong>Twilio Console</strong></li>
                <li>Configurer le webhook <code className="bg-amber-100 px-1 rounded">webhookWhatsAppVenus</code> pour ce numéro dans Twilio</li>
                <li>Vérifier que le secret <code className="bg-amber-100 px-1 rounded">TWILIO_WHATSAPP_VENUS_FROM</code> est défini (whatsapp:+22655483838)</li>
              </ol>
              <p className="text-amber-600 mt-2 text-xs">Le numéro principal {MAIN_NUMBER} ne nécessite aucune modification.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Checklist */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Checklist de validation fonctionnelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {VALIDATION_STEPS.map((step) => {
            const Icon = step.icon;
            const isChecked = checkedSteps[step.id];
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  isChecked ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => toggleStep(step.id)}
              >
                {isChecked ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-500" />
                    <span className={`font-medium text-sm ${isChecked ? 'text-green-700' : 'text-gray-900'}`}>
                      {step.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                  <p className="text-xs text-gray-400 mt-1 italic">👉 {step.manual}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              Journaux récents (10 derniers raisonnements)
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actualiser'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun journal pour le moment.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700">{log.intention || 'N/A'}</span>
                    <Badge variant="outline" className={
                      log.confiance >= 80 ? 'bg-green-50 text-green-700' :
                      log.confiance >= 50 ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }>
                      {log.confiance || 0}% confiance
                    </Badge>
                  </div>
                  <p className="text-gray-500 mb-1">👤 {log.client_telephone || 'N/A'}</p>
                  <p className="text-gray-600 truncate">📥 "{log.message_recu || ''}"</p>
                  <p className="text-gray-600 truncate mt-1">📤 "{(log.reponse_envoyee || '').substring(0, 80)}..."</p>
                  <p className="text-gray-400 mt-1">
                    {log.action_choisie || 'N/A'} · {log.temps_traitement_ms || 0}ms · {new Date(log.created_date).toLocaleString('fr-FR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
        {ok ? '✓' : '✗'} {value}
      </span>
    </div>
  );
}