import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, ShoppingBag, MessageCircle, BarChart3, Store, Wallet, Loader2, CheckCircle, Clock, Truck, TrendingUp } from "lucide-react";

export default function PartenaireHome({ etablissement, etablissementType, onNavigate, messageBadge = 0 }) {
  const isRestaurant = etablissementType === "restaurant";
  const isPharmacie = etablissementType === "pharmacie";
  const entityName = isRestaurant ? "CommandeRestaurant" : "CommandeBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
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
  const annuleesToday = isPharmacie ? 0 : commandesToday.filter((commande) => commande.statut === "annulee").length;
  const pendingCount = isPharmacie
    ? pharmaActiveCourses.length
    : commandes.filter((commande) => !["livree", "annulee"].includes(commande.statut)).length;

  const handleToggleOuvert = async () => {
    setToggling(true);
    try {
      const eName = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
      await base44.entities[eName].update(etablissement.id, { ouvert: !etablissement.ouvert });
      queryClient.invalidateQueries({ queryKey: isPharmacie ? ["ma-pharmacie"] : isRestaurant ? ["mon-restaurant"] : ["ma-boutique"] });
    } catch {
      // La UI sera rafraichie au prochain cycle.
    } finally {
      setToggling(false);
    }
  };

  const cards = isPharmacie ? [
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600", badge: messageBadge },
    { id: "livraisons", icon: Truck, label: "Livraisons", subtitle: "Creer une livraison", bg: "bg-blue-50", iconColor: "text-blue-700", badge: pendingCount },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Revenus et suivi", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ] : [
    { id: "commandes", icon: Package, label: "Commandes", subtitle: "Gerer les commandes", bg: "bg-blue-50", iconColor: "text-blue-600", badge: pendingCount },
    { id: "produits", icon: ShoppingBag, label: isRestaurant ? "Plats" : "Produits", subtitle: "Gerer le catalogue", bg: "bg-purple-50", iconColor: "text-purple-600" },
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600", badge: messageBadge },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Ventes et revenus", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white shadow-xl shadow-purple-200"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/5 rounded-full" />

        <div className="relative p-5 space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleToggleOuvert}
              disabled={toggling}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold hover:bg-white/30 transition-colors"
            >
              {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <span className={"w-2.5 h-2.5 rounded-full " + (etablissement.ouvert ? "bg-green-400" : "bg-red-400")} />
              )}
              {etablissement.ouvert ? "Ouvert" : "Ferme"}
            </button>
            <span className="text-xs text-white/70 capitalize">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <HeroStat value={isPharmacie ? pharmaConversations.length : commandesToday.length} label={isPharmacie ? "Conversations actives" : "Commandes aujourd'hui"} />
            <HeroStat value={isPharmacie ? pharmaActiveCourses.length : revenusToday.toLocaleString()} label={isPharmacie ? "Livraisons en cours" : "FCFA de ventes"} />
            <HeroStat value={enPreparation} label={isPharmacie ? "En recherche" : "En preparation"} />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-2">
        <QuickStat icon={CheckCircle} value={livreesToday} label="Livrees" color="text-green-600" bg="bg-green-50" />
        <QuickStat icon={Clock} value={enPreparation} label={isPharmacie ? "Recherche" : "Preparation"} color="text-orange-600" bg="bg-orange-50" />
        <QuickStat icon={Truck} value={enLivraison} label="En livraison" color="text-indigo-600" bg="bg-indigo-50" />
        <QuickStat icon={MessageCircle} value={isPharmacie ? pharmaConversations.length : annuleesToday} label={isPharmacie ? "Messages" : "Annulees"} color={isPharmacie ? "text-purple-600" : "text-red-600"} bg={isPharmacie ? "bg-purple-50" : "bg-red-50"} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 px-1 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-purple-500" /> Gestion
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, index) => (
            <motion.button
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onNavigate(card.id)}
              className="relative bg-white rounded-2xl p-4 shadow-sm border border-gray-50 hover:shadow-md hover:border-gray-100 transition-all text-left group active:scale-95"
            >
              {card.badge > 0 && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                  {card.badge}
                </span>
              )}
              <div className={"w-11 h-11 rounded-xl " + card.bg + " flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"}>
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
