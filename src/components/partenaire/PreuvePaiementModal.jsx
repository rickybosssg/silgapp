import React, { useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, CheckCircle, RotateCw } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PreuvePaiementModal — Affiche une preuve de paiement en plein écran avec zoom.
 *
 * Sécurité :
 *   - Aucune validation automatique. L'utilisateur doit cliquer explicitement
 *     sur VALIDER ou REFUSER pour modifier le statut de la commande.
 *   - La modal ne modifie JAMAIS la commande, le montant, la preuve ou le statut.
 *
 * Fonctions backend réutilisées (via le parent) :
 *   - changerStatutCommande avec action="valider_paiement"
 *   - changerStatutCommande avec action="refuser_paiement"
 */
export default function PreuvePaiementModal({ commande, onClose, onValider, onRefuser, loading }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom/pan quand on change de commande
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [commande?.id]);

  // Fermer avec ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    // Bloquer le scroll du body
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(z - 0.5, 1);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Drag pour naviguer dans l'image zoomée (mobile + desktop) ──
  const handlePointerDown = (e) => {
    if (zoom === 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  if (!commande) return null;

  const dateStr = commande.created_date
    ? new Date(commande.created_date).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const refShort = (commande.id || "").slice(-6).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── Header : fermer + titre ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">Preuve de paiement</p>
          <p className="text-white/60 text-[11px]">Réf: #{refShort}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
          aria-label="Fermer"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* ── Zone image : plein écran + zoom + drag ── */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
      >
        {commande.preuve_paiement_url ? (
          <img
            src={commande.preuve_paiement_url}
            alt="Preuve de paiement"
            className="max-w-full max-h-full object-contain select-none pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: dragging ? "none" : "transform 0.2s ease-out",
            }}
            draggable={false}
          />
        ) : (
          <p className="text-white/50 text-sm">Aucune preuve de paiement</p>
        )}

        {/* ── Contrôles zoom ── */}
        {commande.preuve_paiement_url && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom === 1}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
              aria-label="Dézoomer"
            >
              <ZoomOut className="w-4 h-4 text-white" />
            </button>
            <span className="text-white text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 4}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
              aria-label="Zoomer"
            >
              <ZoomIn className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              disabled={zoom === 1}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
              aria-label="Réinitialiser"
            >
              <RotateCw className="w-4 h-4 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* ── Footer : infos commande + actions ── */}
      <div className="shrink-0 bg-white rounded-t-2xl px-4 pt-4 pb-6 space-y-3 max-h-[45vh] overflow-y-auto">
        {/* Infos commande */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-50 p-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Client</p>
            <p className="font-bold text-gray-900 truncate">{commande.client_nom || "-"}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Montant</p>
            <p className="font-bold text-gray-900">{(commande.total || 0).toLocaleString()} FCFA</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Date</p>
            <p className="font-bold text-gray-900 text-[11px]">{dateStr}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Référence</p>
            <p className="font-bold text-gray-900">#{refShort}</p>
          </div>
        </div>

        {/* Boutons VALIDER / REFUSER — uniquement si paiement en attente de vérification */}
        {commande.statut === "paiement_verification" && (
          <div className="flex gap-2 pt-1">
            <Button
              size="lg"
              onClick={onValider}
              disabled={loading}
              className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-black text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              VALIDER LE PAIEMENT
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={onRefuser}
              disabled={loading}
              className="flex-1 h-12 text-red-600 border-red-200 hover:bg-red-50 font-black text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-5 h-5" />}
              REFUSER
            </Button>
          </div>
        )}

        {commande.statut !== "paiement_verification" && (
          <p className="text-center text-xs text-gray-400 font-medium pt-1">
            Statut actuel : {commande.statut}
          </p>
        )}
      </div>
    </div>
  );
}