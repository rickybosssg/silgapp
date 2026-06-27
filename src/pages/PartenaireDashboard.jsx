import React, { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Loader2, LogOut, MapPin, Pill } from "lucide-react";
import EtablissementForm from "@/components/partenaire/EtablissementForm";
import ProduitsManager from "@/components/partenaire/ProduitsManager";
import CommandesManager from "@/components/partenaire/CommandesManager";
import PharmacieLivraisons from "@/components/partenaire/PharmacieLivraisons";
import MessagesPage from "@/components/chat/MessagesPage";
import ComptabilitePartenaire from "@/components/partenaire/ComptabilitePartenaire";
import PartenaireHome from "@/components/partenaire/PartenaireHome";
import PartenaireBottomNav from "@/components/partenaire/PartenaireBottomNav";
import NewMessageModal from "@/components/partenaire/NewMessageModal";
import OngletCodePromoPartenaire from "@/components/partenaire/OngletCodePromoPartenaire";
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

const PHARMACIE_ACTIVE_STATUSES = new Set([
  "nouvelle",
  "recherche_livreur",
  "livreur_en_route",
  "arrive_prise_en_charge",
  "colis_recupere",
  "en_livraison",
]);

const PARTNER_PARTICIPANT_TYPES = ["partner", "partenaire", "boutique", "restaurant", "pharmacie"];
function isCurrentPartnerParticipant(participant, etablissementId) {
  if (!participant || !PARTNER_PARTICIPANT_TYPES.includes(participant.type)) return false;
  const ids = [
    participant.id,
    participant.partner_id,
    participant.partenaire_id,
    participant.boutique_id,
    participant.restaurant_id,
    participant.pharmacie_id,
    participant.user_id,
  ].filter(Boolean).map(String);
  return ids.includes(String(etablissementId));
}

