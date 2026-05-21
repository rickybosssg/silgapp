import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Package, CheckCircle2, XCircle, Clock, TrendingUp, Trophy, MapPin } from "lucide-react";
import { isToday, getHours, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import StatCard from "../components/dashboard/StatCard";

const COLORS = ["#dc2626", "#f59e0b", "#16a34a", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function RapportJour() {
  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 500),
    initialData: [],
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  const today = useMemo(() => courses.filter(c => isToday(new Date(c.created_date))), [courses]);

  const stats = useMemo(() => {
    const livrees = today.filter(c => c.statut === "livree");
    const annulees = today.filter(c => c.statut === "annulee");
    const enAttente = today.filter(c => !["livree", "annulee"].includes(c.statut));
    const ca = livrees.reduce((s, c) => s + (c.prix || 0), 0);

    // Par livreur
    const parLivreur = {};
    today.forEach(c => {
      if (c.livreur_nom) {
        if (!parLivreur[c.livreur_nom]) parLivreur[c.livreur_nom] = { nom: c.livreur_nom, courses: 0, ca: 0 };
        parLivreur[c.livreur_nom].courses++;
        if (c.statut === "livree") parLivreur[c.livreur_nom].ca += (c.prix || 0);
      }
    });
    const livreurStats = Object.values(parLivreur).sort((a, b) => b.courses - a.courses);
    const meilleur = livreurStats[0] || null;

    // Par quartier
    const parQuartier = {};
    today.forEach(c => {
      const q = c.adresse_depart || "Inconnu";
      parQuartier[q] = (parQuartier[q] || 0) + 1;
    });
    const quartierStats = Object.entries(parQuartier)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));

    // Par heure
    const parHeure = {};
    for (let i = 6; i <= 22; i++) parHeure[i] = 0;
    today.forEach(c => {
      const h = getHours(new Date(c.created_date));
      if (parHeure[h] !== undefined) parHeure[h]++;
    });
    const heureStats = Object.entries(parHeure).map(([h, count]) => ({
      heure: `${h}h`,
      courses: count,
    }));

    return {
      total: today.length,
      livrees: livrees.length,
      annulees: annulees.length,
      enAttente: enAttente.length,
      ca,
      livreurStats,
      meilleur,
      quartierStats,
      heureStats,
    };
  }, [today]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Rapport du jour</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard title="Total courses" value={stats.total} icon={Package} iconBg="bg-primary" />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" />
        <StatCard title="En attente" value={stats.enAttente} icon={Clock} iconBg="bg-amber-500" />
        <StatCard title="Chiffre d'affaires" value={`${stats.ca.toLocaleString()} F`} icon={TrendingUp} iconBg="bg-indigo-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Courses par heure */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Courses par heure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.heureStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="heure" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="courses" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Courses par quartier */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Courses par quartier (départ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.quartierStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.quartierStats}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                  >
                    {stats.quartierStats.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-12">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Par livreur */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-secondary" /> Performance par livreur
            {stats.meilleur && (
              <span className="text-xs text-muted-foreground font-normal ml-2">
                🏆 Meilleur : {stats.meilleur.nom} ({stats.meilleur.courses} courses)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.livreurStats.length > 0 ? (
            <div className="space-y-2">
              {stats.livreurStats.map((l, i) => (
                <div key={l.nom} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                    <span className="text-sm font-medium">{l.nom}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>{l.courses} courses</span>
                    <span className="font-semibold">{l.ca.toLocaleString()} FCFA</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-8">Aucune donnée de livreur</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}