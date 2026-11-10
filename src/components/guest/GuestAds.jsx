import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { loadGuestAds, guestAdLink } from '@/lib/guestAdsClient';

/** Public home carousel. Keep the public feed separate from authenticated tracking. */
export default function GuestAds({ countries = [], country = '' }) {
  const [result, setResult] = useState({ country: '', ads: [], status: 'loading' });
  const [index, setIndex] = useState(0);
  const allowed = Array.isArray(countries) ? countries.filter(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code)) : [];
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
  const ads = result.country === selected && result.status === 'ready' ? result.ads : [];
  const currentIndex = index < ads.length ? index : 0;
  const ad = ads[currentIndex];
  // Match the signed-in home: no empty, loading or unavailable advertising panel.
  if (!ad) return null;
  const href = guestAdLink(ad);
  const imageOverlay = ad.media_url && ad.type_media === 'image';
  return <section aria-label="Publicités" aria-roledescription="carrousel" className="relative overflow-hidden rounded-2xl shadow-lg">
    <article key={ad.id} className="relative select-none bg-[#1a1a2e]" style={{ minHeight: 120 }}>
      {imageOverlay && <img src={ad.media_url} alt={ad.titre} loading="lazy" referrerPolicy="no-referrer" className="w-full h-40 object-contain bg-black" />}
      {ad.media_url && ad.type_media === 'video' && <video src={ad.media_url} controls playsInline preload="none" aria-label={ad.titre} className="w-full h-40 object-contain bg-black" />}
      <div className={`${imageOverlay ? 'absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent' : ''} flex flex-col justify-end`}>
        <div className={`p-4 space-y-1 ${ads.length > 1 ? 'px-14 pb-7' : ''}`}>
          {ad.annonceur_nom && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white bg-white/15">{ad.annonceur_nom}</span>}
          <h3 className="font-black text-base leading-tight text-white break-words line-clamp-2">{ad.titre}</h3>
          {ad.description && <p className="text-xs text-white/80 line-clamp-2 break-words">{ad.description}</p>}
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex mt-2 text-[10px] font-bold text-white px-2.5 py-1 rounded-full ${ad.lien_whatsapp ? 'bg-green-600' : 'bg-blue-600'}`}>{ad.lien_whatsapp ? 'WhatsApp' : ad.lien_telephone ? 'Appeler' : 'Voir plus'}</a>}
        </div>
      </div>
      <span className="absolute top-2 right-2 text-[9px] font-bold bg-black/40 text-white/70 px-1.5 py-0.5 rounded">Pub</span>
    </article>
    {ads.length > 1 && <>
      <button type="button" aria-label="Annonce précédente" className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center" onClick={() => setIndex((currentIndex + ads.length - 1) % ads.length)}><span aria-hidden="true">‹</span></button>
      <button type="button" aria-label="Annonce suivante" className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center" onClick={() => setIndex((currentIndex + 1) % ads.length)}><span aria-hidden="true">›</span></button>
      <div aria-hidden="true" className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">{ads.map((item, i) => <span key={item.id} className={`block h-1.5 rounded-full ${i === currentIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`} />)}</div>
      <span className="sr-only" aria-live="polite">Annonce {currentIndex + 1} sur {ads.length}</span>
    </>}
  </section>;
}
