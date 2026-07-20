import React, { useState } from 'react';
import { Sparkles, Send, Loader2, TrendingUp, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const SUGGESTED_QUESTIONS = [
  "Pourquoi les réclamations augmentent-elles ?",
  "Quels quartiers génèrent le plus de commandes ?",
  "Quels workflows échouent le plus ?",
  "Quels sont les meilleurs livreurs cette semaine ?",
  "Quelles sont les heures de pointe ?",
  "Quelles améliorations recommandes-tu ?",
];

export default function AdminAssistantTab() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  const askQuestion = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_question', question: query }),
      });
      const json = await res.json();
      if (json.success) {
        setAnswer(json);
      } else {
        setAnswer({ reponse: 'Erreur: ' + (json.error || 'Réponse non disponible') });
      }
    } catch (e) {
      setAnswer({ reponse: 'Erreur de connexion' });
    } finally {
      setLoading(false);
      setQuestion('');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            Assistant Administrateur VENUS
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Posez vos questions business — VENUS analyse les données et vous répond avec des recommandations.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex: Pourquoi les retards augmentent-ils dans le quartier X ?"
                className="min-h-[80px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    askQuestion();
                  }
                }}
              />
              <Button
                onClick={() => askQuestion()}
                disabled={loading || !question.trim()}
                className="self-end"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>

            {/* Suggested Questions */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuestion(q)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded-full border bg-muted/30 hover:bg-muted/50 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Answer */}
      {answer && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-5 h-5 text-primary" />
              Réponse de VENUS
              {answer.niveau_confiance && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Confiance: {answer.niveau_confiance}%
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{answer.reponse}</p>
            </div>

            {answer.donnees_cles && (
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Données clés</p>
                <p className="text-sm text-foreground">{answer.donnees_cles}</p>
              </div>
            )}

            {answer.recommandation && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-primary mb-1">Recommandation</p>
                    <p className="text-sm text-foreground">{answer.recommandation}</p>
                  </div>
                </div>
              </div>
            )}

            {answer.sources && (
              <div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">Sources: </span>{answer.sources}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}