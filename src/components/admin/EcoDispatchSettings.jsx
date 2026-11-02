import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { normalizeCourseFunctionResult } from '@/lib/courseFunctionResult';
import { Switch } from '@/components/ui/switch';

const settingsError = error => Number(error?.response?.status) === 404
  ? 'Service des réglages Éco indisponible (manageEcoSettings, HTTP 404). Déploiement serveur compatible à vérifier. Aucune valeur modifiée.'
  : error?.response?.data?.error || error?.message || 'Lecture des réglages indisponible.';

export default function EcoDispatchSettings() {
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [countryError, setCountryError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const lock = useRef(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setCountryError('');
    (async () => {
      const response = normalizeCourseFunctionResult(await base44.functions.invoke('manageEcoSettings', { action: 'countries' }));
      if (response?.success !== true || !Array.isArray(response.countries)) throw Error(response?.error || 'Liste des pays non confirmée.');
      if (cancelled) return;
      setAllowed(true);
      setCountries(response.countries);
      if (!response.countries.length) setCountryError('Aucun pays actif disponible.');
    })().catch(e => { if (!cancelled) { setAllowed(false); setCountryError(settingsError(e)); } });
    return () => { cancelled = true; };
  }, [reload]);
  useEffect(() => {
    const current = ++sequence.current;
    setSettings(null); setError('');
    if (!country || !allowed) return;
    setBusy(true);
    base44.functions.invoke('manageEcoSettings', { action: 'read', country_code: country }).then(raw => {
      const result = normalizeCourseFunctionResult(raw);
      if (!result?.success || !result.settings) throw Error(result?.error || 'Configuration indisponible.');
      if (current === sequence.current) setSettings(result.settings);
    }).catch(e => { if (current === sequence.current) setError(settingsError(e)); })
      .finally(() => { if (current === sequence.current) setBusy(false); });
    return () => { sequence.current++; };
  }, [country, allowed]);
  async function save(setting, value) {
    if (lock.current || !settings?.[setting]?.configured) return;
    const selectedCountry = country, current = sequence.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = normalizeCourseFunctionResult(await base44.functions.invoke('manageEcoSettings', { action: 'set', country_code: country, setting, value, revision: settings[setting].revision }));
      if (result?.success !== true) throw Error(result?.error || 'Modification non confirmée.');
      const read = normalizeCourseFunctionResult(await base44.functions.invoke('manageEcoSettings', { action: 'read', country_code: selectedCountry }));
      if (read?.success !== true || !read.settings) throw Error('Actualisation indisponible.');
      if (current === sequence.current) setSettings(read.settings);
    } catch (e) { if (current === sequence.current) { setSettings(null); setError(settingsError(e)); } }
    finally { lock.current = false; if (current === sequence.current) setBusy(false); }
  }
  if (!allowed) return countryError ? <div><p role="alert">{countryError}</p><button type="button" onClick={() => setReload(v => v + 1)}>Réessayer</button></div> : <p role="status">Vérification des droits et des pays…</p>;
  return <section className="space-y-3 border-t border-gray-200 pt-5">
    <h3 className="font-bold">Éco et optimisation sur trajet</h3>
    {countryError && <p role="alert">{countryError}</p>}
    <label className="block text-sm">Pays<select className="mt-1 block w-full rounded-lg border bg-white p-2 text-gray-900" value={country} disabled={busy} onChange={e => setCountry(e.target.value)}><option value="">Sélectionner un pays</option>{countries.map(c => <option key={c.code} value={c.code}>{c.nom}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status">Chargement…</p>}
    {settings && <>{settings.EMERGENCY_STOP.value && <p role="status" className="text-sm text-amber-800">Arrêt d’urgence actif : les réglages ci-dessous restent conservés.</p>}
      {[['ENABLED', 'Courses en mode Éco'], ['ON_ROUTE_ENABLED', 'Optimisation sur trajet'], ['EMERGENCY_STOP', 'Arrêt général Éco et optimisation — pays sélectionné']].map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><label htmlFor={`eco-${key}`}>{label}{!settings[key]?.configured && <span className="block text-xs">Non configuré</span>}</label><Switch id={`eco-${key}`} checked={settings[key]?.value === true} disabled={busy || !settings[key]?.configured} onCheckedChange={value => save(key, value)} /></div>)}
    </>}
  </section>;
}
