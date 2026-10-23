import { useEffect, useRef, useState } from "react";
import { Mic, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SmartAddressInput from "@/components/location/SmartAddressInput";
import { createExpressRecorder } from "@/lib/expressRecorder";
import { getVoiceQuartierReview } from "@/lib/expressQuartierSuggestions";
import { buildExpressCourse, createExpressSubmission, parseExpressPrice, resolveExpressQuartier, TRANSCRIPTION_UNAVAILABLE } from "../../../base44/shared/expressOrder.js";
import { mergeExpressTurn } from "../../../base44/shared/expressConversation.js";
import { resolveExpressClient, EXPRESS_PROFILE_MESSAGES } from "../../../base44/shared/expressClientContext.js";
import { loadExpressWrittenContext } from "@/lib/expressWrittenContext";

const primary = "min-h-12 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-50";
const secondary = "min-h-12 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 disabled:opacity-50";

export default function ExpressVoiceOrder({ transcribe = null, interpret = null, api = base44, onCreated, clientProfil, onCompleteProfile, onOpenChange, capabilityError = '', audioDisabled = false, textOnly = false, checkAudioAllowed = null, recorderFactory = createExpressRecorder }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({ depart: "", arrivee: "", prix: "" });
  const [country, setCountry] = useState("");
  const [context, setContext] = useState(null);
  const [currency, setCurrency] = useState('');
  const [quartierIds, setQuartierIds] = useState([]);
  const [profileStatus, setProfileStatus] = useState('idle');
  const [profileError, setProfileError] = useState('');
  const [profileRetry, setProfileRetry] = useState(0);
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [quartierChecks, setQuartierChecks] = useState({});
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('');
  const [attempted, setAttempted] = useState(false);
  const recorder = useRef(null), operation = useRef(0), abort = useRef(null);
  const submit = useRef(null), lock = useRef(false), autoStart = useRef(false);
  const micStarting = useRef(false), selected = useRef({});
  const draft = useRef({ depart: '', arrivee: '', prix: '' });
  const requested = useRef('');
  const audioWork = useRef(false);
  const panel = useRef(null);
  const lastProfileLoad = useRef(null);

  useEffect(() => {
    if (!audioDisabled && !textOnly) return;
    autoStart.current = false;
    if (micStarting.current || audioWork.current || recording !== 'idle') {
      operation.current++; abort.current?.abort(); recorder.current?.cancel();
      micStarting.current = false; audioWork.current = false; setRecording('idle'); setBusy(false);
    }
  }, [audioDisabled, textOnly]);

  useEffect(() => () => { operation.current++; abort.current?.abort(); recorder.current?.cancel(); }, []);
  useEffect(() => () => { operation.current++; abort.current?.abort(); recorder.current?.cancel(); }, [clientProfil?.id, clientProfil?.country_code]);
  useEffect(() => {
    if (recording !== "recording") return undefined;
    const started = Date.now(); setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (!open) return undefined;
    operation.current++; abort.current?.abort(); recorder.current?.cancel();
    micStarting.current = false; audioWork.current = false; lock.current = false; setBusy(false); setRecording('idle');
    let active = true;
    const profileKey = `${clientProfil?.id || ''}:${clientProfil?.country_code || ''}`;
    const preserveDraft = lastProfileLoad.current?.key === profileKey && lastProfileLoad.current.retry !== profileRetry;
    lastProfileLoad.current = {key: profileKey, retry: profileRetry};
    setProfileStatus('loading'); setProfileError(''); setContext(null); setCountry('');
    setCurrency(''); setQuartierIds([]);
    setTranscript(''); setQuartierChecks({});
    if (!preserveDraft) { selected.current = {}; setRecap(null); draft.current = { depart: '', arrivee: '', prix: '' }; setFields(draft.current); setQuestion(''); setReply(''); requested.current = ''; }
    api.auth.me().then(user => resolveExpressClient({ user, entity: api.entities.ClientExterne, profileId: clientProfil?.id }))
      .then(async value => {
        const written = textOnly ? await loadExpressWrittenContext(api, value.client) : null;
        if (active) { setContext(value); setCountry(value.country); setCurrency(written?.currency || ''); setQuartierIds(written?.quartiers.map(q => q.id) || []); setProfileStatus('ready'); }
      })
      .catch(e => { if (active) { setProfileStatus('error'); setProfileError(EXPRESS_PROFILE_MESSAGES[e.code] || (textOnly ? "Impossible de charger votre profil et les quartiers de votre ville. Vérifiez votre connexion puis rechargez le profil." : "Impossible de charger le profil. Vérifiez votre connexion puis réessayez.")); } });
    return () => { active = false; };
  }, [open, api, clientProfil?.id, clientProfil?.country_code, profileRetry]);
  useEffect(() => {
    onOpenChange?.(open);
    if (open) panel.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const cancel = () => {
    operation.current++; abort.current?.abort(); recorder.current?.cancel(); recorder.current = null;
    micStarting.current = false; audioWork.current = false; selected.current = {}; lock.current = false; autoStart.current = false;
    draft.current = { depart: '', arrivee: '', prix: '' }; requested.current = ''; setQuestion(''); setReply('');
    setOpen(false); setRecap(null); setRecording("idle");
    setFields({ depart: "", arrivee: "", prix: "" }); setError(""); setBusy(false); setSeconds(0);
    setTranscript(''); setQuartierChecks({});
  };
  const start = async () => {
    if (textOnly || audioDisabled || !transcribe || busy || recording !== "idle" || micStarting.current || lock.current || !context) return;
    micStarting.current = true;
    const token = ++operation.current; setError(""); setRecap(null); setSeconds(0); setTranscript(''); setQuartierChecks({});
    if (checkAudioAllowed) {
      let allowed = false;
      try { allowed = await checkAudioAllowed(); } catch { /* Fail closed before microphone access. */ }
      if (token !== operation.current) return;
      if (!allowed) { micStarting.current = false; setRecording('idle'); return; }
    }
    recorder.current = recorderFactory({
      onState: state => { if (token === operation.current) { setRecording(state); if (state === "idle") micStarting.current = false; } },
      onError: message => { if (token === operation.current) { micStarting.current = false; setError(message); } },
      onAudio: async blob => {
        if (token !== operation.current) return;
        audioWork.current = true; abort.current = new AbortController(); setBusy(true);
        try {
          const text = await transcribe(blob, { signal: abort.current.signal, clientContext: context.client });
          if (token === operation.current) {
            setTranscript(text);
            let turn = mergeExpressTurn(draft.current, text, requested.current);
            if (interpret && Object.values(turn.fields).some(value => !value)) {
              try {
                const structured = await interpret(text, { previous: draft.current, requested: requested.current, clientContext: context.client, signal: abort.current.signal });
                if (token !== operation.current) return;
                const combined = { ...turn.fields };
                for (const key of ['depart', 'arrivee', 'prix']) if (!combined[key] && structured[key]) combined[key] = structured[key];
                turn = { ...turn, ...mergeExpressTurn(combined, '', ''), changed: [...new Set([...turn.changed, ...Object.keys(combined).filter(key => combined[key] !== draft.current[key])])] };
              } catch { if (token !== operation.current) return; /* Bounded local interpretation remains available; no retry. */ }
            }
            const extracted = turn.fields;
            for (const key of turn.changed) delete selected.current[key];
            draft.current = extracted; requested.current = turn.requested;
            setFields(extracted); setQuestion(turn.question); setRecap(null);
            try {
              const quartiers = await api.entities.Quartier.filter({ country_code: context.country, actif: true }, "nom", 500);
              if (token === operation.current) setQuartierChecks(getVoiceQuartierReview({ fields: extracted, quartiers, country: context.country, city: context.client.ville }));
            } catch {
              if (token === operation.current) setError("Texte reconnu, mais les quartiers n’ont pas pu être vérifiés. Réessayez la vérification de votre commande.");
            }
          }
        } catch (e) { if (token === operation.current) setError(e.message || "Transcription impossible. Corrigez les trois champs ou réessayez."); }
        finally { if (token === operation.current) { audioWork.current = false; setBusy(false); } }
      },
    });
    recorder.current.start();
  };
  const begin = () => {
    if (open || lock.current) return;
    setOpen(true);
    autoStart.current = !audioDisabled && !textOnly;
  };
  useEffect(() => {
    if (open && profileStatus === 'ready' && transcribe && autoStart.current) {
      autoStart.current = false; start();
    }
  }, [open, profileStatus, transcribe]);
  const applyReply = async () => {
    if (busy || recording !== 'idle' || !reply.trim() || !context) return;
    const turn = mergeExpressTurn(draft.current, reply, requested.current);
    for (const key of turn.changed) delete selected.current[key];
    draft.current = turn.fields; requested.current = turn.requested;
    setFields(turn.fields); setQuestion(turn.question); setReply(''); setRecap(null); setError('');
    const token = ++operation.current;
    try {
      const quartiers = await api.entities.Quartier.filter({ country_code: context.country, actif: true }, 'nom', 500);
      if (token === operation.current) setQuartierChecks(getVoiceQuartierReview({ fields: turn.fields, quartiers, country: context.country, city: context.client.ville }));
    } catch { if (token === operation.current) setError('Les quartiers n’ont pas pu être vérifiés. Utilisez les suggestions des champs.'); }
  };
  const updateQuartier = (key, value, item) => {
    selected.current[key] = item?.type === "quartier" ? item : null;
    draft.current = { ...draft.current, [key]: item ? `${item.label}${item.ville ? ` (${item.ville})` : ""}` : value };
    setFields(draft.current);
    setRecap(null);
    setQuartierChecks(previous => { const next = { ...previous }; delete next[key]; return next; });
    setError('');
  };
  const quartierChoices = key => {
    const check = quartierChecks[key];
    if (!check) return null;
    const label = key === 'depart' ? 'de départ' : 'd’arrivée';
    return <div role="group" aria-label={`Confirmer le quartier ${label}`} className="space-y-2 border-l-2 border-amber-400 pl-3">
      <p className="text-sm font-semibold text-amber-900">Quel quartier {label} vouliez-vous dire ?</p>
      {check.candidates.length ? check.candidates.map(quartier => <button key={quartier.id} type="button" className={`${secondary} w-full text-left`} disabled={blocked} onClick={() => updateQuartier(key, quartier.nom, { type: 'quartier', id: quartier.id, label: quartier.nom, ville: quartier.ville })}>Choisir {quartier.nom} ({quartier.ville})</button>) : <p className="text-sm text-slate-600">Précisez le nom dans le champ et choisissez un quartier proposé.</p>}
    </div>;
  };
  const review = async () => {
    if (lock.current || busy || recording !== "idle" || profileStatus !== 'ready') return;
    lock.current = true;
    const token = ++operation.current; setBusy(true); setError("");
    try {
      const user = await api.auth.me();
      const { client } = await resolveExpressClient({ user, entity: api.entities.ClientExterne, profileId: context.client.id, expectedCountry: country });
      const written = textOnly ? await loadExpressWrittenContext(api, client) : null;
      const quartiers = written?.quartiers || await api.entities.Quartier.filter({ country_code: client.country_code, actif: true }, "nom", 500);
      if (token !== operation.current) return;
      if (written) { setCurrency(written.currency); setQuartierIds(written.quartiers.map(q => q.id)); }
      const resolve = key => {
        const exact = selected.current[key];
        if (!exact) return resolveExpressQuartier(fields[key], quartiers, client.country_code);
        const quartier = quartiers.find(q => q.id === exact.id && q.country_code === client.country_code && q.actif === true);
        if (!quartier) throw new Error("Quartier sélectionné indisponible. Choisissez une nouvelle suggestion.");
        return quartier;
      };
      const depart = resolve("depart"), arrivee = resolve("arrivee");
      const course = buildExpressCourse({ user, client, depart, arrivee, prix: parseExpressPrice(fields.prix) });
      if (token !== operation.current) return;
      submit.current = createExpressSubmission((name, payload) => api.functions.invoke(name, payload));
      setRecap({ course, draft: { client_profile_id: client.id, country_code: client.country_code, depart_id: depart.id, arrivee_id: arrivee.id, prix: course.prix_propose_client, confirmed: true } });
    } catch (e) { if (token === operation.current) setError(textOnly && !/^(?:Quartier|Position approximative|Prix incertain|Saisissez|Pays des quartiers|Veuillez|Session client|Aucun quartier|Configuration du pays)/.test(e.message || '') ? "Vérification impossible. Vos informations sont conservées ; vérifiez la connexion puis réessayez." : e.message || "Vérification impossible."); }
    finally { if (token === operation.current) { lock.current = false; setBusy(false); } }
  };
  const confirm = async () => {
    if (lock.current || !recap) return;
    lock.current = true; setAttempted(true); setBusy(true); setError("");
    const token = operation.current;
    try {
      const course = await submit.current(recap.draft);
      if (course && token === operation.current) { setAttempted(false); cancel(); onCreated?.(course); }
    } catch { if (token === operation.current) setError("Résultat de création non confirmé. Réessayez cette confirmation : le même identifiant sera conservé."); }
    finally { if (token === operation.current) { lock.current = false; setBusy(false); } }
  };
  const blocked = busy || recording !== "idle";
  const status = busy ? "Traitement en cours…" : recording === "requesting" ? "Autorisez le microphone sur votre appareil…" : recording === "recording" ? "Enregistrement en cours" : recording === "stopping" ? "Arrêt du microphone…" : profileStatus === 'loading' ? "Chargement du profil…" : error || profileError ? "Commande non envoyée" : "Vérifiez votre commande";
  return <div>
    <button type="button" data-testid="express-voice-order" onClick={begin} disabled={open} className="w-full flex items-center gap-3 rounded-lg bg-red-600 text-white p-4 shadow text-left disabled:opacity-60">
      {textOnly ? <Zap className="w-8 h-8 shrink-0" aria-hidden="true" /> : !audioDisabled && transcribe && <Mic className="w-8 h-8 shrink-0" aria-hidden="true" />}
      <span className="min-w-0"><strong className="block text-base">Commande express</strong><span className="block text-sm">{textOnly || audioDisabled ? 'Indiquez votre départ, votre arrivée et votre prix.' : 'Dites votre départ, votre arrivée et votre prix.'}</span></span>
    </button>
    {!open && !audioDisabled && transcribe && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer">Traitement de votre audio</summary><p>Le micro envoie votre enregistrement à un service externe de transcription. Vous pouvez arrêter, annuler ou saisir sans audio. Aucune course sans confirmation.</p></details>}
    {open && <section ref={panel} role="dialog" aria-modal="false" aria-label={textOnly ? "Commande express" : "Commande vocale express"} className="mt-3 scroll-mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div role="status" aria-live="polite" className={`rounded-lg p-3 font-semibold text-sm ${error || profileError ? "bg-red-50 text-red-800" : recording === "recording" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>
        {status}{recording === "recording" && <span className="ml-3 font-mono" aria-label="Durée d’enregistrement">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")} / 01:00</span>}
      </div>
      {!textOnly && !transcribe && <p className="text-sm text-slate-600">{capabilityError || (audioDisabled ? 'Audio désactivé. La saisie écrite reste disponible.' : TRANSCRIPTION_UNAVAILABLE)}</p>}
      {profileError && <div role="alert" className="space-y-2 text-sm text-red-800"><p>{profileError}</p><div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setProfileRetry(value => value + 1)}>Recharger le profil</button>{onCompleteProfile && <button type="button" className={secondary} onClick={onCompleteProfile}>Ouvrir mon profil</button>}</div></div>}
      {!audioDisabled && transcribe && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Traitement de votre audio</summary><p>En lançant le micro, vous demandez l’envoi de cet enregistrement à un service externe de transcription. L’audio ne reste pas uniquement sur votre téléphone. Aucune course ne sera créée sans confirmation.</p></details>}
      {recording === "recording" && <button type="button" className="w-full min-h-14 rounded-xl bg-red-600 px-5 py-4 text-lg font-bold text-white shadow" onClick={() => recorder.current?.stop()}>Arrêter l’enregistrement</button>}
      {!recap && <>
        {transcript && <details className="min-w-0 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><summary className="cursor-pointer font-semibold">Texte reconnu</summary><p className="mt-2 whitespace-pre-wrap break-words">{transcript}</p></details>}
        {question && <p role="status" className="text-sm font-semibold text-amber-900">{question}</p>}
        {!blocked && !audioDisabled && transcribe && <button type="button" className={secondary} disabled={profileStatus !== 'ready'} onClick={start}>Compléter par la voix</button>}
        {!textOnly && !blocked && <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm">Votre réponse<textarea rows={1} className="mt-1 min-h-12 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-base" value={reply} onChange={e => setReply(e.target.value)} placeholder="Compléter ou corriger" /></label><button type="button" className={secondary} onClick={applyReply} disabled={!reply.trim() || profileStatus !== 'ready'}>Appliquer</button></div>}
        {recording === 'recording' && <button type="button" className={secondary} onClick={() => { operation.current++; recorder.current?.cancel(); micStarting.current = false; setRecording('idle'); }}>Saisir sans audio</button>}
        <fieldset disabled={blocked} className="space-y-4 min-w-0">
          <SmartAddressInput countryCode={country} quartierOnly quartierIds={textOnly ? quartierIds : undefined} disabled={blocked || !country} label="Quartier de départ" placeholder="Saisissez au moins deux lettres" value={fields.depart} onChange={(value, item) => updateQuartier("depart", value, item)} />
          {quartierChoices('depart')}
          <SmartAddressInput countryCode={country} quartierOnly quartierIds={textOnly ? quartierIds : undefined} disabled={blocked || !country} label="Quartier d’arrivée" placeholder="Saisissez au moins deux lettres" value={fields.arrivee} onChange={(value, item) => updateQuartier("arrivee", value, item)} />
          {quartierChoices('arrivee')}
          <label className="block text-sm font-semibold text-slate-700">Prix proposé ({textOnly ? currency || '…' : 'F'})<input className="mt-1 h-12 block w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900" type={textOnly ? 'number' : 'text'} min={textOnly ? '1' : undefined} step={textOnly ? '1' : undefined} value={fields.prix} inputMode="numeric" onChange={e => { draft.current = { ...draft.current, prix: e.target.value }; setFields(draft.current); setRecap(null); }} /></label>
        </fieldset>
        <p className="text-xs text-slate-600">Positions approximatives des quartiers. Aucun destinataire requis.</p>
        <div className={textOnly ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2"}><button type="button" className={primary} disabled={blocked || profileStatus !== 'ready'} onClick={review}>{textOnly ? 'Commander' : 'Vérifier ma commande'}</button><button type="button" className={secondary} onClick={cancel}>Annuler</button></div>
      </>}
      {recap && <>
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-slate-900"><p><strong>Départ :</strong> {recap.course.adresse_depart}</p><p><strong>Arrivée :</strong> {recap.course.adresse_arrivee}</p><p><strong>Prix proposé :</strong> {recap.course.prix_propose_client} {textOnly ? currency : 'F'}</p><p className="text-sm">Le client connecté est le contact initial. Livraison standard.</p></div>
        <button type="button" className={`${primary} w-full`} disabled={busy} onClick={confirm}>Confirmer ma commande</button>
        {!attempted && <div className="grid grid-cols-2 gap-3"><button type="button" className={secondary} disabled={busy} onClick={() => setRecap(null)}>Modifier</button><button type="button" className={secondary} onClick={cancel}>Annuler</button></div>}
      </>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {attempted && <p className="text-sm text-slate-600">Une confirmation a été envoyée. Conservez ce récapitulatif pour éviter une nouvelle commande si la réponse tarde.</p>}
    </section>}
  </div>;
}
