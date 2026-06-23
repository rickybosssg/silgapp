import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, ShoppingBag, MessageCircle, BarChart3, Store, Wallet, Loader2, CheckCircle, Clock, Truck, X, TrendingUp } from "lucide-react";

export default function PartenaireHome({ etablissement, etablissementType, onNavigate }) {
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
  });

  // Stats du jour
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const commandesToday = commandes.filter(c => new Date(c.created_date) >= today);
  const revenusToday = commandesToday.filter(c => c.statut === "livree").reduce((sum, c) => sum + (c.total || 0), 0);
  const enPreparation = commandes.filter(c => c.statut === "en_preparation").length;
  const enLivraison = commandes.filter(c => ["livreur_assigne", "en_livraison"].includes(c.statut)).length;
  const livreesToday = commandesToday.filter(c => c.statut === "livree").length;
  const annuleesToday = commandesToday.filter(c => c.statut === "annulee").length;
  const pendingCount = commandes.filter(c => !["livree", "annulee"].includes(c.statut)).length;

  const handleToggleOuvert = async () => {
    setToggling(true);
    try {
      const eName = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
      await base44.entities[eName].update(etablissement.id, { ouvert: !etablissement.ouvert });
      queryClient.invalidateQueries({ queryKey: isPharmacie ? ["ma-pharmacie"] : isRestaurant ? ["mon-restaurant"] : ["ma-boutique"] });
    } catch (err) {}
    setToggling(false);
  };

  const cards = isPharmacie ? [
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600", badge: pendingCount },
    { id: "livraisons", icon: Truck, label: "Livraisons", subtitle: "Créer une livraison", bg: "bg-gray-100", iconColor: "text-gray-700" },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Revenus & suivi", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ] : [
    { id: "commandes", icon: Package, label: "Commandes", subtitle: "Gérer les commandes", bg: "bg-blue-50", iconColor: "text-blue-600", badge: pendingCount },
    { id: "produits", icon: ShoppingBag, label: isRestaurant ? "Plats" : "Produits", subtitle: "Gérer le catalogue", bg: "bg-purple-50", iconColor: "text-purple-600" },
    { id: "messages", icon: MessageCircle, label: "Messages", subtitle: "Discuter avec clients", bg: "bg-green-50", iconColor: "text-green-600" },
    { id: "statistiques", icon: BarChart3, label: "Statistiques", subtitle: "Ventes & revenus", bg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "infos", icon: Store, label: "Informations", subtitle: "Modifier la fiche", bg: "bg-pink-50", iconColor: "text-pink-600" },
    { id: "revenus", icon: Wallet, label: "Revenus", subtitle: "Suivi des paiements", bg: "bg-teal-50", iconColor: "text-teal-600" },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Hero Card — style Uber Eats / Glovo Merchant ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white shadow-xl shadow-purple-200"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/5 rounded-full" />

        <div className="relative p-5 space-y-4">
          {/* Status toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleToggleOuvert}
              disabled={toggling}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold hover:bg-white/30 transition-colors"
            >
              {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <span className={"w-2.5 h-2.5 rounded-full " + (etablissement.ouvert ? "bg-green-400" : "bg-red-400")} />
              )}
              {etablissement.ouvert ? "Ouvert" : "Fermé"}
            </button>
            <span className="text-xs text-white/70 capitalize">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
            </span>
          </div>

          {/* Main stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center">
              <p className="text-2xl font-black leading-none">{commandesToday.length}</p>
              <p className="text-[10px] text-white/70 font-medium mt-1">Commandes<br/>aujourd'hui</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center">
              <p className="text-2xl font-black leading-none">{revenusToday.toLocaleString()}</p>
              <p className="text-[10px] text-white/70 font-medium mt-1">FCFA<br/>de ventes</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center">
              <p className="text-2xl font-black leading-none">{enPreparation}</p>
              <p className="text-[10px] text-white/70 font-medium mt-1">En<br/>préparation</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Quick stats row ── */}
      <div className="grid grid-cols-4 gap-2">
        <QuickStat icon={CheckCircle} value={livreesToday} label="Livrées" color="text-green-600" bg="bg-green-50" />
        <QuickStat icon={Clock} value={enPreparation} label="Préparation" color="text-orange-600" bg="bg-orange-50" />
        <QuickStat icon={Truck} value={enLivraison} label="En livraison" color="text-indigo-600" bg="bg-indigo-50" />
        <QuickStat icon={X} value={annuleesToday} label="Annulées" color="text-red-600" bg="bg-red-50" />
      </div>

      {/* ── Navigation cards grid ── */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 px-1 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-purple-500" /> Gestion
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, i) => (
            <motion.button
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
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