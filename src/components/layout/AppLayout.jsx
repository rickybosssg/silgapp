import React, { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { playNotificationSound } from "@/hooks/useSonEtVibration";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import DemandesLivreursPopup from "@/components/admin/DemandesLivreursPopup";
import DemandesPartenairesPopup from "@/components/admin/DemandesPartenairesPopup";
import NeoNotificationModal from "@/components/neo/NeoNotificationModal";
import PaiementRecuModal from "@/components/admin/PaiementRecuModal";
import SystemAlertModal from "@/components/admin/SystemAlertModal";
import VenusCourseAlertModal from "@/components/admin/VenusCourseAlertModal";
import VenusIncidentAlertModal from "@/components/admin/VenusIncidentAlertModal";
import CourseWindowStack from "@/components/admin/CourseWindowStack";
import { AdminCourseWindowsProvider, useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";

export default function AppLayout({ reseau }) {
  return (
    <AdminCourseWindowsProvider>
      <AppLayoutInner reseau={reseau} />
    </AdminCourseWindowsProvider>
  );
}

function AppLayoutInner({ reseau }) {
  const { windows } = useAdminCourseWindows();
  const hasWindows = windows.length > 0;
  const [notifCount, setNotifCount] = useState(0);
  const [demandesCount, setDemandesCount] = useState(0);
  const [partenaireDemandesCount, setPartenaireDemandesCount] = useState(0);
  const [neoCount, setNeoCount] = useState(0);
  const [paiementCount, setPaiementCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [livreursBloquesCount, setLivreursBloquesCount] = useState(0);
  const [whatsappMessageCount, setWhatsappMessageCount] = useState(0);
  const prevWhatsappCountRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) { setNotifCount(0); return; }
        // Filtrer par destinataire_email pour ne compter QUE les notifications
        // de l'admin connecté (sinon on compte celles de tous les utilisateurs)
        const data = await base44.entities.Notification.filter({ lue: false, destinataire_email: user.email });
        setNotifCount((data || []).length);
      } catch (_) {}
    };
    const fetchDemandes = async () => {
      try {
        const data = await base44.entities.Livreur.filter({ validation: "en_attente", type_livreur: "externe" });
        setDemandesCount((data || []).length);
      } catch (_) {}
    };
    const fetchPartenaireDemandes = async () => {
      try {
        const [bqs, rts, phs] = await Promise.all([
          base44.entities.Boutique.filter({ validation: "en_attente" }).catch(() => []),
          base44.entities.Restaurant.filter({ validation: "en_attente" }).catch(() => []),
          base44.entities.Pharmacie.filter({ validation: "en_attente" }).catch(() => []),
        ]);
        setPartenaireDemandesCount((bqs?.length || 0) + (rts?.length || 0) + (phs?.length || 0));
      } catch (_) {}
    };
    const fetchNeoCount = async () => {
      try {
        const data = await base44.entities.NeoRecommendation.filter({ statut: "nouvelle" });
        setNeoCount((data || []).length);
      } catch (_) {}
    };
    fetchNotifs();
    fetchDemandes();
    fetchPartenaireDemandes();
    const fetchPaiements = async () => {
      try {
        const data = await base44.entities.PaiementSilgapp.filter({ statut: "en_attente" });
        setPaiementCount((data || []).length);
      } catch (_) {}
    };
    fetchNeoCount();
    fetchPaiements();
    const fetchLivreursBloques = async () => {
      try {
        const data = await base44.entities.Livreur.filter({ bloque_encours: true });
        setLivreursBloquesCount((data || []).length);
      } catch (_) {}
    };
    fetchLivreursBloques();
    const fetchMessages = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) return;
        const all = await base44.entities.Conversation.list("-last_message_date", 100);
        // Filtrer UNIQUEMENT les conversations où l'admin connecté est participant
        // (pas toutes les conversations avec un admin quelconque)
        const mine = (all || []).filter(c => {
          try {
            const parts = JSON.parse(c.participants || "[]");
            return parts.some(p => {
              if (p.type !== "admin") return false;
              const ids = [p.id, p.user_id, p.email].filter(Boolean).map(String);
              return ids.includes(String(user.id)) || (user.email && ids.includes(String(user.email)));
            });
          } catch { return false; }
        });
        const unread = mine.filter(c => {
          if (c.last_sender_type === "admin") return false;
          if (!c.last_message_date) return false;
          if (!c.admin_last_read_date) return true;
          return new Date(c.last_message_date) > new Date(c.admin_last_read_date);
        });
        setMessageCount(prev => {
          const next = unread.length;
          if (next > prev) playNotificationSound();
          return next;
        });
      } catch (_) {}
    };
    fetchMessages();
    const fetchWhatsAppMessages = async () => {
      try {
        const all = await base44.entities.Conversation.list("-last_message_date", 200);
        const waConvs = (all || []).filter(c => c.source === "whatsapp");
        const unread = waConvs.filter(c => {
          if (c.last_sender_type === "admin") return false;
          if (!c.last_message_date) return false;
          if (!c.admin_last_read_date) return true;
          return new Date(c.last_message_date) > new Date(c.admin_last_read_date);
        });
        setWhatsappMessageCount(prev => {
          const next = unread.length;
          if (next > prev) playNotificationSound();
          return next;
        });
      } catch (_) {}
    };
    fetchWhatsAppMessages();
    // Subscription temps réel sur les conversations et messages
    const unsubConv = base44.entities.Conversation.subscribe(() => { fetchMessages(); fetchWhatsAppMessages(); });
    const unsubMsg = base44.entities.Message.subscribe((event) => {
      if (event.type === "create") { fetchMessages(); fetchWhatsAppMessages(); }
    });
    const iv = setInterval(() => { fetchNotifs(); fetchDemandes(); fetchPartenaireDemandes(); fetchNeoCount(); fetchPaiements(); fetchLivreursBloques(); fetchMessages(); fetchWhatsAppMessages(); }, 30000);
    return () => { clearInterval(iv); unsubConv?.(); unsubMsg?.(); };
  }, []);

  return (
    <div className="min-h-screen bg-[#23272e] text-white">
      {/* Desktop layout */}
      {/* Popup automatique demandes livreurs */}
      <DemandesLivreursPopup />
      <DemandesPartenairesPopup />
      <NeoNotificationModal />
      <PaiementRecuModal />
      <SystemAlertModal />
      <VenusCourseAlertModal />
      <VenusIncidentAlertModal />
      <CourseWindowStack />

      <div className="hidden lg:flex min-h-screen">
        <Sidebar notificationCount={notifCount} demandesCount={demandesCount} partenaireDemandesCount={partenaireDemandesCount} neoCount={neoCount} paiementCount={paiementCount} messageCount={messageCount} livreursBloquesCount={livreursBloquesCount} whatsappMessageCount={whatsappMessageCount} reseau={reseau} />
        <main className={`flex-1 min-h-screen overflow-x-hidden bg-[#23272e] transition-all ${hasWindows ? "lg:mr-96" : ""}`}>
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <MobileNav notificationCount={notifCount} demandesCount={demandesCount} partenaireDemandesCount={partenaireDemandesCount} neoCount={neoCount} messageCount={messageCount} reseau={reseau} />
        <main className="pt-[calc(3.5rem+max(env(safe-area-inset-top),28px))] pb-16 min-h-screen bg-[#23272e]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}