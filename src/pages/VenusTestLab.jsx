import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { FlaskConical, Play, CheckCircle, XCircle, AlertTriangle, Loader2, Wrench, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const STATUT_STYLE = {
  succes: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle, label: 'Succès' },
  echec: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle, label: 'Échec' },
  avertissement: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle, label: 'Avertissement' },
  erreur: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle, label: 'Erreur' },
};

function ScoreBadge({ score, statut }) {
  const s = STATUT_STYLE[statut] || STATUT_STYLE.echec;
  const Icon = s.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${s.bg} ${s.text} ${s.border} border text-xs font-semibold`}>
      <Icon className="w-3.5 h-3.5" />
      {s.label} — {score}/100
    </div>
  );
}

function TraceSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-medium text-slate-700">{title}</span>
      </button>
      {open && <div className="p-3 bg-white">{children}</div>}
    </div>
  );
}

function TestResultCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const ev = result.evaluation || {};
  const s = STATUT_STYLE[ev.statut] || STATUT_STYLE.echec;
  const Icon = s.icon;

  return (
    <Card className={`border-l-4 ${s.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-5 h-5 ${s.text}`} />
              <CardTitle className="text-base">{result.scenario_nom || result.scenario?.nom}</CardTitle>
            </div>
            <p className="text-xs text-slate-500 italic">"{result.message || result.scenario?.message}"</p>
          </div>
          {ev.score !== undefined && <ScoreBadge score={ev.score} statut={ev.statut} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Réponse VENUS */}
        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-700 mb-1">Réponse VENUS</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{result.reponse || result.erreur || '—'}</p>
        </div>

        {/* Métriques rapides */}
        <div className="flex flex-wrap gap-2 text-xs">
          {result.intention_rapide && (
            <Badge variant="outline" className="bg-blue-50">Intention: {result.intention_rapide}</Badge>
          )}
          {result.intention_llm && result.intention_llm !== result.intention_rapide && (
            <Badge variant="outline" className="bg-purple-50">LLM: {result.intention_llm}</Badge>
          )}
          {result.action && (
            <Badge variant="outline" className="bg-slate-50">Action: {result.action}</Badge>
          )}
          {result.confiance !== undefined && (
            <Badge variant="outline" className="bg-slate-50">Confiance: {result.confiance}%</Badge>
          )}
          {result.temps_ms && (
            <Badge variant="outline" className="bg-slate-50">
              <Clock className="w-3 h-3 mr-1" />{result.temps_ms}ms
            </Badge>
          )}
          {result.hallucination && (
            <Badge variant="outline" className="bg-red-50 text-red-600">⚠️ Hallucination</Badge>
          )}
        </div>

        {/* Outils */}
        {result.outils && result.outils.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.outils.map((o, i) => (
              <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${o.trouve ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                <Wrench className="w-3 h-3" />
                {o.outil}
                {o.trouve ? ' ✅' : ' ❌'}
              </span>
            ))}
          </div>
        )}

        {/* Évaluation détails */}
        {ev.details && ev.details.length > 0 && (
          <div className="space-y-1">
            {ev.details.map((d, i) => (
              <p key={i} className={`text-xs ${d.includes('succès') || d.includes('satisfaits') ? 'text-emerald-600' : 'text-amber-600'}`}>
                • {d}
              </p>
            ))}
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="w-full text-xs">
          {expanded ? 'Masquer' : 'Voir'} la trace complète
        </Button>

        {expanded && result.trace && (
          <div className="space-y-2 mt-2">
            <TraceSection title="Outils & Données" defaultOpen={true}>
              {result.trace.outils_resultats && result.trace.outils_resultats.length > 0 ? (
                <div className="space-y-2">
                  {result.trace.outils_resultats.map((o, i) => (
                    <div key={i} className={`text-xs p-2 rounded ${o.trouve ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                      <span className="font-semibold">{o.outil}</span>
                      {o.trouve ? ' ✅' : ' ❌'} — {o.message}
                      <span className="text-slate-400 ml-2">({o.temps_ms}ms)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Aucun outil appelé</p>
              )}
            </TraceSection>

            <TraceSection title="Sources consultées">
              <div className="text-xs space-y-1">
                {result.trace.business_rule_id && <p>📖 Règle métier: {result.trace.business_rule_id}</p>}
                {result.trace.knowledge_id && <p>📚 Connaissance: {result.trace.knowledge_id}</p>}
                {result.trace.document_sources && result.trace.document_sources.length > 0 ? (
                  result.trace.document_sources.map((d, i) => (
                    <p key={i}>📄 Document: {d.document_titre} (score: {d.score})</p>
                  ))
                ) : (
                  <p className="text-slate-400">Aucune source RAG</p>
                )}
              </div>
            </TraceSection>

            <TraceSection title="Mémoire mise à jour">
              <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(result.trace.memoire_courte_update || {}, null, 2)}
              </pre>
            </TraceSection>

            <TraceSection title="Hallucination">
              <p className={`text-xs ${result.trace.hallucination?.suspecte ? 'text-red-600' : 'text-emerald-600'}`}>
                {result.trace.hallucination?.suspecte
                  ? `⚠️ ${result.trace.hallucination.details}`
                  : '✅ Aucune hallucination détectée'}
              </p>
            </TraceSection>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VenusTestLab() {
  const { toast } = useToast();
  const [scenarios, setScenarios] = useState([]);
  const [tools, setTools] = useState([]);
  const [running, setRunning] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [singleResult, setSingleResult] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [customPhone, setCustomPhone] = useState('+22670000099');
  const [customCountry, setCustomCountry] = useState('BF');
  const [selectedScenario, setSelectedScenario] = useState(null);

  useEffect(() => {
    loadScenarios();
    loadTools();
  }, []);

  const loadScenarios = async () => {
    try {
      const res = await base44.functions.invoke('venusTestLab', { action: 'list_scenarios' });
      setScenarios(res.scenarios || []);
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const loadTools = async () => {
    try {
      const res = await base44.functions.invoke('venusTestLab', { action: 'list_tools' });
      setTools(res.tools || []);
    } catch (e) {
      console.error('Load tools error:', e);
    }
  };

  const runScenario = async (scenarioId) => {
    setRunning(true);
    setSingleResult(null);
    setSelectedScenario(scenarioId);
    try {
      const res = await base44.functions.invoke('venusTestLab', {
        action: 'run_test',
        scenario_id: scenarioId,
      });
      setSingleResult(res);
    } catch (e) {
      toast({ title: 'Erreur de test', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const runCustom = async () => {
    if (!customMessage.trim()) {
      toast({ title: 'Message requis', variant: 'destructive' });
      return;
    }
    setRunning(true);
    setSingleResult(null);
    setSelectedScenario('custom');
    try {
      const res = await base44.functions.invoke('venusTestLab', {
        action: 'run_test',
        message: customMessage,
        telephone: customPhone,
        countryCode: customCountry,
      });
      setSingleResult(res);
    } catch (e) {
      toast({ title: 'Erreur de test', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const runBatch = async () => {
    setRunningBatch(true);
    setBatchResults(null);
    try {
      const res = await base44.functions.invoke('venusTestLab', { action: 'run_batch' });
      setBatchResults(res);
      toast({
        title: 'Tests terminés',
        description: `${res.succes}/${res.total} réussis — Score: ${res.score_global}%`,
      });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setRunningBatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="w-7 h-7 text-indigo-600" />
              Laboratoire de Test VENUS
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Validez le comportement de VENUS, les outils appelés, et l'anti-hallucination
            </p>
          </div>
          <Button
            onClick={runBatch}
            disabled={runningBatch}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {runningBatch ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Tests en cours...</>
            ) : (
              <><Play className="w-5 h-5" /> Lancer tous les tests</>
            )}
          </Button>
        </div>

        {/* Score global */}
        {batchResults && (
          <Card className="border-l-4 border-indigo-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Résultats globaux</h2>
                <div className="text-3xl font-bold text-indigo-600">{batchResults.score_global}%</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{batchResults.succes}</p>
                  <p className="text-xs text-emerald-700">Succès</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {batchResults.total - batchResults.succes - batchResults.echecs - batchResults.erreurs}
                  </p>
                  <p className="text-xs text-amber-700">Avertissements</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{batchResults.echecs + batchResults.erreurs}</p>
                  <p className="text-xs text-red-700">Échecs / Erreurs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scénarios prédéfinis */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Scénarios de test prédéfinis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scenarios.map(s => (
              <Card
                key={s.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedScenario === s.id ? 'ring-2 ring-indigo-400' : ''}`}
                onClick={() => !running && runScenario(s.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-slate-800">{s.nom}</h3>
                    {running && selectedScenario === s.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 italic mb-2">"{s.message}"</p>
                  <p className="text-xs text-slate-400">{s.attendu?.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Test personnalisé */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test personnalisé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              placeholder="Saisissez un message client de test..."
              rows={3}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={customPhone}
                onChange={e => setCustomPhone(e.target.value)}
                placeholder="Téléphone (ex: +22670000099)"
                className="sm:w-64"
              />
              <Select value={customCountry} onValueChange={setCustomCountry}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BF">Burkina Faso</SelectItem>
                  <SelectItem value="CI">Côte d'Ivoire</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={runCustom}
                disabled={running || !customMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white sm:ml-auto"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Tester
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Résultat unique */}
        {singleResult && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Résultat du test</h2>
            <TestResultCard result={singleResult} />
          </div>
        )}

        {/* Résultats batch */}
        {batchResults && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Détail des tests ({batchResults.total})</h2>
            <div className="space-y-3">
              {batchResults.results.map((r, i) => (
                <TestResultCard key={i} result={r} />
              ))}
            </div>
          </div>
        )}

        {/* Outils disponibles */}
        {tools.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-indigo-600" />
                Outils VENUS ({tools.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tools.map(t => (
                  <div key={t.nom} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-700">{t.nom}</p>
                    <p className="text-xs text-slate-500">{t.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.intentions.map(int => (
                        <span key={int} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{int}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}