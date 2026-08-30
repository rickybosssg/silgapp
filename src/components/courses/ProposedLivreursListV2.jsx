import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Users, Phone, Clock, CheckCircle2, RefreshCw, Radio, XCircle, UserCheck,
  Eye, X, TrendingUp, Wifi, Timer,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function fmtSec(sec) {
  if (sec <= 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Vue V2 — Fil de courses
 * Contrairement au V1 (vagues par proximité), la course est visible par TOUS
 * les livreurs éligibles simultanément. Cette vue affiche :
 *  - Le nombre total de livreurs éligibles (qui voient la course)
 *  - Le flux d'activité temps réel : vus / refusés / acceptés
 *  - Le bouton "Assigner manuellement" reste disponible (assignation forcée)
 */
export default function ProposedLivreursListV2({ course }) {
  const queryClient = useQueryClient();
  const [assigningId, setAssigningId] = useState(null);
  const [selectedAssignId, setSelectedAssignId] = useState(null);
  const [now, setNow] = useState(Date.now());

  // ── Tick pour compte à rebours ──
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Timeout / expiration ──
  const expiresTs = course?.timeout_expires_at ? new Date(course.timeout_expires_at).getTime() : null;
  const remainingSec = expiresTs ? Math.max(0, Math.floor((expiresTs - now) / 1000)) : null;
  const isExpired = expiresTs ? now >= expiresTs : false;

  // ── Vérifier V2 activé ──
  const [v2Enabled, setV2Enabled] = useState(true);
  useEffect(() => {
    let mounted = true;
    base44.entities.AppConfig.filter({ cle: "DISPATCH_V2_ENABLED" })
      .then((configs) => {
        if (mounted) setV2Enabled(configs?.[0] ? configs[0].valeur !== "false" : true);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // ── Récupérer toutes les interactions (DispatchNotification) ──
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchInteractions = async () => {
      try {
        const notifs = await base44.entities.DispatchNotification.filter(
          { course_id: course.id },
          "-date_notification", 200
        );
        if (!mounted) return;
        // Récupérer les infos des livreurs concernés
        const livreurIds = [...new Set((notifs || []).map(n => n.livreur_id).filter(Boolean))];
        let livreursMap = {};
        if (livreurIds.length > 0) {
          const livreurs = await base44.entities.Livreur.filter({ id: { $in: livreurIds } });
          (livreurs || []).forEach(l => { livreursMap[l.id] = l; });
        }
        // Fusionner
        const enriched = (notifs || []).map(n => ({
          ...n,
          livreur: livreursMap[n.livreur_id] || null,
        }));
        if (mounted) { setInteractions(enriched); setLoading(false); }
      } catch {
        if (mounted) { setInteractions([]); setLoading(false); }
      }
    };
    fetchInteractions();
    // ── Refresh toutes les 5s en V2 (temps réel) ──
    const iv = setInterval(fetchInteractions, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, [course?.id, course?.updated_date]);

  // ── Compter les livreurs éligibles (disponibles + GPS actif du pays) ──
  const [eligibleCount, setEligibleCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    const fetchEligible = async () => {
      try {
        const livreurs = await base44.entities.Livreur.filter(
          {
            country_code: course.country_code,
            type_livreur: "externe",
            statut: "disponible",
            actif: true,
            validation: "valide",
            bloque_encours: false,
          },
          "-created_date", 500
        );
        if (!mounted) return;
        // Compter ceux avec activité récente (< 15 min) — aligné avec les critères
        // de dispatch V2 (notifierLivreursEligiblesV2 n'exclut pas par GPS freshness)
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const eligible = (livreurs || []).filter(l => {
          if (l.manual_hors_ligne === true) return false;
          if (l.admin_hors_ligne === true) return false;
          if (!l.last_seen_at) return false;
          return new Date(l.last_seen_at) > fifteenMinAgo;
        });
        setEligibleCount(eligible.length);
      } catch {
        if (mounted) setEligibleCount(0);
      }
    };
    fetchEligible();
    const iv = setInterval(fetchEligible, 10000);
    return () => { mounted = false; clearInterval(iv); };
  }, [course?.country_code]);

  // ── Grouper les interactions par statut ──
  const stats = useMemo(() => {
    const notifie = interactions.filter(n => n.statut === "notifie" || n.statut === "push_succes");
    const refuse = interactions.filter(n => n.statut === "refuse");
    const accepte = interactions.filter(n => n.statut === "accepte");
    const expire = interactions.filter(n => n.statut === "expire");
    return { notifie, refuse, accepte, expire };
  }, [interactions]);

  const acceptedId = course.livreur_id || course.accepted_by_livreur_id;
  const dispatchStatus = course?.dispatch_status;
  const isTerminal = course?.statut === "annulee" || course?.statut === "livree";
  const isDiffusing = dispatchStatus === "disponible_push" || dispatchStatus === "propose" || dispatchStatus === "en_attente";

  // ── Assignation manuelle forcée ──
  const handleForceAssign = async (livreur) => {
    setAssigningId(livreur.id);
    try {
      const result = await base44.functions.invoke("assignerLivreurAdmin", {
        course_id: course.id,
        livreur_id: livreur.id,
        motif: `Assigné manuellement par admin → ${livreur.prenom || ""} ${livreur.nom || ""}`,
      });
      if (!result?.data?.success && result?.data?.error) {
        throw new Error(result.data.error);
      }
      toast.success(`Course assignée à ${livreur.prenom || ""} ${livreur.nom || ""}`);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error("Erreur : " + (error?.message || "assignation impossible"));
    } finally {
      setAssigningId(null);
    }
  };

  // ── Tous les livreurs uniques ayant interagi ──
  const allInteractedLivreurs = useMemo(() => {
    const map = new Map();
    interactions.forEach(n => {
      if (!n.livreur) return;
      if (!map.has(n.livreur_id)) {
        map.set(n.livreur_id, { ...n.livreur, _statut: n.statut, _date: n.date_reponse || n.date_notification });
      }
    });
    return [...map.values()];
  }, [interactions]);

  if (loading) {
    return (
      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
        <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 animate-pulse" />
          Diffusion en cours...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 space-y-2.5">
      {/* ── Header V2 ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" />
          En diffusion
        </p>
        <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
          {eligibleCount} éligibles
        </span>
      </div>

      {/* ── Stats temps réel ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-blue-200 rounded-lg p-2 text-center">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-1">
            <Radio className="w-3 h-3 text-blue-600 animate-pulse" />
          </div>
          <p className="text-lg font-black text-blue-600">{stats.notifie.length}</p>
          <p className="text-[9px] text-gray-500 font-semibold uppercase">Notifiés</p>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-2 text-center">
          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-1">
            <X className="w-3 h-3 text-red-500" />
          </div>
          <p className="text-lg font-black text-red-500">{stats.refuse.length}</p>
          <p className="text-[9px] text-gray-500 font-semibold uppercase">Refusés</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-2 text-center">
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-1">
            <Clock className="w-3 h-3 text-amber-500" />
          </div>
          <p className="text-lg font-black text-amber-500">{stats.expire.length}</p>
          <p className="text-[9px] text-gray-500 font-semibold uppercase">Expirés</p>
        </div>
      </div>

      {/* ── Timeline diffusion ── */}
      {isDiffusing && !isTerminal && (
        <div className="rounded-lg p-3 bg-white border-2 border-emerald-200 space-y-2.5">
          {/* Statut diffusion */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-600">
                Diffusion active
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Fil de courses
            </span>
          </div>

          {/* Compte à rebours */}
          {remainingSec !== null && !isExpired && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Timer className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-700">Attente d'acceptation</p>
                <p className="text-[10px] text-gray-400">expire dans {fmtSec(remainingSec)}</p>
                <div className="mt-1 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (remainingSec / 120) * 100)}%` }} />
                </div>
              </div>
              <span className="text-lg font-black text-emerald-600 tabular-nums">{fmtSec(remainingSec)}</span>
            </div>
          )}

          {/* Timeout expiré */}
          {isExpired && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <RefreshCw className="w-3.5 h-3.5 text-orange-600 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-orange-600">Timeout dépassé</p>
                <p className="text-[10px] text-orange-400">en attente d'acceptation...</p>
              </div>
            </div>
          )}

          {/* Info éligibles */}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-600">Livreurs éligibles</p>
              <p className="text-[10px] text-gray-400">disponibles avec GPS actif</p>
            </div>
            <span className="text-sm font-bold text-emerald-600 tabular-nums">{eligibleCount}</span>
          </div>
        </div>
      )}

      {/* ── Terminal ── */}
      {isTerminal && (
        <div className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <XCircle className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-500">
            Dispatch arrêté — course {course?.statut === "annulee" ? "annulée" : "livrée"}
          </span>
        </div>
      )}

      {/* ── Liste déroulante des livreurs ayant interagi ── */}
      {allInteractedLivreurs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Activité ({allInteractedLivreurs.length})
          </p>
          {(() => {
            const selectedLivreur = allInteractedLivreurs.find(l => l.id === selectedAssignId);
            const isAcceptedSelected = selectedLivreur && acceptedId && String(selectedLivreur.id) === String(acceptedId);
            return (
              <>
                <select
                  value={selectedAssignId || ""}
                  onChange={(e) => setSelectedAssignId(e.target.value || null)}
                  className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Sélectionner un livreur —</option>
                  {allInteractedLivreurs.map((l) => {
                    const isAccepted = acceptedId && String(l.id) === String(acceptedId);
                    const statutLabel = l._statut === "refuse" ? " (Refusé)" : l._statut === "expire" ? " (Expiré)" : isAccepted ? " (Accepté)" : "";
                    return (
                      <option key={l.id} value={l.id}>
                        {l.prenom} {l.nom} — {l.telephone || "?"}{statutLabel}
                      </option>
                    );
                  })}
                </select>
                {selectedLivreur && (
                  <div className="flex items-center gap-2 p-2 rounded-lg text-xs border bg-white border-gray-100">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isAcceptedSelected ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {(selectedLivreur.prenom?.[0] || "") + (selectedLivreur.nom?.[0] || "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate">
                        {selectedLivreur.prenom} {selectedLivreur.nom}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        {selectedLivreur.telephone && (
                          <span className="flex items-center gap-0.5">
                            <Phone className="w-2.5 h-2.5" />
                            {selectedLivreur.telephone}
                          </span>
                        )}
                        {selectedLivreur._date && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(selectedLivreur._date), "HH:mm", { locale: fr })}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedLivreur._statut === "refuse" && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full shrink-0">
                        Refusé
                      </span>
                    )}
                    {selectedLivreur._statut === "expire" && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                        Expiré
                      </span>
                    )}
                    {isAcceptedSelected ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-200 px-2 py-1 rounded-full shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Accepté
                      </span>
                    ) : !isTerminal ? (
                      <button
                        onClick={() => handleForceAssign(selectedLivreur)}
                        disabled={assigningId === selectedLivreur.id}
                        className="flex items-center gap-1 text-[10px] font-bold text-white bg-primary px-2 py-1 rounded-full shrink-0 hover:bg-primary/90 transition disabled:opacity-50"
                      >
                        {assigningId === selectedLivreur.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <UserCheck className="w-3 h-3" />
                        )}
                        {assigningId === selectedLivreur.id ? "..." : "Assigner"}
                      </button>
                    ) : null}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Aucune interaction ── */}
      {allInteractedLivreurs.length === 0 && !isTerminal && (
        <div className="text-center py-3">
          <Wifi className="w-6 h-6 text-emerald-300 mx-auto mb-1 animate-pulse" />
          <p className="text-[11px] text-gray-400">
            En attente d'activité...
          </p>
          <p className="text-[10px] text-gray-300">
            {eligibleCount} livreur{eligibleCount !== 1 ? "s" : ""} peuvent voir cette course
          </p>
        </div>
      )}
    </div>
  );
}