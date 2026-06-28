import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Loader2, LogOut, MapPin, Pill, Clock, XCircle } from "lucide-react";
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

export default function PartenaireDashboard() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
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

  // Query commandes avant les retours conditionnels (Rules of Hooks)
  const cmdEntityName = etablissementType === "restaurant" ? "CommandeRestaurant" : "CommandeBoutique";
  const cmdIdField = etablissementType === "restaurant" ? "restaurant_id" : "boutique_id";
  const { data: commandes = [] } = useQuery({
    queryKey: ["commandes", etablissementType, etablissement?.id],
    queryFn: () => base44.entities[cmdEntityName].filter({ [cmdIdField]: etablissement.id }, "-created_date", 100),
    enabled: !!etablissement?.id && !hasPharmacie,
    refetchInterval: 10000,
  });

  // ── Pour les pharmacies : conversations & courses en temps réel ──
  const { data: pharmaConversations = [] } = useQuery({
    queryKey: ["conversations-pharmacie-dashboard", etablissement?.id],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => p.type === "partenaire" && p.id === etablissement.id);
        } catch { return false; }
      });
    },
    enabled: hasPharmacie && !!etablissement?.id,
    refetchInterval: 10000,
  });

  const { data: pharmaCourses = [] } = useQuery({
    queryKey: ["courses-pharmacie-dashboard", etablissement?.id],
    queryFn: async () => {
      const pharma = await base44.entities.Pharmacie.get(etablissement.id);
      const all = await base44.entities.CourseExterne.filter({ country_code: pharma.pays_code }, "-created_date", 50);
      return (all || []).filter(c => c.expediteur_nom === etablissement.nom);
    },
    enabled: hasPharmacie && !!etablissement?.id,
    refetchInterval: 10000,
  });

  // ── Conversations pour TOUS les types d'établissement (badge messages non lus) ──
  const { data: allConversations = [] } = useQuery({
    queryKey: ["conversations-partenaire-all", etablissement?.id],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => p.type === "partenaire" && p.id === etablissement.id);
        } catch { return false; }
      });
    },
    enabled: !!etablissement?.id,
    refetchInterval: 8000,
  });

  // ── Tracker les messages non lus (dernier message pas du partenaire) ──
  const [seenConvIds, setSeenConvIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("partenaire_seen_convs") || "[]"); } catch { return []; }
  });
  const [newMsgModal, setNewMsgModal] = useState(null);

  // Conversations non lues = dernier message pas envoyé par le partenaire
  const unreadConversations = allConversations.filter(c => {
    if (!c.last_message) return false;
    return c.last_sender_name !== etablissement?.nom;
  });
  const unreadCount = unreadConversations.length;

  // ── Détecter une nouvelle discussion et afficher le modal ──
  useEffect(() => {
    if (!etablissement?.id || allConversations.length === 0) return;
    const currentIds = allConversations.map(c => c.id);
    const newOnes = allConversations.filter(c => {
      // Non lu ET pas encore vu
      const isUnread = c.last_sender_name !== etablissement.nom;
      const notSeen = !seenConvIds.includes(c.id);
      return isUnread && notSeen;
    });
    if (newOnes.length > 0 && tab !== "messages") {
      // Trouver le nom du client
      const newest = newOnes[0];
      let clientName = "Nouveau client";
      try {
        const parts = JSON.parse(newest.participants || "[]");
        const client = parts.find(p => p.type === "client");
        if (client?.name) clientName = client.name;
      } catch {}
      setNewMsgModal({ convId: newest.id, clientName });
    }
    // Marquer comme vues
    const newSeen = [...new Set([...seenConvIds, ...currentIds])];
    if (newSeen.length !== seenConvIds.length) {
      setSeenConvIds(newSeen);
      localStorage.setItem("partenaire_seen_convs", JSON.stringify(newSeen));
    }
  }, [allConversations, etablissement?.id, etablissement?.nom, tab]);

  // Quand on ouvre l'onglet messages, marquer tout comme lu
  useEffect(() => {
    if (tab === "messages" && allConversations.length > 0) {
      const currentIds = allConversations.map(c => c.id);
      const newSeen = [...new Set([...seenConvIds, ...currentIds])];
      setSeenConvIds(newSeen);
      localStorage.setItem("partenaire_seen_convs", JSON.stringify(newSeen));
    }
  }, [tab]);

  const loading = loadingBoutique || loadingRestaurant || loadingPharmacie;

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
            <button onClick={() => setTab("pharmacie_form")} className="w-full p-6 rounded-3xl border-2 border-gray-300 bg-gradient-to-br from-gray-50 to-slate-100 hover:border-gray-600 hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center"><Pill className="w-7 h-7 text-gray-700" /></div>
                <div><p className="font-black text-lg text-gray-900">Une Pharmacie</p><p className="text-sm text-gray-500">Discuter avec clients et livrer</p></div>
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
          {tab === "pharmacie_form" && (
            <EtablissementForm type="pharmacie" partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === 'admin'}
              onSaved={() => { setTab("home"); queryClient.invalidateQueries({ queryKey: ["ma-pharmacie"] }); }}
              onCancel={() => setTab("home")} />
          )}
        </div>
      </div>
    );
  }

  // ── Bloquer l'accès si l'établissement n'est pas validé ──
  if (etablissement && etablissement.validation === "en_attente") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-xl font-black text-gray-900">Compte en attente de validation</h1>
          <p className="text-sm text-gray-500">Votre établissement est en cours de vérification par l'équipe SILGAPP. Vous recevrez une notification dès que votre compte sera validé.</p>
          <p className="text-xs text-gray-400">📞 Support : +226 66 92 51 90</p>
          <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="text-xs text-purple-600 underline">Se déconnecter</button>
        </div>
      </div>
    );
  }

  if (etablissement && (etablissement.validation === "refuse" || etablissement.validation === "suspendu")) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-red-100 flex items-center justify-center mx-auto">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-black text-gray-900">{etablissement.validation === "refuse" ? "Compte refusé" : "Compte suspendu"}</h1>
          <p className="text-sm text-gray-500">{etablissement.motif_refus || "Contactez le support SILGAPP pour plus d'informations."}</p>
          <p className="text-xs text-gray-400">📞 Support : +226 66 92 51 90</p>
          <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="text-xs text-purple-600 underline">Se déconnecter</button>
        </div>
      </div>
    );
  }

  const pendingCount = hasPharmacie
    ? pharmaCourses.filter(c => !["livree", "annulee"].includes(c.statut)).length
    : commandes.filter(c => !["livree", "annulee"].includes(c.statut)).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ── En-tête premium ── */}
      <div className="bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-20 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden flex-shrink-0">
              {etablissement.logo_url
                ? <img src={etablissement.logo_url} alt="logo" className="w-full h-full object-cover" />
                : (etablissementType === "boutique" ? <Store className="w-6 h-6" /> : etablissementType === "restaurant" ? <UtensilsCrossed className="w-6 h-6" /> : <Pill className="w-6 h-6" />)}
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
        {tab === "home" && <PartenaireHome etablissement={etablissement} etablissementType={etablissementType} onNavigate={setTab} />}
        {tab === "commandes" && !hasPharmacie && <CommandesManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "produits" && !hasPharmacie && <ProduitsManager type={etablissementType} etablissementId={etablissement.id} />}
        {tab === "livraisons" && hasPharmacie && <PharmacieLivraisons pharmacieId={etablissement.id} pharmacieNom={etablissement.nom} onNavigate={setTab} />}
        {tab === "messages" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-[70vh]">
            <MessagesPage myType="partenaire" myId={etablissement.id} myName={etablissement.nom} />
          </div>
        )}
        {tab === "promo" && <OngletCodePromoPartenaire partenaireId={user.id} />}
        {tab === "statistiques" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "revenus" && <ComptabilitePartenaire type={etablissementType} />}
        {tab === "infos" && (
          <EtablissementForm type={etablissementType} existing={etablissement} partenaireId={user.id} userEmail={user.email} isAdmin={user?.role === 'admin'}
            onSaved={() => queryClient.invalidateQueries({ queryKey: hasPharmacie ? ["ma-pharmacie"] : etablissementType === "boutique" ? ["ma-boutique"] : ["mon-restaurant"] })} />
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <PartenaireBottomNav tab={tab} setTab={setTab} badgeCount={pendingCount} messageBadge={unreadCount} etablissementType={etablissementType} />

      {/* ── Modal Nouvelle discussion ── */}
      <NewMessageModal
        show={!!newMsgModal}
        clientName={newMsgModal?.clientName}
        onOpen={() => { setTab("messages"); setNewMsgModal(null); }}
        onClose={() => setNewMsgModal(null)}
      />
    </div>
  );
}