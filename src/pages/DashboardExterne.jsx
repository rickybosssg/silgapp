import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Package, Truck, Clock, CheckCircle2, XCircle, TrendingUp, ArrowLeft, Globe, Users, Zap, ChevronRight, Bell } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import ClientsEnLigne from "@/components/dashboard/ClientsEnLigne";
import { isClientEligibleCarte } from "@/lib/dispatchRules.js";
import { calculateLivreurCounters, calculateClientCounters } from "@/lib/livreurCounters.js";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import CodePromoPanel from "@/components/admin/CodePromoPanel";
import DownloadStatsPanel from "@/components/admin/DownloadStatsPanel";
import StatDetailModal from "@/components/dashboard/StatDetailModal";
import AppToggleButton from "@/components/admin/AppToggleButton";

function KpiCard({ label, value, icon: Icon, color, suffix, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${color} text-white`}
    >
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -right-2 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-white" />
          </div>
          {onClick && <ChevronRight className="w-3.5 h-3.5 text-white/50 group-hover:text-white/80 transition-colors" />}
        </div>
        <p className="text-2xl font-black leading-none mb-1">
          {value}
          {suffix && <span className="text-xs font-normal ml-1 opacity-80">{suffix}</span>}
        </p>
        <p className="text-[11px] font-medium opacity-70 uppercase tracking-wide">{label}</p>
      </div>
    </button>
  );
}

export default function DashboardExterne() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [statModal, setStatModal] = useState(null);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const defaultCountry = paysActifs.length === 1 ? paysActifs[0].code : null;
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || defaultCountry);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-dashboard", effectiveCountry || "all"],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date")
      : base44.entities.CourseExterne.list("-created_date", 300),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.Livreur.filter(
      effectiveCountry ? { type_livreur: "externe", country_code: effectiveCountry } : { type_livreur: "externe" }
    ),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.ClientExterne.filter(
      effectiveCountry ? { actif: true, country_code: effectiveCountry } : { actif: true }
    ),
    initialData: [],
    refetchInterval: 10000,
  });

  const coursesFiltrees = useMemo(
    () => effectiveCountry ? courses.filter(c => (c.country_code || "BF") === effectiveCountry) : courses,
    [courses, effectiveCountry]
  );

  const todayCourses = useMemo(
    () => coursesFiltrees.filter(c =>
      isToday(new Date(c.created_date)) || !["livree", "annulee"].includes(c.statut)
    ),
    [coursesFiltrees]
  );

  const coursesEnTraitement = useMemo(
    () => todayCourses.filter(c => !["livree", "annulee"].includes(c.statut)),
    [todayCourses]
  );

  const coursesTerminees = useMemo(
    () => coursesFiltrees.filter(c =>
      ["livree", "annulee"].includes(c.statut) &&
      isToday(new Date(c.heure_livraison || c.updated_date || c.created_date))
    ),
    [coursesFiltrees]
  );

  // Même critère que la carte dispatch : statut actif (disponible ou en_course) + validé + actif
  // PAS de filtre heartbeat (isON) pour garantir la cohérence avec la carte
  const livreursEnLigne = useMemo(
    () => livreurs.filter(l =>
      (l.statut === "disponible" || l.statut === "en_course") &&
      l.validation === "valide" &&
      l.actif !== false
    ),
    [livreurs]
  );

  const clientsEnLigne = useMemo(
    () => clients.filter(c => isClientEligibleCarte(c)),
    [clients]
  );

  const compteursLivreurs = useMemo(() =>
    calculateLivreurCounters(livreurs.filter(l => l.validation === "valide" && l.actif !== false)),
    [livreurs]
  );

  const compteursClients = useMemo(() =>
    calculateClientCounters(clients),
    [clients]
  );

  const stats = useMemo(() => {
    const todayAll = coursesFiltrees.filter(c => isToday(new Date(c.created_date)));
    const livrees = coursesTerminees.filter(c => c.statut === "livree").length;
    const annulees = coursesTerminees.filter(c => c.statut === "annulee").length;
    const enCours = coursesEnTraitement.length;
    const ca = coursesTerminees.filter(c => c.statut === "livree").reduce((s, c) => s + (c.prix_final || 0), 0);
    return { total: todayAll.length, livrees, annulees, enCours, ca, libres: livreursEnLigne.filter(l => l.statut === "disponible").length };
  }, [coursesFiltrees, coursesEnTraitement, coursesTerminees, livreursEnLigne]);

  const taux = stats.total > 0 ? Math.round((stats.livrees / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 py-4 lg:px-6 lg:py-6 space-y-5 max-w-7xl mx-auto">

        {/* ── HERO HEADER ─────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-5 sm:p-6 shadow-2xl">
          {/* Décoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
          </div>
          
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-1.5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 rounded-xl">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Silga Externe
                    {isPays && adminCountryCode && (
                      <span className="ml-2 text-base font-normal text-white/50">· {adminCountryCode}</span>
                    )}
                  </h1>
                </div>
                <p className="text-white/40 text-xs capitalize">
                  {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Pill live */}
              <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {livreursEnLigne.length} livreur{livreursEnLigne.length > 1 ? "s" : ""} en ligne
              </div>
              <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {clientsEnLigne.length} client{clientsEnLigne.length > 1 ? "s" : ""} actif{clientsEnLigne.length > 1 ? "s" : ""}
              </div>
              {isGlobal && (
                <Link to="/admin/global">
                  <Button size="sm" variant="ghost" className="gap-1.5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 rounded-xl text-xs">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Global</span>
                  </Button>
                </Link>
              )}
              <Link to="/diagnostic-push-complet?email=eric.nongbzanga@yahoo.fr">
                <Button size="sm" variant="ghost" className="gap-1.5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 rounded-xl text-xs">
                  <Bell className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Push</span>
                </Button>
              </Link>
              <AppToggleButton />
              <Link to="/carte">
                <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs shadow-lg shadow-primary/30">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Carte</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Mini KPIs dans le hero */}
          <div className="relative mt-5 grid grid-cols-4 gap-3">
            {[
              { label: "Aujourd'hui", value: stats.total, color: "text-white" },
              { label: "En cours", value: stats.enCours, color: "text-blue-300" },
              { label: "Livrées", value: stats.livrees, color: "text-green-300" },
              { label: "Taux", value: `${taux}%`, color: "text-yellow-300" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`text-xl sm:text-2xl font-black ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── KPI CARDS ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <KpiCard label="Clients" value={compteursClients.total} icon={Users} color="bg-gradient-to-br from-violet-500 to-purple-600" onClick={() => setStatModal({ type: "clients", data: clients })} />
          <KpiCard label="Courses" value={stats.total} icon={Package} color="bg-gradient-to-br from-blue-500 to-indigo-600" />
          <KpiCard label="En cours" value={stats.enCours} icon={Clock} color="bg-gradient-to-br from-amber-500 to-orange-500" onClick={() => setStatModal({ type: "en_traitement", data: coursesEnTraitement })} />
          <KpiCard label="Livrées" value={stats.livrees} icon={CheckCircle2} color="bg-gradient-to-br from-emerald-500 to-teal-500" onClick={() => setStatModal({ type: "livrees", data: coursesTerminees.filter(c => c.statut === "livree") })} />
          <KpiCard label="Annulées" value={stats.annulees} icon={XCircle} color="bg-gradient-to-br from-rose-500 to-red-600" onClick={() => setStatModal({ type: "annulees", data: coursesTerminees.filter(c => c.statut === "annulee") })} />
          <KpiCard label="CA du jour" value={stats.ca > 999 ? `${Math.round(stats.ca/1000)}k` : stats.ca} suffix={stats.ca <= 999 ? "F" : "F"} icon={TrendingUp} color="bg-gradient-to-br from-cyan-500 to-blue-500" onClick={() => setStatModal({ type: "ca", data: coursesTerminees.filter(c => c.statut === "livree") })} />
          <KpiCard label="Disponibles" value={stats.libres} icon={Truck} color="bg-gradient-to-br from-primary to-red-600" onClick={() => setStatModal({ type: "livreurs_dispo", data: livreursEnLigne.filter(l => l.statut === "disponible") })} />
        </div>

        {/* ── TÉLÉCHARGEMENTS ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <DownloadStatsPanel />
        </div>

        {/* ── CODES PROMO ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <CodePromoPanel />
        </div>

        {/* ── ACTIVITÉ ─────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Activité en direct</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
              <ClientsEnLigne clients={clientsEnLigne} />
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
              <LivreursEnLigne livreurs={livreursEnLigne} />
            </div>
          </div>
        </div>

        {/* ── COURSES EN COURS ────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Courses en cours</p>
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <CoursesEnTraitement
              courses={coursesEnTraitement}
              onView={setSelectedCourse}
              isExterne={true}
            />
          </div>
        </div>

        {/* ── HISTORIQUE DU JOUR ──────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Historique du jour</p>
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <CoursesTerminees
              courses={coursesTerminees}
              onView={setSelectedCourse}
            />
          </div>
        </div>

      </div>

      {/* Dialogs */}
      <CourseDetailDialog
        course={selectedCourse}
        open={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
        reseau="externe"
      />
      <StatDetailModal
        open={!!statModal}
        onClose={() => setStatModal(null)}
        type={statModal?.type}
        data={statModal?.data}
      />
    </div>
  );
}