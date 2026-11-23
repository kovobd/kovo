/**
 * Centralised R2 uploader. ALL admin uploaders must go through this helper.
 *
 * Flow:
 *   blob → image-upload edge function → Cloudflare R2 → returns "r2:..." or "r2o:..." ref
 *
 * Hard enforcement: any returned value that is not an r2:/r2o: ref is rejected,
 * preventing legacy Supabase Storage URLs from ever being persisted.
 */
import { supabase } from "@/integrations/supabase/client";
import { isR2Ref } from "@/lib/cdnImage";

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export interface R2UploadOptions {
  /** Folder prefix in R2, e.g. "products", "social-icons", "floating-icons". */
  prefix: string;
  /** Override MIME if blob.type is missing. */
  mime?: string;
  /** Granular progress 0..1 (covers base64 read + network upload + server processing). */
  onProgress?: (pct: number) => void;
  /**
   * Also store WebP copies at 400/800/1600 px and return an `r2:` ref, so the
   * storefront serves a size that fits the screen. Use for storefront photos
   * (products, hero, categories…), not for files that must stay JPG/PNG.
   */
  responsive?: boolean;
}

const readFunctionError = async (error: any) => {
  const context = error?.context;
  if (!context || typeof context.json !== "function") return error?.message || "Upload failed";
  try {
    const body = await context.json();
    return body?.error || body?.message || error?.message || "Upload failed";
  } catch {
    try {
      return (await context.text()) || error?.message || "Upload failed";
    } catch {
      return error?.message || "Upload failed";
    }
  }
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const estimateUploadTimeoutMs = (bytes: number) =>
  Math.max(25_000, Math.min(120_000, 15_000 + Math.ceil(bytes / 250_000) * 1_000));

/**
 * Read blob as base64 with progress (0..1 over the read phase).
 */
const blobToBase64WithProgress = (blob: Blob, onProgress?: (pct: number) => void): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (ev) => {
      if (onProgress && ev.lengthComputable) onProgress(ev.loaded / ev.total);
    };
    r.onload = () => {
      onProgress?.(1);
      resolve(String(r.result).split(",")[1] || "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * POST JSON to an edge function via XHR so we get upload.onprogress.
 */
const xhrUploadJson = async (
  path: string,
  payload: any,
  timeoutMs: number,
  onUploadProgress?: (pct: number) => void,
  onUploadComplete?: () => void,
): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON;
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/functions/v1/${path}`);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("apikey", SUPABASE_ANON);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (onUploadProgress && ev.lengthComputable) onUploadProgress(ev.loaded / ev.total);
    };
    xhr.upload.onload = () => onUploadComplete?.();
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.ontimeout = () => reject(new Error("Upload timed out while finalizing. Please try again with a smaller optimized file."));
    xhr.onload = () => {
      let parsed: any = null;
      try { parsed = JSON.parse(xhr.responseText || "null"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed);
      } else {
        const msg = parsed?.error || parsed?.message || `Upload failed (${xhr.status})`;
        const error = new Error(msg) as Error & { status?: number };
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.send(body);
  });
};

const postFunctionJson = async (path: string, payload: any, timeoutMs: number): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let parsed: any = null;
    try { parsed = await res.json(); } catch {}
    if (!res.ok) throw new Error(parsed?.error || parsed?.message || `Upload failed (${res.status})`);
    return parsed;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Upload timed out while finalizing. Please try again with a smaller optimized file.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};


// ── Responsive copies, made in the admin's browser ─────────────────────────
// The storefront renders `r2:` refs as WebP at 400/800/1600 px (CdnImage), so
// a phone downloads a few dozen KB instead of the full original. Encoding
// happens here because the edge function's CPU limit is too small for it.
const VARIANT_WIDTHS = [400, 800, 1600] as const;
const RESIZABLE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function encodeWebp(bitmap: ImageBitmap, width: number): Promise<Blob | null> {
  const w = Math.min(width, bitmap.width);
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  // Browsers without a WebP encoder silently return PNG: treat as unsupported.
  return blob && blob.type === "image/webp" ? blob : null;
}

/** WebP copies at each storefront width, or null if this browser cannot make them. */
async function makeVariants(blob: Blob, mime: string): Promise<{ name: string; mime: string; data: string }[] | null> {
  if (!RESIZABLE_MIMES.has(mime) || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const out: { name: string; mime: string; data: string }[] = [];
      for (const w of VARIANT_WIDTHS) {
        const webp = await encodeWebp(bitmap, w);
        if (!webp) return null;
        out.push({ name: `${w}.webp`, mime: "image/webp", data: await blobToBase64(webp) });
      }
      return out;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Upload a blob/file to Cloudflare R2 via the image-upload edge function.
 * Returns an `r2:...` (variant) or `r2o:...` (SVG / passthrough) reference.
 * Throws if the response is not a valid R2 ref.
 */
export async function uploadToR2(blob: Blob, opts: R2UploadOptions): Promise<string> {
  const mime = (opts.mime || blob.type || "image/jpeg").toLowerCase();
  const timeoutMs = estimateUploadTimeoutMs(blob.size);
  // Phase weights: read 25%, upload 60%, server processing 15% (eased 85→99 until response)
  const report = (phase: "read" | "upload" | "processing" | "done", localPct: number) => {
    if (!opts.onProgress) return;
    if (phase === "read") opts.onProgress(Math.min(0.25, localPct * 0.25));
    else if (phase === "upload") opts.onProgress(0.25 + Math.min(0.6, localPct * 0.6));
    else if (phase === "processing") opts.onProgress(0.85 + Math.min(0.13, localPct * 0.13));
    else opts.onProgress(1);
  };

  const [data, variants] = await Promise.all([
    blobToBase64WithProgress(blob, (p) => report("read", p)),
    opts.responsive ? makeVariants(blob, mime) : Promise.resolve(null),
  ]);
  const payload = variants ? { prefix: opts.prefix, mime, data, variants } : { prefix: opts.prefix, mime, data };

  // Kick off a processing easer that starts once upload bytes finish and runs
  // until the server responds (variant encoding + R2 uploads take real time).
  let processingTimer: number | null = null;
  let processingStart = 0;
  const startProcessing = () => {
    if (processingTimer != null) return;
    processingStart = Date.now();
    // Estimate ~4s for a typical multi-variant encode; scale a bit with file size.
    const estimatedMs = Math.max(3000, Math.min(20000, 3000 + Math.round(blob.size / 200_000) * 400));
    processingTimer = window.setInterval(() => {
      const elapsed = Date.now() - processingStart;
      const t = Math.min(1, elapsed / estimatedMs);
      // ease-out toward 1.0 (mapped to 85→99 by report)
      const eased = 1 - Math.pow(1 - t, 2);
      report("processing", eased);
    }, 150);
  };
  const stopProcessing = () => {
    if (processingTimer != null) {
      window.clearInterval(processingTimer);
      processingTimer = null;
    }
  };

  try {
    const res = await xhrUploadJson(
      "image-upload",
      payload,
      timeoutMs,
      (p) => {
        report("upload", p);
        if (p >= 0.999) startProcessing();
      },
      startProcessing,
    );
    stopProcessing();
    report("done", 1);
    const ref = res?.ref as string | undefined;
    if (!ref || !isR2Ref(ref)) {
      throw new Error("Upload rejected: result is not a Cloudflare R2 reference");
    }
    return ref;
  } catch (err: any) {
    stopProcessing();
    if (err?.status || /timed out|aborted/i.test(err?.message || "")) {
      throw err;
    }
    // Fallback to supabase.functions.invoke (fetch — no real upload progress).
    // Synthesize smooth progress easing toward 90% over the estimated upload window,
    // then snap to 100% on response. Estimated 1.5 MB/s as a conservative baseline.
    const estimatedMs = Math.max(600, Math.min(20000, Math.round((blob.size / (1.5 * 1024 * 1024)) * 1000)));
    let synthetic = 0;
    let cancelled = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const elapsed = Date.now() - started;
      // ease-out toward 0.9 over estimatedMs
      const t = Math.min(1, elapsed / estimatedMs);
      synthetic = 0.9 * (1 - Math.pow(1 - t, 2));
      report("upload", synthetic);
    }, 120);
    try {
      const res = await postFunctionJson("image-upload", payload, timeoutMs);
      const ref = (res as any)?.ref as string | undefined;
      if (!ref || !isR2Ref(ref)) {
        throw new Error("Upload rejected: result is not a Cloudflare R2 reference");
      }
      report("done", 1);
      return ref;
    } finally {
      cancelled = true;
      window.clearInterval(timer);
    }
  }
}


/**
 * Load an existing R2 image for canvas-safe re-cropping. Straight from R2 via
 * the site's own /__r2/ path (worker/index.ts), so the pixels are same-origin;
 * through the admin edge function only where that path doesn't exist (e.g. the
 * Vite dev server or a preview domain without the Worker).
 */
export async function loadR2ImageForCrop(ref: string): Promise<string> {
  if (!isR2Ref(ref)) throw new Error("Image is not a Cloudflare R2 reference");
  const objectKey = ref.startsWith("r2o:") ? ref.slice(4) : `${ref.slice(3)}-original.jpg`;
  try {
    const direct = await fetch(`/__r2/${objectKey}`);
    const type = direct.headers.get("Content-Type") || "";
    if (direct.ok && type.startsWith("image/")) return URL.createObjectURL(await direct.blob());
  } catch {
    /* fall back to the edge function */
  }
  const { data: res, error } = await supabase.functions.invoke("image-upload", {
    body: { action: "read", ref },
  });
  if (error) throw new Error(await readFunctionError(error));
  const dataUrl = (res as any)?.dataUrl as string | undefined;
  if (!dataUrl?.startsWith("data:image/")) throw new Error("Image could not be loaded for cropping");
  return dataUrl;
}

/** Hard guard: throw if a value is anything other than an r2:/r2o: ref. */
export function assertR2Ref(value: string, field = "image"): void {
  if (!isR2Ref(value)) {
    const preview = typeof value === "string" ? (value as string).slice(0, 60) : String(value);
    throw new Error(
      `Refusing to save ${field}: only Cloudflare R2 references are allowed (got "${preview}…").`,
    );
  }
}

export interface MediaUsage {
  entity: string;
  id: string;
  label?: string;
  column?: string;
}

/** Look up which entities still reference an R2 asset. */
export async function findR2Usage(ref: string): Promise<MediaUsage[]> {
  if (!isR2Ref(ref)) return [];
  const { data, error } = await supabase.functions.invoke("image-upload", {
    body: { action: "usage", ref },
  });
  if (error) throw new Error(await readFunctionError(error));
  return ((data as any)?.usage as MediaUsage[]) || [];
}

export interface R2DeleteResult {
  ok: boolean;
  usage?: MediaUsage[];
  objectKey?: string;
  unlinked?: Record<string, number> | null;
  error?: string;
  message?: string;
}

/**
 * Delete an R2 asset. If `force` is false (default), the server blocks deletion
 * when the asset is still referenced and returns the usage list.
 */
export async function deleteR2Asset(ref: string, opts: { force?: boolean } = {}): Promise<R2DeleteResult> {
  if (!isR2Ref(ref)) return { ok: true };
  const { data, error } = await supabase.functions.invoke("image-upload", {
    body: { action: "delete", ref, force: !!opts.force },
  });
  if (error) {
    // Try to surface the structured 409 (in_use) body
    const ctx: any = (error as any)?.context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error === "in_use") {
          return { ok: false, error: "in_use", message: body.message, usage: body.usage || [] };
        }
        return { ok: false, error: body?.error || "delete_failed", message: body?.message || (error as any)?.message };
      } catch { /* fall through */ }
    }
    return { ok: false, error: "delete_failed", message: (error as any)?.message || "Delete failed" };
  }
  return {
    ok: !!(data as any)?.ok,
    objectKey: (data as any)?.objectKey,
    unlinked: (data as any)?.unlinked ?? null,
  };
}

