import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, MapPin, Package, Truck, Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, Users } from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import StatCard from "@/components/dashboard/StatCard";
import { useQueryClient } from "@tanstack/react-query";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import CoursesADispatcher from "@/components/dashboard/CoursesADispatcher";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import AssignLivreurDialog from "@/components/courses/AssignLivreurDialog";
import DispatchMonitor from "@/components/dispatch/DispatchMonitor";
import BatterieAlertesPanel from "@/components/admin/BatterieAlertesPanel";
import CoursesEnPausePanel from "@/components/admin/CoursesEnPausePanel";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/ui/PullToRefreshIndicator";

export default function Dashboard() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignCourse, setAssignCourse] = useState(null);
  const queryClient = useQueryClient();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.filter({ reseau: "interne" }, "-created_date", 500),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "interne" }),
    initialData: [],
    refetchInterval: 5000,
  });

  // Courses du jour = créées aujourd'hui OU encore actives (pas terminées)
  const todayCourses = useMemo(() => {
    return courses.filter(c =>
      isToday(new Date(c.created_date)) || !["livree", "annulee"].includes(c.statut)
    );
  }, [courses]);

  // Courses à dispatcher : statut "nouvelle" SANS livreur assigné (en attente action admin)
  const coursesADispatcher = useMemo(
    () => todayCourses.filter(c =>
      c.statut === "nouvelle" &&
      (!c.livreur_id || c.livreur_id === "") &&
      (!c.dispatch_status || c.dispatch_status === "en_attente_admin" || c.dispatch_status === "expire")
    ),
    [todayCourses]
  );

  // Courses en traitement : tout ce qui est actif + dispatch automatique en cours (statut=en_attente_livreur, dispatch_status=propose)
  const coursesEnTraitement = useMemo(
    () => todayCourses.filter(c =>
      !["livree", "annulee"].includes(c.statut) &&
      !(c.statut === "nouvelle" && (!c.dispatch_status || ["en_attente_admin", "expire"].includes(c.dispatch_status)))
    ),
    [todayCourses]
  );

  // Courses terminées aujourd'hui
  // ⚠️ On utilise heure_livraison || created_date — JAMAIS updated_date
  // car updated_date est modifié par les tâches de maintenance/correction auto,
  // ce qui ferait réapparaître d'anciennes courses annulées dans l'historique du jour.
  const coursesTerminees = useMemo(
    () => courses.filter(c =>
      ["livree", "annulee"].includes(c.statut) &&
      isToday(new Date(c.heure_livraison || c.created_date))
    ),
    [courses]
  );

  // Courses en pause
  const coursesEnPause = useMemo(
    () => courses.filter(c => c.statut === "pause"),
    [courses]
  );

  // Livreurs en ligne = disponible ou en_course, validés et actifs
  const livreursEnLigne = useMemo(
    () => livreurs.filter(l =>
      l.statut !== "hors_ligne" &&
      l.validation === "valide" &&
      l.actif !== false
    ),
    [livreurs]
  );

  const stats = useMemo(() => {
    const todayAll = courses.filter(c => isToday(new Date(c.created_date)));
    const total = todayAll.length;
    const livrees = courses.filter(c => c.statut === "livree" && isToday(new Date(c.heure_livraison || c.created_date))).length;
    const annulees = todayAll.filter(c => c.statut === "annulee").length;
    const enCours = coursesEnTraitement.length;
    const aDispatcher = coursesADispatcher.length;
    const ca = courses.filter(c => c.statut === "livree" && isToday(new Date(c.heure_livraison || c.created_date)))
      .reduce((s, c) => s + (c.prix_reel || c.prix || 0), 0);
    const dispoLivreurs = livreursEnLigne.filter(l => l.statut === "disponible").length;
    return { total, livrees, annulees, enCours, aDispatcher, ca, dispoLivreurs };
  }, [courses, coursesADispatcher, coursesEnTraitement, livreursEnLigne]);

  const { pulling, refreshing } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries({ queryKey: ["courses"] });
    await queryClient.invalidateQueries({ queryKey: ["livreurs"] });
  });

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 lg:space-y-5 max-w-7xl mx-auto">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-xs lg:text-sm text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/nouvelle-course" className="flex-1 sm:flex-none">
            <Button size="sm" className="w-full sm:w-auto gap-1.5 bg-primary">
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
          <Link to="/admin/externe" className="flex-1 sm:flex-none">
            <Button variant="outline" size="sm" className="w-full sm:w-auto gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">SILGAPP Externe</span>
              <span className="sm:hidden">Externe</span>
            </Button>
          </Link>

        </div>
      </div>

      {/* Alertes batterie + dispatch monitor + courses en pause */}
      <BatterieAlertesPanel currentUser={null} />
      <DispatchMonitor />
      <CoursesEnPausePanel
        courses={coursesEnPause}
        onReprendre={(course) => {
          base44.functions.invoke("gestionPauseCourse", {
            action: "reprendre_course",
            course_id: course.id,
            livreur_id: course.livreur_id,
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["courses"] });
          }).catch(err => alert("Erreur : " + err.message));
        }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard title="Total" value={stats.total} icon={Package} iconBg="bg-primary" />
        <StatCard title="À dispatcher" value={stats.aDispatcher} icon={AlertTriangle} iconBg="bg-orange-500" />
        <StatCard title="En traitement" value={stats.enCours} icon={Clock} iconBg="bg-blue-500" />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" />
        <StatCard title="CA du jour" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel="FCFA" />
        <StatCard title="Livreurs dispo" value={stats.dispoLivreurs} icon={Truck} iconBg="bg-accent" />
      </div>

      {/* Livreurs en ligne */}
      <LivreursEnLigne livreurs={livreursEnLigne} />

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
      />

      {/* Bouton flottant VENUS */}
      <VenusFloatingButton />
    </div>
  );
}