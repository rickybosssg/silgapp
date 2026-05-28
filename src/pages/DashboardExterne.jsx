import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, MapPin, Package, Truck, Clock, CheckCircle2, XCircle, TrendingUp, ArrowLeft } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import StatCard from "@/components/dashboard/StatCard";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";

import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";

import DispatchMonitor from "@/components/dispatch/DispatchMonitor";
import BatterieAlertesPanel from "@/components/admin/BatterieAlertesPanel";
import SyncClientGPSPanel from "@/components/admin/SyncClientGPSPanel";
import SyncLivreurGPSPanel from "@/components/admin/SyncLivreurGPSPanel";
import { Card } from "@/components/ui/card";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";

export default function DashboardExterne() {
  const [selectedCourse, setSelectedCourse] = useState(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-dashboard"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 300),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe" }),
    initialData: [],
    refetchInterval: 5000,
  });

  // Courses du jour OU encore actives
  const todayCourses = useMemo(
    () => courses.filter(c =>
      isToday(new Date(c.created_date)) || !["livree", "annulee"].includes(c.statut)
    ),
    [courses]
  );

  const coursesEnTraitement = useMemo(
    () => todayCourses.filter(c => !["livree", "annulee"].includes(c.statut)),
    [todayCourses]
  );

  const coursesTerminees = useMemo(
    () => courses.filter(c =>
      ["livree", "annulee"].includes(c.statut) &&
      isToday(new Date(c.heure_livraison || c.updated_date || c.created_date))
    ),
    [courses]
  );

  const livreursEnLigne = useMemo(
    () => livreurs.filter(l => l.statut !== "hors_ligne" && l.validation === "valide" && l.actif !== false),
    [livreurs]
  );

  const stats = useMemo(() => {
    const todayAll = courses.filter(c => isToday(new Date(c.created_date)));
    const total = todayAll.length;
    const livrees = coursesTerminees.filter(c => c.statut === "livree").length;
    const annulees = coursesTerminees.filter(c => c.statut === "annulee").length;
    const enCours = coursesEnTraitement.length;
    const ca = coursesTerminees.filter(c => c.statut === "livree").reduce((s, c) => s + (c.prix_final || 0), 0);
    const dispoLivreurs = livreursEnLigne.filter(l => l.statut === "disponible").length;
    return { total, livrees, annulees, enCours, ca, dispoLivreurs };
  }, [courses, coursesEnTraitement, coursesTerminees, livreursEnLigne]);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 lg:space-y-5 max-w-7xl mx-auto">
      {/* Header avec retour */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Changer</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">Silga Externe</h1>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
        <Link to="/carte" className="flex-1 sm:flex-none">
          <Button variant="outline" size="sm" className="w-full sm:w-auto gap-1.5">
            <MapPin className="w-4 h-4" />
            <span className="hidden sm:inline">Carte</span>
          </Button>
        </Link>
      </div>

      {/* Alertes batterie + dispatch monitor */}
      <BatterieAlertesPanel currentUser={null} />
      <DispatchMonitor />

      {/* Synchronisation GPS */}
      <div className="grid gap-4">
        <SyncClientGPSPanel />
        <SyncLivreurGPSPanel />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total" value={stats.total} icon={Package} iconBg="bg-accent" />
        <StatCard title="En traitement" value={stats.enCours} icon={Clock} iconBg="bg-blue-500" />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" />
        <StatCard title="CA du jour" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel="FCFA" />
        <StatCard title="Livreurs dispo" value={stats.dispoLivreurs} icon={Truck} iconBg="bg-accent" />
      </div>

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
    </div>
  );
}