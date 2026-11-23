import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Crop, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImageCropper, { type CropAspect } from "./ImageCropper";
import { isR2Ref, resolveImageSrc } from "@/lib/cdnImage";
import { loadR2ImageForCrop, uploadToR2, deleteR2Asset, type MediaUsage } from "@/lib/r2Upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_UPLOAD_BYTES = 200 * 1024;
const MAX_UPLOAD_LABEL = "200 KB";
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};
const SUPPORTED_MIMES = new Set(Object.values(MIME_BY_EXTENSION));
const FORMAT_HINT =
  "Recommended: AVIF (best performance) or WebP. JPG/PNG are supported but may result in larger file sizes and slower page loads.";

const getFileExtension = (file: File) => (file.name.split(".").pop() || "jpg").toLowerCase();

const normalizeImageMime = (mime: string | undefined, ext: string) => {
  const normalized = (mime || MIME_BY_EXTENSION[ext] || "image/jpeg").toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
};

const formatUploadBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  multiple?: boolean;
  label?: string;
  hint?: string;
  /**
   * When set, every uploaded image MUST be cropped to this aspect before save.
   * Existing images can be re-cropped via a "Re-crop" button.
   */
  cropAspect?: CropAspect;
}

const ImageUpload = ({ value, onChange, multiple = true, label = "Images", hint, cropAspect }: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Crop queue: when cropAspect is set we crop one file at a time.
  const [cropQueue, setCropQueue] = useState<string[]>([]); // object URLs awaiting crop
  const [cropTotal, setCropTotal] = useState(0);
  const [recropIndex, setRecropIndex] = useState<number | null>(null); // re-crop existing image
  const [recropSrc, setRecropSrc] = useState<string | null>(null);

  // All uploads MUST go through uploadToR2 — the single, enforced entry point.
  const uploadBlob = (blob: Blob, ext: string, onProgress?: (pct: number) => void): Promise<string> => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      return Promise.reject(
        new Error(
          `Image is ${formatUploadBytes(blob.size)} — exceeds the ${MAX_UPLOAD_LABEL} maximum. Please compress the image before uploading.`,
        ),
      );
    }
    return uploadToR2(blob, { prefix: "products", mime: normalizeImageMime(blob.type, ext), onProgress });
  };


  const resetInputs = () => {
    if (inputRef.current) inputRef.current.value = "";
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  };

  const prepareFiles = (files: File[], requireCrop: boolean) => {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const ext = getFileExtension(file);
      const mime = normalizeImageMime(file.type, ext);
      if (!SUPPORTED_MIMES.has(mime)) {
        rejected.push(`${file.name}: unsupported file type`);
        continue;
      }
      if (requireCrop && mime === "image/svg+xml") {
        rejected.push(`${file.name}: SVG cannot be cropped`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(
          `${file.name} is ${formatUploadBytes(file.size)} — exceeds the ${MAX_UPLOAD_LABEL} maximum. Please compress the image before uploading.`,
        );
        continue;
      }
      accepted.push(file);
    }
    if (rejected.length > 0) {
      toast({
        title: `Image exceeds ${MAX_UPLOAD_LABEL} limit`,
        description: rejected.slice(0, 3).join("\n"),
        variant: "destructive",
      });
    }
    return accepted;
  };

  const describeError = (err: any): string => {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const msg = err.message || err.error || err.statusText || "";
    const code = err.statusCode || err.status || err.code;
    if (code === 401 || code === 403 || /unauthor|forbidden|jwt|policy/i.test(msg))
      return "Permission denied — please sign in to the admin panel and try again.";
    if (/r2_not_configured/i.test(msg))
      return "Cloudflare R2 is not configured. Add the R2 Edge Function secrets before uploading.";
    if (/unsupported_mime/i.test(msg))
      return "Unsupported image type. Use AVIF, WebP, JPG, PNG, or SVG.";
    if (/payload|too large|413/i.test(msg))
      return `File too large. Compress the image to under ${MAX_UPLOAD_LABEL} before uploading.`;
    return msg || `Upload failed (${code ?? "unknown"})`;
  };

  const bulkUploadFiles = async (files: File[]) => {
    const acceptedFiles = prepareFiles(files, false);
    if (acceptedFiles.length === 0) {
      resetInputs();
      return;
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: acceptedFiles.length });
    try {
      const newUrls: string[] = [];
      for (let index = 0; index < acceptedFiles.length; index++) {
        const file = acceptedFiles[index];
        setUploadStatus(`Uploading ${index + 1} of ${acceptedFiles.length}: ${file.name}`);
        const ext = getFileExtension(file);
        const ref = await uploadBlob(file, ext, (pct) => {
          setUploadProgress({ done: index + pct, total: acceptedFiles.length });
        });
        newUrls.push(ref);
        setUploadProgress({ done: index + 1, total: acceptedFiles.length });
      }
      onChange(multiple ? [...value, ...newUrls] : newUrls.slice(0, 1));
      toast({ title: `${newUrls.length} image(s) uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: describeError(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadStatus("");
      setUploadProgress(null);
      resetInputs();
    }
  };


  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Crop-required path: queue object URLs and let the cropper handle uploads one-by-one.
    if (cropAspect) {
      const acceptedFiles = prepareFiles(Array.from(files), true);
      if (acceptedFiles.length === 0) {
        resetInputs();
        return;
      }
      cropQueue.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
      const urls = acceptedFiles.map((f) => URL.createObjectURL(f));
      setCropQueue(urls);
      setCropTotal(urls.length);
      setUploadStatus(`${urls.length} image(s) ready to crop`);
      resetInputs();
      return;
    }

    await bulkUploadFiles(Array.from(files));
  };

  const handleBulkSkipCrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await bulkUploadFiles(Array.from(files));
  };

  const handleCropComplete = async (blob: Blob) => {
    setUploading(true);
    setUploadProgress(recropIndex != null ? { done: 0, total: 1 } : { done: Math.max(0, cropTotal - cropQueue.length), total: cropTotal || 1 });
    try {
      // Re-crop of an existing image
      if (recropIndex != null) {
        setUploadStatus("Uploading re-cropped image…");
        const url = await uploadBlob(blob, "jpg", (pct) => setUploadProgress({ done: pct, total: 1 }));
        const next = [...value];
        next[recropIndex] = url;
        onChange(next);
        setUploadProgress({ done: 1, total: 1 });
        toast({ title: "Image re-cropped" });
        setRecropIndex(null);
        setRecropSrc(null);
        return;
      }
      // Queued upload crop
      const current = Math.max(1, (cropTotal || cropQueue.length) - cropQueue.length + 1);
      const total = cropTotal || cropQueue.length || 1;
      const baseDone = current - 1;
      setUploadStatus(`Uploading cropped image ${current} of ${total}…`);
      const url = await uploadBlob(blob, "jpg", (pct) => setUploadProgress({ done: baseDone + pct, total }));
      const remaining = cropQueue.slice(1);
      // Revoke processed object URL
      try { URL.revokeObjectURL(cropQueue[0]); } catch {}
      onChange(multiple ? [...value, url] : [url]);
      setCropQueue(remaining);
      setUploadProgress({ done: current, total });
      if (remaining.length === 0) {
        setCropTotal(0);
        setUploadStatus("");
        toast({ title: "Image uploaded" });
      } else {
        setUploadStatus(`${remaining.length} image(s) waiting to crop`);
      }
    } catch (err: any) {
      console.error("[ImageUpload] crop upload error", err);
      setUploadStatus("Upload failed. Try again.");
      toast({ title: "Upload failed", description: describeError(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const cancelCrop = () => {
    if (recropIndex != null) {
      setRecropIndex(null);
      setRecropSrc(null);
      setUploadStatus("");
      return;
    }
    // Skip current queued image (do not save it). Move to next.
    if (cropQueue.length > 0) {
      try { URL.revokeObjectURL(cropQueue[0]); } catch {}
      const remaining = cropQueue.slice(1);
      setCropQueue(remaining);
      if (remaining.length === 0) {
        setCropTotal(0);
        setUploadStatus("");
      } else {
        setUploadStatus(`${remaining.length} image(s) waiting to crop`);
      }
    }
  };

  const startRecrop = async (i: number) => {
    if (!cropAspect) return;
    try {
      setUploadStatus("Loading image for re-crop…");
      const current = value[i];
      if (isR2Ref(current)) {
        setRecropSrc(await loadR2ImageForCrop(current));
      } else {
        const resolved = resolveImageSrc(current, 1600);
        const res = await fetch(resolved, { mode: "cors" });
        if (!res.ok) throw new Error("Image could not be loaded");
        const blob = await res.blob();
        setRecropSrc(URL.createObjectURL(blob));
      }
      setRecropIndex(i);
      setUploadStatus("");
    } catch {
      setUploadStatus("");
      toast({ title: "Cannot load image for cropping", variant: "destructive" });
    }
  };

  // --- Permanent R2 delete with confirmation + usage check ---
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; ref: string } | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<MediaUsage[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestRemoveImage = (index: number) => {
    const ref = value[index];
    // For non-R2 refs (legacy URLs) just unlink locally.
    if (!isR2Ref(ref)) {
      onChange(value.filter((_, i) => i !== index));
      return;
    }
    setDeleteUsage(null);
    setDeleteTarget({ index, ref });
  };

  const confirmDeleteImage = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // The dialog already confirms a permanent delete. Always force-unlink
      // references first so the first click does not fail with an in-use error.
      const result = await deleteR2Asset(deleteTarget.ref, { force: true });
      if (!result.ok && result.error === "in_use") {
        setDeleteUsage(result.usage || []);
        toast({
          title: "Image is still in use",
          description: "Could not unlink references automatically. Try again.",
          variant: "destructive",
        });
        return;
      }
      if (!result.ok) {
        toast({
          title: "Delete failed",
          description: result.message || "Could not delete the file from storage.",
          variant: "destructive",
        });
        return;
      }
      onChange(value.filter((_, i) => i !== deleteTarget.index));
      toast({ title: "Image deleted from storage" });
      setDeleteTarget(null);
      setDeleteUsage(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };



  const cropperOpen = (cropQueue.length > 0 || recropIndex != null) && !!cropAspect;
  const cropperSrc = recropIndex != null ? recropSrc : cropQueue[0] || null;

  return (
    <div>
      <label className="text-sm font-medium text-foreground mb-1 block">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground mb-1">{hint}</p>}
      <p className="text-[11px] text-muted-foreground/80 mb-2">{FORMAT_HINT}</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          {value.map((url, i) => (
            <div
              key={i}
              className={`relative group rounded-lg overflow-hidden border border-border ${
                cropAspect === "4:5" ? "w-16 h-20" : cropAspect === "16:9" ? "w-28 h-[63px]" : "w-20 h-20"
              }`}
            >
              <img
                src={resolveImageSrc(url, 400)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.endsWith("/placeholder.svg")) img.src = "/placeholder.svg";
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {cropAspect && (
                  <button
                    type="button"
                    onClick={() => startRecrop(i)}
                    className="w-6 h-6 bg-background/90 text-foreground rounded-full flex items-center justify-center hover:bg-background"
                    title="Re-crop"
                  >
                    <Crop size={11} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => requestRemoveImage(i)}
                  className="w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90"
                  title="Remove"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleUpload}
        className="hidden"
      />
      <input
        ref={bulkInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleBulkSkipCrop}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
          {uploading ? "Uploading..." : cropAspect ? "Upload & crop" : "Upload image"}
        </Button>
        {cropAspect && multiple && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => bulkInputRef.current?.click()}
            title="Upload many images at once without cropping"
          >
            <Upload size={14} className="mr-1" />
            Bulk Upload (skip crop)
          </Button>
        )}
        {cropQueue.length > 0 && (
          <span className="text-xs text-muted-foreground">{cropQueue.length} image(s) waiting to crop…</span>
        )}
      </div>
      {(uploading || uploadStatus || uploadProgress) && (
        <div
          className="fixed bottom-4 right-4 z-[120] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card text-card-foreground shadow-xl px-4 py-3 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            {uploading && <Loader2 size={14} className="animate-spin text-foreground" />}
            <span className="truncate">{uploadStatus || "Preparing image upload…"}</span>
            {uploadProgress && (
              <span className="ml-auto tabular-nums text-muted-foreground">
                {Math.round((uploadProgress.done / Math.max(1, uploadProgress.total)) * 100)}% · {uploadProgress.done}/{uploadProgress.total}
              </span>
            )}
          </div>
          {uploadProgress && uploadProgress.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all duration-300"
                style={{ width: `${Math.max(6, Math.round((uploadProgress.done / uploadProgress.total) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {cropAspect && (
        <ImageCropper
          open={cropperOpen}
          aspect={cropAspect}
          imageSrc={cropperSrc}
          onCancel={cancelCrop}
          onCrop={handleCropComplete}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteUsage(null);
          }
        }}
      >
        <AlertDialogContent className="bg-card text-card-foreground border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={16} /> Permanently delete image?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the file from Cloudflare R2 and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteUsage && deleteUsage.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <div className="font-medium mb-1">
                In use by {deleteUsage.length} item{deleteUsage.length === 1 ? "" : "s"}:
              </div>
              <ul className="space-y-0.5 max-h-32 overflow-auto">
                {deleteUsage.slice(0, 10).map((u, idx) => (
                  <li key={idx} className="truncate">
                    • <span className="font-medium">{u.entity}</span>
                    {u.label ? ` — ${u.label}` : ""}
                  </li>
                ))}
                {deleteUsage.length > 10 && <li>…and {deleteUsage.length - 10} more</li>}
              </ul>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteImage();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? <><Loader2 size={14} className="mr-1 animate-spin" /> Deleting…</>
                : (deleteUsage && deleteUsage.length > 0 ? "Delete anyway" : "Delete permanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ImageUpload;
