import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Loader2, LogOut, MapPin, Pill, Clock, XCircle, ArrowLeft } from "lucide-react";
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
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import { clearPersistedToken } from "@/lib/authPersistence";
import { registerPushToken } from "@/lib/notifications";
import { usePushTokenRetry } from "@/hooks/usePushTokenRetry";

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

  // ── Relance automatique du token push au retour au premier plan ──
  usePushTokenRetry(null, user?.email ? { ...user, user_type: "partenaire" } : null);

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

  // Conversations non lues = dernier message pas envoyé par le partenaire ET pas encore vues
  const unreadConversations = allConversations.filter(c => {
    if (!c.last_message) return false;
    if (c.last_sender_name === etablissement?.nom) return false;
    return !seenConvIds.includes(c.id);
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

  const handleRetourChoixRole = () => {
    try {
      localStorage.setItem("silgapp_force_role_selection", "true");
    } catch (_) {}
    window.location.reload();
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-[#0A1F3D] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
      </div>
    );
  }

  if (!hasEtablissement) {
    return (
      <div className="min-h-screen bg-[#0A1F3D] flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <button
            type="button"
            onClick={handleRetourChoixRole}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1f2429] px-4 py-2 text-sm font-bold text-white/80 shadow-sm hover:bg-[#2b3137] active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au choix du compte
          </button>
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-[#007AFF]/15 flex items-center justify-center mx-auto">
              <Store className="w-10 h-10 text-[#007AFF]" />
            </div>
            <h1 className="text-2xl font-black text-white">Espace Partenaire</h1>
            <p className="text-white/50">Que souhaitez-vous créer ?</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => setTab("boutique_form")} className="w-full p-6 rounded-3xl border-2 border-sky-500/20 bg-[#1f2429] hover:border-sky-500 hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/15 flex items-center justify-center"><Store className="w-7 h-7 text-sky-400" /></div>
                <div><p className="font-black text-lg text-white">Une Boutique</p><p className="text-sm text-white/50">Vendre des produits</p></div>
              </div>
            </button>
            <button onClick={() => setTab("restaurant_form")} className="w-full p-6 rounded-3xl border-2 border-orange-500/20 bg-[#1f2429] hover:border-orange-500 hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/15 flex items-center justify-center"><UtensilsCrossed className="w-7 h-7 text-orange-400" /></div>
                <div><p className="font-black text-lg text-white">Un Restaurant</p><p className="text-sm text-white/50">Proposer un menu et des plats</p></div>
              </div>
            </button>
            <button onClick={() => setTab("pharmacie_form")} className="w-full p-6 rounded-3xl border-2 border-white/10 bg-[#1f2429] hover:border-[#007AFF] hover:shadow-lg transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center"><Pill className="w-7 h-7 text-white/70" /></div>
                <div><p className="font-black text-lg text-white">Une Pharmacie</p><p className="text-sm text-white/50">Discuter avec clients et livrer</p></div>
              </div>
            </button>
          </div>
          <div className="flex items-center justify-center gap-4 pt-2">
            <button onClick={async () => {
              await base44.auth.updateMe({ silgapp_role: "" }).catch(() => {});
              window.location.reload();
            }} className="flex items-center gap-1.5 text-sm text-[#007AFF] font-medium hover:text-[#00c47a]">
              <ArrowLeft className="w-4 h-4" />
              Retour au choix de rôle
            </button>
            <span className="text-white/20">|</span>
            <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="text-sm text-white/40 underline">Se déconnecter</button>
          </div>
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
      <div className="min-h-screen bg-[#0A1F3D] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/15 flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-xl font-black text-white">Compte en attente de validation</h1>
          <p className="text-sm text-white/50">Votre établissement est en cours de vérification par l'équipe SILGAPP. Vous recevrez une notification dès que votre compte sera validé.</p>
          <div className="flex items-center gap-2 bg-amber-500/10 rounded-xl px-4 py-3 border border-amber-500/20">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-xs text-amber-400 font-medium">Validation sous 24-48h ouvrées</p>
          </div>
          <p className="text-xs text-white/40">📞 Support : +226 66 92 51 90</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button onClick={async () => {
              await base44.auth.updateMe({ silgapp_role: "" }).catch(() => {});
              clearPersistedToken();
              base44.auth.logout();
            }} className="flex items-center gap-1 text-xs text-[#007AFF] font-medium hover:text-[#00c47a] py-2 px-3">
              <ArrowLeft className="w-3.5 h-3.5" />
              Changer de rôle
            </button>
            <span className="text-white/20">|</span>
            <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="text-xs text-white/50 underline underline-offset-2 hover:text-white/70 py-2 px-3">Se déconnecter</button>
          </div>
        </div>
      </div>
    );
  }

  if (etablissement && (etablissement.validation === "refuse" || etablissement.validation === "suspendu")) {
    return (
      <div className="min-h-screen bg-[#0A1F3D] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-red-500/15 flex items-center justify-center mx-auto">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-xl font-black text-white">{etablissement.validation === "refuse" ? "Compte refusé" : "Compte suspendu"}</h1>
          <p className="text-sm text-white/50">{etablissement.motif_refus || "Contactez le support SILGAPP pour plus d'informations."}</p>
          <p className="text-xs text-white/40">📞 Support : +226 66 92 51 90</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button onClick={async () => {
              await base44.auth.updateMe({ silgapp_role: "" }).catch(() => {});
              clearPersistedToken();
              base44.auth.logout();
            }} className="flex items-center gap-1 text-xs text-[#007AFF] font-medium hover:text-[#00c47a] py-2 px-3">
              <ArrowLeft className="w-3.5 h-3.5" />
              Changer de rôle
            </button>
            <span className="text-white/20">|</span>
            <button onClick={() => { clearPersistedToken(); base44.auth.logout(); }} className="text-xs text-[#007AFF] underline py-2 px-3">Se déconnecter</button>
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = hasPharmacie
    ? pharmaCourses.filter(c => !["livree", "annulee"].includes(c.statut)).length
    : commandes.filter(c => !["livree", "annulee"].includes(c.statut)).length;

  return (
    <div className="min-h-screen bg-[#0A1F3D] pb-20">
      {/* ── En-tête premium ── */}
      <div className="bg-gradient-to-br from-[#0A1F3D] via-[#1f2429] to-[#0A1F3D] text-white px-4 py-4 sticky top-0 z-20 shadow-lg border-b-2 border-[#0A1F3D]/30">
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
          <div className="bg-[#1f2429] rounded-2xl border border-white/8 shadow-sm overflow-hidden h-[calc(100dvh-180px)]">
            <MessagesPage myType="partenaire" myId={etablissement.id} myName={etablissement.nom} />
          </div>
        )}
        {tab === "promo" && <OngletCodePromoPartenaire partenaireId={user.id} />}
        {tab === "statistiques" && <ComptabilitePartenaire type={etablissementType} etablissement={etablissement} />}
        {tab === "revenus" && <ComptabilitePartenaire type={etablissementType} etablissement={etablissement} />}
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

      {/* ── Assistant VENUS ── */}
      <VenusFloatingButton forcedCountryCode={etablissement?.pays_code} />
    </div>
  );
}