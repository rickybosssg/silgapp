import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Package, Truck, Clock, CheckCircle2, XCircle, TrendingUp, ArrowLeft, Globe } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import StatCard from "@/components/dashboard/StatCard";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import StatsPays from "@/components/international/StatsPays.jsx";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import ClientsEnLigne from "@/components/dashboard/ClientsEnLigne";
import { isON, isLibre, isEnCourse, isAppActive, hasValidGPS, isEligibleCarte, isClientEligibleCarte, hasGPS } from "@/lib/dispatchRules.js";
import { calculateLivreurCounters, calculateClientCounters } from "@/lib/livreurCounters.js";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import CodePromoPanel from "@/components/admin/CodePromoPanel";
import DownloadStatsPanel from "@/components/admin/DownloadStatsPanel";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import StatDetailModal from "@/components/dashboard/StatDetailModal";
import AppToggleButton from "@/components/admin/AppToggleButton";

export default function DashboardExterne() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [statModal, setStatModal] = useState(null);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const defaultCountry = paysActifs.length === 1 ? paysActifs[0].code : null;
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || defaultCountry);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-dashboard", effectiveCountry || "all"],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date")
      : base44.entities.CourseExterne.list("-created_date", 300),
    initialData: [],
    refetchInterval: 5000,
  });

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", country_code: effectiveCountry }
    : { type_livreur: "externe" };

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.Livreur.filter(livreurFilter),
    initialData: [],
    refetchInterval: 5000,
  });

  const clientFilter = effectiveCountry
    ? { actif: true, country_code: effectiveCountry }
    : { actif: true };

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.ClientExterne.filter(clientFilter),
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

  const livreursEnLigne = useMemo(
    () => livreurs.filter(l => isON(l) && l.validation === "valide" && l.actif !== false),
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
    const total = todayAll.length;
    const livrees = coursesTerminees.filter(c => c.statut === "livree").length;
    const annulees = coursesTerminees.filter(c => c.statut === "annulee").length;
    const enCours = coursesEnTraitement.length;
    const ca = coursesTerminees.filter(c => c.statut === "livree").reduce((s, c) => s + (c.prix_final || 0), 0);
    const dispoLivreurs = livreursEnLigne.filter(l => l.statut === "disponible").length;
    const totalClients = clients.length;
    return { total, livrees, annulees, enCours, ca, dispoLivreurs, totalClients };
  }, [coursesFiltrees, coursesEnTraitement, coursesTerminees, livreursEnLigne, clients]);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 lg:space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Changer</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">
              Silga Externe
              {isPays && adminCountryCode && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  — {adminCountryCode}
                </span>
              )}
            </h1>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isGlobal && (
            <Link to="/admin/global">
              <Button variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Global</span>
              </Button>
            </Link>
          )}
          {!isPays && (
            <div className="flex items-center gap-1.5">
              <CountrySelector
                value={effectiveCountry || ""}
                onChange={(code) => setSelectedCountry(code)}
                className="h-9 text-xs"
              />
            </div>
          )}
          <AppToggleButton />
          <Link to="/carte">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Carte</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Codes Promo */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <CodePromoPanel />
      </div>

      {/* Statistiques Téléchargements */}
      <DownloadStatsPanel />


      {/* Stats principales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard title="Total clients" value={compteursClients.total} icon={Package} iconBg="bg-purple-500" onClick={() => setStatModal({ type: "clients", data: clients })} />
        <StatCard title="Total courses" value={stats.total} icon={Package} iconBg="bg-accent" />
        <StatCard title="En traitement" value={stats.enCours} icon={Clock} iconBg="bg-blue-500" onClick={() => setStatModal({ type: "en_traitement", data: coursesEnTraitement })} />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" onClick={() => setStatModal({ type: "livrees", data: coursesTerminees.filter(c => c.statut === "livree") })} />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" onClick={() => setStatModal({ type: "annulees", data: coursesTerminees.filter(c => c.statut === "annulee") })} />
        <StatCard title="CA du jour" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel="FCFA" onClick={() => setStatModal({ type: "ca", data: coursesTerminees.filter(c => c.statut === "livree") })} />
        <StatCard title="Livreurs dispo" value={compteursLivreurs.libres} icon={Truck} iconBg="bg-accent" onClick={() => setStatModal({ type: "livreurs_dispo", data: livreursEnLigne.filter(l => l.statut === "disponible") })} />
      </div>

      {/* Clients en ligne */}
      <ClientsEnLigne clients={clientsEnLigne} />

      {/* Livreurs en ligne */}
      <LivreursEnLigne livreurs={livreursEnLigne} />

      {/* Courses en traitement */}
      <CoursesEnTraitement
        courses={coursesEnTraitement}
        onView={setSelectedCourse}
        isExterne={true}
      />

      {/* Historique du jour */}
      <CoursesTerminees
        courses={coursesTerminees}
        onView={setSelectedCourse}
      />

      {/* Dialogs */}
      <CourseDetailDialog
        course={selectedCourse}
        open={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />

      {/* Bouton flottant VENUS */}
      <VenusFloatingButton />

      {/* Modal détails stats */}
      <StatDetailModal
        open={!!statModal}
        onClose={() => setStatModal(null)}
        type={statModal?.type}
        data={statModal?.data}
      />
    </div>
  );
}