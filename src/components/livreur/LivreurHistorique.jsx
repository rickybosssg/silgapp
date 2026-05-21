import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Clock, MapPin, Banknote, Calendar } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const periodFilters = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

export default function LivreurHistorique({ mesCourses, livreurProfil }) {
  const [period, setPeriod] = useState("today");

  // Déterminer la période
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = subDays(now, 1).toDateString();
    
    switch (period) {
      case "today":
        return { start: new Date(today), end: new Date(today) };
      case "yesterday":
        return { start: new Date(yesterday), end: new Date(yesterday) };
      case "week":
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
      case "month":
        return { start: startOfMonth(now), end: now };
      default:
        return { start: new Date(today), end: new Date(today) };
    }
  }, [period]);

  // Filtrer les courses par période
  const filteredCourses = useMemo(() => {
    return mesCourses.filter(c => {
      const courseDate = new Date(c.created_date);
      return isWithinInterval(courseDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [mesCourses, dateRange]);

  // Récapitulatif du jour (toujours aujourd'hui, peu importe le filtre)
  const today = new Date().toDateString();
  const coursesToday = mesCourses.filter(c => 
    new Date(c.created_date).toDateString() === today
  );
  
  const livreesToday = coursesToday.filter(c => c.statut === "livree");
  const totalEncaisseToday = livreesToday.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  const montantDuToday = totalEncaisseToday;
  const isPaye = livreurProfil?.statut_paiement === "paye";

  return (
    <div className="space-y-4">
      {/* Récapitulatif du jour */}
      <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Récapitulatif aujourd'hui
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
            <div className="flex items-center gap-1 text-amber-700 font-semibold text-sm mb-1">
              <CheckCircle2 className="w-4 h-4" />
              {livreesToday.length} course{livreesToday.length > 1 ? "s" : ""}
            </div>
            <p className="text-xs text-amber-600">Livrées aujourd'hui</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
            <div className="flex items-center gap-1 text-amber-700 font-semibold text-sm mb-1">
              <Banknote className="w-4 h-4" />
              {totalEncaisseToday.toLocaleString()} FCFA
            </div>
            <p className="text-xs text-amber-600">Total encaissé</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
            <div className="flex items-center gap-1 text-blue-700 font-semibold text-sm mb-1">
              <Banknote className="w-4 h-4" />
              {montantDuToday.toLocaleString()} FCFA
            </div>
            <p className="text-xs text-blue-600">Dû à Silga</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
            <div className="flex items-center gap-1 text-green-700 font-semibold text-sm mb-1">
              {isPaye ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              {isPaye ? "Payé" : "Non payé"}
            </div>
            <p className="text-xs text-muted-foreground">Statut paiement</p>
          </div>
        </div>
      </Card>

      {/* Filtres période */}
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="w-full">
          {periodFilters.map(f => (
            <TabsTrigger key={f.value} value={f.value} className="text-xs flex-1">
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Historique des courses */}
      <div>
        <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
          Historique ({filteredCourses.length} course{filteredCourses.length > 1 ? "s" : ""})
        </h3>
        {filteredCourses.length === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">Aucune course pour cette période</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredCourses.map(course => (
              <Card key={course.id} className="p-3">
                <div className="flex items-start gap-3">
                  {/* Statut */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    course.statut === "livree" && "bg-green-100",
                    course.statut === "annulee" && "bg-red-100",
                    ["acceptee", "colis_recupere", "en_livraison"].includes(course.statut) && "bg-blue-100",
                    course.statut === "nouvelle" && "bg-slate-100"
                  )}>
                    {course.statut === "livree" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : course.statut === "annulee" ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-blue-600" />
                    )}
                  </div>

                  {/* Détails */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        course.statut === "livree" && "bg-green-100 text-green-700",
                        course.statut === "annulee" && "bg-red-100 text-red-700",
                        ["acceptee", "colis_recupere", "en_livraison"].includes(course.statut) && "bg-blue-100 text-blue-700"
                      )}>
                        {course.statut === "livree" ? "Livrée" : course.statut === "annulee" ? "Annulée" : "En cours"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(course.created_date), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{course.adresse_depart}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <span className="text-muted-foreground/50">→</span>
                      <span className="truncate">{course.adresse_arrivee}</span>
                    </div>

                    {course.prix_reel && course.statut === "livree" && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded px-2 py-1 w-fit">
                        <Banknote className="w-3 h-3" />
                        {course.prix_reel.toLocaleString()} FCFA encaissés
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}