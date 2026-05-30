import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "@/components/courses/CourseStatusBadge";
import { useAdminContext } from "@/hooks/useAdminContext.js";

export default function ToutesCoursesExternes() {
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes", effectiveCountry || "all"],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date", 200)
      : base44.entities.CourseExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 10000,
  });

  const stats = useMemo(() => {
    return {
      totale: courses.length,
      nouvelle: courses.filter(c => c.statut === "nouvelle").length,
      enCours: courses.filter(c => ["recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)).length,
      livree: courses.filter(c => c.statut === "livree").length,
      annulee: courses.filter(c => c.statut === "annulee").length,
    };
  }, [courses]);

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link to={isPays ? "/" : "/admin/global"}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            {isPays ? "Retour" : "Admin Global"}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Toutes les Courses (Externes)</h1>
          <p className="text-sm text-muted-foreground">
            {stats.totale} courses {effectiveCountry ? `(${effectiveCountry})` : "tous pays"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Totale" value={stats.totale} color="bg-primary" />
        <StatCard label="Nouvelle" value={stats.nouvelle} color="bg-orange-500" />
        <StatCard label="En cours" value={stats.enCours} color="bg-blue-500" />
        <StatCard label="Livrée" value={stats.livree} color="bg-green-500" />
        <StatCard label="Annulée" value={stats.annulee} color="bg-red-500" />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Historique complet</h2>
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucune course externe</p>
          </div>
        ) : (
          <div className="space-y-2">
            {courses.map(course => (
              <div key={course.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{course.client_nom || "Client"}</span>
                    <CourseStatusBadge statut={course.statut} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{course.adresse_depart} → {course.adresse_arrivee}</span>
                    <span>•</span>
                    <span>{format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-4 text-right">
                  {course.prix_final ? (
                    <span className="text-sm font-semibold text-green-700">{course.prix_final.toLocaleString()} F</span>
                  ) : course.prix_estimate ? (
                    <span className="text-xs text-muted-foreground">~{course.prix_estimate.toLocaleString()} F</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <Card className={`p-4 ${color} text-white`}>
      <p className="text-xs opacity-90">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}