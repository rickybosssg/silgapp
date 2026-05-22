import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Truck, Users, CheckCircle2, Banknote, TrendingUp, 
  Clock, MapPin, Phone, Eye, Calendar 
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurPerformanceCard from "@/components/livreurs/LivreurPerformanceCard";
import LivreurDetailDialog from "@/components/livreurs/LivreurDetailDialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

const periodFilters = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

export default function RecapitulatifAdmin() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("today");
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const { user: currentUser } = useAuth();

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list("-created_date", 200),
    initialData: [],
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 500),
    initialData: [],
    refetchInterval: 30000,
  });

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
    return courses.filter(c => {
      const courseDate = new Date(c.created_date);
      return isWithinInterval(courseDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [courses, dateRange]);

  // Résumé global
  const globalStats = useMemo(() => {
    const totalLivreurs = livreurs.length;
    const enLigne = livreurs.filter(l => l.statut === "disponible" || l.statut === "en_course").length;
    const disponibles = livreurs.filter(l => l.statut === "disponible").length;
    const enCourse = livreurs.filter(l => l.statut === "en_course").length;
    const horsLigne = livreurs.filter(l => l.statut === "hors_ligne" || !l.statut).length;
    
    const coursesLivrees = filteredCourses.filter(c => c.statut === "livree");
    const totalEncaisse = coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
    const totalDuSilga = totalEncaisse; // 100%
    
    const paiementsValides = livreurs.filter(l => l.statut_paiement === "paye").length;
    const paiementsNonValides = livreurs.filter(l => l.statut_paiement !== "paye" && l.statut_paiement !== undefined).length;

    return {
      totalLivreurs,
      enLigne,
      disponibles,
      enCourse,
      horsLigne,
      coursesLivrees: coursesLivrees.length,
      totalEncaisse,
      totalDuSilga,
      paiementsValides,
      paiementsNonValides,
    };
  }, [livreurs, filteredCourses]);

  // Mutation validation paiement
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Livreur.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  const handleValiderPaiement = (livreur, montant) => {
    updateMutation.mutate({
      id: livreur.id,
      data: {
        statut_paiement: "paye",
        montant_paye: montant,
        heure_paiement: new Date().toISOString(),
        admin_paiement: currentUser?.full_name || currentUser?.email || "admin",
      },
    });
    toast.success(`Paiement de ${montant.toLocaleString()} FCFA validé ✅`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Récapitulatif Admin</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
      </div>

      {/* Filtres période */}
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList>
          {periodFilters.map(f => (
            <TabsTrigger key={f.value} value={f.value} className="gap-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5" />
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Résumé global */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 to-indigo-50 border-primary/20">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">Résumé général des livreurs</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
          <div className="text-center">
            <div className="text-2xl font-black text-primary">{globalStats.coursesLivrees}</div>
            <p className="text-xs text-muted-foreground">Courses livrées</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-amber-700">{globalStats.totalEncaisse.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">FCFA encaissés</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-blue-700">{globalStats.totalDuSilga.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Dû à Silga</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-green-700">{globalStats.enLigne}</div>
            <p className="text-xs text-muted-foreground">En ligne</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-green-600">{globalStats.disponibles}</div>
            <p className="text-xs text-muted-foreground">Disponibles</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-red-600">{globalStats.enCourse}</div>
            <p className="text-xs text-muted-foreground">En course</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-slate-500">{globalStats.horsLigne}</div>
            <p className="text-xs text-muted-foreground">Hors ligne</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-emerald-700">{globalStats.paiementsValides}</div>
            <p className="text-xs text-muted-foreground">Paiements validés</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-amber-700">{globalStats.paiementsNonValides}</div>
            <p className="text-xs text-muted-foreground">Non validés</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-indigo-700">{globalStats.totalLivreurs}</div>
            <p className="text-xs text-muted-foreground">Total livreurs</p>
          </div>
        </div>
      </Card>

      {/* Tableau des livreurs */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Performances par livreur</h2>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {livreurs.map(livreur => (
              <LivreurPerformanceCard
                key={livreur.id}
                livreur={livreur}
                courses={courses}
                onVoirDetails={setSelectedLivreur}
                onValiderPaiement={handleValiderPaiement}
                isPending={updateMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog détails */}
      {selectedLivreur && (
        <LivreurDetailDialog
          livreur={selectedLivreur}
          courses={courses}
          onClose={() => setSelectedLivreur(null)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