export default function PartenaireDashboard() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [newOrderNotice, setNewOrderNotice] = useState(null);
  const [newMsgModal, setNewMsgModal] = useState(null);
  const [seenConvIds, setSeenConvIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("partenaire_seen_convs") || "[]"); } catch { return []; }
  });
  const previousActiveCountRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
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
    refetchInterval: 15000,
  });

  const { data: monRestaurant, isLoading: loadingRestaurant } = useQuery({
    queryKey: ["mon-restaurant", user?.id],
    queryFn: async () => {
      const list = await base44.entities.Restaurant.filter({ partenaire_id: user.id });
      return list?.[0] || null;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const { data: maPharmacie, isLoading: loadingPharmacie } = useQuery({
    queryKey: ["ma-pharmacie", user?.id],
    queryFn: async () => {
      const list = await base44.entities.Pharmacie.filter({ partenaire_id: user.id });
      return list?.[0] || null;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const hasBoutique = !!maBoutique;
  const hasRestaurant = !!monRestaurant;
  const hasPharmacie = !!maPharmacie;
  const hasEtablissement = hasBoutique || hasRestaurant || hasPharmacie;
  const etablissementType = hasBoutique ? "boutique" : hasRestaurant ? "restaurant" : hasPharmacie ? "pharmacie" : null;
  const etablissement = maBoutique || monRestaurant || maPharmacie || null;

  const cmdEntityName = etablissementType === "restaurant" ? "CommandeRestaurant" : "CommandeBoutique";
  const cmdIdField = etablissementType === "restaurant" ? "restaurant_id" : "boutique_id";
  const { data: commandes = [] } = useQuery({
    queryKey: ["commandes", etablissementType, etablissement?.id],
    queryFn: () => base44.entities[cmdEntityName].filter({ [cmdIdField]: etablissement.id }, "-created_date", 100),
    enabled: !!etablissement?.id && !hasPharmacie,
    refetchInterval: 5000,
  });

  const { data: pharmaCourses = [] } = useQuery({
    queryKey: ["courses-pharmacie-dashboard", etablissement?.id],
    queryFn: async () => {
      const pharma = await base44.entities.Pharmacie.get(etablissement.id);
      const all = await base44.entities.CourseExterne.filter({ country_code: pharma.pays_code }, "-created_date", 50);
      return (all || []).filter(c => c.expediteur_nom === etablissement.nom);
    },
    enabled: hasPharmacie && !!etablissement?.id,
    refetchInterval: 5000,
  });

  const { data: allConversations = [] } = useQuery({
    queryKey: ["conversations-partenaire-all", etablissement?.id],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => isCurrentPartnerParticipant(p, etablissement.id));
        } catch {
          return false;
        }
      });
    },
    enabled: !!etablissement?.id,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!etablissement?.id || hasPharmacie) return;
    const unsub = base44.entities[cmdEntityName]?.subscribe?.((event) => {
      const row = event?.data;
      if (!row || row[cmdIdField] !== etablissement.id) return;
      queryClient.invalidateQueries({ queryKey: ["commandes", etablissementType, etablissement.id] });
    });
    return () => unsub?.();
  }, [cmdEntityName, cmdIdField, etablissement?.id, etablissementType, hasPharmacie, queryClient]);

  const seenKey = etablissement?.id ? `silgapp_partner_seen_${etablissementType}_${etablissement.id}` : "";
  const seenAt = seenKey ? Number(localStorage.getItem(seenKey) || 0) : 0;
  const pendingCount = hasPharmacie
    ? pharmaCourses.filter(c => PHARMACIE_ACTIVE_STATUSES.has(c.statut) && new Date(c.updated_date || c.created_date || 0).getTime() > seenAt).length
    : commandes.filter(c => ACTION_STATUSES.has(c.statut) && new Date(c.updated_date || c.created_date || 0).getTime() > seenAt).length;
  const activeCount = hasPharmacie
    ? pharmaCourses.filter(c => PHARMACIE_ACTIVE_STATUSES.has(c.statut)).length
    : commandes.filter(c => ACTION_STATUSES.has(c.statut)).length;

  const unreadConversations = allConversations.filter(c =>
    c.last_message &&
    c.last_sender_name !== etablissement?.nom &&
    !seenConvIds.includes(c.id)
  );
  const unreadCount = unreadConversations.length;

  useEffect(() => {
    if (!etablissement?.id || allConversations.length === 0) return;
    const newOnes = allConversations.filter(c => c.last_sender_name !== etablissement.nom && !seenConvIds.includes(c.id));
    if (newOnes.length > 0 && tab !== "messages") {
      const newest = newOnes[0];
      let clientName = "Nouveau client";
      try {
        const parts = JSON.parse(newest.participants || "[]");
        const client = parts.find(p => p.type === "client");
        if (client?.name) clientName = client.name;
      } catch {}
      setNewMsgModal({ convId: newest.id, clientName });
    }
  }, [allConversations, etablissement?.id, etablissement?.nom, seenConvIds, tab]);

  useEffect(() => {
    if (tab === "messages" && allConversations.length > 0) {
      const currentIds = allConversations.map(c => c.id);
      const newSeen = [...new Set([...seenConvIds, ...currentIds])];
      setSeenConvIds(newSeen);
      localStorage.setItem("partenaire_seen_convs", JSON.stringify(newSeen));
    }
  }, [tab, allConversations, seenConvIds]);

  useEffect(() => {
    if (!etablissement?.id) return;
    if (previousActiveCountRef.current === null) {
      previousActiveCountRef.current = activeCount;
      return;
    }
    if (activeCount > previousActiveCountRef.current) {
      playNotificationSound();
      navigator.vibrate?.([160, 80, 160]);
      setNewOrderNotice(hasPharmacie ? "Nouvelle livraison pharmacie" : "Nouvelle commande recue");
      setTimeout(() => setNewOrderNotice(null), 5000);
    }
    previousActiveCountRef.current = activeCount;
  }, [activeCount, etablissement?.id, hasPharmacie]);

  const handleSetTab = (nextTab) => {
    setTab(nextTab);
    const seenTabs = hasPharmacie ? ["livraisons", "messages"] : ["commandes"];
    if (seenTabs.includes(nextTab) && seenKey) {
      localStorage.setItem(seenKey, String(Date.now()));
      queryClient.invalidateQueries({ queryKey: ["commandes", etablissementType, etablissement?.id] });
      queryClient.invalidateQueries({ queryKey: ["courses-pharmacie-dashboard", etablissement?.id] });
    }
  };

  const loading = loadingBoutique || loadingRestaurant || loadingPharmacie;

  const handleLogout = () => {
    if (!window.confirm("Voulez-vous vraiment vous déconnecter ?")) return;
    clearPersistedToken();
    base44.auth.logout();
  };

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
            <p className="text-gray-500">Que souhaitez-vous creer ?</p>
          </div>

          <CreateChoice icon={Store} title="Une Boutique" text="Vendre des produits" onClick={() => setTab("boutique_form")} color="blue" />
          <CreateChoice icon={UtensilsCrossed} title="Un Restaurant" text="Proposer un menu et des plats" onClick={() => setTab("restaurant_form")} color="orange" />
          <CreateChoice icon={Pill} title="Une Pharmacie" text="Discuter avec clients et livrer" onClick={() => setTab("pharmacie_form")} color="blueDark" />

          <button onClick={handleLogout} className="w-full text-sm text-gray-400 underline">
            Se deconnecter
          </button>

          {tab === "boutique_form" && (
            <EtablissementForm type="boutique" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === "admin"}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["ma-boutique"] }); }}
              onCancel={() => setTab("home")} />
          )}
          {tab === "restaurant_form" && (
            <EtablissementForm type="restaurant" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === "admin"}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["mon-restaurant"] }); }}
              onCancel={() => setTab("home")} />
          )}
          {tab === "pharmacie_form" && (
            <EtablissementForm type="pharmacie" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === "admin"}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["ma-pharmacie"] }); }}
              onCancel={() => setTab("home")} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-20 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden flex-shrink-0">
              {etablissement.logo_url
                ? <img src={etablissement.logo_url} alt="logo" className="w-full h-full object-cover" />
                : etablissementType === "boutique" ? <Store className="w-6 h-6" /> : etablissementType === "restaurant" ? <UtensilsCrossed className="w-6 h-6" /> : <Pill className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-tight truncate">{etablissement.nom}</h1>
              <div className="flex items-center gap-1.5 text-white/70 text-xs">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{etablissement.quartier || etablissement.ville || ""}</span>
                <span className={"w-1.5 h-1.5 rounded-full flex-shrink-0 " + (etablissement.ouvert ? "bg-green-400" : "bg-red-400")} />
                <span className="flex-shrink-0">{etablissement.ouvert ? "Ouvert" : "Ferme"}</span>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {newOrderNotice && (
          <div className="mb-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-black text-red-700">
            {newOrderNotice}
          </div>
        )}
        {tab === "home" && <PartenaireHome etablissement={etablissement} etablissementType={etablissementType} onNavigate={handleSetTab} messageBadge={unreadCount} />}
        {tab === "commandes" && !hasPharmacie && <CommandesManager type={etablissementType} etablissementId={etablissement.id} etablissementNom={etablissement.nom} />}
        {tab === "produits" && !hasPharmacie && <ProduitsManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "livraisons" && hasPharmacie && <PharmacieLivraisons pharmacieId={etablissement.id} pharmacieNom={etablissement.nom} onNavigate={handleSetTab} />}
        {tab === "messages" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-[70vh]">
            <MessagesPage myType="partenaire" myId={etablissement.id} myName={etablissement.nom} />
          </div>
        )}
        {tab === "promo" && <OngletCodePromoPartenaire partenaireId={user.id} />}
        {tab === "statistiques" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "revenus" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "infos" && (
          <EtablissementForm type={etablissementType} existing={etablissement} partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === "admin"}
            onSaved={() => queryClient.invalidateQueries({ queryKey: hasPharmacie ? ["ma-pharmacie"] : etablissementType === "boutique" ? ["ma-boutique"] : ["mon-restaurant"] })} />
        )}
      </div>

      <PartenaireBottomNav tab={tab} setTab={handleSetTab} badgeCount={pendingCount} messageBadge={unreadCount} etablissementType={etablissementType} />

      <NewMessageModal
        show={!!newMsgModal}
        clientName={newMsgModal?.clientName}
        onOpen={() => { handleSetTab("messages"); setNewMsgModal(null); }}
        onClose={() => setNewMsgModal(null)}
      />
    </div>
  );
}

