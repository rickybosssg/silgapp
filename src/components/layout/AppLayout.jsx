import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import DemandesLivreursPopup from "@/components/admin/DemandesLivreursPopup";
import DemandesPartenairesPopup from "@/components/admin/DemandesPartenairesPopup";
import NeoNotificationModal from "@/components/neo/NeoNotificationModal";
import PaiementRecuModal from "@/components/admin/PaiementRecuModal";
import SystemAlertModal from "@/components/admin/SystemAlertModal";

export default function AppLayout({ reseau }) {
  const [notifCount, setNotifCount] = useState(0);
  const [demandesCount, setDemandesCount] = useState(0);
  const [partenaireDemandesCount, setPartenaireDemandesCount] = useState(0);
  const [neoCount, setNeoCount] = useState(0);
  const [paiementCount, setPaiementCount] = useState(0);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const data = await base44.entities.Notification.filter({ lue: false });
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
    const iv = setInterval(() => { fetchNotifs(); fetchDemandes(); fetchPartenaireDemandes(); fetchNeoCount(); fetchPaiements(); }, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop layout */}
      {/* Popup automatique demandes livreurs */}
      <DemandesLivreursPopup />
      <DemandesPartenairesPopup />
      <NeoNotificationModal />
      <PaiementRecuModal />
      <SystemAlertModal />

      <div className="hidden lg:flex min-h-screen">
        <Sidebar notificationCount={notifCount} demandesCount={demandesCount} partenaireDemandesCount={partenaireDemandesCount} neoCount={neoCount} paiementCount={paiementCount} reseau={reseau} />
        <main className="flex-1 min-h-screen overflow-x-hidden bg-slate-50">
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <MobileNav notificationCount={notifCount} demandesCount={demandesCount} partenaireDemandesCount={partenaireDemandesCount} neoCount={neoCount} reseau={reseau} />
        <main className="pt-14 pb-16 min-h-screen bg-slate-50 safe-area-top safe-area-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}