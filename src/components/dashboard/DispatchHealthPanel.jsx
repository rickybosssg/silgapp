import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Radio, MapPin, Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getHeartbeatSeuilMin, getGpsSeuilMin } from "@/lib/dispatchRules.js";

/**
 * Carte "Santé du dispatch" — indicateurs PUREMENT informatifs.
 *
 * 4 compteurs dynamiques calculés à partir des données réelles :
 *  1. Livreurs ON        — candidats réels du Dispatch V2 (mêmes critères)
 *  2. Présence récente   — heartbeat < heartbeat_seuil_min (paramètre dynamique)
 *  3. GPS récent          — derniere_position_date < gps_seuil_min (paramètre dynamique)
 *  4. Push actif          — au moins 1 token FCM natif actif
 *
 * ⚠️ Ces indicateurs sont INFORMATIFS UNIQUEMENT.
 *    Ils ne filtrent PAS le dispatch — tous les livreurs ON continuent
 *    de voir les courses indépendamment de ces valeurs.
 */
export default function DispatchHealthPanel({ courses = [], livreurs = [] }) {
  // ── Statuts actifs/terminaux (même définition que dispatchV2.ts) ──
  const STATUTS_ACTIFS = [
    "nouvelle", "en_attente", "programmee", "recherche_livreur",
    "livreur_en_route", "client_contacte", "en_route_expediteur",
    "arrive_prise_en_charge", "colis_recupere", "passager_embarque",
    "pris_en_charge", "en_livraison", "arrivee",
  ];
  const STATUTS_TERMINAUX = ["livree", "annulee"];

  // ── 1. Livreurs ON (mêmes critères que notifierLivreursEligiblesV2) ──
  const livreursON = useMemo(() => {
    // Livreurs en course (même définition que getLivreursEnCourse dans dispatchV2.ts)
    const livreursEnCourse = new Set();
    for (const c of courses) {
      const actif = STATUTS_ACTIFS.includes(c.statut) ||
        (c.dispatch_status === "accepte" && !STATUTS_TERMINAUX.includes(c.statut));
      if (!actif) continue;
      if (c.livreur_id) livreursEnCourse.add(c.livreur_id);
      if (c.accepted_by_livreur_id) livreursEnCourse.add(c.accepted_by_livreur_id);
    }

    return livreurs.filter(l =>
      l.type_livreur === "externe" &&
      l.statut === "disponible" &&
      l.validation === "valide" &&
      l.actif === true &&
      l.bloque_encours !== true &&
      l.manual_hors_ligne !== true &&
      l.admin_hors_ligne !== true &&
      l.user_email &&
      !livreursEnCourse.has(l.id)
    );
  }, [livreurs, courses]);

  // ── 2. Présence récente (last_seen_at < heartbeat_seuil_min) ──
  const presenceRecente = useMemo(() => {
    const seuilMs = getHeartbeatSeuilMin() * 60 * 1000;
    const now = Date.now();
    return livreursON.filter(l => {
      if (!l.last_seen_at) return false;
      return (now - new Date(l.last_seen_at).getTime()) < seuilMs;
    });
  }, [livreursON]);

  // ── 3. GPS récent (derniere_position_date < gps_seuil_min) ──
  const gpsRecent = useMemo(() => {
    const seuilMs = getGpsSeuilMin() * 60 * 1000;
    const now = Date.now();
    return livreursON.filter(l => {
      if (!l.derniere_position_date) return false;
      return (now - new Date(l.derniere_position_date).getTime()) < seuilMs;
    });
  }, [livreursON]);

  // ── 4. Push actif (au moins 1 token FCM natif actif) ──
  const { data: tokens = [] } = useQuery({
    queryKey: ["dispatch-health-push-tokens"],
    queryFn: () => base44.entities.NotificationToken.filter({
      user_type: "livreur",
      actif: true,
    }),
    initialData: [],
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const pushActif = useMemo(() => {
    const emailsAvecToken = new Set(
      (tokens || []).map(t => t.user_email).filter(Boolean)
    );
    return livreursON.filter(l => emailsAvecToken.has(l.user_email));
  }, [livreursON, tokens]);

  // ── Couleurs dynamiques ──
  const total = livreursON.length;
  const pct = (count) => total > 0 ? Math.round((count / total) * 100) : 0;

  const presencePct = pct(presenceRecente.length);
  const gpsPct = pct(gpsRecent.length);
  const pushPct = pct(pushActif.length);

  const colorFor = (pctVal) =>
    pctVal >= 80 ? "text-[#00a86b]"
    : pctVal >= 50 ? "text-amber-400"
    : pctVal >= 20 ? "text-orange-400"
    : "text-red-400";

  return (
    <div className="bg-[#1f2429] rounded-2xl border border-white/8 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Users className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Santé du dispatch</h3>
          <p className="text-[10px] text-white/40">Indicateurs informatifs temps réel</p>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Livreurs ON */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Livreurs ON
            </span>
          </div>
          <p className="text-2xl font-black leading-none text-blue-400">
            {total}
          </p>
          <p className="text-[10px] text-white/40 mt-1">Éligibles au dispatch</p>
        </div>

        {/* 2. Présence récente */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Radio className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Présence récente
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${colorFor(presencePct)}`}>
            {presenceRecente.length}
          </p>
          <p className="text-[10px] text-white/40 mt-1">Heartbeat récent</p>
        </div>

        {/* 3. GPS récent */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <MapPin className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              GPS récent
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${colorFor(gpsPct)}`}>
            {gpsRecent.length}
          </p>
          <p className="text-[10px] text-white/40 mt-1">Position GPS récente</p>
        </div>

        {/* 4. Push actif */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bell className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Push actif
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${colorFor(pushPct)}`}>
            {pushActif.length}
          </p>
          <p className="text-[10px] text-white/40 mt-1">Peuvent recevoir le push</p>
        </div>
      </div>

      {/* Barre de santé globale — basée sur le ratio push actif / livreurs ON */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
            Couverture push
          </span>
          <span className={`text-xs font-bold ${colorFor(pushPct)}`}>
            {pushPct >= 80 ? "🟢 Bonne" : pushPct >= 50 ? "🟡 À surveiller" : "🔴 Faible"}
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pushPct >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : pushPct >= 50 ? "bg-gradient-to-r from-amber-400 to-orange-400"
              : "bg-gradient-to-r from-rose-400 to-red-500"
            }`}
            style={{ width: `${pushPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
