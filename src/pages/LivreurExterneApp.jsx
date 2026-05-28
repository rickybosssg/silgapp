/**
 * LivreurExterneApp — VERSION MINIMALE DE DEBUG
 * 
 * ÉTAPE 1/7 : Auth + Profil + "Connecté" seulement
 * Zéro GPS, zéro notifications, zéro courses, zéro hooks externes
 * 
 * Activer les modules un par un UNIQUEMENT si cette version est stable :
 * [ ] GPS
 * [ ] Notifications  
 * [ ] Courses polling
 * [ ] Stats/Finances
 * [ ] Realtime listeners
 * [ ] Dashboard complet
 */

import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function LivreurExterneApp({ livreurProfil: initialProfil }) {
  const [profil, setProfil] = useState(null);
  const [phase, setPhase] = useState("init"); // init | ok | error

  // PHASE 1 : utiliser le profil passé en prop — aucun appel réseau synchrone
  useEffect(() => {
    if (!initialProfil) {
      setPhase("error");
      return;
    }
    setProfil(initialProfil);
    setPhase("ok");
  }, []);

  const handleLogout = () => {
    ["base44_access_token", "access_token", "base44_token", "token"].forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    base44.auth.logout();
    setTimeout(() => window.location.reload(), 300);
  };

  if (phase === "init") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#f9fafb" }}>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>Initialisation...</p>
      </div>
    );
  }

  if (phase === "error" || !profil) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "16px", backgroundColor: "#f9fafb" }}>
        <p style={{ color: "#dc2626", fontSize: "14px" }}>Erreur : profil livreur introuvable.</p>
        <button
          onClick={handleLogout}
          style={{ padding: "10px 20px", backgroundColor: "#dc2626", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px" }}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  // DASHBOARD MINIMAL — version 1/7
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "400px", backgroundColor: "white", borderRadius: "16px", padding: "32px", boxShadow: "0 1px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
        
        {/* Indicateur de succès */}
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px" }}>
          ✅
        </div>

        {/* Titre */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#111827", margin: 0 }}>
            Connecté avec succès
          </h1>
          <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "6px" }}>
            Dashboard Livreur Externe — v.minimal
          </p>
        </div>

        {/* Infos profil */}
        <div style={{ width: "100%", backgroundColor: "#f9fafb", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <InfoRow label="Nom" value={`${profil.prenom || ""} ${profil.nom || ""}`.trim() || "—"} />
          <InfoRow label="Téléphone" value={profil.telephone || "—"} />
          <InfoRow label="Statut" value={profil.statut || "—"} />
          <InfoRow label="Type" value={profil.type_livreur || "—"} />
          <InfoRow label="ID" value={profil.id?.slice(0, 8) + "..." || "—"} />
        </div>

        {/* Bouton déconnexion */}
        <button
          onClick={handleLogout}
          style={{ width: "100%", padding: "12px", backgroundColor: "#dc2626", color: "white", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
        >
          🚪 Se déconnecter
        </button>

        <p style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center" }}>
          Si cette page s'affiche sans crash → le routing est stable.<br />
          Les fonctionnalités seront réactivées une par une.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "500" }}>{label}</span>
      <span style={{ fontSize: "12px", color: "#111827", fontWeight: "600", textAlign: "right" }}>{value}</span>
    </div>
  );
}