import React, { useEffect, useState } from "react";
import { TrendingUp, Package, CheckCircle, AlertCircle, Banknote } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function LivreurStatsBanner({ mesCourses, totalEncaisse, montantDüSilga, isExterne = false }) {
  const today = new Date().toDateString();
  const livreesToday = mesCourses.filter(c =>
    c.statut === "livree" && new Date(c.heure_livraison || c.updated_date).toDateString() === today
  );
  const coursesAujourdHui = mesCourses.filter(c =>
    new Date(c.created_date).toDateString() === today
  ).length;

  // 🎯 Commission dynamique du pays
  const [countryCommissionPct, setCountryCommissionPct] = useState(30);
  useEffect(() => {
    const countryCode = mesCourses?.[0]?.country_code;
    if (!countryCode) return;
    base44.entities.Country.filter({ code: countryCode, actif: true })
      .then(countries => { if (countries?.[0]?.commission_pct) setCountryCommissionPct(countries[0].commission_pct); })
      .catch(() => {});
  }, [mesCourses]);

  // Calculs financiers du jour — priorité aux champs sauvegardés, fallback calcul local
  const prixTotalToday = livreesToday.reduce((s, c) => {
    const prix = c.prix_final || 0;
    return s + prix;
  }, 0);
  const commissionToday = livreesToday.reduce((s, c) => {
    if (c.commission_silga > 0) return s + c.commission_silga;
    return s + Math.round((c.prix_final || 0) * (countryCommissionPct / 100));
  }, 0);
  const gainToday = livreesToday.reduce((s, c) => {
    if (c.montant_livreur > 0) return s + c.montant_livreur;
    return s + Math.round((c.prix_final || 0) * ((100 - countryCommissionPct) / 100));
  }, 0);

  if (isExterne) {
    return (
      <div className="space-y-2">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Package className="w-4 h-4 text-blue-500" />,   bg: "bg-blue-50",   val: coursesAujourdHui,       label: "Courses",   valClass: "text-blue-800" },
            { icon: <CheckCircle className="w-4 h-4 text-green-500" />, bg: "bg-green-50", val: livreesToday.length,    label: "Livrées",   valClass: "text-green-800" },
            { icon: <AlertCircle className="w-4 h-4 text-orange-500" />, bg: "bg-orange-50", val: null, label: "Dû SILGAPP", valClass: "text-orange-700" },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
              <div className={`w-8 h-8 rounded-xl ${item.bg} flex items-center justify-center mx-auto mb-1.5`}>
                {item.icon}
              </div>
              {item.val !== null ? (
                <p className={`text-2xl font-black ${item.valClass}`}>{item.val}</p>
              ) : (
                <p className={`text-xs font-black ${item.valClass} leading-tight`}>
                  {montantDüSilga > 0 ? `${montantDüSilga.toLocaleString()}` : "0"}<span className="text-[9px] ml-0.5">F</span>
                </p>
              )}
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Bilan financier du jour */}
        {livreesToday.length > 0 && (
          <div className="rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-800 px-4 py-2 flex items-center gap-2">
              <Banknote className="w-3.5 h-3.5 text-white/60" />
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Bilan du jour</p>
            </div>
            <div className="bg-white border border-gray-100 grid grid-cols-3 divide-x divide-gray-100">
              {[
                { label: "Total client", val: prixTotalToday, color: "text-gray-800" },
                { label: "Votre gain", val: gainToday,    color: "text-green-700" },
                { label: "Commission SILGAPP", val: commissionToday, color: "text-orange-600" },
              ].map((s, i) => (
                <div key={i} className="p-3 text-center">
                  <p className={`text-sm font-black ${s.color}`}>{s.val.toLocaleString()}<span className="text-[9px] ml-0.5 font-normal">F</span></p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
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
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-1.5">
          <Package className="w-4 h-4 text-blue-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesAujourdHui}</p>
        <p className="text-[10px] text-gray-400 font-medium">Courses</p>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesLivrees}</p>
        <p className="text-[10px] text-gray-400 font-medium">Livrées</p>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-1.5">
          <TrendingUp className="w-4 h-4 text-amber-500" />
        </div>
        <p className="text-sm font-bold text-gray-900 leading-tight">
          {totalEncaisse > 0 ? `${totalEncaisse.toLocaleString()} FCFA` : "0 FCFA"}
        </p>
        <p className="text-[10px] text-gray-400 font-medium">Encaissé</p>
      </div>
    </div>
  );
}