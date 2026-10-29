import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ArrowLeft, RefreshCw, Loader2, ShieldCheck, Phone, CheckCircle2, ArrowRight } from 'lucide-react';
import { createGuestSubmission, guestApi, guestStorage, newGuestAccess } from '@/lib/guestOrderClient';
import { normalizeLocationText } from '@/lib/locationSearchCore';
import { expressCurrency } from '@/lib/expressWrittenContext';
import { getCourseStatusLabel } from '@/lib/courseStatuses';
import { guestCountryFlag, guestCountryName, guestNationalInput, normalizeGuestPhone } from '@/lib/guestPhone';
import { GuestRoute } from '@/components/guest/GuestOrderPresentation';
import GuestClientHome from '@/components/guest/GuestClientHome';
import CourseTimeline from '@/components/client/CourseTimeline';
import GuestCourseMap from '@/components/guest/GuestCourseMap';
import { CountrySelectView } from '@/components/ui/CountrySelect';
import { preferredGuestCountry, reconcileGuestCourse } from '@/lib/guestTrackingState';
import '@/components/guest/guestOrder.css';

const button = 'guest-primary';
const input = 'guest-input';
const emptyDraft = { country_code: '', phone_country_code: '', depart_id: '', arrivee_id: '', prix: '', telephone: '', invitation_consent: false };

export function GuestQuartierField({ label, rows, value, onSelect, disabled = false }) {
  const selected = rows.find(q => q.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const matches = rows.filter(q => normalizeLocationText(`${q.nom} ${q.ville}`).includes(normalizeLocationText(query))).slice(0, 12);
  return <div className="min-w-0 space-y-1">
    <label className="guest-field">{label}<input className={input} disabled={disabled} value={open ? query : selected ? `${selected.nom} — ${selected.ville}` : query}
      autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`guest-${label}`} onFocus={() => { setQuery(selected?.nom || query); setOpen(true); }}
      onChange={event => { setQuery(event.target.value); onSelect(''); setOpen(true); }} /></label>
    {open && !disabled && <ul id={`guest-${label}`} role="listbox" aria-label={label} className="guest-options">
      {matches.map(q => <li key={q.id}><button role="option" aria-selected={value === q.id} type="button" className="guest-option" onClick={() => { onSelect(q.id); setQuery(q.nom); setOpen(false); }}>{q.nom} <span>— {q.ville}</span></button></li>)}
      {!matches.length && <li className="p-3 text-sm text-gray-600">Aucun quartier correspondant.</li>}
    </ul>}
  </div>;
}

