import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Clock, MapPin, Banknote, Calendar, AlertCircle } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const periodFilters = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

export default function LivreurHistorique({ mesCourses, livreurProfil, isExterne = false }) {
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

  // Filtrer les courses par période — utiliser heure_livraison pour les livrées, created_date sinon
  const filteredCourses = useMemo(() => {
    return mesCourses.filter(c => {
      const refDate = new Date(c.heure_livraison || c.updated_date || c.created_date);
      const start = new Date(dateRange.start); start.setHours(0,0,0,0);
      const end = new Date(dateRange.end); end.setHours(23,59,59,999);
      return refDate >= start && refDate <= end;
    });
  }, [mesCourses, dateRange]);

  // Récapitulatif du jour (toujours aujourd'hui, peu importe le filtre)
  const today = new Date().toDateString();
  const coursesToday = mesCourses.filter(c => {
    const refDate = new Date(c.heure_livraison || c.updated_date || c.created_date);
    return refDate.toDateString() === today;
  });
  
  const livreesToday = coursesToday.filter(c => c.statut === "livree");
  const totalEncaisseToday = isExterne
    ? livreesToday.reduce((sum, c) => sum + (c.prix_final || 0), 0)
    : livreesToday.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  const gainLivreurToday = livreesToday.reduce((sum, c) => {
    if (c.montant_livreur > 0) return sum + c.montant_livreur;
    return sum + Math.round((c.prix_final || 0) * 0.7);
  }, 0);
  const commissionToday = livreesToday.reduce((sum, c) => {
    if (c.commission_silga > 0) return sum + c.commission_silga;
    return sum + Math.round((c.prix_final || 0) * 0.3);
  }, 0);
  const montantDuSilga = livreurProfil?.montant_du_silga || 0;
  const isPaye = livreurProfil?.statut_paiement === "paye";

  return (
    <div className="space-y-4">
      {/* Récapitulatif du jour */}
      <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Récapitulatif aujourd'hui
        </h3>
        {isExterne ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
                <div className="flex items-center gap-1 text-amber-700 font-semibold text-sm mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {livreesToday.length} course{livreesToday.length > 1 ? "s" : ""}
                </div>
                <p className="text-xs text-amber-600">Livrées aujourd'hui</p>
              </div>
              <div className="bg-white/70 rounded-lg p-3 border border-amber-200">
                <div className="flex items-center gap-1 text-gray-700 font-semibold text-sm mb-1">
                  <Banknote className="w-4 h-4" />
                  {totalEncaisseToday.toLocaleString()} FCFA
                </div>
                <p className="text-xs text-amber-600">Prix total courses</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-50 rounded-lg p-2 border border-green-200 text-center">
                <p className="text-xs font-bold text-green-700">{gainLivreurToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-green-600 mt-0.5">Votre gain (70%)</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 border border-orange-200 text-center">
                <p className="text-xs font-bold text-orange-700">{commissionToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-orange-600 mt-0.5">Commission (30%)</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2 border border-red-200 text-center">
                <p className="text-xs font-bold text-red-700">{commissionToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-red-600 mt-0.5">Dû à Silga (auj.)</p>
              </div>
            </div>
          </div>
        ) : (
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
              <div className="flex items-center gap-1 text-green-700 font-semibold text-sm mb-1">
                {isPaye ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                {isPaye ? "Payé" : "Non payé"}
              </div>
              <p className="text-xs text-muted-foreground">Statut paiement</p>
            </div>
          </div>
        )}
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

                    {course.statut === "livree" && (
                      isExterne ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(() => {
                            const dist = course.distance_reelle_km > 0 ? Number(course.distance_reelle_km) : 0;
                            const prix = course.prix_final > 0 ? Number(course.prix_final) : 0;
                            const gain = course.montant_livreur > 0 ? Number(course.montant_livreur) : 0;
                            const commission = course.commission_silga > 0 ? Number(course.commission_silga) : 0;
                            let dureeMin = null;
                            if (course.heure_livraison && course.heure_recuperation) {
                              dureeMin = Math.round((new Date(course.heure_livraison) - new Date(course.heure_recuperation)) / 60000);
                            }
                            return <>
                              {dist > 0 && (
                                <span className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-0.5">
                                  📏 {dist.toFixed(1)} km
                                </span>
                              )}
                              {dureeMin !== null && dureeMin > 0 && (
                                <span className="text-xs text-purple-600 bg-purple-50 rounded px-2 py-0.5">
                                  ⏱ {dureeMin} min
                                </span>
                              )}
                              {prix > 0 && (
                                <span className="text-xs font-semibold text-gray-700 bg-gray-50 rounded px-2 py-0.5">
                                  💰 {prix.toLocaleString()} F
                                </span>
                              )}
                              {gain > 0 && (
                                <span className="text-xs font-bold text-green-700 bg-green-50 rounded px-2 py-0.5">
                                  ✅ +{gain.toLocaleString()} F
                                </span>
                              )}
                              {commission > 0 && (
                                <span className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-0.5">
                                  Silga: {commission.toLocaleString()} F
                                </span>
                              )}
                              {course.note_livreur > 0 && (
                                <span className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">
                                  {"⭐".repeat(course.note_livreur)}
                                </span>
                              )}
                            </>;
                          })()}
                        </div>
                      ) : (
                        course.prix_reel && (
                          <div className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded px-2 py-1 w-fit">
                            <Banknote className="w-3 h-3" />
                            {course.prix_reel.toLocaleString()} FCFA encaissés
                          </div>
                        )
                      )
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