import React, { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Loader2, LogOut, MapPin } from "lucide-react";
import EtablissementForm from "@/components/partenaire/EtablissementForm";
import ProduitsManager from "@/components/partenaire/ProduitsManager";
import CommandesManager from "@/components/partenaire/CommandesManager";
import MessagesPage from "@/components/chat/MessagesPage";
import ComptabilitePartenaire from "@/components/partenaire/ComptabilitePartenaire";
import PartenaireHome from "@/components/partenaire/PartenaireHome";
import PartenaireBottomNav from "@/components/partenaire/PartenaireBottomNav";
import { clearPersistedToken } from "@/lib/authPersistence";
import { registerPushToken } from "@/lib/notifications";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

const ACTION_STATUSES = new Set([
  "commande_envoyee",
  "commande_recue",
  "paiement_verification",
  "paiement_valide",
  "en_preparation",
  "prete_recuperation",
  "livreur_assigne",
  "commande_recuperee",
  "en_livraison",
]);

export default function PartenaireDashboard() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [newOrderNotice, setNewOrderNotice] = useState(null);
  const previousActiveCountRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      // ── Enregistrer le token FCM pour les notifications push partenaire ──
      if (u?.email) {
        registerPushToken(null, { ...u, user_type: "partenaire" }).catch(() => {});
      }
    }).catch(() => {});
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

  const hasBoutique = !!maBoutique;
  const hasRestaurant = !!monRestaurant;
  const hasEtablissement = hasBoutique || hasRestaurant;
  const etablissementType = hasBoutique ? "boutique" : hasRestaurant ? "restaurant" : null;
  const etablissement = maBoutique || monRestaurant || null;

  // Query commandes avant les retours conditionnels (Rules of Hooks)
  const cmdEntityName = etablissementType === "restaurant" ? "CommandeRestaurant" : "CommandeBoutique";
  const cmdIdField = etablissementType === "restaurant" ? "restaurant_id" : "boutique_id";
  const { data: commandes = [] } = useQuery({
    queryKey: ["commandes", etablissementType, etablissement?.id],
    queryFn: () => base44.entities[cmdEntityName].filter({ [cmdIdField]: etablissement.id }, "-created_date", 100),
    enabled: !!etablissement?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!etablissement?.id) return;
    const unsub = base44.entities[cmdEntityName]?.subscribe?.((event) => {
      const row = event?.data;
      if (!row || row[cmdIdField] !== etablissement.id) return;
      queryClient.invalidateQueries({ queryKey: ["commandes", etablissementType, etablissement.id] });
    });
    return () => unsub?.();
  }, [cmdEntityName, cmdIdField, etablissement?.id, etablissementType, queryClient]);

  const seenKey = etablissement?.id ? `silgapp_partner_commandes_seen_${etablissementType}_${etablissement.id}` : "";
  const seenAt = seenKey ? Number(localStorage.getItem(seenKey) || 0) : 0;
  const pendingCount = commandes.filter(c => {
    if (!ACTION_STATUSES.has(c.statut)) return false;
    const changedAt = new Date(c.updated_date || c.created_date || 0).getTime();
    return changedAt > seenAt;
  }).length;
  const activeCount = commandes.filter(c => ACTION_STATUSES.has(c.statut)).length;

  useEffect(() => {
    if (!etablissement?.id) return;
    if (previousActiveCountRef.current === null) {
      previousActiveCountRef.current = activeCount;
      return;
    }
    if (activeCount > previousActiveCountRef.current) {
      playNotificationSound();
      navigator.vibrate?.([160, 80, 160]);
      setNewOrderNotice("Nouvelle commande recue");
      setTimeout(() => setNewOrderNotice(null), 5000);
    }
    previousActiveCountRef.current = activeCount;
  }, [activeCount, etablissement?.id]);

  const handleSetTab = (nextTab) => {
    setTab(nextTab);
    if (nextTab === "commandes" && seenKey) {
      localStorage.setItem(seenKey, String(Date.now()));
      queryClient.invalidateQueries({ queryKey: ["commandes", etablissementType, etablissement?.id] });
    }
  };

  const loading = loadingBoutique || loadingRestaurant;

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

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
          <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="w-full text-sm text-gray-400 underline">Se déconnecter</button>
          {tab === "boutique_form" && (
            <EtablissementForm type="boutique" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === 'admin'}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["ma-boutique"] }); }}
              onCancel={() => setTab("home")} />
          )}
          {tab === "restaurant_form" && (
            <EtablissementForm type="restaurant" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === 'admin'}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["mon-restaurant"] }); }}
              onCancel={() => setTab("home")} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ── En-tête premium ── */}
      <div className="bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-20 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden flex-shrink-0">
              {etablissement.logo_url
                ? <img src={etablissement.logo_url} alt="logo" className="w-full h-full object-cover" />
                : (etablissementType === "boutique" ? <Store className="w-6 h-6" /> : <UtensilsCrossed className="w-6 h-6" />)}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-tight truncate">{etablissement.nom}</h1>
              <div className="flex items-center gap-1.5 text-white/70 text-xs">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{etablissement.quartier || etablissement.ville || ""}</span>
                <span className={"w-1.5 h-1.5 rounded-full flex-shrink-0 " + (etablissement.ouvert ? "bg-green-400" : "bg-red-400")} />
                <span className="flex-shrink-0">{etablissement.ouvert ? "Ouvert" : "Fermé"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {newOrderNotice && (
          <div className="mb-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-black text-red-700">
            {newOrderNotice}
          </div>
        )}
        {tab === "home" && <PartenaireHome etablissement={etablissement} etablissementType={etablissementType} onNavigate={handleSetTab} />}
        {tab === "commandes" && <CommandesManager type={etablissementType} etablissementId={etablissement.id} etablissementNom={etablissement.nom} />}
        {tab === "produits" && <ProduitsManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "messages" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-[70vh]">
            <MessagesPage myType="partenaire" myId={etablissement.id} myName={etablissement.nom} />
          </div>
        )}
        {tab === "statistiques" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "revenus" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "infos" && (
          <EtablissementForm type={etablissementType} existing={etablissement} partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === 'admin'}
            onSaved={() => queryClient.invalidateQueries({ queryKey: etablissementType === "boutique" ? ["ma-boutique"] : ["mon-restaurant"] })} />
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <PartenaireBottomNav tab={tab} setTab={handleSetTab} badgeCount={pendingCount} />
    </div>
  );
}
