import React, { useEffect, useState } from "react";
import { TrendingUp, Package, CheckCircle, AlertCircle, Banknote } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function LivreurStatsBanner({ mesCourses, totalEncaisse, montantDuSilga, isExterne = false }) {
  const today = new Date().toDateString();
  const livreesToday = mesCourses.filter(c =>
    c.statut === "livree" && new Date(c.heure_livraison || c.updated_date).toDateString() === today
  );
  // Ne compter que les courses réellement assignées au livreur (exclure les simples propositions notifiées)
  const coursesAujourdHui = mesCourses.filter(c =>
    c.livreur_id && new Date(c.created_date).toDateString() === today
  ).length;

  //  Commission dynamique du pays
  const [countryCommissionPct, setCountryCommissionPct] = useState(null);
  useEffect(() => {
    const countryCode = mesCourses?.[0]?.country_code;
    if (!countryCode) return;
    base44.entities.Country.filter({ code: countryCode, actif: true })
      .then(countries => {
        const value = Number(countries?.[0]?.commission_pct);
        setCountryCommissionPct(Number.isFinite(value) ? value : null);
      })
      .catch(() => {});
  }, [mesCourses]);

  // Calculs financiers du jour — priorité aux champs sauvegardés, fallback calcul local
  const prixTotalToday = livreesToday.reduce((s, c) => {
    const prix = c.prix_final || 0;
    return s + prix;
  }, 0);
  const commissionToday = livreesToday.reduce((s, c) => {
    if (c.commission_silga > 0) return s + c.commission_silga;
    if (countryCommissionPct === null) return s;
    return s + Math.round((c.prix_final || 0) * (countryCommissionPct / 100));
  }, 0);
  const gainToday = livreesToday.reduce((s, c) => {
    if (c.montant_livreur > 0) return s + c.montant_livreur;
    if (countryCommissionPct === null) return s;
    return s + Math.round((c.prix_final || 0) * ((100 - countryCommissionPct) / 100));
  }, 0);

  if (isExterne) {
    return (
      <div className="space-y-2">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: <Package className="w-4 h-4 text-sky-400" />,   bg: "bg-sky-500/10",   val: coursesAujourdHui,       label: "Courses",   valClass: "text-sky-300" },
            { icon: <CheckCircle className="w-4 h-4 text-[#00a86b]" />, bg: "bg-green-500/10", val: livreesToday.length,    label: "Livrées",   valClass: "text-[#00a86b]" },
            { icon: <AlertCircle className="w-4 h-4 text-orange-400" />, bg: "bg-orange-500/10", val: null, label: "Dû SILGAPP", valClass: "text-orange-400" },
          ].map((item, i) => (
            <div key={i} className="bg-[#1f2429] rounded-3xl p-3.5 shadow-sm border border-white/8 text-center">
              <div className={`w-9 h-9 rounded-2xl ${item.bg} flex items-center justify-center mx-auto mb-1.5`}>
                {item.icon}
              </div>
              {item.val !== null ? (
                <p className={`text-2xl font-black ${item.valClass}`}>{item.val}</p>
              ) : (
                <p className={`text-xs font-black ${item.valClass} leading-tight`}>
                  {montantDuSilga > 0 ? `${montantDuSilga.toLocaleString()}` : "0"}<span className="text-[9px] ml-0.5">F</span>
                </p>
              )}
              <p className="text-[10px] text-white/40 font-medium mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Bilan financier du jour */}
        {livreesToday.length > 0 && (
          <div className="rounded-3xl overflow-hidden shadow-lg border border-white/8">
            <div className="bg-[#2b3137] px-4 py-2.5 flex items-center gap-2">
              <Banknote className="w-3.5 h-3.5 text-white/60" />
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Bilan du jour</p>
            </div>
            <div className="bg-[#1f2429] grid grid-cols-3 divide-x divide-white/8">
              {[
                { label: "Total client", val: prixTotalToday, color: "text-white" },
                { label: "Votre gain", val: gainToday,    color: "text-[#00a86b]" },
                { label: "Commission SILGAPP", val: commissionToday, color: "text-orange-400" },
              ].map((s, i) => (
                <div key={i} className="p-3 text-center">
                  <p className={`text-sm font-black ${s.color}`}>{s.val.toLocaleString()}<span className="text-[9px] ml-0.5 font-normal">F</span></p>
                  <p className="text-[9px] text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const coursesLivrees = livreesToday.length;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-[#1f2429] rounded-2xl p-3 shadow-sm border border-white/8 text-center">
        <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center mx-auto mb-1.5">
          <Package className="w-4 h-4 text-sky-400" />
        </div>
        <p className="text-xl font-bold text-white">{coursesAujourdHui}</p>
        <p className="text-[10px] text-white/40 font-medium">Courses</p>
      </div>
      <div className="bg-[#1f2429] rounded-2xl p-3 shadow-sm border border-white/8 text-center">
        <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle className="w-4 h-4 text-[#00a86b]" />
        </div>
        <p className="text-xl font-bold text-white">{coursesLivrees}</p>
        <p className="text-[10px] text-white/40 font-medium">Livrées</p>
      </div>
      <div className="bg-[#1f2429] rounded-2xl p-3 shadow-sm border border-white/8 text-center">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-1.5">
          <TrendingUp className="w-4 h-4 text-amber-400" />
        </div>
        <p className="text-sm font-bold text-white leading-tight">
          {totalEncaisse > 0 ? `${totalEncaisse.toLocaleString()} FCFA` : "0 FCFA"}
        </p>
        <p className="text-[10px] text-white/40 font-medium">Encaissé</p>
      </div>
    </div>
  );
}