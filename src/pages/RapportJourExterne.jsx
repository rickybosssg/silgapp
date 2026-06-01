import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Package, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  const coursesToday = useMemo(() => {
    return courses.filter(c => {
      const date = new Date(c.created_date);
      return date >= today && date <= endOfDay(today);
    });
  }, [courses]);

  const stats = useMemo(() => {
    const livrees = coursesToday.filter(c => c.statut === "livree");
    return {
      totale: coursesToday.length,
      livrees: livrees.length,
      ca: livrees.reduce((sum, c) => sum + (c.prix_final || 0), 0),
      distance: livrees.reduce((sum, c) => sum + (c.distance_reelle_km || 0), 0),
    };
  }, [coursesToday]);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport du Jour (Externe)</h1>
          <p className="text-sm text-muted-foreground">
            {format(today, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="Courses totales" 
          value={stats.totale} 
          icon={Package}
          color="bg-primary" 
        />
        <StatCard 
          label="Courses livrées" 
          value={stats.livrees} 
          icon={Package}
          color="bg-green-500" 
        />
        <StatCard 
          label="CA encaissé" 
          value={`${stats.ca.toLocaleString()}`} 
          icon={DollarSign}
          color="bg-indigo-500"
          suffix="FCFA"
        />
        <StatCard 
          label="Distance totale" 
          value={stats.distance.toFixed(1)} 
          icon={TrendingUp}
          color="bg-blue-500"
          suffix="km"
        />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Détail des courses livrées</h2>
        {coursesToday.filter(c => c.statut === "livree").length === 0 ? (
          <p className="text-center text-muted-foreground py-4">Aucune course livrée aujourd'hui</p>
        ) : (
          <div className="space-y-2">
            {coursesToday
              .filter(c => c.statut === "livree")
              .map(course => (
                <div key={course.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-semibold">{course.client_nom || "Client"}</p>
                    <p className="text-xs text-muted-foreground">
                      {course.adresse_depart} → {course.adresse_arrivee}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{course.prix_final?.toLocaleString() || "0"} FCFA</p>
                    <p className="text-xs text-muted-foreground">
                      {course.heure_livraison ? format(new Date(course.heure_livraison), "HH:mm") : "-"}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, suffix }) {
  return (
    <Card className={`p-4 ${color} text-white`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs opacity-90">{label}</p>
        <Icon className="w-4 h-4 opacity-80" />
      </div>
      <p className="text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
      </p>
    </Card>
  );
}