import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export type CropAspect = "4:5" | "16:9" | "1:1";

interface Props {
  open: boolean;
  imageSrc: string | null;
  aspect: CropAspect;
  onCancel: () => void;
  onCrop: (blob: Blob) => void | Promise<void>;
  /** Output longest-edge in px. Defaults match the recommended sizes per aspect. */
  outputMaxEdge?: number;
}

const ASPECT_RATIO: Record<CropAspect, number> = {
  "4:5": 4 / 5,
  "16:9": 16 / 9,
  "1:1": 1,
};

const DEFAULT_OUT: Record<CropAspect, { w: number; h: number }> = {
  "4:5": { w: 2000, h: 2500 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1600, h: 1600 },
};

const HINT: Record<CropAspect, string> = {
  "4:5": "Output 2000 × 2500 · 4:5 (portrait)",
  "16:9": "Output 1920 × 1080 · 16:9 (landscape)",
  "1:1": "Output 1600 × 1600 · 1:1 (square)",
};

const MAX_OUTPUT_BYTES = 200 * 1024;

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob failed"))), "image/jpeg", quality),
  );

// Deterministically produce a JPEG ≤ 200 KB by progressively dropping quality
// and, if needed, dimensions. Same input always converges to the same output
// so users never see intermittent "too large" failures after cropping.
const getCroppedBlob = async (src: string, area: Area, out: { w: number; h: number }): Promise<Blob> => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  const QUALITY_STEPS = [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4];
  const SCALE_STEPS = [1, 0.85, 0.72, 0.6, 0.5];

  let best: Blob | null = null;
  for (const scale of SCALE_STEPS) {
    const w = Math.max(320, Math.round(out.w * scale));
    const h = Math.max(320, Math.round(out.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
    for (const q of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, q);
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
      // Track the smallest blob we've seen so far as a fallback.
      if (!best || blob.size < best.size) best = blob;
    }
  }
  // Hard guarantee: never return a blob larger than the limit. If even the
  // most aggressive compression couldn't reach 200 KB (extremely rare), fail
  // loudly so the caller surfaces a clear error.
  if (best && best.size <= MAX_OUTPUT_BYTES) return best;
  throw new Error(
    `Image could not be compressed under 200 KB (smallest: ${
      best ? Math.round(best.size / 1024) : "?"
    } KB). Please use a smaller source image.`,
  );
};

const ImageCropper = ({ open, imageSrc, aspect, onCancel, onCrop, outputMaxEdge }: Props) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Cropping…");

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const handleSave = async () => {
    if (!imageSrc || !area) return;
    setBusy(true);
    setBusyLabel("Cropping…");
    try {
      const out = outputMaxEdge
        ? aspect === "4:5"
          ? { w: outputMaxEdge, h: Math.round(outputMaxEdge * 1.25) }
          : aspect === "16:9"
          ? { w: outputMaxEdge, h: Math.round(outputMaxEdge * 9 / 16) }
          : { w: outputMaxEdge, h: outputMaxEdge }
        : DEFAULT_OUT[aspect];
      const blob = await getCroppedBlob(imageSrc, area, out);
      setBusyLabel("Uploading…");
      await onCrop(blob);
    } finally {
      setBusy(false);
      setBusyLabel("Cropping…");
    }
  };

  const reset = () => { setCrop({ x: 0, y: 0 }); setZoom(1); };

  // Frame height for the cropper canvas — keep it visually balanced per aspect
  const frameClass =
    aspect === "4:5" ? "aspect-[4/5] max-h-[60vh] mx-auto"
    : aspect === "16:9" ? "aspect-[16/9]"
    : "aspect-square max-h-[60vh] mx-auto";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent
        overlayClassName="admin-shell !bg-foreground/20 backdrop-blur-[2px]"
        className="admin-shell max-w-[min(720px,calc(100vw-2rem))] gap-5 rounded-[14px] border-0 bg-card p-6 text-card-foreground shadow-[var(--a-shadow-pop)] sm:rounded-[14px]"
      >
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="a-h2 text-card-foreground">Crop image · {aspect}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={`relative w-full overflow-hidden rounded-[12px] bg-muted shadow-[inset_0_0_0_1px_hsl(var(--border))] ${frameClass}`}>
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT_RATIO[aspect]}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onComplete}
                restrictPosition
              />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="a-label">Zoom</span>
              <button type="button" onClick={reset} className="a-btn a-btn-ghost a-btn-sm h-7 px-2">Reset</button>
            </div>
            <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <p className="a-caption">{HINT[aspect]} · Drag to position.</p>
          {busy && (
            <div className="flex items-center gap-2 rounded-[10px] bg-muted px-3 py-2 text-xs text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]" role="status" aria-live="polite">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
              <span>{busyLabel}</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" className="a-btn a-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="button" className="a-btn a-btn-primary" onClick={handleSave} disabled={busy || !area}>{busy ? busyLabel : "Crop & Use"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropper;