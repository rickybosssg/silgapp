import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ChevronRight, Users, Zap } from "lucide-react";
import {
  getClientFrequentOrigin,
  getRecentRecipients,
  buildQuickOrderPrefill,
} from "@/lib/getClientFrequentOrigin";

/**
 * QuickOrderProPanel — Phase 5 Étape 2
 *
 * Affiche le départ habituel du client + destinataires récents (max 5).
 * Un tap PRÉREMPLIT le formulaire de course. NE CRÉE PAS la course.
 * Le client doit toujours appuyer sur "Commander" pour confirmer.
 *
 * NE MODIFIE PAS : tarification, dispatch, commissions, QuickOrder Phase 3.
 */
export default function QuickOrderProPanel({ clientProfil, position, user }) {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!clientProfil?.id || !user?.id) {
        setLoading(false);
        return;
      }
      try {
        const [frequentOrigin, recentRecipients] = await Promise.all([
          getClientFrequentOrigin(clientProfil, user),
          getRecentRecipients(clientProfil, user, 5),
        ]);
        if (cancelled) return;
        setOrigin(frequentOrigin);
        setRecipients(recentRecipients);
      } catch (err) {
        console.error("[QuickOrderPro] Erreur:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [clientProfil?.id, user?.id]);

  // Ne rien afficher si pas de départ récurrent
  if (loading) return null;
  if (!origin) return null;

  const handleRecipientClick = (recipient) => {
    const prefill = buildQuickOrderPrefill(origin, recipient);
    navigate("/client/course/expedier", {
      state: {
        position,
        clientProfil,
        prefillCourse: prefill,
      },
    });
  };

  const handleJustOrigin = () => {
    const prefill = buildQuickOrderPrefill(origin, null);
    navigate("/client/course/expedier", {
      state: {
        position,
        clientProfil,
        prefillCourse: prefill,
      },
    });
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-4 shadow-[0_8px_24px_rgba(0,168,107,0.08)]">
      {/* Départ habituel */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-emerald-700" />
        </div>
        <p className="text-xs font-black text-emerald-800 uppercase tracking-wide">Commande rapide</p>
      </div>

      <button
        onClick={handleJustOrigin}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-emerald-200 hover:border-emerald-400 active:scale-[0.98] transition-all text-left mb-3"
      >
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Départ habituel</p>
          <p className="text-sm font-black text-gray-900 truncate">{origin.label}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {origin.pct}% de vos courses · {origin.matching_courses}/{origin.total_courses} courses
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      </button>

      {/* Destinataires récents (max 5) */}
      {recipients.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <p className="text-[10px] font-black text-blue-700 uppercase tracking-wide">Clients récents</p>
          </div>
          <div className="space-y-1.5">
            {recipients.map((r, i) => (
              <button
                key={i}
                onClick={() => handleRecipientClick(r)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-blue-100 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98] transition-all text-left"
              >
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-black text-blue-700">
                    {(r.nom || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{r.nom || "Client"}</p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {r.quartier_arrivee || r.adresse_arrivee || "Destination"}
                  </p>
                </div>
                {r.count > 1 && (
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                    {r.count}x
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] text-gray-400 mt-2 text-center">
        Un tap préremplit · vous confirmez avec « Commander »
      </p>
    </div>
  );
}