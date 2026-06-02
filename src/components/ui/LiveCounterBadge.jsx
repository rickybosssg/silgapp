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

  // Couleur dynamique selon disponibilité (uniquement pour les livreurs)
  const getColorStyle = () => {
    if (type !== "livreurs") return { bg: "rgba(255,255,255,1)", text: "#111", glow: "rgba(0,0,0,0.18)" };
    if (count >= 5) return { bg: "rgba(220,252,231,1)", text: "#15803d", glow: "rgba(34,197,94,0.35)" };
    if (count >= 2) return { bg: "rgba(255,237,213,1)", text: "#c2410c", glow: "rgba(249,115,22,0.35)" };
    return { bg: "rgba(254,226,226,1)", text: "#b91c1c", glow: "rgba(239,68,68,0.4)" };
  };

  const color = getColorStyle();

  return (
    <div
      title={tooltip}
      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-white/60 select-none ${className}`}
      style={{
        backgroundColor: color.bg,
        transition: "transform 0.3s ease, box-shadow 0.3s ease, background-color 0.6s ease",
        transform: pulse ? "scale(1.06)" : "scale(1)",
        boxShadow: pulse
          ? `0 4px 20px ${color.glow}, 0 0 0 3px rgba(255,255,255,0.4)`
          : `0 4px 12px ${color.glow}`,
      }}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span
        className="text-sm font-black tabular-nums leading-none"
        style={{ color: color.text, transition: "color 0.6s ease, opacity 0.2s ease" }}
      >
        {count}
      </span>
    </div>
  );
}