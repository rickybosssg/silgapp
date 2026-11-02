import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, Pencil, Check, X } from 'lucide-react';
import { normalizeCourseFunctionResult } from '@/lib/courseFunctionResult';
import { withRequestDeadline } from '@/lib/guestTrackingState';

export default function ClientRelaunchActions({ identity, context = null, readContext = null, execute, onConfirmed = null, disabled = false, searchMode = false }) {
  const key = `silgapp_relaunch_v1:${identity}`;
  const [current, setCurrent] = useState(context || null);
  const [editing, setEditing] = useState(false), [price, setPrice] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [retryAt, setRetryAt] = useState(0);
  const [attempt, setAttempt] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const lock = useRef(false);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const cooling = retryAt > clock;
  useEffect(() => {
    let gone = false;
    setCurrent(context || null);
    try { const saved = localStorage.getItem(key); setAttempt(saved ? JSON.parse(saved) : null); }
    catch { setError('Tentative locale illisible. Actualisez le suivi avant de continuer.'); }
    if (readContext) withRequestDeadline(readContext(), 15000, 'Lecture indisponible. Actualisez avant de continuer.').then(raw => {
      const result = normalizeCourseFunctionResult(raw);
      if (result?.success !== true || !result.context) throw Error(result?.error || 'Actualisation indisponible.');
      if (!gone) {
        setCurrent(result.context);
        if (!searchMode && !result.context.waiting && result.context.state === 'confirmed') onConfirmed?.(result);
      }
    }).catch(e => { if (!gone) setError(e.message); });
    return () => { gone = true; };
  }, [key, context?.revision]);
  const serverPending = ['pending', 'publishing'].includes(current?.state);
  const storedAttempt = attempt || (serverPending && current.operation_id ? { operation_id: current.operation_id, mode: current.mode, new_price: current.price, expected_revision: current.revision } : null);
  async function send(mode) {
    if (lock.current || disabled || !current || Date.now() < retryAt) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let payload = storedAttempt;
      if (!payload) {
        const value = mode === 'same_price' ? current.price : Number(price);
        if (!Number.isSafeInteger(value) || value <= 0 || (current.minimum != null && value < current.minimum)) throw Error('Verifiez le prix et le minimum du service.');
        payload = { operation_id: crypto.randomUUID(), mode, new_price: value, expected_revision: current.revision, ...(searchMode ? { search_price_change: true } : {}) };
        localStorage.setItem(key, JSON.stringify(payload));
        if (localStorage.getItem(key) !== JSON.stringify(payload)) throw Error('Impossible de conserver la tentative. Aucun envoi effectue.');
        setAttempt(payload);
      } else if (readContext) {
        const checked = normalizeCourseFunctionResult(await withRequestDeadline(readContext(), 15000, 'Etat non confirme. Actualisez avant de reprendre.'));
        if (checked?.success !== true || !checked.context) throw Error('Etat non confirme. Actualisez avant de reprendre.');
        setCurrent(checked.context);
        if (checked.context.operation_id === payload.operation_id && checked.context.state === 'confirmed' && !checked.context.waiting) {
          localStorage.removeItem(key); setAttempt(null); onConfirmed?.(checked); return;
        }
      }
      const result = normalizeCourseFunctionResult(await withRequestDeadline(execute(payload), 30000, 'Resultat incertain. Actualisez le suivi puis reprenez cette tentative.'));
      if (result?.success === true && !result.pending) {
        localStorage.removeItem(key); setAttempt(null); setEditing(false); onConfirmed?.(result);
      } else {
        if (result?.retry_after) setRetryAt(Date.now() + Number(result.retry_after) * 1000);
        throw Error(result?.message || result?.error || 'Relance non confirmee. Reprenez la meme tentative.');
      }
    } catch (e) {
      const data = e?.response?.data;
      if (['PRICE_INVALID', 'TARIFF_CONFIG', 'COUNTRY_CONFIG', 'STALE_COURSE', 'NEW_DECISION'].includes(data?.code || e?.code)) {
        localStorage.removeItem(key); setAttempt(null);
        if (readContext) {
          try { const fresh = normalizeCourseFunctionResult(await withRequestDeadline(readContext(), 15000, 'Actualisation indisponible.')); if (fresh?.success && fresh.context) setCurrent(fresh.context); } catch { /* Keep the last known state on a read failure. */ }
        }
      }
      if (e?.retryAfterMs) setRetryAt(Date.now() + e.retryAfterMs);
      setError(data?.error || e.message || 'Relance non confirmee.');
    } finally { lock.current = false; setBusy(false); }
  }
  const button = 'w-full min-h-12 rounded-lg px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 whitespace-normal';
  return <div className="space-y-3" aria-label="Relancer cette course">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!current ? <p role="status">Lecture du prix confirme…</p> : <>
      <p className="text-sm">Prix actuel : <strong>{current.price == null ? 'Indisponible' : Number(current.price).toLocaleString('fr-FR')} {current.currency}</strong></p>
      {storedAttempt ? <button type="button" className={`${button} bg-blue-700 text-white`} disabled={busy || disabled || cooling} onClick={() => send(storedAttempt.mode)}><RotateCw size={18} />Reprendre la relance en cours</button> : <>
        {!searchMode && <button type="button" className={`${button} bg-blue-700 text-white`} disabled={busy || disabled || current.price == null || !current.waiting} onClick={() => send('same_price')}><RotateCw size={18} />Relancer au même prix</button>}
        <button type="button" className={`${button} ${searchMode ? 'bg-red-600 text-white' : 'border border-blue-700 text-blue-800'}`} disabled={busy || disabled || !(searchMode ? current.can_edit_search_price : current.waiting)} onClick={() => { setPrice(String(current.price ?? '')); setEditing(true); }}><Pencil size={18} />{searchMode ? 'Modifier le prix' : 'Modifier le prix et relancer'}</button>
        {editing && <div className="space-y-3"><label className="block text-sm">{searchMode ? 'Nouveau montant' : 'Nouveau prix'} ({current.currency})<input className="mt-1 block w-full rounded-lg border bg-white p-3 text-gray-900" type="text" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} disabled={busy} /></label>
          <button type="button" className={`${button} bg-blue-700 text-white`} disabled={busy || disabled} onClick={() => send('new_price')}><Check size={18} />{searchMode ? 'Valider' : 'Confirmer le prix et relancer'}</button>
          <button type="button" className={button} disabled={busy} onClick={() => setEditing(false)}><X size={18} />Annuler la modification</button></div>}
      </>}
    </>}
    {busy && <p role="status" className="text-sm">Confirmation en cours…</p>}
    {cooling && <p role="status" className="text-sm">Nouvelle tentative possible dans {Math.ceil((retryAt - clock) / 1000)} s.</p>}
  </div>;
}
