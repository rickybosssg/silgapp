import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck, CheckCircle2, Banknote, Eye, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurDetailDialog from "./LivreurDetailDialog";
import { useAuth } from "@/lib/AuthContext";

const periodOptions = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "custom", label: "Période personnalisée" },
];

export default function LivreurPerformanceTable() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-all"],
    queryFn: () => base44.entities.Course.list("-created_date", 1000),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Livreur.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  // Déterminer la période
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (selectedPeriod) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
      case "week":
        return { start: startOfWeek(now, { locale: fr }), end: endOfWeek(now, { locale: fr }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "custom":
        return customStart && customEnd ? { start: new Date(customStart), end: new Date(customEnd) } : null;
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [selectedPeriod, customStart, customEnd]);

  // Calculer les stats par livreur
  const performanceData = useMemo(() => {
    if (!dateRange) return [];

    const validLivreurs = livreurs.filter(l => l.validation === "valide");

    return validLivreurs.map(livreur => {
      const livreurCourses = courses.filter(c => 
        c.livreur_id === livreur.id &&
        new Date(c.created_date) >= dateRange.start &&
        new Date(c.created_date) <= dateRange.end
      );

      const livrees = livreurCourses.filter(c => c.statut === "livree");
      const annulees = livreurCourses.filter(c => c.statut === "annulee");
      const enCours = livreurCourses.filter(c => ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut));
      const refusees = livreurCourses.filter(c => c.statut === "en_attente_livreur" && !c.livreur_id);

      const totalEncaisse = livrees.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
      const montantDu = totalEncaisse; // 100% à reverser
      const isPaye = livreur.statut_paiement === "paye";

      // Dernière position
      const lastPos = livreur.latitude && livreur.longitude 
        ? `${livreur.latitude.toFixed(4)}, ${livreur.longitude.toFixed(4)}`
        : "N/A";
      const lastActivity = livreur.derniere_position_date 
        ? format(new Date(livreur.derniere_position_date), "dd/MM HH:mm", { locale: fr })
        : "Jamais";

      return {
        livreur,
        coursesLivrees: livrees.length,
        totalEncaisse,
        montantDu,
        isPaye,
        coursesAnnulees: annulees.length,
        coursesEnCours: enCours.length,
        coursesRefusees: refusees.length,
        lastPos,
        lastActivity,
      };
    });
  }, [livreurs, courses, dateRange]);

  // Résumé global
  const globalSummary = useMemo(() => {
    const totalLivreurs = livreurs.filter(l => l.validation === "valide").length;
    const enLigne = livreurs.filter(l => l.statut === "disponible" || l.statut === "en_course").length;
    const disponibles = livreurs.filter(l => l.statut === "disponible").length;
    const enCourse = livreurs.filter(l => l.statut === "en_course").length;
    const horsLigne = livreurs.filter(l => l.statut === "hors_ligne" || !l.statut).length;
    
    const totalCoursesLivrees = performanceData.reduce((sum, p) => sum + p.coursesLivrees, 0);
    const totalEncaisse = performanceData.reduce((sum, p) => sum + p.totalEncaisse, 0);
    const totalDu = totalEncaisse;
    const payesCount = performanceData.filter(p => p.isPaye).length;
    const nonPayesCount = performanceData.filter(p => !p.isPaye && p.montantDu > 0).length;

    return {
      totalLivreurs,
      enLigne,
      disponibles,
      enCourse,
      horsLigne,
      totalCoursesLivrees,
      totalEncaisse,
      totalDu,
      payesCount,
      nonPayesCount,
    };
  }, [livreurs, performanceData]);

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

  const handleViewDetail = (livreur) => {
    setSelectedLivreur(livreur);
    setShowDetail(true);
  };

  return (
    <div className="space-y-4">
      {/* Résumé global */}
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-accent/5">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Résumé général des livreurs
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
          <StatBox label="Total livreurs" value={globalSummary.totalLivreurs} />
          <StatBox label="En ligne" value={globalSummary.enLigne} color="text-green-600" />
          <StatBox label="Disponibles" value={globalSummary.disponibles} color="text-green-600" />
          <StatBox label="En course" value={globalSummary.enCourse} color="text-red-600" />
          <StatBox label="Hors ligne" value={globalSummary.horsLigne} color="text-slate-600" />
          <StatBox label="Courses livrées" value={globalSummary.totalCoursesLivrees} icon={CheckCircle2} />
          <StatBox label="Total encaissé" value={`${globalSummary.totalEncaisse.toLocaleString()} F`} icon={Banknote} />
          <StatBox label="Dû à Silga" value={`${globalSummary.totalDu.toLocaleString()} F`} color="text-blue-600" />
          <StatBox label="Payés" value={globalSummary.payesCount} color="text-green-600" />
          <StatBox label="Non payés" value={globalSummary.nonPayesCount} color="text-amber-600" />
        </div>
      </Card>

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedPeriod === "custom" && (
          <div className="flex gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-40"
            />
          </div>
        )}
      </div>

      {/* Tableau */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Livreur</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Courses livrées</TableHead>
              <TableHead className="text-right">Total encaissé</TableHead>
              <TableHead className="text-right">Dû à Silga</TableHead>
              <TableHead>Paiement</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performanceData.map(({ livreur, coursesLivrees, totalEncaisse, montantDu, isPaye }) => (
              <TableRow key={livreur.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {livreur.photo_url ? (
                      <img src={livreur.photo_url} alt={livreur.nom} className="w-8 h-8 rounded-full" />
                    ) : (
                      <Truck className="w-8 h-8 text-muted-foreground" />
                    )}
                    <span>{livreur.prenom} {livreur.nom}</span>
                  </div>
                </TableCell>
                <TableCell>{livreur.telephone}</TableCell>
                <TableCell>
                  <Badge variant={livreur.statut === "disponible" ? "default" : livreur.statut === "en_course" ? "destructive" : "secondary"}>
                    {livreur.statut === "disponible" ? "Disponible" : livreur.statut === "en_course" ? "En course" : "Hors ligne"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{coursesLivrees}</TableCell>
                <TableCell className="text-right font-semibold">{totalEncaisse.toLocaleString()} F</TableCell>
                <TableCell className="text-right font-semibold text-blue-600">{montantDu.toLocaleString()} F</TableCell>
                <TableCell>
                  {isPaye ? (
                    <Badge className="bg-green-500 text-white">Payé</Badge>
                  ) : montantDu > 0 ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">Non payé</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDetail(livreur)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {!isPaye && montantDu > 0 && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleValiderPaiement(livreur, montantDu)}
                        disabled={updateMutation.isPending}
                      >
                        <Banknote className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {performanceData.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Aucune donnée pour cette période
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog détail */}
      {selectedLivreur && (
        <LivreurDetailDialog
          livreur={selectedLivreur}
          open={showDetail}
          onClose={() => { setShowDetail(false); setSelectedLivreur(null); }}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color = "text-foreground" }) {
  return (
    <div className="text-center p-2 bg-white rounded-lg border">
      <div className={`text-lg font-bold ${color} flex items-center justify-center gap-1`}>
        {Icon && <Icon className="w-4 h-4" />}
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
