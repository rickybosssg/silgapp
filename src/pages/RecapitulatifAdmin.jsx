import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Calendar, Building2, Globe, AlertCircle, AlertTriangle } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, endOfDay, isWithinInterval } from "date-fns";
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

function ReseauCard({ title, icon: Icon, color, livreurs, coursesLivrees, isExterne }) {
  const totalLivreurs = livreurs.length;
  const enLigne = livreurs.filter(l => l.statut === "disponible" || l.statut === "en_course").length;
  const disponibles = livreurs.filter(l => l.statut === "disponible").length;
  const enCourse = livreurs.filter(l => l.statut === "en_course").length;
  const horsLigne = livreurs.filter(l => l.statut === "hors_ligne" || !l.statut).length;
  const paiementsValides = livreurs.filter(l => l.statut_paiement === "paye").length;
  const paiementsNonValides = livreurs.filter(l => l.statut_paiement !== "paye").length;

  const totalEncaisse = isExterne
    ? coursesLivrees.reduce((sum, c) => sum + (c.prix_final || 0), 0)
    : coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || c.prix || 0), 0);

  const totalDuSilga = isExterne
    ? coursesLivrees.reduce((sum, c) => sum + (Number(c.commission_silga) || 0), 0)
    : totalEncaisse;

  const kpis = [
    { label: "Livrées",     value: coursesLivrees.length,         grad: "from-primary to-red-600",       icon: "📦" },
    { label: "Encaissés",   value: totalEncaisse.toLocaleString(), grad: "from-amber-500 to-orange-500",  icon: "💰", suffix: "F" },
    { label: "Dû SILGAPP",    value: totalDuSilga.toLocaleString(),  grad: "from-blue-500 to-indigo-600",   icon: "🏦", suffix: "F" },
    { label: "En ligne",    value: enLigne,                        grad: "from-green-500 to-emerald-500", icon: "🟢" },
    { label: "Disponibles", value: disponibles,                    grad: "from-emerald-400 to-teal-500",  icon: "✅" },
    { label: "En course",   value: enCourse,                       grad: "from-orange-400 to-amber-500",  icon: "🚀" },
    { label: "Hors ligne",  value: horsLigne,                      grad: "from-gray-400 to-slate-500",    icon: "⚫" },
    { label: "Payés",       value: paiementsValides,               grad: "from-teal-500 to-cyan-500",     icon: "✔️" },
    { label: "Non payés",   value: paiementsNonValides,            grad: "from-rose-400 to-pink-500",     icon: "⏳" },
    { label: "Total",       value: totalLivreurs,                  grad: "from-violet-500 to-purple-600", icon: "👥" },
  ];

  // Alerte : livreurs disponibles mais aucune course active
  const inactiviteAlerte = disponibles > 0 && enCourse === 0 && coursesLivrees.length === 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-red-600 to-rose-600 p-5 shadow-xl shadow-red-100">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
        <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
      </div>
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-white text-lg">{title}</h2>
            <p className="text-white/65 text-xs">{totalLivreurs} livreur{totalLivreurs > 1 ? "s" : ""} enregistrés</p>
          </div>
        </div>

        {inactiviteAlerte && (
          <div className="mb-3 bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/25 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <p className="text-white text-xs font-medium">
              {disponibles} livreur{disponibles > 1 ? "s" : ""} disponible{disponibles > 1 ? "s" : ""} mais aucune course livrée sur la période.
            </p>
          </div>
        )}
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {kpis.map(k => (
            <div key={k.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/20">
              <p className="text-base leading-none mb-1">{k.icon}</p>
              <p className="text-white font-black text-lg leading-none">{k.value}{k.suffix && <span className="text-[9px] ml-0.5 opacity-70">{k.suffix}</span>}</p>
              <p className="text-white/60 text-[9px] mt-0.5 leading-tight">{k.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RecapitulatifAdmin({ reseau }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("today");
  const [filtreEndettes, setFiltreEndettes] = useState(false);
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
      case "yesterday": return { start: new Date(yesterday), end: endOfDay(new Date(yesterday)) };
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
        montant_du_silga: 0, // Remise à zéro du compteur
      },
    });
    toast.success(`Paiement de ${montant.toLocaleString()} FCFA validé ✅ — Compteur remis à zéro`);
  };

  // Livreurs et courses selon l'onglet actif
  const livreursActifs = activeTab === "interne" ? livreursInternes : livreursExternes;
  const coursesActives = activeTab === "interne" ? coursesInternes : coursesExternes;

  // ── Calcul des montants dus par livreur (sur la période sélectionnée) ──
  const livreurMontants = useMemo(() => {
    const map = {};
    const coursesLivrees = activeTab === "interne" ? coursesInterneLivrees : coursesExterneLivrees;
    for (const c of coursesLivrees) {
      if (c.statut === "livree" && c.livreur_id) {
        const amount = activeTab === "interne"
          ? (c.prix_reel || c.prix || 0)
          : (Number(c.commission_silga) || 0);
        map[c.livreur_id] = (map[c.livreur_id] || 0) + amount;
      }
    }
    return map;
  }, [activeTab, coursesInterneLivrees, coursesExterneLivrees]);

  const nbEndettes = useMemo(
    () => livreursActifs.filter(l => (Number(l.montant_du_silga) || 0) > 0).length,
    [livreursActifs]
  );

  const livreursFiltres = filtreEndettes
    ? livreursActifs.filter(l => (Number(l.montant_du_silga) || 0) > 0)
    : livreursActifs;

  // Si reseau est forcé (prop), afficher uniquement ce réseau sans onglets
  const showTabs = !reseau;

  return (
    <div className="p-4 space-y-5 max-w-7xl mx-auto">
      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">📈</div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Récapitulatif Admin</h1>
            <p className="text-white/60 text-xs mt-0.5 capitalize">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
      </div>

      {/* ── FILTRES PÉRIODE + ENDETTÉS ─────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        {periodFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setPeriod(f.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              period === f.value
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-gray-200 hover:border-slate-400 hover:text-slate-800"
            }`}
          >
            <Calendar className="w-3 h-3" />
            {f.label}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button
          onClick={() => setFiltreEndettes(!filtreEndettes)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            filtreEndettes
              ? "bg-red-600 text-white border-red-600 shadow-md"
              : "bg-white text-red-600 border-red-200 hover:border-red-400"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Endettés ({nbEndettes})
        </button>
      </div>

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

      {/* ── ONGLETS LIVREURS ─────────────────────────── */}
      {showTabs && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab("interne")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
              activeTab === "interne"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Internes ({livreursInternes.length})
          </button>
          <button
            onClick={() => setActiveTab("externe")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
              activeTab === "externe"
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50 hover:text-primary"
            }`}
          >
            <Globe className="w-4 h-4" />
            Externes ({livreursExternes.length})
          </button>
        </div>
      )}

      {/* ── PERFORMANCES LIVREURS ────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${activeTab === "interne" ? "bg-gradient-to-br from-blue-500 to-indigo-600" : "bg-gradient-to-br from-primary to-red-600"}`}>
            {activeTab === "interne" ? <Building2 className="w-4 h-4 text-white" /> : <Globe className="w-4 h-4 text-white" />}
          </div>
          <div>
            <p className="font-bold text-foreground">Performances — {activeTab === "interne" ? "SILGAPP Interne" : "SILGAPP Externe"}</p>
            <p className="text-xs text-muted-foreground">{livreursFiltres.length} livreur{livreursFiltres.length > 1 ? "s" : ""}{filtreEndettes ? " endetté(s)" : ""}</p>
          </div>
        </div>
        {loadingLivreurs ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : livreursActifs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">👤</div>
            <p className="text-sm font-semibold">Aucun livreur {activeTab} trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {livreursFiltres.map(livreur => (
              <LivreurPerformanceCard
                key={livreur.id}
                livreur={livreur}
                courses={coursesActives}
                montantDuOverride={livreurMontants[livreur.id] || 0}
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