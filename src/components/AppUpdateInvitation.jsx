import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { Download, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { updateInvitation } from '@/lib/appUpdatePolicy';

const WEEK = 7 * 24 * 60 * 60 * 1000;
let request;
// One read per application launch, without retries or any session mutation.
const readPolicy = () => request ||= base44.functions.invoke('getAppUpdatePolicy', {}).then(r => r?.data ?? r);

export default function AppUpdateInvitation() {
  const [offer, setOffer] = useState(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const platform = Capacitor.getPlatform();
    (async () => {
      const [info, policy] = await Promise.all([App.getInfo(), readPolicy()]);
      if (policy?.success !== true) return;
      const next = updateInvitation(policy.platforms?.[platform], platform, info.version);
      if (!next) return;
      const key = `silgapp-update:${platform}:${next.version}`;
      const { value } = await Preferences.get({ key });
      if (value && Number(value) > Date.now()) return;
      if (active) setOffer({ ...next, key });
    })().catch(() => { /* An unavailable optional invitation must not interrupt a course. */ });
    return () => { active = false; };
  }, []);
  if (!offer) return null;
  const dismiss = () => {
    const key = offer.key;
    setOffer(null);
    void Preferences.set({ key, value: String(Date.now() + WEEK) }).catch(() => {});
  };
  const openStore = async () => {
    if (opening) return;
    setOpening(true); setError(false);
    try { await Browser.open({ url: offer.url }); dismiss(); }
    catch { setError(true); }
    finally { setOpening(false); }
  };
  return <aside aria-label="Mise à jour SILGAPP" className="fixed z-[10000] inset-x-3 top-[max(12px,env(safe-area-inset-top))] mx-auto max-w-md rounded-lg border border-blue-200 bg-white p-4 text-slate-900 shadow-lg">
    <div className="flex items-start gap-3">
      <Download aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1"><p className="font-semibold">Une mise à jour SILGAPP est disponible</p><p className="mt-1 text-sm">Version {offer.version}</p></div>
      <button type="button" onClick={dismiss} aria-label="Fermer" title="Fermer" className="flex h-11 w-11 shrink-0 items-center justify-center"><X className="h-5 w-5" /></button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">Impossible d'ouvrir la boutique. Réessayez plus tard.</p>}
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={dismiss} className="min-h-11 px-4 text-sm">Plus tard</button>
      <button type="button" onClick={openStore} disabled={opening} className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">Mettre à jour</button>
    </div>
  </aside>;
}
