import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Badge circulaire premium affichant un compteur temps réel.
 * - type="livreurs" : compte les livreurs disponibles (pour clients)
 * - type="clients"  : compte les clients actifs (pour livreurs)
 */
export default function LiveCounterBadge({ type = "livreurs", className = "" }) {
  const [count, setCount] = useState(null);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(null);

  const fetchCount = async () => {
    try {
      if (type === "livreurs") {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const livreurs = await base44.entities.Livreur.filter({
          statut: "disponible",
          actif: true,
          validation: "valide",
          app_active: true,
        });
        // Filtrer : GPS actif + connectés récemment
        const actifs = (livreurs || []).filter(l =>
          l.latitude && l.longitude &&
          l.last_seen_at && l.last_seen_at >= cutoff
        );
        setCount(actifs.length);
      } else {
        // clients actifs
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const clients = await base44.entities.ClientExterne.filter({
          app_active: true,
          actif: true,
        });
        const actifs = (clients || []).filter(c =>
          c.last_seen_at && c.last_seen_at >= cutoff
        );
        setCount(actifs.length);
      }
    } catch (_) {
      // silencieux
    }
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [type]);

  // Pulse toutes les 10 secondes (effet visuel)
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Animation si le compteur change
  useEffect(() => {
    if (count !== null && prevCount.current !== null && count !== prevCount.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    }
    prevCount.current = count;
  }, [count]);

  if (count === null) return null;

  const emoji = type === "livreurs" ? "🚚" : "👥";
  const tooltip = type === "livreurs"
    ? "Nombre de livreurs actuellement prêts à recevoir une course"
    : "Nombre de clients actuellement actifs sur SILGAPP";

  return (
    <div
      title={tooltip}
      className={`relative flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 shadow-lg shadow-black/20 border border-white/60 select-none ${className}`}
      style={{
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        transform: pulse ? "scale(1.06)" : "scale(1)",
        boxShadow: pulse
          ? "0 4px 20px rgba(0,0,0,0.25), 0 0 0 3px rgba(255,255,255,0.4)"
          : "0 4px 12px rgba(0,0,0,0.18)",
      }}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span
        className="text-sm font-black text-gray-900 tabular-nums leading-none"
        style={{ transition: "opacity 0.2s ease" }}
      >
        {count}
      </span>
    </div>
  );
}