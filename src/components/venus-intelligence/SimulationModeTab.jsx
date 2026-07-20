import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, User, Send, Trophy, RefreshCw, Target, BookOpen, Workflow, AlertCircle, Lightbulb } from 'lucide-react';

const VENUS_PROMPT = `Tu es VENUS, l'assistante virtuelle SILGAPP sur WhatsApp.
Tu aides les clients à envoyer/recevoir des colis, se déplacer, commander en pharmacie/restaurant/boutique.
RÈGLES:
- Ne JAMAIS inventer un tarif — le livreur confirme le prix.
- Toujours utiliser la course active.
- Demander uniquement les informations manquantes.
- Ne jamais demander deux fois la même information.
- Ne jamais communiquer le PIN/QR avant l'arrivée du livreur.
- Tu es bienveillante, concise, professionnelle.
Réponds en français, format WhatsApp (court, pas d'emojis).`;

export default function SimulationModeTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'client', content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);
    try {
      const convStr = newMsgs.map(m => `${m.role === 'client' ? 'Client' : 'VENUS'}: ${m.content}`).join('\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `${VENUS_PROMPT}\n\nConversation:\n${convStr}\n\nRéponds au dernier message du client.`,
        response_json_schema: {
          type: 'object',
          properties: {
            reponse: { type: 'string', description: 'Réponse de VENUS' },
            intention_reconnue: { type: 'string' },
            connaissances_utilisees: { type: 'array', items: { type: 'string' } },
            workflow_utilise: { type: 'string' },
            confiance: { type: 'number' },
            erreurs: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
        },
      });
      const venusMsg = { role: 'venus', content: res.reponse || '...' };
      setMessages([...newMsgs, venusMsg]);
      setAnalytics([...analytics, res]);
    } catch (e) {
      setMessages([...newMsgs, { role: 'venus', content: 'Erreur: ' + e.message }]);
    }
    setLoading(false);
  };

  const finish = () => {
    const allIntentions = analytics.map(a => a.intention_reconnue).filter(Boolean);
    const allKnowledge = [...new Set(analytics.flatMap(a => a.connaissances_utilisees || []))];
    const allWorkflows = [...new Set(analytics.map(a => a.workflow_utilise).filter(Boolean))];
    const allErrors = analytics.flatMap(a => a.erreurs || []);
    const allSuggestions = [...new Set(analytics.flatMap(a => a.suggestions || []))];
    const avgConfiance = analytics.length > 0 ? Math.round(analytics.reduce((s, a) => s + (a.confiance || 0), 0) / analytics.length) : 0;
    setEvaluation({ totalMessages: messages.length, intentions: allIntentions, knowledge: allKnowledge, workflows: allWorkflows, errors: allErrors, suggestions: allSuggestions, score: avgConfiance });
  };

  const reset = () => { setMessages([]); setAnalytics([]); setEvaluation(null); setInput(''); };

  if (evaluation) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl p-6 text-white text-center shadow-lg">
          <Trophy className="w-12 h-12 mx-auto mb-2 opacity-90" />
          <p className="text-xs opacity-80 uppercase tracking-widest">Score de simulation</p>
          <p className="text-5xl font-black">{evaluation.score}%</p>
          <p className="text-xs opacity-70 mt-1">{evaluation.totalMessages} messages échangés</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><Target className="w-4 h-4 text-blue-500" /><p className="text-xs font-bold text-gray-500 uppercase">Intentions reconnues</p></div>
            {evaluation.intentions.length === 0 ? <p className="text-xs text-gray-400">—</p> : evaluation.intentions.map((i, idx) => <p key={idx} className="text-xs text-gray-700">• {i}</p>)}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><Workflow className="w-4 h-4 text-purple-500" /><p className="text-xs font-bold text-gray-500 uppercase">Workflows utilisés</p></div>
            {evaluation.workflows.length === 0 ? <p className="text-xs text-gray-400">—</p> : evaluation.workflows.map((w, idx) => <p key={idx} className="text-xs text-gray-700">• {w}</p>)}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-green-500" /><p className="text-xs font-bold text-gray-500 uppercase">Connaissances utilisées</p></div>
            {evaluation.knowledge.length === 0 ? <p className="text-xs text-gray-400">—</p> : evaluation.knowledge.map((k, idx) => <p key={idx} className="text-xs text-gray-700">• {k}</p>)}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-xs font-bold text-gray-500 uppercase">Erreurs</p></div>
            {evaluation.errors.length === 0 ? <p className="text-xs text-green-600">Aucune erreur 🎉</p> : evaluation.errors.map((e, idx) => <p key={idx} className="text-xs text-red-600">• {e}</p>)}
          </div>
        </div>
        {evaluation.suggestions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><Lightbulb className="w-4 h-4 text-amber-500" /><p className="text-xs font-bold text-gray-500 uppercase">Suggestions d'amélioration</p></div>
            {evaluation.suggestions.map((s, idx) => <p key={idx} className="text-xs text-gray-700">• {s}</p>)}
          </div>
        )}
        <Button onClick={reset} className="w-full"><RefreshCw className="w-4 h-4 mr-1" />Nouvelle simulation</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
            <div><p className="text-sm font-bold text-gray-900">Simulation VENUS</p><p className="text-[10px] text-gray-400">Vous jouez le rôle du client</p></div>
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && <Button size="sm" variant="outline" onClick={finish}><Trophy className="w-3.5 h-3.5 mr-1" />Terminer</Button>}
            {messages.length > 0 && <Button size="sm" variant="ghost" onClick={reset}><RefreshCw className="w-3.5 h-3.5" /></Button>}
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Tapez un message en tant que client pour commencer la simulation.</p>
              <p className="text-xs mt-1">Ex: « Bonjour », « Je veux envoyer un colis », « Combien ça coûte ? »</p>
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-2 ${m.role === 'venus' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'venus' ? 'bg-violet-100' : 'bg-gray-200'}`}>
                {m.role === 'venus' ? <Bot className="w-4 h-4 text-violet-600" /> : <User className="w-4 h-4 text-gray-500" />}
              </div>
              <div className={`rounded-2xl px-3 py-2 max-w-[75%] ${m.role === 'venus' ? 'bg-violet-500 text-white' : 'bg-white border border-gray-100 text-gray-900'}`}>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 flex-row-reverse">
              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-violet-600" /></div>
              <div className="rounded-2xl px-3 py-2 bg-violet-500 text-white"><div className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-gray-100 flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message du client..." disabled={loading} />
          <Button onClick={send} disabled={loading || !input.trim()}><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}