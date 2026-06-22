import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Loader2, ClipboardList, Package, ShoppingBag, MessageCircle } from "lucide-react";
import EtablissementForm from "@/components/partenaire/EtablissementForm";
import ProduitsManager from "@/components/partenaire/ProduitsManager";
import CommandesManager from "@/components/partenaire/CommandesManager";
import MessagesPage from "@/components/chat/MessagesPage";

export default function PartenaireDashboard() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("infos");
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => {});
  }, []);

  const { data: maBoutique, isLoading: loadingBoutique } = useQuery({
    queryKey: ["ma-boutique", user?.id],
    queryFn: async () => {
      const list = await base44.entities.Boutique.filter({ partenaire_id: user.id });
      return list?.[0] || null;
    },
    enabled: !!user?.id,
  });

  const { data: monRestaurant, isLoading: loadingRestaurant } = useQuery({
    queryKey: ["mon-restaurant", user?.id],
    queryFn: async () => {
      const list = await base44.entities.Restaurant.filter({ partenaire_id: user.id });
      return list?.[0] || null;
    },
    enabled: !!user?.id,
  });

  const loading = loadingBoutique || loadingRestaurant;

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const hasBoutique = !!maBoutique;
  const hasRestaurant = !!monRestaurant;
  const hasEtablissement = hasBoutique || hasRestaurant;
  const etablissementType = hasBoutique ? "boutique" : hasRestaurant ? "restaurant" : null;
  const etablissement = maBoutique || monRestaurant || null;

  if (!hasEtablissement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto">
              <Store className="w-10 h-10 text-purple-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Espace Partenaire</h1>
            <p className="text-gray-500">Que souhaitez-vous créer ?</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => setTab("boutique_form")} className="w-full p-6 rounded-3xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 hover:border-blue-500 hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center"><Store className="w-7 h-7 text-blue-600" /></div>
                <div><p className="font-black text-lg text-gray-900">Une Boutique</p><p className="text-sm text-gray-500">Vendre des produits</p></div>
              </div>
            </button>
            <button onClick={() => setTab("restaurant_form")} className="w-full p-6 rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 hover:border-orange-500 hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center"><UtensilsCrossed className="w-7 h-7 text-orange-600" /></div>
                <div><p className="font-black text-lg text-gray-900">Un Restaurant</p><p className="text-sm text-gray-500">Proposer un menu et des plats</p></div>
              </div>
            </button>
          </div>
          <button onClick={() => base44.auth.logout()} className="w-full text-sm text-gray-400 underline">Se déconnecter</button>
          {tab === "boutique_form" && (
            <EtablissementForm type="boutique" partenaireId={user.id} userEmail={user.email}
              onSaved={() => { setTab("infos"); queryClient.invalidateQueries({ queryKey: ["ma-boutique"] }); }}
              onCancel={() => setTab("infos")} />
          )}
          {tab === "restaurant_form" && (
            <EtablissementForm type="restaurant" partenaireId={user.id} userEmail={user.email}
              onSaved={() => { setTab("infos"); queryClient.invalidateQueries({ queryKey: ["mon-restaurant"] }); }}
              onCancel={() => setTab("infos")} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/70 text-xs">Espace Partenaire</p>
            <h1 className="text-lg font-black">{etablissement.nom}</h1>
            <p className="text-white/70 text-xs flex items-center gap-1">
              {etablissementType === "boutique" ? <Store className="w-3 h-3" /> : <UtensilsCrossed className="w-3 h-3" />}
              <span>{etablissementType === "boutique" ? "Boutique" : "Restaurant"} - {etablissement.quartier || etablissement.ville || ""}</span>
            </p>
          </div>
          <button onClick={() => base44.auth.logout()} className="text-white/70 text-xs underline">Déconnexion</button>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex bg-white rounded-2xl p-1 gap-1 shadow-sm border border-gray-100">
          <button onClick={() => setTab("infos")} className={"flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 " + (tab === "infos" ? "bg-purple-600 text-white shadow" : "text-gray-500")}>
            <ClipboardList className="w-3.5 h-3.5" /> Infos
          </button>
          <button onClick={() => setTab("produits")} className={"flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 " + (tab === "produits" ? "bg-purple-600 text-white shadow" : "text-gray-500")}>
            <Package className="w-3.5 h-3.5" /> {etablissementType === "boutique" ? "Produits" : "Plats"}
          </button>
          <button onClick={() => setTab("commandes")} className={"flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 " + (tab === "commandes" ? "bg-purple-600 text-white shadow" : "text-gray-500")}>
            <ShoppingBag className="w-3.5 h-3.5" /> Commandes
          </button>
          <button onClick={() => setTab("messages")} className={"flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 " + (tab === "messages" ? "bg-purple-600 text-white shadow" : "text-gray-500")}>
            <MessageCircle className="w-3.5 h-3.5" /> Messages
          </button>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        {tab === "infos" && (
          <EtablissementForm type={etablissementType} existing={etablissement} partenaireId={user.id} userEmail={user.email}
            onSaved={() => queryClient.invalidateQueries({ queryKey: etablissementType === "boutique" ? ["ma-boutique"] : ["mon-restaurant"] })} />
        )}
        {tab === "produits" && <ProduitsManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "commandes" && <CommandesManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "messages" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-[70vh]">
            <MessagesPage
              myType="partenaire"
              myId={etablissement.id}
              myName={etablissement.nom}
            />
          </div>
        )}
      </div>
    </div>
  );
}
