import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createAudioTranscriber } from '@/lib/audioTranscriptionClient';

const configErrors = {
  OPENAI_KEY_MISSING: 'Clé OpenAI absente côté serveur.',
  OPENAI_APPROVAL_REQUIRED: 'Autorisation OpenAI absente ou désactivée côté serveur.',
  OPENAI_MODEL_UNSUPPORTED: 'Modèle OpenAI absent ou non pris en charge.',
};

export default function AudioTranscriptionSettings({ api = base44 }) {
  const [status, setStatus] = useState(null);
  const [provider, setProvider] = useState('base44');
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(null);
  const [testProvider, setTestProvider] = useState('base44');
  const lock = useRef(false);
  const attempted = useRef(false);
  const [tested, setTested] = useState(false);
  useEffect(() => {
    let active = true;
    api.functions.invoke('audioTranscription', { action: 'status' }).then(response => {
      const value = response?.data || response;
      if (active && !value?.erreur) { setStatus(value); setProvider(value.provider); setEnabled(value.enabled); }
      else if (active) setMessage('Réglages indisponibles ou accès refusé.');
    }).catch(() => { if (active) setMessage('Réglages indisponibles ou accès refusé.'); });
    return () => { active = false; };
  }, [api]);
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const response = await api.functions.invoke('audioTranscription', { action: 'save', provider, enabled });
      const value = response?.data || response;
      if (value?.erreur) throw Error(value.erreur);
      setStatus(value); setProvider(value.provider); setEnabled(value.enabled); setMessage('Réglages enregistrés et relus côté serveur.');
    } catch { setMessage('Enregistrement non confirmé. Rechargez les réglages avant toute nouvelle tentative.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const test = async () => {
    if (lock.current || attempted.current || !file || !consent) return;
    lock.current = true; attempted.current = true; setTested(true); setBusy(true);
    try { setUsed(null); setMessage(await createAudioTranscriber(api, { consent: true, test: true, testProvider, onResult: setUsed })(file)); }
    catch (error) { setMessage(error.message || 'Résultat inconnu : ne relancez pas sans vérification.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!status) return message ? <p role="status">{message}</p> : null;
  return <section className="rounded-2xl border bg-white p-5 space-y-3" aria-label="Transcription audio">
    <h2 className="font-bold">Commande express</h2>
    <p>Le formulaire écrit reste disponible quand l’audio est désactivé.</p>
    <p>Aucune clé dans l’application. Aucun changement automatique de moteur en cas d’échec.</p>
    <p>Moteur enregistré : <strong>{status.provider === 'openai' ? 'OpenAI' : status.provider === 'base44' ? 'Base44' : 'invalide'}</strong> — {status.enabled ? 'activé' : 'désactivé'}. Connexion non vérifiée par cette lecture.</p>
    {status.openai?.error && <p role="alert">{configErrors[status.openai.error] || 'Configuration OpenAI non validée.'}</p>}
    {status.openai?.model && <p>Modèle OpenAI côté serveur : {status.openai.model}</p>}
    <label>Moteur <select aria-label="Moteur des clients" value={provider} onChange={event => setProvider(event.target.value)} disabled={busy}>
      <option value="base44">Base44</option><option value="openai" disabled={!status.openai?.configured}>OpenAI</option>
    </select></label>
    <p>Base44 : {status.base44?.configured ? 'autorisé côté serveur, connexion non vérifiée' : 'non configuré / non autorisé'}. OpenAI : {status.openai?.configured ? 'paramètres présents, connexion non vérifiée' : 'non configuré / désactivé'}.</p>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy || (!enabled && !status[provider]?.configured)} /> Activer l’audio</label>
    <button type="button" disabled={busy || !status.provisioned} onClick={save}>Enregistrer les réglages</button>
    <p>Le test ne change pas le moteur des clients. Il peut consommer des crédits Base44 ou être facturé par OpenAI. Fichier fictif uniquement ; aucun enregistrement micro ici.</p>
    <label>Moteur du test <select aria-label="Moteur du test" value={testProvider} disabled={busy || tested} onChange={event => setTestProvider(event.target.value)}>
      <option value="base44">Base44</option><option value="openai" disabled={!status.openai?.configured}>OpenAI</option>
    </select></label>
    <label>Audio fictif <input type="file" accept="audio/*" disabled={busy || tested} onChange={event => setFile(event.target.files?.[0] || null)} /></label>
    <label><input type="checkbox" checked={consent} disabled={busy || tested} onChange={event => setConsent(event.target.checked)} /> J’autorise cet envoi unique et sa consommation.</label>
    <button type="button" disabled={busy || tested || !file || !consent || !status.enabled || !status[testProvider]?.configured} onClick={test}>Tester une fois ce fichier</button>
    <p role="status">{message}</p>
    {used && <p>Moteur de cette réponse : {used.provider || 'non communiqué par le serveur'}{used.model ? ` (${used.model})` : ''}.</p>}
  </section>;
}
