import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Smartphone, MessageCircle, CheckCircle2, XCircle, Clock, TrendingUp, Zap, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

function StatBox({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CrmConversionDashboard({ stats }) {
  if (!stats) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <p className="text-sm text-slate-400">Chargement du tableau de bord...</p>
      </div>
    );
  }

  const tauxInst = stats.taux_installation_pct ?? 0;
  const tauxConv = stats.taux_conversion_pct ?? 0;

  return (
    <div className="space-y-3">
      {/* ── KPI principaux ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox icon={Users} label="CRM Total" value={stats.crm_total ?? 0} color="bg-blue-500" />
        <StatBox icon={Smartphone} label="Avec App" value={stats.crm_avec_app ?? 0} color="bg-purple-500" sub={`${tauxInst}% install`} />
        <StatBox icon={CheckCircle2} label="Convertis" value={stats.crm_converti ?? 0} color="bg-green-500" sub={`${tauxConv}% conversion`} />
        <StatBox icon={MessageCircle} label="Sans App" value={stats.crm_uniquement ?? 0} color="bg-amber-500" sub="À proscrire" />
      </div>

      {/* ── FCM + Téléphone ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox icon={Zap} label="FCM natif" value={stats.app_avec_fcm ?? 0} color="bg-cyan-500" sub="Push gratuit" />
        <StatBox icon={XCircle} label="Sans FCM" value={stats.app_sans_fcm ?? 0} color="bg-orange-500" />
        <StatBox icon={MessageCircle} label="CRM avec tél" value={stats.crm_avec_tel ?? 0} color="bg-teal-500" sub="WhatsApp possible" />
        <StatBox icon={Ban} label="CRM sans tél" value={stats.crm_sans_tel ?? 0} color="bg-red-500" />
      </div>

      {/* ── Priorisation ── */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox icon={TrendingUp} label="🔥 Priorité 1" value={stats.crm_priorite_1 ?? 0} color="bg-red-500" sub="2+ courses" />
        <StatBox icon={Clock} label="🟠 Priorité 2" value={stats.crm_priorite_2 ?? 0} color="bg-amber-500" sub="1 course" />
        <StatBox icon={Users} label="⚪ Priorité 3" value={stats.crm_priorite_3 ?? 0} color="bg-slate-400" sub="0 course" />
      </div>

      {/* ── Pipeline ── */}
      {(stats.pipeline_a_contacter > 0 || stats.pipeline_contacte > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Pipeline prospection</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "À contacter", value: stats.pipeline_a_contacter, color: "bg-blue-50 text-blue-700" },
              { label: "Contactés", value: stats.pipeline_contacte, color: "bg-cyan-50 text-cyan-700" },
              { label: "Intéressés", value: stats.pipeline_interesse, color: "bg-green-50 text-green-700" },
              { label: "À relancer", value: stats.pipeline_a_relancer, color: "bg-amber-50 text-amber-700" },
              { label: "App installée", value: stats.pipeline_app_installee, color: "bg-purple-50 text-purple-700" },
              { label: "Convertis", value: stats.pipeline_converti, color: "bg-emerald-50 text-emerald-700" },
              { label: "Pas intéressé", value: stats.pipeline_pas_interesse, color: "bg-gray-100 text-gray-600" },
              { label: "Ne plus contacter", value: stats.pipeline_ne_plus_contacter, color: "bg-red-50 text-red-700" },
            ].map(s => (
              <span key={s.label} className={cn("text-[10px] font-bold px-2 py-1 rounded-full", s.color)}>
                {s.label}: {s.value ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Taux de conversion ── */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100 p-4">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-2">Taux de conversion</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-3xl font-black text-blue-700">{tauxInst}%</p>
            <p className="text-[10px] text-blue-600">Installation App</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{stats.crm_avec_app ?? 0} / {stats.crm_total ?? 0} CRM</p>
          </div>
          <div>
            <p className="text-3xl font-black text-green-700">{tauxConv}%</p>
            <p className="text-[10px] text-green-600">Conversion réelle</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{stats.crm_converti ?? 0} / {stats.crm_total ?? 0} CRM</p>
          </div>
        </div>
      </div>
    </div>
  );
}