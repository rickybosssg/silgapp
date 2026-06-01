import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, Calendar, Building2, Globe } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurPerformanceCard from "@/components/livreurs/LivreurPerformanceCard";
import LivreurDetailDialog from "@/components/livreurs/LivreurDetailDialog";
import { toast } from "sonner";
import { useSilgappAuth } from "@/lib/silgappAuth";
import ReseauInternePremiumCard from "@/components/recap/ReseauInternePremiumCard";

const periodFilters = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

function StatBox({ value, label, color = "text-gray-900" }) {
  return (
    <div className="text-center p-2">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function ReseauCard({ title, icon: Icon, color, livreurs, coursesLivrees, isExterne }) {
  const totalLivreurs = livreurs.length;
  const enLigne = livreurs.filter(l => l.statut === "disponible" || l.statut === "en_course").length;
  const disponibles = livreurs.filter(l => l.statut === "disponible").length;
  const enCourse = livreurs.filter(l => l.statut === "en_course").length;
  const horsLigne = livreurs.filter(l => l.statut === "hors_ligne" || !l.statut).length;
  const paiementsValides = livreurs.filter(l => l.statut_paiement === "paye").length;
  const paiementsNonValides = livreurs.filter(l => l.statut_paiement !== "paye").length;

  // Calcul encaissé + dû Silga selon le réseau
  const totalEncaisse = isExterne
    ? coursesLivrees.reduce((sum, c) => sum + (c.prix_final || 0), 0)
    : coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || c.prix || 0), 0);

  const totalDuSilga = isExterne
    ? coursesLivrees.reduce((sum, c) => sum + (c.commission_silga || Math.round((c.prix_final || 0) * 0.3)), 0)
    : totalEncaisse; // interne : 100% dû à Silga

  return (
    <Card className={`p-5 border-2 ${color}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5" />
        <h2 className="font-bold text-lg">{title}</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {totalLivreurs} livreur{totalLivreurs > 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-5 md:grid-cols-10 gap-1 divide-x divide-border">
        <StatBox value={coursesLivrees.length} label="Courses livrées" color="text-primary" />
        <StatBox value={totalEncaisse.toLocaleString()} label="FCFA encaissés" color="text-amber-700" />
        <StatBox value={totalDuSilga.toLocaleString()} label="Dû à Silga" color="text-blue-700" />
        <StatBox value={enLigne} label="En ligne" color="text-green-700" />
        <StatBox value={disponibles} label="Disponibles" color="text-green-600" />
        <StatBox value={enCourse} label="En course" color="text-orange-600" />
        <StatBox value={horsLigne} label="Hors ligne" color="text-slate-500" />
        <StatBox value={paiementsValides} label="Paiements validés" color="text-emerald-700" />
        <StatBox value={paiementsNonValides} label="Non validés" color="text-amber-700" />
        <StatBox value={totalLivreurs} label="Total livreurs" color="text-indigo-700" />
      </div>
    </Card>
  );
}

export default function RecapitulatifAdmin({ reseau }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("today");
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [activeTab, setActiveTab] = useState(reseau || "interne");
  const { user: currentUser } = useSilgappAuth();

  // Charger TOUS les livreurs (on filtre ensuite par type)
  const { data: allLivreurs = [], isLoading: loadingLivreurs } = useQuery({
    queryKey: ["livreurs-all"],
    queryFn: () => base44.entities.Livreur.list("-created_date", 500),
    initialData: [],
  });

  // Courses internes (entité Course)
  const { data: coursesInternes = [] } = useQuery({
    queryKey: ["courses-internes-recap"],
    queryFn: () => base44.entities.Course.list("-created_date", 500),
    initialData: [],
    refetchInterval: 30000,
    enabled: !reseau || reseau === "interne",
  });

  // Courses externes (entité CourseExterne)
  const { data: coursesExternes = [] } = useQuery({
    queryKey: ["courses-externes-recap"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 500),
    initialData: [],
    refetchInterval: 30000,
    enabled: !reseau || reseau === "externe",
  });

  // Filtrer livreurs par type
  const livreursInternes = useMemo(
    () => allLivreurs.filter(l => l.type_livreur === "interne" || (!l.type_livreur && l.reseau === "interne") || (!l.type_livreur && !l.reseau)),
    [allLivreurs]
  );
  const livreursExternes = useMemo(
    () => allLivreurs.filter(l => l.type_livreur === "externe" || l.reseau === "externe"),
    [allLivreurs]
  );

  // Période
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = subDays(now, 1).toDateString();
    switch (period) {
      case "today":     return { start: new Date(today), end: new Date() };
      case "yesterday": return { start: new Date(yesterday), end: new Date(yesterday) };
      case "week":      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
      case "month":     return { start: startOfMonth(now), end: now };
      default:          return { start: new Date(today), end: new Date() };
    }
  }, [period]);

  const inPeriod = (c) => {
    const d = new Date(c.heure_livraison || c.created_date);
    return isWithinInterval(d, { start: dateRange.start, end: dateRange.end });
  };

  const coursesInterneLivrees = useMemo(
    () => coursesInternes.filter(c => c.statut === "livree" && inPeriod(c)),
    [coursesInternes, dateRange]
  );
  const coursesExterneLivrees = useMemo(
    () => coursesExternes.filter(c => c.statut === "livree" && inPeriod(c)),
    [coursesExternes, dateRange]
  );

  // Mutation validation paiement
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Livreur.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs-all"] }),
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

  // Livreurs et courses selon l'onglet actif
  const livreursActifs = activeTab === "interne" ? livreursInternes : livreursExternes;
  const coursesActives = activeTab === "interne" ? coursesInternes : coursesExternes;

  // Si reseau est forcé (prop), afficher uniquement ce réseau sans onglets
  const showTabs = !reseau;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Récapitulatif Admin</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
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

      {/* Cartes résumé */}
      {!reseau ? (
        <div className="space-y-4">
          <ReseauInternePremiumCard
            livreurs={livreursInternes}
            coursesLivrees={coursesInterneLivrees}
          />
          <ReseauCard
            title="SILGAPP Externe"
            icon={Globe}
            color="border-primary/20 bg-primary/5"
            livreurs={livreursExternes}
            coursesLivrees={coursesExterneLivrees}
            isExterne={true}
          />
        </div>
      ) : reseau === "interne" ? (
        <ReseauInternePremiumCard
          livreurs={livreursInternes}
          coursesLivrees={coursesInterneLivrees}
        />
      ) : (
        <ReseauCard
          title="SILGAPP Externe"
          icon={Globe}
          color="border-primary/20 bg-primary/5"
          livreurs={livreursExternes}
          coursesLivrees={coursesExterneLivrees}
          isExterne={true}
        />
      )}

      {/* Onglets livreurs — uniquement si pas de réseau forcé */}
      {showTabs && (
        <div className="flex gap-3">
          <button
            onClick={() => setActiveTab("interne")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              activeTab === "interne"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Livreurs internes ({livreursInternes.length})
          </button>
          <button
            onClick={() => setActiveTab("externe")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              activeTab === "externe"
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
            }`}
          >
            <Globe className="w-4 h-4" />
            Livreurs externes ({livreursExternes.length})
          </button>
        </div>
      )}

      {/* Tableau des livreurs filtrés */}
      <div>
        <h2 className="font-semibold text-lg mb-3">
          Performances — {activeTab === "interne" ? "SILGAPP Interne" : "SILGAPP Externe"}
        </h2>
        {loadingLivreurs ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : livreursActifs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Aucun livreur {activeTab} trouvé.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {livreursActifs.map(livreur => (
              <LivreurPerformanceCard
                key={livreur.id}
                livreur={livreur}
                courses={coursesActives}
                onVoirDetails={setSelectedLivreur}
                onValiderPaiement={handleValiderPaiement}
                isPending={updateMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {selectedLivreur && (
        <LivreurDetailDialog
          livreur={selectedLivreur}
          courses={coursesActives}
          onClose={() => setSelectedLivreur(null)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}