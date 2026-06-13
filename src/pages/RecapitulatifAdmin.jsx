import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Calendar, Building2, Globe } from "lucide-react";
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
    ? coursesLivrees.reduce((sum, c) => sum + (c.commission_silga || Math.round((c.prix_final || 0) * 0.3)), 0)
    : totalEncaisse;

  const kpis = [
    { label: "Livrées",     value: coursesLivrees.length,         grad: "from-primary to-red-600",       icon: "📦" },
    { label: "Encaissés",   value: totalEncaisse.toLocaleString(), grad: "from-amber-500 to-orange-500",  icon: "💰", suffix: "F" },
    { label: "Dû Silga",    value: totalDuSilga.toLocaleString(),  grad: "from-blue-500 to-indigo-600",   icon: "🏦", suffix: "F" },
    { label: "En ligne",    value: enLigne,                        grad: "from-green-500 to-emerald-500", icon: "🟢" },
    { label: "Disponibles", value: disponibles,                    grad: "from-emerald-400 to-teal-500",  icon: "✅" },
    { label: "En course",   value: enCourse,                       grad: "from-orange-400 to-amber-500",  icon: "🚀" },
    { label: "Hors ligne",  value: horsLigne,                      grad: "from-gray-400 to-slate-500",    icon: "⚫" },
    { label: "Payés",       value: paiementsValides,               grad: "from-teal-500 to-cyan-500",     icon: "✔️" },
    { label: "Non payés",   value: paiementsNonValides,            grad: "from-rose-400 to-pink-500",     icon: "⏳" },
    { label: "Total",       value: totalLivreurs,                  grad: "from-violet-500 to-purple-600", icon: "👥" },
  ];

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
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const { user: currentUser } = useSilgappAuth();
  const isExterne = reseau === "externe";

  // Charger UNIQUEMENT les livreurs du réseau concerné
  const { data: livreurs = [], isLoading: loadingLivreurs } = useQuery({
    queryKey: ["livreurs-recap", reseau],
    queryFn: () => isExterne
      ? base44.entities.Livreur.filter({ type_livreur: "externe" }, "-created_date", 500)
      : base44.entities.Livreur.filter({ type_livreur: "interne" }, "-created_date", 500),
    initialData: [],
  });

  // Charger UNIQUEMENT les courses du réseau concerné
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-recap", reseau],
    queryFn: () => isExterne
      ? base44.entities.CourseExterne.list("-created_date", 500)
      : base44.entities.Course.list("-created_date", 500),
    initialData: [],
    refetchInterval: 30000,
  });

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

  const coursesLivrees = useMemo(
    () => courses.filter(c => c.statut === "livree" && inPeriod(c)),
    [courses, dateRange]
  );

  // Mutation validation paiement
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Livreur.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs-recap"] }),
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

  // Données du réseau en cours
  const livreursActifs = livreurs;
  const coursesActives = courses;

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

      {/* ── FILTRES PÉRIODE ──────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
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
      </div>

      {/* Carte résumé du réseau */}
      {isExterne ? (
        <ReseauCard
          title="SILGAPP Externe"
          icon={Globe}
          color="border-primary/20 bg-primary/5"
          livreurs={livreurs}
          coursesLivrees={coursesLivrees}
          isExterne={true}
        />
      ) : (
        <ReseauInternePremiumCard
          livreurs={livreurs}
          coursesLivrees={coursesLivrees}
        />
      )}

      {/* ── PERFORMANCES LIVREURS ────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${isExterne ? "bg-gradient-to-br from-primary to-red-600" : "bg-gradient-to-br from-blue-500 to-indigo-600"}`}>
            {isExterne ? <Globe className="w-4 h-4 text-white" /> : <Building2 className="w-4 h-4 text-white" />}
          </div>
          <div>
            <p className="font-bold text-foreground">Performances — {isExterne ? "SILGAPP Externe" : "SILGAPP Interne"}</p>
            <p className="text-xs text-muted-foreground">{livreursActifs.length} livreur{livreursActifs.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        {loadingLivreurs ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : livreursActifs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">👤</div>
            <p className="text-sm font-semibold">Aucun livreur {isExterne ? "externe" : "interne"} trouvé</p>
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