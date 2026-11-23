/**
 * Premium fullscreen media viewer: fade transitions, prev/next, keyboard nav,
 * touch swipe, double-tap-to-zoom, adjacent preloading. Supports images, R2
 * uploaded videos, and YouTube/Vimeo embeds.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { resolveImageSrc } from "@/lib/cdnImage";
import { videoEmbedUrl, type ReviewMediaRow } from "@/lib/reviewsApi";

export interface MediaViewerProps {
  items: ReviewMediaRow[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

const MediaViewer = ({ items, index, open, onClose, onIndexChange }: MediaViewerProps) => {
  const [zoom, setZoom] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const lastTap = useRef<number>(0);

  const go = useCallback((delta: number) => {
    if (!items.length) return;
    const next = (index + delta + items.length) % items.length;
    setZoom(1);
    onIndexChange(next);
  }, [items.length, index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, go]);

  // Preload neighbours
  useEffect(() => {
    if (!open || !items.length) return;
    [-1, 1].forEach((d) => {
      const nb = items[(index + d + items.length) % items.length];
      if (nb?.kind === "image") {
        const src = nb.r2_key ? resolveImageSrc(nb.r2_key, 1600) : nb.url;
        if (src) { const img = new Image(); img.src = src; }
      }
    });
  }, [open, index, items]);

  if (!open || !items.length) return null;
  const item = items[index];
  const embed = item.kind === "video" ? videoEmbedUrl(item) : null;
  const videoSrc = item.kind === "video" && item.provider === "upload"
    ? (item.r2_key ? resolveImageSrc(item.r2_key) : item.url)
    : null;
  const imgSrc = item.kind === "image" ? (item.r2_key ? resolveImageSrc(item.r2_key, 1600) : item.url) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center animate-in fade-in duration-200"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const now = Date.now();
        if (now - lastTap.current < 280) {
          setZoom((z) => (z > 1 ? 1 : 2));
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={onClose}
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 sm:top-5 sm:right-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
      >
        <XIcon className="w-5 h-5" />
      </button>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            aria-label="Previous"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            aria-label="Next"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </>
      )}

      <div className="relative z-[5] w-full h-full flex items-center justify-center p-4 sm:p-10">
        {imgSrc && (
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.2))}
            style={{ transform: `scale(${zoom})`, transition: "transform 220ms ease" }}
            className="max-w-full max-h-full object-contain rounded-[14px] shadow-2xl select-none"
          />
        )}
        {embed && (
          <div className="relative w-full max-w-5xl aspect-video rounded-[14px] overflow-hidden shadow-2xl bg-black">
            <iframe
              src={embed}
              title="Video"
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {videoSrc && !embed && (
          <video
            src={videoSrc}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full rounded-[14px] shadow-2xl bg-black"
          />
        )}
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] tracking-wider tabular-nums">
          {index + 1} / {items.length}
        </div>
      )}
    </div>
  );
};

export default MediaViewer;
