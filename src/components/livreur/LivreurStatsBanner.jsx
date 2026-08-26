import React, { useEffect, useState } from "react";
import { TrendingUp, Package, CheckCircle } from "lucide-react";
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
      <div className="grid grid-cols-3 gap-2.5">
        {/* Livrées */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-black/5 text-center">
          <p className="text-2xl font-black text-success leading-none">{livreesToday.length}</p>
          <p className="text-[10px] text-slate-600 font-semibold mt-1">Livrées</p>
        </div>
        {/* Gains */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-black/5 text-center">
          <p className="text-base font-black text-slate-900 leading-none">
            {totalEncaisse > 0 ? totalEncaisse.toLocaleString() : "0"}<span className="text-[10px] font-normal ml-0.5">F</span>
          </p>
          <p className="text-[10px] text-slate-600 font-semibold mt-1">Gains</p>
        </div>
        {/* Dû SILGAPP */}
        <div className={`rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border text-center ${
          montantDuSilga > 0 ? "bg-orange-50 border-orange-200" : montantDuSilga < 0 ? "bg-green-50 border-green-200" : "bg-white border-black/5"
        }`}>
          <p className={`text-base font-black leading-none ${
            montantDuSilga > 0 ? "text-orange-500" : montantDuSilga < 0 ? "text-green-500" : "text-slate-400"
          }`}>
            {Math.abs(montantDuSilga).toLocaleString()}<span className="text-[10px] font-normal ml-0.5">F</span>
          </p>
          <p className="text-[10px] text-slate-600 font-semibold mt-1">Dû SILGAPP</p>
        </div>
      </div>
    );
  }

  const coursesLivrees = livreesToday.length;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-card rounded-2xl p-3 shadow-sm border border-border text-center">
        <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center mx-auto mb-1.5">
          <Package className="w-4 h-4 text-sky-400" />
        </div>
        <p className="text-xl font-bold text-foreground">{coursesAujourdHui}</p>
        <p className="text-[10px] text-muted-foreground font-medium">Courses</p>
      </div>
      <div className="bg-card rounded-2xl p-3 shadow-sm border border-border text-center">
        <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle className="w-4 h-4 text-success" />
        </div>
        <p className="text-xl font-bold text-foreground">{coursesLivrees}</p>
        <p className="text-[10px] text-muted-foreground font-medium">Livrées</p>
      </div>
      <div className="bg-card rounded-2xl p-3 shadow-sm border border-border text-center">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-1.5">
          <TrendingUp className="w-4 h-4 text-amber-400" />
        </div>
        <p className="text-sm font-bold text-foreground leading-tight">
          {totalEncaisse > 0 ? `${totalEncaisse.toLocaleString()} FCFA` : "0 FCFA"}
        </p>
        <p className="text-[10px] text-muted-foreground font-medium">Encaissé</p>
      </div>
    </div>
  );
}
