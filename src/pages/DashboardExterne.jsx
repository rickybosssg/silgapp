import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Package, Truck, Clock, CheckCircle2, XCircle, TrendingUp, ArrowLeft, Globe, Users, Zap, ChevronRight, Bell, Tag, Smartphone, UserPlus, UserX, PhoneOff } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import ClientsEnLigne from "@/components/dashboard/ClientsEnLigne";
import { isClientEligibleCarte, isLibre, STATUTS_LIVREUR_OCCUPE } from "@/lib/dispatchRules.js";
import { calculateLivreurCounters, calculateClientCounters } from "@/lib/livreurCounters.js";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CoursesRedispatch from "@/components/dashboard/CoursesRedispatch";
import DispatchHealthPanel from "@/components/dashboard/DispatchHealthPanel";
import VenusActivityPanel from "@/components/dashboard/VenusActivityPanel";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import CodePromoPanel from "@/components/admin/CodePromoPanel";

import StatDetailModal from "@/components/dashboard/StatDetailModal";
import AppToggleButton from "@/components/admin/AppToggleButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function KpiCard({ label, value, icon: Icon, color, suffix, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl p-3 lg:p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${color} text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] border border-white/10`}
    >
      <div className="relative">
        <div className="flex items-center justify-between mb-2 lg:mb-3">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-white" />
          </div>
          {onClick && <ChevronRight className="w-3.5 h-3.5 text-white/50 group-hover:text-white/80 transition-colors" />}
        </div>
        <p className="text-xl lg:text-2xl font-black leading-none mb-1">
          {value}
          {suffix && <span className="text-xs font-normal ml-1 opacity-80">{suffix}</span>}
        </p>
        <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      </div>
    </button>
  );
}

