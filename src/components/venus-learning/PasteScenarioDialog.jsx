import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/venusLearning';
import { ClipboardPaste } from 'lucide-react';

/**
 * Dialogue "Coller un texte" pour créer rapidement un scénario.
 * Colle une conversation (ex: export WhatsApp) et parse automatiquement
 * les tours Client / VENUS.
 */
export default function PasteScenarioDialog({ open, onClose, onSaved }) {
  const [texte, setTexte] = useState('');
  const [nom, setNom] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setTexte(''); setNom(''); };

  /**
   * Parse un texte brut en conversation structurée.
   * Détecte les patterns :
   *   Client: ... / VENUS: ... / Venus: ...
   *   C: ... / V: ...
   *   Sans préfixe → tout va dans "client"
   */
  const parseConversation = (raw) => {
    const lignes = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const messages = [];
    let currentRole = 'client';
    let buffer = '';

    for (const ligne of lignes) {
      // Détecter un préfixe de rôle
      const match = ligne.match(/^(client|venus|v|c|livreur|l)\s*[:\-]\s*(.*)/i);
      if (match) {
        // Flush du buffer précédent
        if (buffer.trim()) {
          messages.push({ role: currentRole, content: buffer.trim() });
          buffer = '';
        }
        const roleRaw = match[1].toLowerCase();
        currentRole = (roleRaw === 'venus' || roleRaw === 'v') ? 'venus' : 'client';
        buffer = match[2];
      } else {
        // Ligne sans préfixe — on accumule dans le tour courant
        buffer = buffer ? buffer + ' ' + ligne : ligne;
      }
    }
    // Flush final
    if (buffer.trim()) {
      messages.push({ role: currentRole, content: buffer.trim() });
    }

    return messages;
  };

  const handleCreate = async () => {
    if (!texte.trim()) return;
    setSaving(true);
    try {
      const conv = parseConversation(texte);
      const titre = nom.trim() || (conv[0]?.content?.substring(0, 60) || 'Scénario collé');
      // La réponse idéale = dernier message VENUS, ou premier message si pas de VENUS
      const dernierVenus = [...conv].reverse().find(m => m.role === 'venus');
      const reponseIdeale = dernierVenus?.content || conv[0]?.content || '';

      const data = {
        nom: titre,
        description: `Scénario créé par collage de texte (${conv.length} messages)`,
        categorie: '',
        declencheurs: JSON.stringify([]),
        conversation: JSON.stringify(conv),
        reponse_ideale: reponseIdeale,
        outils_utilises: JSON.stringify([]),
        resultat_attendu: '',
        statut: 'brouillon',
        version: 1,
      };
      const created = await base44.entities.VenusScenario.create(data);
      await logAudit('create', 'scenario', created.id, null, { ...data, source: 'paste' });
      onSaved?.();
      reset();
      onClose();
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = texte.trim() ? parseConversation(texte) : [];

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" /> Coller une conversation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom du scénario (optionnel)</Label>
            <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="Auto-généré si vide" />
          </div>
          <div>
            <Label>Conversation à coller</Label>
            <Textarea
              value={texte}
              onChange={e => setTexte(e.target.value)}
              rows={8}
              placeholder={`Collez votre conversation ici, par exemple :

Client: Bonjour, je voudrais envoyer un colis
VENUS: Bonjour ! Avec plaisir. Où doit-on récupérer le colis ?
Client: À Karpala
VENUS: Parfait. Et la destination ?
Client: Patte d'Oie`}
            />
            <p className="text-xs text-slate-500 mt-1">
              Détecte automatiquement les tours Client / VENUS. Sans préfixe, le texte est assigné au client.
            </p>
          </div>
          {preview.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-600 mb-2">Aperçu ({preview.length} messages)</p>
              {preview.map((msg, i) => (
                <div key={i} className={`p-2 rounded-lg text-xs mb-1 ${msg.role === 'client' ? 'bg-blue-50 text-slate-700' : 'bg-slate-200 text-slate-700'}`}>
                  <span className="font-semibold">{msg.role === 'client' ? 'Client' : 'VENUS'}:</span> {msg.content.substring(0, 120)}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuler</Button>
          <Button onClick={handleCreate} disabled={saving || !texte.trim()}>
            {saving ? 'Création...' : 'Créer le scénario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}