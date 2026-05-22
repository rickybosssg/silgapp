import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Package, Truck, Clock, CheckCircle2, 
  XCircle, AlertTriangle, MapPin, TrendingUp 
} from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import StatCard from "../components/dashboard/StatCard";
import CourseListItem from "../components/courses/CourseListItem";
import CourseDetailDialog from "../components/courses/CourseDetailDialog";
import AssignLivreurDialog from "../components/courses/AssignLivreurDialog";
import DispatchModeSelector from "../components/dispatch/DispatchModeSelector";
import DispatchMonitor from "../components/dispatch/DispatchMonitor";
import BatterieAlertesPanel from "../components/admin/BatterieAlertesPanel";
import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";

const statusFilters = [
  { value: "toutes", label: "Toutes" },
  { value: "active", label: "En cours" },
  { value: "nouvelle", label: "Nouvelles" },
  { value: "livree", label: "Livrées" },
  { value: "annulee", label: "Annulées" },
];

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState("toutes");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignCourse, setAssignCourse] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;

    base44.auth.me().then(async (user) => {
      if (cancelled) return;
      setCurrentUser(user);
      if (!user) return;
      
      // Enregistrer le token push pour admin
      const token = await registerPushToken();
      if (token) {
        console.log('Token push admin enregistré:', token);
      }

      // S'abonner aux notifications
      unsubscribe = subscribeToNotifications(
        (notification) => {
          toast.info(`${notification.titre}: ${notification.message}`);
        },
        user.email
      );
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 200),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  const todayCourses = useMemo(
    () => courses.filter(c => isToday(new Date(c.created_date))),
    [courses]
  );

  const stats = useMemo(() => {
    const total = todayCourses.length;
    const livrees = todayCourses.filter(c => c.statut === "livree").length;
    const annulees = todayCourses.filter(c => c.statut === "annulee").length;
    const enCours = todayCourses.filter(c => 
      !["livree", "annulee", "nouvelle"].includes(c.statut)
    ).length;
    const nouvelles = todayCourses.filter(c => c.statut === "nouvelle").length;
    const ca = todayCourses.filter(c => c.statut === "livree").reduce((s, c) => s + (c.prix || 0), 0);
    const dispoLivreurs = livreurs.filter(l => l.statut === "disponible").length;
    return { total, livrees, annulees, enCours, nouvelles, ca, dispoLivreurs };
  }, [todayCourses, livreurs]);

  const filteredCourses = useMemo(() => {
    if (statusFilter === "toutes") return todayCourses;
    if (statusFilter === "active") return todayCourses.filter(c => 
      !["livree", "annulee", "nouvelle"].includes(c.statut)
    );
    return todayCourses.filter(c => c.statut === statusFilter);
  }, [todayCourses, statusFilter]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/carte">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MapPin className="w-4 h-4" /> Carte
            </Button>
          </Link>
          <Link to="/nouvelle-course">
            <Button size="sm" className="gap-1.5 bg-primary">
              <Plus className="w-4 h-4" /> Nouvelle course
            </Button>
          </Link>
        </div>
      </div>

      {/* Dispatch Mode Selector */}
      <DispatchModeSelector />
      <DispatchMonitor />
      <BatterieAlertesPanel />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard title="Total" value={stats.total} icon={Package} iconBg="bg-primary" />
        <StatCard title="Nouvelles" value={stats.nouvelles} icon={AlertTriangle} iconBg="bg-blue-500" />
        <StatCard title="En cours" value={stats.enCours} icon={Clock} iconBg="bg-amber-500" />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" />
        <StatCard title="CA du jour" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel="FCFA" />
        <StatCard title="Livreurs dispo" value={stats.dispoLivreurs} icon={Truck} iconBg="bg-accent" />
      </div>

      {/* Courses list */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-semibold text-base">Courses du jour</h2>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8">
              {statusFilters.map(f => (
                <TabsTrigger key={f.value} value={f.value} className="text-xs h-7 px-3">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
          {isLoading && (
            <div className="text-center py-12 text-muted-foreground text-sm">Chargement...</div>
          )}
          {!isLoading && filteredCourses.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Aucune course pour ce filtre
            </div>
          )}
          {filteredCourses.map(course => (
            <CourseListItem
              key={course.id}
              course={course}
              onView={setSelectedCourse}
              onAssign={setAssignCourse}
            />
          ))}
        </div>
      </Card>

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
    </div>
  );
}