export default function DashboardExterne() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [statModal, setStatModal] = useState(null);
  const [showCodePromo, setShowCodePromo] = useState(false);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const defaultCountry = paysActifs.length === 1 ? paysActifs[0].code : null;
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || defaultCountry);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-dashboard", effectiveCountry || "all"],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date", 200)
      : base44.entities.CourseExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.Livreur.filter(
      effectiveCountry ? { type_livreur: "externe", country_code: effectiveCountry } : { type_livreur: "externe" }
    ),
    initialData: [],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.ClientExterne.filter(
      effectiveCountry ? { actif: true, country_code: effectiveCountry } : { actif: true }
    ),
    initialData: [],
    refetchInterval: 60000,
    staleTime: 45000,
  });

  // ── KPI clients depuis les vraies CourseExterne (source de vérité) ──
  // nb_courses_total n'est plus la source unique — getClientsStats interroge
  // directement CourseExterne pour des compteurs exacts.
  const { data: clientsStats } = useQuery({
    queryKey: ["clients-stats", effectiveCountry || "all"],
    queryFn: () => base44.functions.invoke('getClientsStats', { country_code: effectiveCountry }),
    initialData: { data: { personnes_uniques: 0, jamais_commande: 0, creee_non_livree: 0, au_moins_une_livree: 0, identifie_par_telephone: 0, identifie_par_email: 0, non_identifiables: 0, clients_app_uniques: 0, clients_crm_uniques: 0, crm_puis_app: 0, app_avec_fcm: 0, app_sans_fcm: 0, profils_sans_telephone: 0, doublons_ecartes: 0 } },
    refetchInterval: 120000,
    staleTime: 90000,
    enabled: !!effectiveCountry,
  });
  const kpiClients = clientsStats?.data || clientsStats || {};

  const coursesFiltrees = courses;

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

  const [filtreTypeDashboard, setFiltreTypeDashboard] = useState("tous");

  const coursesFiltreesDashboard = useMemo(() => {
    if (filtreTypeDashboard === "tous") return coursesFiltrees;
    return coursesFiltrees.filter(c => c.type_course === filtreTypeDashboard);
  }, [coursesFiltrees, filtreTypeDashboard]);

  const coursesTerminees = useMemo(
    () => coursesFiltrees.filter(c =>
      ["livree", "annulee"].includes(c.statut) &&
      isToday(new Date(c.heure_livraison || c.created_date))
    ),
    [coursesFiltrees]
  );

  // ⚠️ ORDRE D'INITIALISATION — livreurIdsEnCourseReelle DOIT être déclaré avant
  //    livreursEnLigne et compteursLivreurs qui l'utilisent (TDZ sinon).
  //    MÊME définition que CarteLivreursExterne et DispatchMap
  const livreurIdsEnCourseReelle = useMemo(() => {
    return new Set(coursesEnTraitement.filter(c => STATUTS_LIVREUR_OCCUPE.includes(c.statut) && c.livreur_id).map(c => c.livreur_id));
  }, [coursesEnTraitement]);

  // "En ligne" = Libre (disponible + GPS ≤ 30 min) OU en mission (course active réelle)
  const livreursEnLigne = useMemo(
    () => livreurs.filter(l =>
      l.validation === "valide" &&
      l.actif !== false &&
      (isLibre(l) || livreurIdsEnCourseReelle.has(l.id))
    ),
    [livreurs, livreurIdsEnCourseReelle]
  );

  const clientsEnLigne = useMemo(
    () => clients.filter(c => isClientEligibleCarte(c)),
    [clients]
  );

  const compteursLivreurs = useMemo(() =>
    calculateLivreurCounters(
      livreurs.filter(l => l.validation === "valide" && l.actif !== false),
      livreurIdsEnCourseReelle
    ),
    [livreurs, livreurIdsEnCourseReelle]
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
    return { total: todayAll.length, livrees, annulees, enCours, ca, libres: compteursLivreurs.verts, enMission: compteursLivreurs.oranges };
  }, [coursesFiltrees, coursesEnTraitement, coursesTerminees, livreursEnLigne]);

  const taux = stats.total > 0 ? Math.round((stats.livrees / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="px-4 py-4 lg:px-6 lg:py-6 space-y-5 max-w-7xl mx-auto">

        {/* ── HERO HEADER ─────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary-dark via-primary to-primary-dark p-5 sm:p-6 shadow-[0_18px_45px_rgba(0,122,255,0.2)] border border-white/10 silgapp-relief-surface">
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
                    SILGAPP Externe
                    {isPays && adminCountryCode && (
                      <span className="ml-2 text-base font-normal text-white/50">· {adminCountryCode}</span>
                    )}
                  </h1>
                </div>
                <p className="text-white/80 text-xs capitalize">
                  {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Pill live */}
              <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {compteursLivreurs.verts} dispo · {compteursLivreurs.oranges} en mission · {compteursLivreurs.total} en ligne
              </div>
              <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/80">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCodePromo(true)}
                className="gap-1.5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 rounded-xl text-xs"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Codes Promo</span>
              </Button>
              <Link to="/carte">
                <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs shadow-lg shadow-primary/30">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Carte</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Filtres type de course */}
          <div className="relative mt-4 flex gap-2 flex-wrap">
            {[
              { key: "tous", label: "Tous" },
              { key: "expedier", label: " Expédition" },
              { key: "recevoir", label: " Réception" },
              { key: "deplacement", label: " Déplacement" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFiltreTypeDashboard(f.key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  filtreTypeDashboard === f.key
                    ? "bg-white/25 text-white border-white/40"
                    : "bg-white/5 text-white/80 border-white/10 hover:bg-white/15"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Mini KPIs dans le hero */}
          <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Aujourd'hui", value: stats.total, color: "text-white" },
              { label: "En cours", value: stats.enCours, color: "text-blue-300" },
              { label: "Livrées", value: stats.livrees, color: "text-green-300" },
              { label: "Taux", value: `${taux}%`, color: "text-yellow-300" },
            ].map(item => (
              <div key={item.label} className="flex flex-col items-center gap-0.5 border-r border-white/10 last:border-r-0 pr-3 last:pr-0">
                <p className={`text-xl sm:text-2xl font-black leading-none ${item.color}`}>{item.value}</p>
                <p className="text-xs text-white/80 uppercase tracking-wide">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── KPI CARDS ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 lg:gap-3">
          <KpiCard label="Personnes uniques" value={kpiClients.personnes_uniques ?? 0} icon={Users} color="bg-primary" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "tous" })} />
          <KpiCard label="Jamais commandé" value={kpiClients.jamais_commande ?? 0} icon={UserX} color="bg-gray-400" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "jamais_commande" })} />
          <KpiCard label="Créée non livrée" value={kpiClients.creee_non_livree ?? 0} icon={Clock} color="bg-warning" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "creee_non_livree" })} />
          <KpiCard label="Livré" value={kpiClients.au_moins_une_livree ?? 0} icon={CheckCircle2} color="bg-success" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "livres" })} />
          <KpiCard label="App uniques" value={kpiClients.clients_app_uniques ?? 0} icon={Smartphone} color="bg-indigo-500" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "app" })} />
          <KpiCard label="CRM uniques" value={kpiClients.clients_crm_uniques ?? 0} icon={UserPlus} color="bg-purple-500" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "crm" })} />
          <KpiCard label="Identifiés email" value={kpiClients.identifie_par_email ?? 0} icon={Smartphone} color="bg-blue-400" onClick={() => setStatModal({ type: "clients", data: clients, initialFilter: "app" })} />
          <KpiCard label="Courses" value={stats.total} icon={Package} color="bg-primary-dark" />
          <KpiCard label="En cours" value={stats.enCours} icon={Clock} color="bg-warning" onClick={() => setStatModal({ type: "en_traitement", data: coursesEnTraitement })} />
          <KpiCard label="Livrées" value={stats.livrees} icon={CheckCircle2} color="bg-success" onClick={() => setStatModal({ type: "livrees", data: coursesTerminees.filter(c => c.statut === "livree") })} />
          <KpiCard label="Annulées" value={stats.annulees} icon={XCircle} color="bg-red-500" onClick={() => setStatModal({ type: "annulees", data: coursesTerminees.filter(c => c.statut === "annulee") })} />
          <KpiCard label="CA du jour" value={stats.ca > 999 ? `${Math.round(stats.ca/1000)}k` : stats.ca} suffix={stats.ca <= 999 ? "F" : "F"} icon={TrendingUp} color="bg-primary" onClick={() => setStatModal({ type: "ca", data: coursesTerminees.filter(c => c.statut === "livree") })} />
          <KpiCard label="Disponibles" value={stats.libres} icon={Truck} color="bg-success" onClick={() => setStatModal({ type: "livreurs_dispo", data: livreursEnLigne.filter(l => l.statut === "disponible") })} />
        </div>

        {/* ── SANTÉ DU DISPATCH ──────────────────────────── */}
        <DispatchHealthPanel courses={courses} livreurs={livreurs} />

        {/* ── ACTIVITÉ VENUS ────────────────────────────── */}
        <VenusActivityPanel courses={courses} countryCode={effectiveCountry} />

        {/* ── ACTIVITÉ ─────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Activité en direct</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-2xl border border-border shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden">
              <ClientsEnLigne clients={clientsEnLigne} />
            </div>
            <div className="bg-card rounded-2xl border border-border shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden">
              <LivreursEnLigne livreurs={livreursEnLigne} livreurIdsEnCourseReelle={livreurIdsEnCourseReelle} />
            </div>
          </div>
        </div>

        {/* ── COURSES EN REDISPATCH (intervention admin) ── */}
        <CoursesRedispatch courses={courses} onView={setSelectedCourse} />

        {/* ── COURSES EN COURS ────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Courses en cours</p>
          <div className="bg-card rounded-2xl border border-border shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden">
            <CoursesEnTraitement
              courses={filtreTypeDashboard === "tous" ? coursesEnTraitement : coursesEnTraitement.filter(c => c.type_course === filtreTypeDashboard)}
              onView={setSelectedCourse}
              isExterne={true}
            />
          </div>
        </div>

        {/* ── HISTORIQUE DU JOUR ──────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Historique du jour</p>
          <div className="bg-card rounded-2xl border border-border shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden">
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

      {/* Modal Codes Promo */}
      <Dialog open={showCodePromo} onOpenChange={setShowCodePromo}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-purple-600" />
              Gestion des codes promo
            </DialogTitle>
          </DialogHeader>
          <CodePromoPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}