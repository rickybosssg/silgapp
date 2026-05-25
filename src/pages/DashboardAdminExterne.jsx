import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Package, DollarSign, TrendingUp, ArrowLeft, MapPin, Truck, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function DashboardAdminExterne() {
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 10000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe" }, "-created_date"),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes"],
    queryFn: () => base44.entities.ClientExterne.list("-created_date", 100),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const coursesToday = courses.filter(c => new Date(c.created_date).toDateString() === today);
    const livrees = courses.filter(c => c.statut === "livree");
    
    return {
      coursesTotale: courses.length,
      coursesToday: coursesToday.length,
      enCours: courses.filter(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)).length,
      livrees: livrees.length,
      caTotal: livrees.reduce((sum, c) => sum + (c.prix_final || 0), 0),
      commissionSilga: livrees.reduce((sum, c) => sum + (c.commission_silga || 0), 0),
      livreursTotal: livreurs.length,
      livreursActifs: livreurs.filter(l => l.statut === "disponible" && l.actif).length,
      livreursEnAttente: livreurs.filter(l => l.validation === "en_attente").length,
      clientsTotal: clients.length,
    };
  }, [courses, livreurs, clients]);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header avec retour */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">Silga Externe - Admin</h1>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Courses totales" value={stats.coursesTotale} icon={Package} color="bg-primary" />
        <StatCard title="Aujourd'hui" value={stats.coursesToday} icon={Package} color="bg-blue-500" />
        <StatCard title="En cours" value={stats.enCours} icon={Truck} color="bg-orange-500" />
        <StatCard title="Livrées" value={stats.livrees} icon={TrendingUp} color="bg-green-500" />
        <StatCard title="CA total" value={`${stats.caTotal.toLocaleString()}`} icon={DollarSign} color="bg-indigo-500" suffix="F" />
        <StatCard title="Commission Silga" value={`${stats.commissionSilga.toLocaleString()}`} icon={DollarSign} color="bg-purple-500" suffix="F" />
        <StatCard title="Livreurs" value={stats.livreursTotal} icon={Users} color="bg-accent" />
        <StatCard title="Clients" value={stats.clientsTotal} icon={Users} color="bg-pink-500" />
      </div>

      {/* Alerts */}
      {stats.livreursEnAttente > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">{stats.livreursEnAttente} livreur(s) en attente de validation</p>
              <Link to="/admin/externe/livreurs">
                <Button variant="outline" size="sm" className="mt-2 text-amber-700 border-amber-300 hover:bg-amber-100">
                  Voir les demandes
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Actions rapides */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Link to="/admin/externe/livreurs" className="flex-1">
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Gérer les livreurs</p>
                <p className="text-xs text-muted-foreground">Validations, blocages</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/externe/courses" className="flex-1">
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Courses</p>
                <p className="text-xs text-muted-foreground">Historique complet</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/externe/paiements" className="flex-1">
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Paiements</p>
                <p className="text-xs text-muted-foreground">Montants dus à Silga</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Dernières courses */}
      <Card className="p-4">
        <h3 className="font-bold text-foreground mb-3">Dernières courses</h3>
        <div className="space-y-2">
          {courses.slice(0, 5).map(course => (
            <div key={course.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{course.client_nom || "Client"}</span>
                  <Badge variant={course.statut === "livree" ? "default" : "secondary"} className="text-xs">
                    {course.statut}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {course.adresse_depart} → {course.adresse_arrivee}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}
                </p>
              </div>
              <div className="text-right">
                {course.prix_final ? (
                  <p className="font-bold text-sm text-green-600">{course.prix_final.toLocaleString()} F</p>
                ) : course.prix_estimate ? (
                  <p className="text-xs text-muted-foreground">~{course.prix_estimate.toLocaleString()} F</p>
                ) : null}
                {course.livreur_nom && (
                  <p className="text-xs text-muted-foreground">{course.livreur_nom}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, suffix }) {
  // Icon est déjà passé comme composant depuis les imports lucide-react
  return (
    <Card className={`p-4 ${color} text-white`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs opacity-90">{title}</p>
        <Icon className="w-4 h-4 opacity-80" />
      </div>
      <p className="text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
      </p>
    </Card>
  );
}