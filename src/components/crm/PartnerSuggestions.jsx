import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Store, UtensilsCrossed, Pill, MapPin } from "lucide-react";

export default function PartnerSuggestions({ countryCode, onFillAddress }) {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) { setPartners([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      base44.entities.Boutique.filter({ pays_code: countryCode, actif: true, validation: "valide" }, "nom", 15).catch(() => []),
      base44.entities.Restaurant.filter({ pays_code: countryCode, actif: true, validation: "valide" }, "nom", 15).catch(() => []),
      base44.entities.Pharmacie.filter({ pays_code: countryCode, actif: true, validation: "valide" }, "nom", 15).catch(() => []),
    ]).then(([boutiques, restaurants, pharmacies]) => {
      if (cancelled) return;
      const all = [
        ...(boutiques || []).map(b => ({ ...b, _type: "boutique", _icon: Store })),
        ...(restaurants || []).map(r => ({ ...r, _type: "restaurant", _icon: UtensilsCrossed })),
        ...(pharmacies || []).map(p => ({ ...p, _type: "pharmacie", _icon: Pill })),
      ].filter(p => p.adresse || (p.latitude && p.longitude));
      setPartners(all.slice(0, 12));
    }).catch(() => { if (!cancelled) setPartners([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [countryCode]);

  if (loading && partners.length === 0) return null;
  if (partners.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <MapPin className="w-3 h-3 text-indigo-500" /> Partenaires à proximité
      </p>
      <div className="flex flex-wrap gap-1.5">
        {partners.map((p, i) => {
          const Icon = p._icon;
          const addr = { adresse: p.adresse || p.nom, quartier: p.quartier, lat: p.latitude, lng: p.longitude };
          return (
            <div key={p.id || i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50/50 border border-indigo-100">
              <Icon className="w-3 h-3 text-indigo-500 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-indigo-700 truncate max-w-[100px]">{p.nom}</span>
              <button
                type="button"
                onClick={() => onFillAddress?.("depart", addr)}
                className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[8px] font-bold hover:bg-emerald-600 transition-all active:scale-95"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => onFillAddress?.("arrivee", addr)}
                className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[8px] font-bold hover:bg-rose-600 transition-all active:scale-95"
              >
                →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}