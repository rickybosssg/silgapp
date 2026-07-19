import React, { useState, useRef, useEffect } from 'react';
import { Send, FlaskConical, RotateCcw, Bot, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const PAYS = { BF: { nom: 'Burkina Faso', prix_km: 300, minimum: 1000, devise: 'FCFA' } };

export default function WorkflowSimulatorTab({ workflows }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [executionId, setExecutionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleStart = async () => {
    if (!selectedCode) { toast({ title: 'Sélectionnez un workflow', variant: 'destructive' }); return; }
    setMessages([]);
    setExecutionId(null);
    setBusy(true);
    try {
      const result = await base44.functions.invoke('venusWorkflowEventHandler', {
        action: 'simulate_start',
        workflow_code: selectedCode,
        telephone: '+22670000099',
        profileName: 'Admin Test',
        countryCode: 'BF',
      });
      if (result?.reponse) {
        setMessages([{ role: 'venus', text: result.reponse }]);
        setExecutionId(result.execution_id);
      }
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || !executionId) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setBusy(true);
    try {
      const result = await base44.functions.invoke('venusWorkflowEventHandler', {
        action: 'simulate_respond',
        execution_id: executionId,
        message: userMsg,
      });
      if (result?.reponse) {
        setMessages(prev => [...prev, { role: 'venus', text: result.reponse }]);
      }
      if (result?.termine) {
        setMessages(prev => [...prev, { role: 'system', text: '✅ Workflow terminé' }]);
      }
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleReset = () => {
    setMessages([]);
    setExecutionId(null);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-3">
        <Select value={selectedCode} onValueChange={setSelectedCode}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Sélectionner un workflow" /></SelectTrigger>
          <SelectContent>
            {workflows.map(wf => <SelectItem key={wf.id} value={wf.code}>{wf.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={handleStart} size="sm" disabled={busy || !selectedCode}>
          <FlaskConical className="w-4 h-4 mr-1" /> Démarrer la simulation
        </Button>
        <Button onClick={handleReset} size="sm" variant="ghost"><RotateCcw className="w-4 h-4" /> Réinitialiser</Button>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-xl border border-border p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FlaskConical className="w-10 h-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Sélectionnez un workflow et démarrez la simulation pour tester le déroulement étape par étape.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role !== 'user' && (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'venus' ? 'bg-primary' : 'bg-muted'
                }`}>
                  {msg.role === 'venus' ? <Bot className="w-4 h-4 text-white" /> : <FlaskConical className="w-4 h-4 text-muted-foreground" />}
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                msg.role === 'user' ? 'bg-primary text-white' :
                msg.role === 'venus' ? 'bg-muted text-foreground' :
                'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {busy && <div className="flex justify-start"><div className="bg-muted rounded-2xl px-3 py-2 text-sm text-muted-foreground animate-pulse">VENUS réfléchit...</div></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={!executionId || busy}
          placeholder={executionId ? "Tapez votre réponse..." : "Démarrez la simulation d'abord"}
          className="flex-1 px-4 py-2 rounded-xl border border-input bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <Button onClick={handleSend} disabled={!executionId || busy || !input.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}