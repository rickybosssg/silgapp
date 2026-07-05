import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Package,
  ShoppingBag,
  MessageCircle,
  BarChart3,
  Store,
  Wallet,
  Loader2,
  CheckCircle,
  Clock,
  Truck,
  TrendingUp,
  Eye,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function PartenaireHome({ etablissement, etablissementType, onNavigate, messageBadge = 0 }) {
  const isRestaurant = etablissementType === "restaurant";
  const isPharmacie = etablissementType === "pharmacie";
  const entityName = isRestaurant ? "CommandeRestaurant" : "CommandeBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const theme = isPharmacie
    ? {
        hero: "from-emerald-700 via-green-600 to-teal-600",
        shadow: "shadow-emerald-100",
        accent: "text-emerald-600",
        softBorder: "border-emerald-100",
        label: "Espace pharmacie",
      }
    : isRestaurant
      ? {
          hero: "from-orange-600 via-amber-500 to-rose-500",
          shadow: "shadow-orange-100",
          accent: "text-orange-600",
          softBorder: "border-orange-100",
          label: "Espace restaurant",
        }
      : {
          hero: "from-sky-700 via-blue-600 to-indigo-600",
          shadow: "shadow-sky-100",
          accent: "text-blue-600",
          softBorder: "border-blue-100",
          label: "Espace boutique",
        };
  const queryClient = useQueryClient();
  const [toggling, setToggling] = useState(false);

  const { data: commandes = [], isLoading } = useQuery({
    queryKey: ["commandes", etablissementType, etablissement.id],
    queryFn: () => base44.entities[entityName].filter({ [idField]: etablissement.id }, "-created_date", 100),
    enabled: !isPharmacie && !!etablissement?.id,
    refetchInterval: 10000,
  });

  const { data: pharmaConversations = [] } = useQuery({
    queryKey: ["conversations-pharmacie-home", etablissement?.id],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter((conv) => {
        try {
          const parts = JSON.parse(conv.participants || "[]");
          return parts.some((p) => p.type === "partenaire" && p.id === etablissement.id);
        } catch {
          return false;
        }
      });
    },
    enabled: isPharmacie && !!etablissement?.id,
    refetchInterval: 5000,
  });

  const { data: pharmaCourses = [] } = useQuery({
    queryKey: ["courses-pharmacie-home", etablissement?.id],
    queryFn: async () => {
      const pharmacie = await base44.entities.Pharmacie.get(etablissement.id);
      const all = await base44.entities.CourseExterne.filter({ country_code: pharmacie.pays_code }, "-created_date", 80);
      return (all || []).filter((course) => course.pharmacie_id === etablissement.id || course.expediteur_nom === etablissement.nom);
    },
    enabled: isPharmacie && !!etablissement?.id,
    refetchInterval: 5000,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pharmaCoursesToday = pharmaCourses.filter((course) => new Date(course.created_date) >= today);
  const pharmaActiveCourses = pharmaCourses.filter((course) => !["livree", "annulee"].includes(course.statut));
  const pharmaLivreesToday = pharmaCoursesToday.filter((course) => course.statut === "livree").length;
  const pharmaEnLivraison = pharmaCourses.filter((course) => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(course.statut)).length;
  const pharmaEnRecherche = pharmaCourses.filter((course) => ["nouvelle", "recherche_livreur"].includes(course.statut)).length;

  const commandesToday = isPharmacie ? pharmaCoursesToday : commandes.filter((commande) => new Date(commande.created_date) >= today);
  const revenusToday = isPharmacie ? 0 : commandesToday.filter((commande) => commande.statut === "livree").reduce((sum, commande) => sum + (commande.total || 0), 0);
  const enPreparation = isPharmacie ? pharmaEnRecherche : commandes.filter((commande) => commande.statut === "en_preparation").length;
  const enLivraison = isPharmacie ? pharmaEnLivraison : commandes.filter((commande) => ["livreur_assigne", "en_livraison"].includes(commande.statut)).length;
  const livreesToday = isPharmacie ? pharmaLivreesToday : commandesToday.filter((commande) => commande.statut === "livree").length;
  const pendingCount = isPharmacie
    ? pharmaActiveCourses.length
    : commandes.filter((commande) => !["livree", "annulee"].includes(commande.statut)).length;
  const visitesTotal = Number(etablissement?.nb_visites) || 0;
  const montantDuSilga = Number(etablissement?.montant_du_silga) || 0;

  const handleToggleOuvert = async () => {
    setToggling(true);
    try {
      const eName = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
      await base44.entities[eName].update(etablissement.id, { ouvert: !etablissement.ouvert });
      queryClient.invalidateQueries({ queryKey: isPharmacie ? ["ma-pharmacie"] : isRestaurant ? ["mon-restaurant"] : ["ma-boutique"] });
    } finally {
      setToggling(false);
    }
  };

  const cards = isPharmacie ? [
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600", badge: messageBadge },
    { id: "livraisons", icon: Truck, label: "Livraisons", subtitle: "Créer une livraison", bg: "bg-blue-50", iconColor: "text-blue-700", badge: pendingCount },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Revenus et suivi", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ] : [
    { id: "commandes", icon: Package, label: "Commandes", subtitle: "Gérer les commandes", bg: isRestaurant ? "bg-orange-50" : "bg-blue-50", iconColor: isRestaurant ? "text-orange-700" : "text-blue-600", badge: pendingCount },
    { id: "produits", icon: ShoppingBag, label: isRestaurant ? "Plats" : "Produits", subtitle: "Gérer le catalogue", bg: isRestaurant ? "bg-amber-50" : "bg-blue-50", iconColor: isRestaurant ? "text-amber-700" : "text-blue-700" },
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600", badge: messageBadge },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Ventes, revenus et visites", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className={`w-6 h-6 animate-spin ${theme.accent}`} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${theme.hero} text-white shadow-2xl ${theme.shadow} ring-1 ring-white/10`}
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/5 rounded-full" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_45%)] pointer-events-none" />

        <div className="relative p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">{theme.label}</p>
              <p className="text-lg font-black leading-tight mt-1">{etablissement.nom || "Etablissement"}</p>
            </div>
            <button
              onClick={handleToggleOuvert}
              disabled={toggling}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2.5 text-sm font-black hover:bg-white/30 transition-colors border border-white/15"
            >
              {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <span className={"w-2.5 h-2.5 rounded-full " + (etablissement.ouvert ? "bg-green-300" : "bg-red-300")} />
              )}
              {etablissement.ouvert ? "Ouvert" : "Fermé"}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
            <span className="text-xs font-semibold text-white/75 capitalize">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <span className="text-xs font-bold text-white/85">
              {etablissement.ville || etablissement.quartier || "SILGAPP"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <HeroStat value={isPharmacie ? pharmaConversations.length : commandesToday.length} label={isPharmacie ? "Conversations actives" : "Commandes aujourd'hui"} />
            <HeroStat value={isPharmacie ? pharmaActiveCourses.length : revenusToday.toLocaleString()} label={isPharmacie ? "Livraisons en cours" : "FCFA de ventes"} />
            <HeroStat value={enPreparation} label={isPharmacie ? "En recherche" : "En préparation"} />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-2.5">
        <QuickStat icon={CheckCircle} value={livreesToday} label="Livrées" color="text-green-600" bg="bg-green-50" />
        <QuickStat icon={Clock} value={enPreparation} label={isPharmacie ? "Recherche" : "Préparation"} color="text-orange-600" bg="bg-orange-50" />
        <QuickStat icon={Truck} value={enLivraison} label="En livraison" color="text-indigo-600" bg="bg-indigo-50" />
        <QuickStat icon={isPharmacie ? MessageCircle : Eye} value={isPharmacie ? pharmaConversations.length : visitesTotal} label={isPharmacie ? "Messages" : "Visites"} color={isPharmacie ? "text-emerald-600" : "text-blue-600"} bg={isPharmacie ? "bg-emerald-50" : "bg-blue-50"} />
      </div>

      {!isPharmacie && (
        <Link to="/payer-silgapp">
          <div className={`rounded-2xl p-4 flex items-center justify-between shadow-lg active:scale-[0.98] transition ${
            montantDuSilga > 0
              ? "bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-orange-200"
              : "bg-white text-slate-900 border border-blue-100 shadow-blue-100/50"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                montantDuSilga > 0 ? "bg-white/20" : "bg-blue-50"
              }`}>
                <Wallet className={`w-5 h-5 ${montantDuSilga > 0 ? "" : "text-blue-700"}`} />
              </div>
              <div>
                <p className="font-black text-sm">Payer SILGAPP</p>
                <p className={`text-xs ${montantDuSilga > 0 ? "text-white/80" : "text-slate-500"}`}>
                  {montantDuSilga > 0 ? `Commission due : ${montantDuSilga.toLocaleString()} FCFA` : "Aucun du pour le moment"}
                </p>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 ${montantDuSilga > 0 ? "text-white/70" : "text-slate-300"}`} />
          </div>
        </Link>
      )}

      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 px-1 flex items-center gap-1.5">
          <TrendingUp className={`w-4 h-4 ${theme.accent}`} /> Gestion
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, index) => (
            <motion.button
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onNavigate(card.id)}
              className={`relative bg-white rounded-3xl p-4 shadow-sm shadow-blue-100/40 border ${theme.softBorder} hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group active:scale-95`}
            >
              {card.badge > 0 && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                  {card.badge}
                </span>
              )}
              <div className={"w-12 h-12 rounded-2xl " + card.bg + " flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"}>
                <card.icon className={"w-5 h-5 " + card.iconColor} />
              </div>
              <p className="font-bold text-gray-900 text-sm">{card.label}</p>
              <p className="text-[11px] text-gray-400">{card.subtitle}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label }) {
  return (
    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center">
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="text-[10px] text-white/70 font-medium mt-1 leading-tight">{label}</p>
    </div>
  );
}

function QuickStat({ icon: Icon, value, label, color, bg }) {
  return (
    <div className="bg-white rounded-2xl p-2.5 text-center border border-gray-50 shadow-sm">
      <div className={"w-8 h-8 rounded-lg " + bg + " flex items-center justify-center mx-auto mb-1"}>
        <Icon className={"w-4 h-4 " + color} />
      </div>
      <p className="text-lg font-black text-gray-900 leading-none">{value}</p>
      <p className="text-[9px] text-gray-400 font-medium mt-0.5">{label}</p>
    </div>
  );
}
