import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { loadGuestAds, guestAdLink } from '@/lib/guestAdsClient';
import { guestCountryName } from '@/lib/guestPhone';

/** Non-blocking public cards on home only. No account, device token or marketing consent. */
export default function GuestAds({ countries = [] }) {
  const [country, setCountry] = useState('');
  const [result, setResult] = useState({ country: '', ads: [], status: 'loading' });
  const [index, setIndex] = useState(0);
  const allowed = countries.filter(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code));
  const selected = allowed.includes(country) ? country : '';
  useEffect(() => {
    let current = true;
    setIndex(0);
    setResult({ country: selected, ads: [], status: 'loading' });
    loadGuestAds(base44, selected).then(ads => { if (current) setResult({ country: selected, ads, status: 'ready' }); })
      .catch(() => { if (current) setResult({ country: selected, ads: [], status: 'unavailable' }); });
    return () => { current = false; };
  }, [selected]);
  // Hide stale-country content synchronously, even before the effect completes.
  const ads = result.country === selected ? result.ads : [];
  const ad = ads[index] || ads[0];
  const href = ad ? guestAdLink(ad) : '';
  return <section aria-label="Publicités" className="rounded-2xl border border-gray-200 p-4 space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold">Publicités</h2><span className="text-xs text-gray-500">Sans compte</span></div>
    {allowed.length > 0 && <label className="block text-xs text-gray-600">Pays des annonces<select className="mt-1 block w-full rounded-lg border p-2 bg-white" value={selected} onChange={e => setCountry(e.target.value)}><option value="">Tous pays uniquement</option>{[...new Set(allowed)].map(code => <option key={code} value={code}>{guestCountryName(code)}</option>)}</select></label>}
    {!ad ? <p className="text-xs text-gray-500">{result.country !== selected || result.status === 'loading' ? 'Chargement des annonces.' : result.status === 'unavailable' ? 'Publicités temporairement indisponibles.' : 'Aucune annonce disponible pour le moment.'}</p> : <article key={ad.id} className="space-y-2">
      {ad.media_url && ad.type_media === 'image' && <img src={ad.media_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full max-h-48 object-contain rounded-lg" />}
      {ad.media_url && ad.type_media === 'video' && <video src={ad.media_url} controls playsInline preload="none" className="w-full max-h-48 rounded-lg" />}
      {ad.annonceur_nom && <p className="text-xs text-gray-500">{ad.annonceur_nom}</p>}
      <h3 className="font-semibold text-sm break-words">{ad.titre}</h3><p className="text-sm text-gray-600 break-words">{ad.description}</p>
      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-blue-700 text-white px-4 py-2 text-sm">{ad.lien_whatsapp ? 'WhatsApp' : ad.lien_telephone ? 'Appeler' : 'En savoir plus'}</a>}
      {ads.length > 1 && <div className="flex items-center justify-between"><button type="button" className="px-3 py-2 border rounded-lg text-sm" onClick={() => setIndex((index + ads.length - 1) % ads.length)}>Précédente</button><span aria-live="polite" className="text-xs">{index + 1} / {ads.length}</span><button type="button" className="px-3 py-2 border rounded-lg text-sm" onClick={() => setIndex((index + 1) % ads.length)}>Suivante</button></div>}
    </article>}
  </section>;
}
