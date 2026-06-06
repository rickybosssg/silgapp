import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bike, Users, Wifi } from "lucide-react";

/**
 * Badge premium affichant les livreurs disponibles en temps réel.
 * - type="livreurs" : compte les livreurs disponibles (pour clients)
 * - type="clients"  : compte les clients actifs (pour livreurs)
 * Filtre par pays de l'utilisateur connecté.
 */
export default function LiveCounterBadge({ type = "livreurs", count: externalCount, className = "" }) {
  const [userCountry, setUserCountry] = useState(null);
  const [internalCount, setInternalCount] = useState(null);
  const [loading, setLoading] = useState(externalCount === undefined);

  // Si un count externe est fourni, l'utiliser directement (même source que la carte)
  const count = externalCount !== undefined ? externalCount : internalCount;

  // Déterminer le pays de l'utilisateur — uniquement si pas de count externe
  useEffect(() => {
    if (externalCount !== undefined) return;
    const detectCountry = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) return;
        const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
        if (clients?.[0]?.country_code) { setUserCountry(clients[0].country_code); return; }
        const livreurs = await base44.entities.Livreur.filter({ user_email: user.email });
        if (livreurs?.[0]?.country_code) setUserCountry(livreurs[0].country_code);
      } catch (_) {}
    };
    detectCountry();
  }, [externalCount]);

  const fetchCount = async () => {
    if (externalCount !== undefined) return; // pas besoin si fourni de l'extérieur
    try {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      if (type === "livreurs") {
        const filter = { statut: "disponible", actif: true, validation: "valide", app_active: true };
        if (userCountry) filter.country_code = userCountry;
        const livreurs = await base44.entities.Livreur.filter(filter);
        const actifs = (livreurs || []).filter(l => l.latitude && l.longitude && l.last_seen_at && l.last_seen_at >= cutoff);
        setInternalCount(actifs.length);
      } else {
        const filter = { app_active: true, actif: true };
        if (userCountry) filter.country_code = userCountry;
        const clients = await base44.entities.ClientExterne.filter(filter);
        const actifs = (clients || []).filter(c => c.last_seen_at && c.last_seen_at >= cutoff);
        setInternalCount(actifs.length);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalCount !== undefined) return;
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [type, userCountry, externalCount]);

  // Quand count externe fourni, pas de loading
  useEffect(() => {
    if (externalCount !== undefined) setLoading(false);
  }, [externalCount]);

  if (loading || count === null) return null;

  const isZero = count === 0;

  return (
    <div
      className={`relative flex items-center gap-2 rounded-full px-3 py-2 select-none ${className}`}
      style={{
        backgroundColor: "rgba(255,255,255,1)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        border: "1px solid rgba(255,255,255,0.8)",
      }}
    >
      {/* Icône scooter/livreur */}
      <div className="relative">
        {type === "clients"
          ? <Users className="w-5 h-5" style={{ color: isZero ? "#b91c1c" : "#059669" }} />
          : <Bike className="w-5 h-5" style={{ color: isZero ? "#b91c1c" : "#059669" }} />
        }
        {/* Pastille verte animée "temps réel" */}
        <div
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
          style={{
            backgroundColor: "#22c55e",
            animation: "pulse-live 2s ease-in-out infinite",
          }}
        />
      </div>

      {/* Nombre et texte */}
      <div className="flex items-center gap-1.5">
        <span
          className="text-base font-black tabular-nums leading-none"
          style={{ color: isZero ? "#b91c1c" : "#111" }}
        >
          {count}
        </span>
        <span
          className="text-xs font-medium leading-none"
          style={{ color: isZero ? "#b91c1c" : "#374151" }}
        >
          {type === "clients"
            ? (isZero ? "Aucun client en ligne" : count === 1 ? "client en ligne" : "clients en ligne")
            : (isZero ? "Aucun livreur disponible" : count === 1 ? "livreur disponible" : "livreurs disponibles")}
        </span>
      </div>

      {/* Badge "temps réel" */}
      <div className="flex items-center gap-1">
        <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#22c55e" }}>
          Temps réel
        </span>
      </div>

      {/* Styles CSS pour l'animation */}
      <style>{`
        @keyframes pulse-live {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(0.9);
          }
        }
      `}</style>
    </div>
  );
}