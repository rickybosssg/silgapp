import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, XCircle, AlertCircle, ShieldCheck, GraduationCap, Map, FileText, ListChecks } from 'lucide-react';

export default function ProductionReadinessTab() {
  const queryClient = useQueryClient();
  const [trainingMode, setTrainingMode] = useState(false);
  const [toggling, setToggling] = useState(false);

  const { data: auditData } = useQuery({
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

  const { data: trainingData } = useQuery({
    queryKey: ['venus-training-mode'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_training_mode' }),
      });
      const json = await res.json();
      return json.success ? json.enabled : false;
    },
  });

  useEffect(() => {
    if (trainingData !== undefined) setTrainingMode(trainingData);
  }, [trainingData]);

  const toggleTraining = async (checked) => {
    setTrainingMode(checked);
    setToggling(true);
    try {
      await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_training_mode', enabled: checked }),
      });
      queryClient.invalidateQueries({ queryKey: ['venus-training-mode'] });
    } finally {
      setToggling(false);
    }
  };

  const { data: featuresData } = useQuery({
    queryKey: ['venus-features'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_features' }),
      });
      const json = await res.json();
      return json.success ? json.features : [];
    },
  });

  const { data: roadmapData } = useQuery({
    queryKey: ['venus-roadmap'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_roadmap' }),
      });
      const json = await res.json();
      return json.success ? json.roadmap : [];
    },
  });

  const readiness = auditData
    ? (typeof auditData.readiness_checklist === 'string' ? JSON.parse(auditData.readiness_checklist) : (auditData.readiness_checklist || []))
    : [];

  const statutConfig = {
    pret: { icon: CheckCircle, color: 'text-green-600', badge: 'default', label: 'Prêt' },
    incomplet: { icon: XCircle, color: 'text-red-600', badge: 'destructive', label: 'Incomplet' },
    a_verifier: { icon: AlertCircle, color: 'text-orange-600', badge: 'secondary', label: 'À vérifier' },
    a_surveiller: { icon: AlertCircle, color: 'text-blue-600', badge: 'secondary', label: 'À surveiller' },
  };

  const pretCount = readiness.filter(r => r.statut === 'pret').length;
  const incompletCount = readiness.filter(r => r.statut === 'incomplet').length;
  const aVerifierCount = readiness.filter(r => r.statut === 'a_verifier' || r.statut === 'a_surveiller').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Préparation à la Production</h2>
        <p className="text-sm text-gray-500">Checklist de readiness, Mode Entraînement, fonctionnalités et feuille de route</p>
      </div>

      {/* Stats readiness */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-0"><CardContent className="p-4 text-center"><CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-600" /><p className="text-3xl font-bold text-green-600">{pretCount}</p><p className="text-xs text-gray-600">Prêts</p></CardContent></Card>
        <Card className="bg-red-50 border-0"><CardContent className="p-4 text-center"><XCircle className="w-6 h-6 mx-auto mb-1 text-red-600" /><p className="text-3xl font-bold text-red-600">{incompletCount}</p><p className="text-xs text-gray-600">Incomplets</p></CardContent></Card>
        <Card className="bg-orange-50 border-0"><CardContent className="p-4 text-center"><AlertCircle className="w-6 h-6 mx-auto mb-1 text-orange-600" /><p className="text-3xl font-bold text-orange-600">{aVerifierCount}</p><p className="text-xs text-gray-600">À surveiller</p></CardContent></Card>
      </div>

      {/* Checklist */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="w-4 h-4 text-indigo-600" /> Checklist de mise en production</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {readiness.map((item, i) => {
            const cfg = statutConfig[item.statut] || statutConfig.a_verifier;
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-center gap-2 border rounded-lg p-2">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{item.item}</p>
                  {item.details && <p className="text-xs text-gray-500">{item.details}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {item.required && <Badge variant="outline" className="text-xs">Requis</Badge>}
                  <Badge variant={cfg.badge} className="text-xs">{cfg.label}</Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Mode Entraînement */}
      <Card className={trainingMode ? 'bg-purple-50 border-2 border-purple-300' : ''}>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="w-4 h-4 text-purple-600" /> Mode Entraînement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{trainingMode ? 'Mode Entraînement ACTIF' : 'Mode Entraînement inactif'}</p>
              <p className="text-xs text-gray-500">Analyse des conversations sans apprentissage automatique — toutes les corrections nécessitent une validation admin</p>
            </div>
            <Switch checked={trainingMode} onCheckedChange={toggleTraining} disabled={toggling} />
          </div>
          {trainingMode && (
            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <p className="text-sm text-purple-900 font-medium mb-2">✨ Mode Entraînement activé</p>
              <ul className="text-xs text-gray-700 space-y-1">
                <li>• Toutes les conversations sont analysées pour apprentissage</li>
                <li>• Les corrections sont proposées aux administrateurs</li>
                <li>• La base de connaissances peut être enrichie manuellement</li>
                <li>• <strong>Aucun apprentissage n'est appliqué sans validation explicite</strong></li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste des fonctionnalités */}
      {featuresData && featuresData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4 text-blue-600" /> Liste des fonctionnalités ({featuresData.reduce((a, c) => a + c.items.length, 0)})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {featuresData.map((cat, i) => (
              <div key={i} className="border rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">{cat.categorie} ({cat.items.length})</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {cat.items.map((item, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-gray-700">{item.nom}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feuille de route */}
      {roadmapData && roadmapData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Map className="w-4 h-4 text-indigo-600" /> Feuille de route</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {roadmapData.map((phase, i) => (
              <div key={i} className="border-l-4 border-indigo-300 pl-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900">{phase.phase}</p>
                  <Badge variant={phase.priorite === 'critique' ? 'destructive' : phase.priorite === 'haute' ? 'default' : 'secondary'} className="text-xs capitalize">{phase.priorite}</Badge>
                </div>
                <ul className="text-xs text-gray-700 space-y-1">
                  {phase.items.map((item, j) => <li key={j}>• {item}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Évolutivité */}
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-0">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="w-4 h-4 text-indigo-600" /> Évolutivité de l'architecture</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-3">L'architecture modulaire de VENUS permet d'ajouter facilement de nouveaux éléments sans réécrire le cœur du système :</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { icon: '🌍', label: 'Nouveaux pays', desc: 'Ajouter une entité Country + traductions' },
              { icon: '🗣️', label: 'Nouvelles langues', desc: 'Ajouter une entité VenusLanguage + translations' },
              { icon: '🛎️', label: 'Nouveaux services', desc: 'Ajouter des workflows + connaissances' },
              { icon: '🤖', label: 'Nouveaux outils IA', desc: 'Brancher de nouveaux LLM ou modèles' },
              { icon: '📱', label: 'Nouveaux canaux', desc: 'Telegram, Messenger, Instagram, appels vocaux' },
              { icon: '🏢', label: 'Nouvelles marques', desc: 'Ajouter une entité VenusBrand + personnalité' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 border rounded-lg p-2 bg-white">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}