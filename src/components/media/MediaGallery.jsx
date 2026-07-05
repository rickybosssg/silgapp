import React, { useState, useRef, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Play } from "lucide-react";

/**
 * Utilitaires média — partagés entre galerie client et uploader partenaire
 */
export function parsePhotos(item) {
  const photos = [];
  if (item?.photos_urls) {
    try {
      const arr = JSON.parse(item.photos_urls);
      if (Array.isArray(arr)) photos.push(...arr.filter(Boolean));
    } catch (_) {}
  }
  if (item?.photo_url && !photos.includes(item.photo_url)) photos.unshift(item.photo_url);
  return photos;
}

export function getMediaList(item) {
  if (!item) return [];
  const photos = parsePhotos(item);
  const media = photos.map((url) => ({ type: "image", url }));
  if (item.video_url) media.push({ type: "video", url: item.video_url });
  return media;
}

/**
 * MediaGallery — carousel horizontal de photos + vidéo pour la fiche produit/plat côté client.
 * Props: item (objet avec photo_url, photos_urls, video_url), className
 */
export default function MediaGallery({ item, className = "" }) {
  const media = getMediaList(item);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (media.length === 0) return null;

  // Galerie simple : 1 seule photo → affichage direct cliquable
  if (media.length === 1) {
    const m = media[0];
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          className={"relative w-full overflow-hidden rounded-xl bg-gray-50 " + className}
        >
          {m.type === "video" ? (
            <>
              <video src={m.url} className="w-full h-full object-cover" preload="metadata" muted />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="w-8 h-8 text-white fill-white" />
              </div>
            </>
          ) : (
            <img src={m.url} alt={item?.nom || ""} className="w-full h-full object-cover" loading="lazy" />
          )}
        </button>
        {lightboxIndex !== null && (
          <MediaLightbox media={media} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </>
    );
  }

  // Plusieurs médias → carousel horizontal
  return (
    <>
      <div className={"flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide " + className}>
        {media.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="relative flex-shrink-0 w-28 h-28 snap-start rounded-xl overflow-hidden bg-gray-50"
          >
            {m.type === "video" ? (
              <>
                <video src={m.url} className="w-full h-full object-cover" preload="metadata" muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </>
            ) : (
              <img src={m.url} alt={`${item?.nom || ""} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            )}
          </button>
        ))}
      </div>
      {lightboxIndex !== null && (
        <MediaLightbox media={media} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

/**
 * MediaLightbox — visionneuse plein écran avec zoom, navigation et lecture vidéo.
 */
function MediaLightbox({ media, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex || 0);
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);
  const isPanning = useRef(false);

  const current = media[index];

  const goNext = useCallback(() => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setIndex((i) => (i + 1) % media.length);
  }, [media.length]);

  const goPrev = useCallback(() => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setIndex((i) => (i - 1 + media.length) % media.length);
  }, [media.length]);

  const toggleZoom = useCallback(() => {
    if (current?.type !== "image") return;
    setZoomed((z) => !z);
    setPan({ x: 0, y: 0 });
  }, [current]);

  // Navigation clavier (web)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev]);

  // Swipe tactile (non-zoomé)
  const onTouchStart = (e) => {
    if (zoomed) {
      dragStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
      isPanning.current = true;
      return;
    }
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e) => {
    if (!dragStart.current) return;
    if (zoomed && isPanning.current) {
      setPan({
        x: e.touches[0].clientX - dragStart.current.x,
        y: e.touches[0].clientY - dragStart.current.y,
      });
    }
  };

  const onTouchEnd = (e) => {
    if (!dragStart.current) return;
    if (!zoomed) {
      const dx = (e.changedTouches[0]?.clientX || 0) - dragStart.current.x;
      if (Math.abs(dx) > 50) {
        if (dx < 0) goNext();
        else goPrev();
      }
    }
    dragStart.current = null;
    isPanning.current = false;
  };

  const onDoubleClick = (e) => {
    toggleZoom();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white safe-area-top">
        <span className="text-xs font-medium text-white/60">
          {index + 1} / {media.length}
        </span>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Zone média */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
      >
        {current?.type === "video" ? (
          <video
            src={current.url}
            className="max-w-full max-h-full"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={current?.url}
            alt=""
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: zoomed ? `scale(2.5) translate(${pan.x / 2.5}px, ${pan.y / 2.5}px)` : "scale(1)",
              cursor: zoomed ? "grab" : "zoom-in",
            }}
            draggable={false}
          />
        )}

        {/* Boutons zoom (images uniquement) */}
        {current?.type === "image" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            <button
              onClick={toggleZoom}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              aria-label="Zoom"
            >
              {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Flèches navigation */}
        {media.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              aria-label="Précédent"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              aria-label="Suivant"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Indicateurs */}
      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4 safe-area-bottom">
          {media.map((_, i) => (
            <span
              key={i}
              className={"h-1.5 rounded-full transition-all " + (i === index ? "w-6 bg-white" : "w-1.5 bg-white/30")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
