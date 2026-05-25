import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, MapPin, Package, Truck, Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, ArrowLeft } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import StatCard from "@/components/dashboard/StatCard";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import CoursesADispatcher from "@/components/dashboard/CoursesADispatcher";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import AssignLivreurDialog from "@/components/courses/AssignLivreurDialog";
import DispatchMonitor from "@/components/dispatch/DispatchMonitor";
import BatterieAlertesPanel from "@/components/admin/BatterieAlertesPanel";
import { Card } from "@/components/ui/card";

export default function DashboardExterne() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignCourse, setAssignCourse] = useState(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes"],
    queryFn: () => base44.entities.Course.filter({ reseau: "externe" }, "-created_date", 300),
    initialData: [],
    refetchInterval: 10000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ reseau: "externe" }),
    initialData: [],
    refetchInterval: 15000,
  });

  const todayCourses = useMemo(
    () => courses.filter(c => isToday(new Date(c.created_date))),
    [courses]
  );

  const coursesADispatcher = useMemo(
    () => todayCourses.filter(c =>
      c.statut === "nouvelle" &&
      (!c.dispatch_status || c.dispatch_status === "en_attente_admin" || c.dispatch_status === "expire")
    ),
    [todayCourses]
  );

  const coursesEnTraitement = useMemo(
    () => todayCourses.filter(c =>
      !["livree", "annulee"].includes(c.statut) &&
      (c.statut !== "nouvelle" || (c.dispatch_status && !["en_attente_admin", "expire"].includes(c.dispatch_status))) &&
      !(c.statut === "nouvelle" && (!c.dispatch_status || c.dispatch_status === "en_attente_admin" || c.dispatch_status === "expire"))
    ),
    [todayCourses]
  );

  const coursesTerminees = useMemo(
    () => todayCourses.filter(c => ["livree", "annulee"].includes(c.statut)),
    [todayCourses]
  );

  const stats = useMemo(() => {
    const total = todayCourses.length;
    const livrees = coursesTerminees.filter(c => c.statut === "livree").length;
    const annulees = coursesTerminees.filter(c => c.statut === "annulee").length;
    const enCours = coursesEnTraitement.length;
    const aDispatcher = coursesADispatcher.length;
    const ca = coursesTerminees.filter(c => c.statut === "livree").reduce((s, c) => s + (c.prix_reel || c.prix || 0), 0);
    const dispoLivreurs = livreurs.filter(l => l.statut === "disponible" && l.validation === "valide" && l.actif !== false).length;
    return { total, livrees, annulees, enCours, aDispatcher, ca, dispoLivreurs };
  }, [todayCourses, coursesADispatcher, coursesEnTraitement, coursesTerminees, livreurs]);

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
        <div className="flex flex-wrap gap-2">
          <Link to="/nouvelle-course" className="flex-1 sm:flex-none">
            <Button size="sm" className="w-full sm:w-auto gap-1.5 bg-accent">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouvelle course</span>
              <span className="sm:hidden">Course</span>
            </Button>
          </Link>
          <Link to="/carte" className="flex-1 sm:flex-none">
            <Button variant="outline" size="sm" className="w-full sm:w-auto gap-1.5">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Carte</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Alertes batterie + dispatch monitor */}
      <BatterieAlertesPanel currentUser={null} />
      <DispatchMonitor />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard title="Total" value={stats.total} icon={Package} iconBg="bg-accent" />
        <StatCard title="À dispatcher" value={stats.aDispatcher} icon={AlertTriangle} iconBg="bg-orange-500" />
        <StatCard title="En traitement" value={stats.enCours} icon={Clock} iconBg="bg-blue-500" />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" />
        <StatCard title="CA du jour" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel="FCFA" />
        <StatCard title="Livreurs dispo" value={stats.dispoLivreurs} icon={Truck} iconBg="bg-accent" />
      </div>

      {/* Livreurs en ligne */}
      <LivreursEnLigne livreurs={livreurs} />

      {/* Courses à dispatcher */}
      <CoursesADispatcher
        courses={coursesADispatcher}
        onAssign={setAssignCourse}
        onView={setSelectedCourse}
      />

      {/* Courses en traitement */}
      <CoursesEnTraitement
        courses={coursesEnTraitement}
        onView={setSelectedCourse}
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
      <AssignLivreurDialog
        course={assignCourse}
        open={!!assignCourse}
        onClose={() => setAssignCourse(null)}
        reseau="externe"
      />
    </div>
  );
}