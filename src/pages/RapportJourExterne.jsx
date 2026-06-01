import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, DollarSign, TrendingUp, CheckCircle2, MapPin, Clock, User } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

export default function RapportJourExterne() {
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-rapport"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 300),
    initialData: [],
    refetchInterval: 10000,
  });

  const today = startOfDay(new Date());

  const coursesToday = useMemo(() =>
    courses.filter(c => {
      const date = new Date(c.created_date);
      return date >= today && date <= endOfDay(today);
    }), [courses]);

  const stats = useMemo(() => {
    const livrees   = coursesToday.filter(c => c.statut === "livree");
    const annulees  = coursesToday.filter(c => c.statut === "annulee");
    const enCours   = coursesToday.filter(c => ["recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut));
    const ca        = livrees.reduce((sum, c) => sum + (c.prix_final || 0), 0);
    const distance  = livrees.reduce((sum, c) => sum + (c.distance_reelle_km || 0), 0);
    const commission = livrees.reduce((sum, c) => sum + (c.commission_silga || 0), 0);

    // Par livreur
    const parLivreur = {};
    coursesToday.forEach(c => {
      if (c.livreur_nom) {
        if (!parLivreur[c.livreur_nom]) parLivreur[c.livreur_nom] = { nom: c.livreur_nom, courses: 0, livrees: 0, ca: 0 };
        parLivreur[c.livreur_nom].courses++;
        if (c.statut === "livree") { parLivreur[c.livreur_nom].livrees++; parLivreur[c.livreur_nom].ca += (c.prix_final || 0); }
      }
    });
    const livreurStats = Object.values(parLivreur).sort((a, b) => b.livrees - a.livrees);

    return { totale: coursesToday.length, livrees: livrees.length, annulees: annulees.length, enCours: enCours.length, ca, distance, commission, livreurStats };
  }, [coursesToday]);

  const livreesDetail = coursesToday.filter(c => c.statut === "livree");

  return (
    <div className="p-4 space-y-5 max-w-4xl mx-auto">

      {/* ── HERO HEADER ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-red-600 to-rose-600 p-5 shadow-xl shadow-red-200">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-xl flex-shrink-0">
              📊
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Rapport du Jour — Externe</h1>
              <p className="text-white/65 text-xs mt-0.5 capitalize">
                {format(today, "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI STATS ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: "Courses totales",  value: stats.totale,                          suffix: null,    grad: "from-primary to-red-600",       shadow: "shadow-red-100",     icon: "📦" },
          { label: "Livrées",          value: stats.livrees,                          suffix: null,    grad: "from-green-500 to-emerald-500",  shadow: "shadow-green-100",   icon: "✅" },
          { label: "CA encaissé",      value: stats.ca.toLocaleString(),              suffix: "FCFA",  grad: "from-indigo-500 to-blue-600",    shadow: "shadow-indigo-100",  icon: "💰" },
          { label: "Distance totale",  value: stats.distance.toFixed(1),              suffix: "km",    grad: "from-cyan-500 to-sky-500",       shadow: "shadow-cyan-100",    icon: "📍" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3.5 text-white shadow-md ${s.shadow}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">{s.label}</p>
              <span className="text-base">{s.icon}</span>
            </div>
            <p className="text-2xl font-black leading-none">
              {s.value}
              {s.suffix && <span className="text-xs font-normal ml-1 opacity-80">{s.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* ── STATS SECONDAIRES ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wide mb-1">En cours</p>
          <p className="text-2xl font-black text-orange-600">{stats.enCours}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">Annulées</p>
          <p className="text-2xl font-black text-red-600">{stats.annulees}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide mb-1">Commission</p>
          <p className="text-lg font-black text-purple-700">{stats.commission.toLocaleString()}<span className="text-[10px] font-normal ml-1">F</span></p>
        </div>
      </div>

      {/* ── PERFORMANCE PAR LIVREUR ───────────────────────── */}
      {stats.livreurStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground">Performance livreurs</p>
              <p className="text-xs text-muted-foreground">{stats.livreurStats.length} livreur{stats.livreurStats.length > 1 ? "s" : ""} actif{stats.livreurStats.length > 1 ? "s" : ""} aujourd'hui</p>
            </div>
          </div>
          <div className="space-y-2">
            {stats.livreurStats.map((l, i) => (
              <div key={l.nom} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-600"}`}>
                  {i === 0 ? "🥇" : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{l.nom}</p>
                  <p className="text-[10px] text-muted-foreground">{l.courses} course{l.courses > 1 ? "s" : ""} · {l.livrees} livrée{l.livrees > 1 ? "s" : ""}</p>
                </div>
                <span className="font-black text-sm text-green-600 flex-shrink-0">{l.ca.toLocaleString()} F</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DÉTAIL DES COURSES LIVRÉES ────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">Courses livrées</p>
            <p className="text-xs text-muted-foreground">{livreesDetail.length} livraison{livreesDetail.length > 1 ? "s" : ""} aujourd'hui</p>
          </div>
        </div>

        {livreesDetail.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">📦</div>
            <p className="font-semibold text-sm">Aucune course livrée aujourd'hui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {livreesDetail.map(course => (
              <div key={course.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-base flex-shrink-0">✅</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{course.client_nom || "Client"}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{course.adresse_depart} → {course.adresse_arrivee || "?"}</span>
                  </div>
                  {course.livreur_nom && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">👤 {course.livreur_nom}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-sm text-green-600">{course.prix_final?.toLocaleString() || "0"} F</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {course.heure_livraison ? format(new Date(course.heure_livraison), "HH:mm") : "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}