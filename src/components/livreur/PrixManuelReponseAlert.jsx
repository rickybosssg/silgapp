import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";

/**
 * Alerte affichée au livreur quand le client répond à sa proposition de prix manuel.
 * Déclenche son + vibration sur acceptation ou refus.
 * CORRECTION : La modale reste affichée jusqu'à ce que le livreur la ferme manuellement.
 */
function playSound(accepted) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (accepted) {
      // Son de succès : montée ascendante
      const notes = [660, 880, 1100];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.15);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
    } else {
      // Son de refus : descente
      const notes = [550, 440, 330];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.15);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
    }
  } catch (_) {}
}

export default function PrixManuelReponseAlert({ accepted, prix, devise, onDismiss }) {
  const [visible, setVisible] = useState(true);

  // Handler explicite pour fermer la modale
  const handleDismiss = () => {
    console.log('[PrixManuelReponseAlert] Modale fermée par le livreur', { accepted, prix });
    setVisible(false);
    onDismiss?.();
  };

  useEffect(() => {
    // Son + vibration au montage
    console.log('[PrixManuelReponseAlert] Affichage notification prix manuel', { accepted, prix, devise });
    playSound(accepted);
    if (accepted) {
      navigator.vibrate?.([200, 100, 200, 100, 400]);
    } else {
      navigator.vibrate?.([500, 150, 500]);
    }

    // CORRECTION : SUPPRESSION de l'auto-dismiss
    // La modale reste affichée jusqu'à ce que le livreur la ferme manuellement
    // Plus de timer automatique — garantie que le livreur voit la notification
  }, [accepted, devise, prix]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        // Fermer seulement si clic en dehors de la modale (overlay)
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in duration-300 ${
        accepted ? "bg-white border-4 border-green-400" : "bg-white border-4 border-red-400"
      }`}>
        {/* Header */}
        <div className={`px-5 pt-6 pb-4 flex flex-col items-center gap-3 ${
          accepted
            ? "bg-gradient-to-br from-green-500 to-emerald-600"
            : "bg-gradient-to-br from-red-500 to-red-700"
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            {accepted
              ? <CheckCircle className="w-10 h-10 text-white" />
              : <XCircle className="w-10 h-10 text-white" />
            }
          </div>
          <div className="text-center">
            <p className="text-white font-black text-xl leading-tight">
              {accepted ? "Prix accepté ! " : "Prix refusé"}
            </p>
            <p className="text-white/80 text-sm mt-1">
              {accepted
                ? `Le client a validé votre proposition`
                : "Le client a refusé votre proposition"}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 text-center">
          {prix > 0 && (
            <div className={`rounded-2xl px-4 py-3 ${accepted ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <p className="text-2xl font-black text-gray-900">
                {prix.toLocaleString()} <span className="text-base font-semibold text-gray-500">{devise || "FCFA"}</span>
              </p>
            </div>
          )}

          <p className={`text-sm font-bold ${accepted ? "text-green-700" : "text-red-700"}`}>
            {accepted
              ? " La course peut commencer. Rendez-vous au point de récupération !"
              : " Vous êtes de nouveau disponible."}
          </p>

          {/* Bouton d'action explicite pour le livreur */}
          <button
            onClick={handleDismiss}
            className={`w-full h-12 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all ${
              accepted
                ? "bg-gradient-to-b from-green-500 to-emerald-600 text-white shadow-green-200"
                : "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-red-200"
            }`}
          >
            {accepted ? "Continuer la course →" : "Compris"}
          </button>

          <p className="text-xs text-gray-400">Ou appuyez en dehors pour fermer</p>
        </div>
      </div>
    </div>
  );
}