/** @param {any} props */
export default function GuestOrderPage({ call: suppliedCall, storage: suppliedStorage, isolatedMap = false } = {}) {
  const navigate = useNavigate();
  const goToLogin = () => navigate('/', { state: { guestLogin: true } });
  const call = useRef(suppliedCall || guestApi()).current;
  const storage = useRef(suppliedStorage || guestStorage()).current;
  const submit = useRef(createGuestSubmission(call, storage)).current;
  const [config, setConfig] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [access, setAccess] = useState(null);
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState('home');
  const [previous, setPrevious] = useState([]);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const catalogGeneration = useRef(0);
  const trackingSequence = useRef(0);
  const nextReadAt = useRef(0);
  const retryNotBefore = useRef(0);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  useEffect(() => {
    const token = ++generation.current;
    const sequence = ++trackingSequence.current;
    const readConfig = () => call('config').then(value => { if (token === generation.current) setConfig(value); return value; }).catch(() => { const closed = { enabled: false, countries: [], unavailable: true }; if (token === generation.current) setConfig(closed); return closed; });
    const settingsPromise = readConfig();
    window.addEventListener('focus', readConfig);
    (async () => {
      try {
        const saved = await storage.read();
        if (token !== generation.current) return;
        if (saved) {
          setPrevious(saved.previous || []);
          if (saved.draft_rejected === true) {
            try {
              const recovered = await call('track', { request_id: saved.request_id, read_token: saved.read_token });
              if (token !== generation.current || sequence !== trackingSequence.current) return;
              if (recovered.course || recovered.pending) {
                setAccess(saved); setCourse(recovered.course || null); setPending(!recovered.course);
                if (!recovered.course) setError(recovered.message || 'Création encore en vérification.');
                return;
              }
            } catch (e) { if (e.code !== 'ACCESS_DENIED') throw e; }
            const settings = await settingsPromise;
            if (token !== generation.current) return;
            setConfig(settings);
            if (settings.enabled && saved.draft?.country_code) {
              const data = await call('catalog', { country_code: saved.draft.country_code });
              if (token !== generation.current) return;
              setCatalog(data); setDraft({ ...emptyDraft, ...saved.draft, phone_country_code: saved.draft.phone_country_code || saved.draft.country_code, invitation_consent: false, prix: String(saved.draft.prix ?? '') });
            }
            return;
          }
          setAccess(saved); setPending(true);
          if (saved.last_course?.reference && typeof saved.last_course.statut === 'string') setCourse(saved.last_course);
          const result = await call('track', { request_id: saved.request_id, read_token: saved.read_token });
          if (token !== generation.current || sequence !== trackingSequence.current) return;
          if (result.course) { setCourse(current => reconcileGuestCourse(current, result.course)); setPending(false); }
          else setError(result.message || 'Création encore en vérification.');
        }
      } catch (e) { if (token === generation.current) setError(`Actualisation momentanément indisponible. ${e.message}`); }
    })();
    return () => { generation.current++; catalogGeneration.current++; window.removeEventListener('focus', readConfig); };
  }, [call, storage]);

  async function loadCatalog(code, remember = false) {
    const token = ++catalogGeneration.current;
    setDraft(d => ({ ...emptyDraft, country_code: code, phone_country_code: d.phone_country_code || code, telephone: d.telephone })); setCatalog(null); setCatalogError(''); setCatalogBusy(true);
    try {
      if (remember && storage.saveCountry) await storage.saveCountry(code);
      const data = await call('catalog', { country_code: code }); if (token === catalogGeneration.current) setCatalog(data);
    }
    catch (e) { if (token === catalogGeneration.current) setCatalogError(e.message); }
    finally { if (token === catalogGeneration.current) setCatalogBusy(false); }
  }
  async function abandonDraft() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const token = generation.current;
    try {
      const saved = await storage.read();
      if (saved?.draft_rejected) await storage.save({ ...saved, draft: { ...emptyDraft, confirmed: false } });
      if (token === generation.current) { setDraft(emptyDraft); setCatalog(null); setReview(false); setView('home'); }
    } catch (e) { if (token === generation.current) setError(e.message); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); } }
  }
  function returnHome() {
    setView('home');
    const token = generation.current;
    call('config').then(value => { if (token === generation.current) setConfig(value); }).catch(() => { if (token === generation.current) setConfig({ enabled: false, countries: [], unavailable: true }); });
  }
  async function openPrevious(entry) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const token = generation.current;
    const sequence = ++trackingSequence.current;
    try { const result = await call('track', { request_id: entry.request_id, read_token: entry.read_token }); if (token === generation.current && sequence === trackingSequence.current && result.course) { setAccess(entry); setCourse(current => reconcileGuestCourse(current, result.course)); setView('track'); } }
    catch (e) { if (token === generation.current) setError(e.message); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function startOrder() {
    if (lock.current || !config?.enabled) return;
    lock.current = true; setBusy(true); setError('');
    const token = generation.current;
    try {
      const saved = await storage.read();
      if (saved && !saved.draft_rejected) {
        let latest;
        try { latest = await call('track', { request_id: saved.request_id, read_token: saved.read_token }); }
        catch (e) {
          if (e.code === 'ACCESS_DENIED' && Number.isFinite(Date.parse(saved.expires_at)) && Date.parse(saved.expires_at) <= Date.now()) latest = { expired: true };
          else throw e;
        }
        if (token !== generation.current) return;
        if (!latest.expired && (!latest.course || !['livree', 'annulee', 'terminee'].includes(latest.course.statut))) {
          setAccess(saved); setCourse(latest.course || null); setPending(!latest.course); setView('track');
          setError('Une commande est encore en cours. Retrouvez son suivi avant de recommander.'); return;
        }
        const { previous: older = [], ...last } = saved;
        const archive = [...older, { ...last, reference: latest.course?.reference || saved.reference }];
        await storage.save({ ...newGuestAccess(saved.device_token), draft: { ...emptyDraft, confirmed: false }, draft_rejected: true, previous: archive });
        if (token !== generation.current) return;
        submit.reset(); setPrevious(archive); setAccess(null); setCourse(null); setPending(false); setDraft(emptyDraft); setCatalog(null);
      }
      if (token === generation.current) {
        setView('form');
        if (!draft.country_code || !catalog || (saved && !saved.draft_rejected)) {
          const remembered = storage.readCountry ? await storage.readCountry() : '';
          if (token !== generation.current) return;
          const selected = preferredGuestCountry(config.countries, remembered);
          if (selected) await loadCatalog(selected);
        }
      }
    } catch (e) { if (token === generation.current) setError(e.message); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function operation(action, automatic = false) {
    if (lock.current) return;
    if (action === 'track' && (Date.now() < retryNotBefore.current || (automatic && Date.now() < nextReadAt.current))) return;
    lock.current = true; setBusy(true); setError('');
    const token = generation.current;
    const sequence = ++trackingSequence.current;
    if (action === 'track') nextReadAt.current = Date.now() + 30000;
    try {
      let result;
      if (action === 'create') {
        result = await submit({ ...draft, telephone: normalizeGuestPhone(draft.telephone, phoneCountry), invitation_consent: false, prix: Number(draft.prix) });
        const saved = await storage.read();
        if (token === generation.current) { setAccess(saved); setReview(false); setView('track'); }
      } else if (action === 'track') result = await call('track', { request_id: access.request_id, read_token: access.read_token });
      else {
        if (!window.confirm(action === 'cancel' ? 'Annuler définitivement cette commande ?' : action === 'consent' ? 'Refuser les invitations à créer un compte ?' : 'Rechercher un autre livreur pour cette commande ?')) return;
        result = await call(action, { request_id: access.request_id, action_token: access.action_token, ...(action === 'consent' ? { consent: false } : {}) });
      }
      if (token !== generation.current || sequence !== trackingSequence.current || !result) return;
      if (result.course && Number.isFinite(Date.parse(result.expires_at))) {
        const stored = await storage.read();
        if (stored && (action === 'create' || stored.request_id === access?.request_id)) await storage.save({ ...stored, expires_at: result.expires_at, reference: result.course.reference,
          last_course: reconcileGuestCourse(stored.last_course, result.course) });
        if (token !== generation.current) return;
      }
      if (result.course) { setCourse(current => reconcileGuestCourse(current, result.course)); setPending(false); retryNotBefore.current = 0; }
      else { setPending(true); setError(result.message || 'Résultat non confirmé. Vérifiez le suivi.'); }
    } catch (e) {
      if (token === generation.current && sequence === trackingSequence.current) {
        if (action === 'track') {
          retryNotBefore.current = Date.now() + Math.max(30000, e.retryAfterMs || 0);
          setError(`Actualisation momentanément indisponible. Dernier état connu conservé. ${e.message}`);
          return;
        }
        setError(e.message);
        if (action === 'create' && e.draftRejected === true) {
          setAccess(null); setPending(false); setReview(false); setView('form');
          if (e.code === 'DISABLED') setConfig(value => value ? { ...value, enabled: false } : value);
          return;
        }
        // A lost response keeps the durable attempt and locks the original draft.
        if (action === 'create') {
          const saved = await storage.read().catch(() => null);
          if (token === generation.current && saved) { setAccess(saved); setPending(true); setReview(false); setView('track'); }
        }
      }
    } finally { if (token === generation.current) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    if (!access || !course || ['livree', 'annulee', 'terminee'].includes(course.statut)) return;
    const refresh = () => { if (document.visibilityState === 'visible' && !lock.current) operation('track', true); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [access, course?.statut, error]);
  useEffect(() => {
    const back = () => { if (review) setReview(false); else setView('home'); };
    let disposed = false;
    let subscription;
    if (Capacitor.isNativePlatform()) CapacitorApp.addListener('backButton', back).then(handle => {
      if (disposed) handle.remove(); else subscription = handle;
    }).catch(() => {});
    document.addEventListener('silgapp:guest-back', back);
    return () => { disposed = true; subscription?.remove(); document.removeEventListener('silgapp:guest-back', back); };
  }, [review]);
  const currency = catalog ? expressCurrency(catalog.country) : '';
  const phoneCountries = catalog?.phone_countries || [];
  const phoneCountry = phoneCountries.find(c => c.code === draft.phone_country_code);
  const phoneDial = String(phoneCountry?.indicatif || '').replace(/\D/g, '');
  const amount = value => value == null ? '—' : Number(value).toLocaleString('fr-FR');
  function prepareReview(event) {
    event.preventDefault(); setError('');
    if (!catalog || !draft.depart_id || !draft.arrivee_id || !draft.telephone.trim() || !Number.isSafeInteger(Number(draft.prix)) || Number(draft.prix) <= 0 || Number(draft.prix) < Number(catalog.country.prix_minimum)) {
      setError('Vérifiez les quartiers, le téléphone et le prix minimum du pays.'); return;
    }
    try {
      if (!phoneCountry) throw Error('Les pays du téléphone sont indisponibles. Réessayez le chargement.');
      normalizeGuestPhone(draft.telephone, phoneCountry);
      setReview(true);
    } catch (e) { setError(e.message); }
  }
  return <main className="guest-order">
    <div className="guest-shell">
      <header className="guest-header"><button type="button" title="Retour à l’accueil" aria-label="Retour à l’accueil" onClick={() => { if (review) setReview(false); else returnHome(); }} className="guest-icon"><ArrowLeft className="h-5 w-5" /></button><span className="guest-brand"><img src="/silgapp-notification-blue.png" alt="" />SILGAPP</span></header>
      {view !== 'home' && <div className="guest-intro"><p className="guest-eyebrow">{view === 'track' ? 'SUIVI PRIVÉ' : 'SANS COMPTE'}</p><h1>{view === 'track' ? 'Votre livraison' : 'Votre commande'}</h1></div>}
      {error && <p role="alert" className="guest-notice">{error}</p>}
      {view === 'home' ? <GuestClientHome enabled={config?.enabled === true} loading={!config} course={course} onOrder={startOrder} onTrack={() => setView('track')} onLogin={() => setLoginPrompt(true)} previous={previous} onPrevious={openPrevious} /> : course && view === 'track' ? <section aria-label="Suivi privé">
        <h2 className="guest-eyebrow">{course.reference || 'Votre course'}</h2>
        <p className="guest-status"><CheckCircle2 aria-hidden="true" />{course.assigned && ['livreur_en_route', 'client_contacte'].includes(course.statut) ? 'Livreur trouvé' : getCourseStatusLabel(course.statut)}</p>
        <GuestCourseMap course={course} isolated={isolatedMap} />
        {course.assigned && !course.driver_position && !course.delivered && <p className="guest-muted py-3">Position récente du livreur indisponible.</p>}
        <GuestRoute depart={course.depart} arrivee={course.arrivee} />
        {course.price_decision_required && <p role="alert" className="text-sm text-amber-800">Un autre prix a été proposé. Contactez l’administration avant de poursuivre.</p>}
        <div className="guest-total"><span>Montant de la course</span><strong>{amount(course.prix)} {course.devise}</strong></div>
        {course.statut !== 'annulee' && <div className="guest-timeline py-4"><CourseTimeline statut={course.statut} typeCourse="expedier" /></div>}
        {course.pickup_at && <p>Récupération : {new Date(course.pickup_at).toLocaleString('fr-FR')}</p>}
        <div className="guest-actions"><button type="button" className="guest-secondary" disabled={busy} onClick={() => operation('track')}><RefreshCw className="h-4 w-4" />Actualiser</button>
        {course.can_cancel && <button type="button" disabled={busy} className="guest-danger" onClick={() => operation('cancel')}>Annuler la commande</button>}
        {course.decision_required && <button type="button" disabled={busy} className={button} onClick={() => operation('retry_dispatch')}>Rechercher un autre livreur</button>}
        {course.invitation_consent && <button type="button" disabled={busy} className="block py-2 text-sm text-gray-600 underline" onClick={() => operation('consent')}>Ne plus recevoir d’invitation</button>}
        </div>{course.delivered && <div className="guest-complete"><p>Créez votre compte pour accéder à votre espace personnel et à votre historique.</p><button type="button" className={button} onClick={() => navigate('/', { state: { guestSignup: true } })}>Créer mon compte</button><button type="button" className="guest-secondary" onClick={returnHome}>Plus tard</button></div>}
      </section> : access || pending ? <section className="guest-actions"><p className="guest-muted">Votre tentative est conservée sur cet appareil.</p><button type="button" disabled={busy} className={button} onClick={() => operation('track')}>Actualiser le suivi</button><button type="button" disabled={busy} className="guest-secondary" onClick={() => operation('create')}>Vérifier la création initiale</button></section> : !config ? <p role="status">{error ? 'Chargement impossible.' : 'Chargement…'}</p> : !config.enabled ? <div className="guest-disabled"><p>Les nouvelles commandes sans compte sont indisponibles.</p><button type="button" className={button} onClick={() => navigate('/')}>Se connecter</button></div> : <form onSubmit={prepareReview} className="guest-form">
        <label className="guest-field">Pays<select required className={input} value={draft.country_code} onChange={e => loadCatalog(e.target.value, true)}><option value="">Choisir le pays de la course</option>{config.countries.map(code => <option key={code} value={code}>{guestCountryName(code)}</option>)}</select></label>
        {catalogBusy && <p role="status">Chargement des quartiers…</p>}
        {catalogError && <p role="alert">{catalogError} <button type="button" className="text-blue-700 underline" onClick={() => loadCatalog(draft.country_code)}>Réessayer</button></p>}
        {catalog && <><GuestQuartierField label="Départ" rows={catalog.quartiers} value={draft.depart_id} onSelect={id => setDraft(d => ({ ...d, depart_id: id }))} /><GuestQuartierField label="Arrivée" rows={catalog.quartiers} value={draft.arrivee_id} onSelect={id => setDraft(d => ({ ...d, arrivee_id: id }))} />
          <label className="guest-field">Prix proposé ({currency})<input required type="text" inputMode="numeric" pattern="[0-9]+" className={input} value={draft.prix} onChange={e => setDraft(d => ({ ...d, prix: e.target.value }))} /></label>
          <div className="guest-phone"><div className="guest-field"><span>Pays du téléphone</span><CountrySelectView ariaLabel="Pays du téléphone" countries={phoneCountries.map(c => ({ ...c, emoji_flag: guestCountryFlag(c.code) }))} value={draft.phone_country_code} onChange={code => setDraft(d => ({ ...d, phone_country_code: code }))} className="guest-phone-select" /></div>
          <label className="guest-field">Téléphone de contact<span className="guest-phone-number"><span className="guest-dial" aria-hidden="true">+{phoneDial || '—'}</span><input required type="tel" inputMode="tel" autoComplete="tel-national" aria-describedby="guest-phone-purpose" className={input} value={draft.telephone} onChange={e => setDraft(d => ({ ...d, telephone: guestNationalInput(e.target.value, phoneCountry) }))} /></span></label><p id="guest-phone-purpose" className="guest-muted">Pour vous joindre au sujet de cette livraison.</p></div>
          <button type="submit" className={button}>Vérifier ma commande<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" disabled={busy} className="guest-quiet" onClick={abandonDraft}>Abandonner le brouillon</button>
        </>}
      </form>}
      {busy && <p role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Vérification…</p>}
      <p className="guest-private"><ShieldCheck aria-hidden="true" />Accès privé sur cet appareil</p>
      {loginPrompt && <div role="dialog" aria-modal="true" aria-label="Connexion requise" className="guest-modal"><div className="guest-review"><h2>Connectez-vous à votre espace</h2><p className="guest-muted">Cette rubrique nécessite un compte. Vous pouvez continuer à commander sans compte.</p><div className="guest-actions mt-5"><button type="button" className={button} onClick={goToLogin}>Se connecter</button><button type="button" className="guest-secondary" onClick={() => setLoginPrompt(false)}>Continuer sans compte</button></div></div></div>}
      {review && <div role="dialog" aria-modal="true" aria-labelledby="guest-review-title" className="guest-modal"><div className="guest-review">
        <p className="guest-eyebrow">DERNIÈRE VÉRIFICATION</p><h2 id="guest-review-title">Confirmer votre commande</h2><GuestRoute depart={catalog.quartiers.find(q => q.id === draft.depart_id)?.nom} arrivee={catalog.quartiers.find(q => q.id === draft.arrivee_id)?.nom} /><div className="guest-total"><span>Prix proposé</span><strong>{amount(draft.prix)} {currency}</strong></div><p className="guest-contact"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />+{normalizeGuestPhone(draft.telephone, phoneCountry)}</p>
        <div className="guest-actions"><button type="button" disabled={busy} className={button} onClick={() => operation('create')}>Confirmer la commande</button><button type="button" disabled={busy} className="guest-secondary" onClick={() => setReview(false)}>Modifier</button></div>
      </div></div>}
    </div>
  </main>;
}