function CreateChoice({ icon: Icon, title, text, onClick, color }) {
  const styles = {
    blue: {
      border: "border-blue-200",
      gradient: "from-blue-50 to-indigo-50",
      hover: "hover:border-blue-500",
      iconText: "text-blue-600",
      iconBg: "bg-blue-100",
    },
    orange: {
      border: "border-orange-200",
      gradient: "from-orange-50 to-amber-50",
      hover: "hover:border-orange-500",
      iconText: "text-orange-600",
      iconBg: "bg-orange-100",
    },
    blueDark: {
      border: "border-blue-900/25",
      gradient: "from-blue-50 to-slate-100",
      hover: "hover:border-blue-900",
      iconText: "text-blue-900",
      iconBg: "bg-blue-100",
    },
  };
  const s = styles[color] || styles.blue;
  return (
    <button onClick={onClick} className={`w-full p-6 rounded-3xl border-2 ${s.border} bg-gradient-to-br ${s.gradient} ${s.hover} hover:shadow-lg transition-all text-left`}>
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl ${s.iconBg} flex items-center justify-center`}>
          <Icon className={`w-7 h-7 ${s.iconText}`} />
        </div>
        <div>
          <p className="font-black text-lg text-gray-900">{title}</p>
          <p className="text-sm text-gray-500">{text}</p>
        </div>
      </div>
    </button>
  );
}
