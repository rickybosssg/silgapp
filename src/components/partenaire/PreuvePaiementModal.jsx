import React, { useEffect, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PreuvePaiementModal({ commande, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState(null);

  const imageUrl = commande?.preuve_paiement_url;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!commande || !imageUrl) return null;

  const clampZoom = (value) => Math.max(1, Math.min(4, value));
  const updateZoom = (delta) => setZoom((current) => clampZoom(Number((current + delta).toFixed(2))));
  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const startDrag = (event) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragStart({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    });
  };

  const moveDrag = (event) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setOffset({
      x: dragStart.originX + event.clientX - dragStart.startX,
      y: dragStart.originY + event.clientY - dragStart.startY,
    });
  };

  const endDrag = (event) => {
    if (dragStart?.pointerId === event.pointerId) setDragStart(null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 p-3 sm:p-6 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-5xl max-h-[96vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-black text-gray-900 text-sm sm:text-base">Preuve de paiement</h2>
            <p className="text-xs text-gray-500 truncate">
              {commande.client_nom || "Client"} · {(commande.total || 0).toLocaleString()} FCFA
              {commande.reference_paiement ? ` · Ref. ${commande.reference_paiement}` : ""}
            </p>
            <p className="text-[11px] text-gray-400">
              {commande.created_date ? new Date(commande.created_date).toLocaleString("fr-FR") : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 bg-gray-950 overflow-hidden flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={imageUrl}
            alt="Preuve de paiement"
            draggable={false}
            className="max-w-full max-h-[70vh] object-contain select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: dragStart ? "none" : "transform 120ms ease",
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-white">
          <div className="text-xs font-bold text-gray-500">Zoom {Math.round(zoom * 100)}%</div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => updateZoom(-0.25)} disabled={zoom <= 1}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={resetView}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => updateZoom(0.25)} disabled={zoom >= 4}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
