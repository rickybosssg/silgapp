import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, AlertTriangle, TrendingDown, Info } from "lucide-react";
import { calculerFiabiliteLivreur, getFiabiliteBadge } from "@/lib/livreurFiabiliteClient";

/**
 * Carte de fiabilité livreur — affiche le Score SILGAPP (0-100) sur 30 jours glissants.
 *
 * ⚠️ DIAGNOSTIQUE UNIQUEMENT — n'impacte ni le dispatch, ni la priorité, ni la commission.
 *
 * Utilisé par :
 * - Admin : LivreurDetailDialog (dialog de détail d'un livreur)
 * - Livreur : LivreurStatsBanner (bannière de stats du jour)
 *
 * @param {object} livreur - L'objet Livreur
 * @param {boolean} compact - Affichage compact (pour le banner livreur)
 */
export default function LivreurFiabiliteCard({ livreur, compact = false }) {
  const livreurId = livreur?.id;

  // ── Fetch 30 derniers jours d'annulations pour ce livreur ──
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  const { data: annulations = [], isLoading: annLoading } = useQuery({
    queryKey: ["annulations-livreur-30j", livreurId],
    queryFn: () => base44.entities.AnnulationLivreur.filter({
      livreur_id: livreurId,
    }, "-date_annulation", 100),
    enabled: !!livreurId,
    staleTime: 60000,
  });

  // ── Fetch courses acceptées (avec heure_acceptation) sur 30j ──
  const { data: coursesAcceptees = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["courses-acceptees-30j", livreurId],
    queryFn: () => base44.entities.CourseExterne.filter({
      livreur_id: livreurId,
    }, "-heure_acceptation", 200),
    enabled: !!livreurId,
    staleTime: 60000,
  });

  // Filtrer sur 30 jours glissants
  const annulations30j = useMemo(() => {
    return (annulations || []).filter(a =>
      a.date_annulation && new Date(a.date_annulation) >= new Date(thirtyDaysAgo)
    );
  }, [annulations, thirtyDaysAgo]);

  const coursesAcceptees30j = useMemo(() => {
    return (coursesAcceptees || []).filter(c =>
      c.heure_acceptation && new Date(c.heure_acceptation) >= new Date(thirtyDaysAgo)
    );
  }, [coursesAcceptees, thirtyDaysAgo]);

  const coursesLivrees30j = useMemo(() => {
    return coursesAcceptees30j.filter(c => c.statut === "livree");
  }, [coursesAcceptees30j]);

  // ── Calcul du score ──
  const fiabilite = useMemo(() => {
    if (annLoading || coursesLoading) return null;
    return calculerFiabiliteLivreur(annulations30j, coursesAcceptees30j, coursesLivrees30j);
  }, [annulations30j, coursesAcceptees30j, coursesLivrees30j, annLoading, coursesLoading]);

  // Pas de livreur = pas de carte
  if (!livreurId) {
    return compact ? (
      <div className="bg-white rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-black/5 text-center opacity-50">
        <ShieldCheck className="w-4 h-4 text-slate-300 mx-auto" />
        <p className="text-[9px] text-slate-400 mt-1">N/A</p>
      </div>
    ) : null;
  }

  if (annLoading || coursesLoading || !fiabilite) {
    return compact ? (
      <div className="bg-white rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-black/5 text-center">
        <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin mx-auto" />
        <p className="text-[10px] text-slate-400 mt-1">Score...</p>
      </div>
    ) : (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
      </div>
    );
  }

  const badge = getFiabiliteBadge(fiabilite.taux_annulation_pct);
  const scoreColor = fiabilite.score >= 75 ? "text-green-600"
    : fiabilite.score >= 60 ? "text-amber-600"
    : "text-red-600";
  const scoreBg = fiabilite.score >= 75 ? "bg-green-50 border-green-200"
    : fiabilite.score >= 60 ? "bg-amber-50 border-amber-200"
    : "bg-red-50 border-red-200";

  // ── Mode compact (bannière livreur) ──
  if (compact) {
    return (
      <div className={`rounded-2xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border text-center ${scoreBg}`}>
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <p className={`text-2xl font-black leading-none ${scoreColor}`}>{fiabilite.score}</p>
        <p className="text-[9px] text-slate-600 font-semibold mt-1">{fiabilite.niveau_label}</p>
        {fiabilite.is_provisoire && (
          <p className="text-[8px] text-slate-400 mt-0.5">Provisoire</p>
        )}
      </div>
    );
  }

  // ── Mode complet (admin) ──
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${scoreBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-600" />
          <p className="text-sm font-bold text-slate-700">Score de fiabilité SILGAPP</p>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">30 derniers jours</span>
      </div>

      {/* Score principal */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Cercle de progression */}
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
              className={scoreColor} opacity="0.15" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
              className={scoreColor}
              strokeDasharray={`${(fiabilite.score / 100) * 213.6} 213.6`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-black ${scoreColor}`}>{fiabilite.score}</span>
            <span className="text-[8px] text-slate-400 font-bold uppercase">/100</span>
          </div>
        </div>
        <div className="flex-1">
          <p className={`text-base font-black ${scoreColor}`}>{fiabilite.niveau_label}</p>
          {fiabilite.is_provisoire ? (
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3" />
              Score provisoire
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">
              {fiabilite.courses_analysees} course(s) analysée(s)
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
              {badge.emoji} {badge.label}
            </span>
            <span className="text-[10px] text-slate-400">
              {fiabilite.taux_annulation_pct}% annulation
            </span>
          </div>
        </div>
      </div>

      {/* Avertissement provisoire */}
      {fiabilite.is_provisoire && (
        <div className="bg-amber-100/50 border border-amber-200 rounded-xl p-2 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700">{fiabilite.provisoire_reason}</p>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-1.5">
        {Object.entries(fiabilite.breakdown).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 w-40 flex-shrink-0">
              {key === "courses_terminees" && "Courses terminées"}
              {key === "respect_engagement" && "Respect engagement"}
              {key === "bonne_execution" && "Bonne exécution"}
              {key === "activite_recente" && "Activité récente"}
            </span>
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreColor.replace("text-", "bg-")}`}
                style={{ width: `${(val.score / val.max) * 100}%` }}
              />
            </div>
            <span className="text-slate-600 font-semibold w-12 text-right">
              {val.score}/{val.max}
            </span>
          </div>
        ))}
      </div>

      {/* Détail stats */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/50">
        <div className="text-center">
          <p className="text-sm font-black text-slate-700">{fiabilite.courses_livrees}</p>
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Livrées</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-slate-700">{fiabilite.courses_acceptees}</p>
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Acceptées</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-red-500">{fiabilite.annulations_imputables}</p>
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Imputables</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-slate-400">{fiabilite.annulations_non_imputables + fiabilite.annulations_neutres}</p>
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Non imput.</p>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-slate-400 text-center italic">
        Score diagnostique — n'impacte pas le dispatch ni la rémunération
      </p>
    </div>
  );
}