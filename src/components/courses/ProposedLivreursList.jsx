import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Phone, MapPin, Clock, CheckCircle2, XCircle, Timer, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function ProposedLivreursList({ course }) {
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remainingSec, setRemainingSec] = useState(null);
  const [isExpired, setIsExpired] = useState(false);

  // ── Compte à rebours avant prochaine relance ──
  useEffect(() => {
    if (!course?.timeout_expires_at) {
      setRemainingSec(null);
      setIsExpired(false);
      return;
    }
    const update = () => {
      const expires = new Date(course.timeout_expires_at);
      const diff = Math.round((expires.getTime() - Date.now()) / 1000);
      if (diff > 0) {
        setRemainingSec(diff);
        setIsExpired(false);
      } else {
        setRemainingSec(0);
        setIsExpired(true);
      }
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [course?.timeout_expires_at]);

  useEffect(() => {
    let mounted = true;
    const fetchLivreurs = async () => {
      let notifiedIds = [];
      try {
        notifiedIds = JSON.parse(course.dispatch_notified_ids || "[]");
      } catch {
        notifiedIds = [];
      }
      if (notifiedIds.length === 0) {
        if (mounted) { setLivreurs([]); setLoading(false); }
        return;
      }
      try {
        const result = await base44.entities.Livreur.filter({ id: { $in: notifiedIds } });
        // Préserver l'ordre de notification
        const ordered = notifiedIds
          .map(id => result.find(l => l.id === id))
          .filter(Boolean);
        if (mounted) { setLivreurs(ordered); setLoading(false); }
      } catch {
        if (mounted) { setLivreurs([]); setLoading(false); }
      }
    };
    fetchLivreurs();
    return () => { mounted = false; };
  }, [course?.id, course?.dispatch_notified_ids]);

  if (loading) {
    return (
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-600 font-semibold flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Livreurs proposés : chargement...
        </p>
      </div>
    );
  }

  if (livreurs.length === 0) {
    return null;
  }

  const acceptedId = course.livreur_id || course.accepted_by_livreur_id;

  const dispatchStatus = course?.dispatch_status;
  const isSearching = dispatchStatus === "propose" || dispatchStatus === "en_attente" || dispatchStatus === "redispatch";
  const isCycleEpuise = dispatchStatus === "cycle_epuise";

  // Construire le libellé du statut dispatch
  let dispatchLabel = "";
  let dispatchColor = "text-gray-500";
  if (dispatchStatus === "propose") { dispatchLabel = "En cours de proposition"; dispatchColor = "text-blue-600"; }
  else if (dispatchStatus === "en_attente") { dispatchLabel = "En attente de livreur"; dispatchColor = "text-amber-600"; }
  else if (dispatchStatus === "redispatch") { dispatchLabel = "Relance en cours"; dispatchColor = "text-orange-600"; }
  else if (dispatchStatus === "cycle_epuise") { dispatchLabel = "Cycle épuisé — reset imminent"; dispatchColor = "text-red-600"; }
  else if (dispatchStatus === "accepte") { dispatchLabel = "Accepté"; dispatchColor = "text-green-600"; }

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Livreurs proposés
        </p>
        <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
          {livreurs.length}
        </span>
      </div>

      {/* ── Compte à rebours + statut dispatch ── */}
      {isSearching && (
        <div className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg ${
          isExpired ? "bg-orange-100 border border-orange-200" : "bg-white border border-blue-100"
        }`}>
          <div className="flex items-center gap-1.5">
            {isExpired ? (
              <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin" />
            ) : (
              <Timer className="w-3.5 h-3.5 text-blue-500" />
            )}
            <span className={`text-[11px] font-bold ${isExpired ? "text-orange-600" : "text-blue-600"}`}>
              {isExpired
                ? "Relance imminente…"
                : `Prochaine relance dans ${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`}
            </span>
          </div>
          <span className={`text-[10px] font-semibold ${dispatchColor}`}>
            {dispatchLabel}
          </span>
        </div>
      )}
      {isCycleEpuise && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-red-50 border border-red-200">
          <RefreshCw className="w-3.5 h-3.5 text-red-500 animate-spin" />
          <span className="text-[11px] font-bold text-red-600">
            Tous les livreurs sollicités — nouveau cycle dans un instant…
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {livreurs.map((l, idx) => {
          const isAccepted = acceptedId && String(l.id) === String(acceptedId);
          return (
            <div
              key={l.id}
              className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                isAccepted ? "bg-green-100 border border-green-200" : "bg-white border border-gray-100"
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                isAccepted ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
              }`}>
                {(l.prenom?.[0] || "") + (l.nom?.[0] || "")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">
                  {l.prenom} {l.nom}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  {l.telephone && (
                    <span className="flex items-center gap-0.5">
                      <Phone className="w-2.5 h-2.5" />
                      {l.telephone}
                    </span>
                  )}
                  {l.last_seen_at && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {format(new Date(l.last_seen_at), "HH:mm", { locale: fr })}
                    </span>
                  )}
                </div>
              </div>
              {isAccepted ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accepté
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  En attente
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}