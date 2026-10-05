import { useState, useEffect, useCallback, useRef } from "react";
import { X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

/**
 * PreuveViewer — Viewer plein écran générique pour une image de preuve.
 *
 * - Affiche l'image ENTIERE (object-contain / width-adapted), jamais recadrée.
 * - Capture très longue → conteneur scrollable verticalement (hauteur auto).
 * - Zoom / Dézoom / Reset / Pan-drag tactile + desktop.
 * - Fermeture : X, ESC, clic extérieur.
 * - Ne déclenche AUCUNE action métier (validation/refus gérées par le parent).
 */
export default function PreuveViewer({ imageUrl, onClose, alt = "Preuve" }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const scrollRef = useRef(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.5, 4)), []);
  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const n = Math.max(z - 0.5, 1);
      if (n === 1) setPan({ x: 0, y: 0 });
      return n;
    });
  }, []);
  const handleReset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const handlePointerDown = (e) => {
    if (zoom === 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handlePointerMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handlePointerUp = () => setDragging(false);

  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 shrink-0">
        <p className="text-white font-bold text-sm truncate">Preuve de paiement</p>
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0" aria-label="Fermer">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 relative overflow-auto flex items-start justify-center touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
      >
        <img
          src={imageUrl}
          alt={alt}
          className="select-none pointer-events-none"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: "none",
            height: "auto",
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
          draggable={false}
        />

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1.5">
          <button type="button" onClick={handleZoomOut} disabled={zoom === 1} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center" aria-label="Dézoomer">
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <span className="text-white text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={handleZoomIn} disabled={zoom >= 4} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center" aria-label="Zoomer">
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <button type="button" onClick={handleReset} disabled={zoom === 1} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center" aria-label="Réinitialiser">
            <RotateCw className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}