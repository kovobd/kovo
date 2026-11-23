import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, GripVertical, Video as VideoIcon,
  Star, Eye, Upload, Link2, Film, X, ChevronDown,
} from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import { parseVideoUrl, buildEmbedUrl } from "@/lib/videoUrl";
import { uploadToR2 } from "@/lib/r2Upload";
import { resolveImageSrc } from "@/lib/cdnImage";
import { cn } from "@/lib/utils";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface VideoTestimonial {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  title: string | null;
  subtitle: string | null;
  product_id: string | null;
  cta_text: string | null;
  cta_enabled: boolean;
  enabled: boolean;
  featured: boolean;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  sort_order: number;
}

interface ProductOption { id: string; name: string; slug: string; }

const blank = (): VideoTestimonial => ({
  id: `new-${Math.random().toString(36).slice(2)}`,
  video_url: "",
  thumbnail_url: null,
  title: "",
  subtitle: "",
  product_id: null,
  cta_text: "Shop Now",
  cta_enabled: true,
  enabled: true,
  featured: false,
  autoplay: true,
  muted: true,
  loop: true,
  sort_order: 0,
});

// ──────────────────────────────────────────────────────────────────────
// Shared primitives (mirror CustomerProfile style)
// ──────────────────────────────────────────────────────────────────────

const Kpi = ({
  icon: Icon, label, value,
}: { icon: any; label: string; value: React.ReactNode }) => (
  <div className="bg-background border border-border/60 rounded-[4px] px-2.5 py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon size={11} className="shrink-0 text-muted-foreground/70" />
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 truncate">{label}</span>
    </div>
    <p className="text-base sm:text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/80">{children}</p>
);

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-1">
    <label className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground/80">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
  </div>
);

// ──────────────────────────────────────────────────────────────────────
// Preview thumb
// ──────────────────────────────────────────────────────────────────────

const PreviewThumb: React.FC<{ url: string; thumbnail: string | null }> = ({ url, thumbnail }) => {
  const resolvedUrl = url?.startsWith("r2o:") ? resolveImageSrc(url, 1600) : url;
  const src = parseVideoUrl(resolvedUrl || "");
  if (src.kind === "invalid") {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
        <VideoIcon size={22} />
      </div>
    );
  }
  if (src.kind === "youtube" || src.kind === "vimeo") {
    const poster = thumbnail || (src.kind === "youtube" ? src.thumbnail : null);
    if (poster) {
      return (
        <div className="relative w-full h-full">
          <img src={poster} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white text-[9px] uppercase tracking-wider">
              {src.kind === "youtube" ? "YT" : "Vimeo"}
            </span>
          </span>
        </div>
      );
    }
    const embed = buildEmbedUrl(src, { autoplay: false, muted: true, loop: false, controls: false });
    return embed ? <iframe src={embed} className="w-full h-full border-0" title="preview" /> : null;
  }
  return (
    <video
      src={src.src}
      poster={thumbnail ? (thumbnail.startsWith("r2o:") ? resolveImageSrc(thumbnail, 800) : thumbnail) : undefined}
      muted loop playsInline autoPlay
      className="w-full h-full object-cover"
    />
  );
};

// ──────────────────────────────────────────────────────────────────────
// Video source field — paste URL OR upload to R2
// ──────────────────────────────────────────────────────────────────────

const MAX_BYTES = 30 * 1024 * 1024;
const SUPPORTED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const VideoSourceField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<"url" | "upload">(value?.startsWith("r2o:") ? "upload" : "url");

  const trimmed = (value || "").trim();
  const isR2 = trimmed.startsWith("r2o:");
  const isValidUrl = !trimmed || isR2 || /^https?:\/\/.+/i.test(trimmed);

  const handleFile = async (file: File) => {
    if (!SUPPORTED.has(file.type)) {
      toast({ title: "Unsupported format", description: "Use MP4, WebM, or MOV.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Video too large", description: `Maximum size is ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const ref = await uploadToR2(file, {
        prefix: "video-testimonials",
        mime: file.type,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      onChange(ref);
      toast({ title: "Video uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error)?.message || "Try again", variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Tab switch */}
      <div className="inline-flex rounded-[4px] border border-border/60 p-0.5 bg-muted/30">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={cn(
            "h-7 px-2.5 text-[11px] rounded-[3px] inline-flex items-center gap-1.5 transition",
            mode === "url" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Link2 size={11} /> URL
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={cn(
            "h-7 px-2.5 text-[11px] rounded-[3px] inline-flex items-center gap-1.5 transition",
            mode === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Upload size={11} /> Upload
        </button>
      </div>

      {mode === "url" ? (
        <div className="space-y-1">
          <Input
            value={isR2 ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a YouTube, Vimeo, or direct video URL"
            className={cn(
              "h-9 text-[12.5px] rounded-[4px]",
              !isValidUrl && "border-destructive focus-visible:ring-destructive/30",
            )}
          />
          {isR2 && (
            <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
              <Film size={11} /> Using uploaded video. Switch to “Upload” to manage it.
            </p>
          )}
          {!isValidUrl && <p className="text-[11px] text-destructive">Must start with http:// or https://</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {isR2 ? (
            <div className="flex items-center justify-between gap-2 rounded-[4px] border border-border/60 bg-background px-2.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-7 w-7 rounded-[4px] bg-muted/50 flex items-center justify-center text-muted-foreground">
                  <Film size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] text-foreground truncate">Uploaded to R2</p>
                  <p className="text-[10.5px] text-muted-foreground/70 truncate">{value}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 rounded-[4px] text-[11.5px]"
                  onClick={() => inputRef.current?.click()} disabled={uploading}>
                  <Upload size={12} className="mr-1" /> Replace
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange("")} disabled={uploading}>
                  <X size={13} />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full h-20 rounded-[4px] border border-dashed border-border/70 bg-muted/30 hover:bg-muted/50 transition flex flex-col items-center justify-center gap-1 text-muted-foreground disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-[11.5px]">Uploading… {progress}%</span>
                </>
              ) : (
                <>
                  <Upload size={15} />
                  <span className="text-[11.5px]">Click to upload video</span>
                  <span className="text-[10.5px] text-muted-foreground/60">MP4 · WebM · MOV — up to 30 MB</span>
                </>
              )}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Toggle row
// ──────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className={cn(
    "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[4px] border cursor-pointer transition",
    checked ? "border-border bg-muted/40" : "border-border/60 hover:bg-muted/30",
  )}>
    <span className="text-[12px] text-foreground">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

const VideoTestimonialsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<VideoTestimonial[]>([]);
  const [original, setOriginal] = useState<VideoTestimonial[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dragIdx = useRef<number | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(original);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    (async () => {
      const [vRes, pRes] = await Promise.all([
        supabase.from("video_testimonials").select("*").order("sort_order"),
        supabase.from("products").select("id, name, slug").order("name"),
      ]);
      const data = ((vRes.data as VideoTestimonial[]) || []).map((r, i) => ({ ...r, sort_order: r.sort_order ?? i }));
      setRows(data);
      setOriginal(JSON.parse(JSON.stringify(data)));
      setCollapsed(new Set(data.map((d) => d.id)));
      setProducts((pRes.data as ProductOption[]) || []);
      setLoading(false);
    })();
  }, []);

  const update = (id: string, patch: Partial<VideoTestimonial>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const add = () => setRows((r) => [...r, { ...blank(), sort_order: r.length }]);
  const remove = (id: string) => setRows((r) => r.filter((x) => x.id !== id));

  const move = (from: number, to: number) => {
    if (from === to) return;
    setRows((r) => {
      const next = [...r];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next.map((x, i) => ({ ...x, sort_order: i }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Session expired", description: "Please sign in again to save.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const incomplete = rows.find((r) => !r.video_url);
      if (incomplete) {
        toast({ title: "Each video needs a URL or upload", variant: "destructive" });
        setSaving(false);
        return;
      }

      const originalIds = new Set(original.filter((o) => !o.id.startsWith("new-")).map((o) => o.id));
      const currentIds = new Set(rows.filter((r) => !r.id.startsWith("new-")).map((r) => r.id));
      const toDelete = [...originalIds].filter((id) => !currentIds.has(id));
      if (toDelete.length) {
        const { error: delErr } = await supabase.from("video_testimonials").delete().in("id", toDelete);
        if (delErr) throw delErr;
      }

      for (const r of rows) {
        const payload = {
          video_url: r.video_url,
          thumbnail_url: r.thumbnail_url || null,
          title: r.title || null,
          subtitle: r.subtitle || null,
          product_id: r.product_id || null,
          cta_text: r.cta_text || "Shop Now",
          cta_enabled: r.cta_enabled,
          enabled: r.enabled,
          featured: r.featured,
          autoplay: r.autoplay,
          muted: r.muted,
          loop: r.loop,
          sort_order: r.sort_order,
        };
        const res = r.id.startsWith("new-")
          ? await supabase.from("video_testimonials").insert(payload)
          : await supabase.from("video_testimonials").update(payload).eq("id", r.id);
        if (res.error) throw res.error;
      }

      const { data } = await supabase.from("video_testimonials").select("*").order("sort_order");
      const fresh = ((data as VideoTestimonial[]) || []);
      setRows(fresh);
      setOriginal(JSON.parse(JSON.stringify(fresh)));
      bumpStorefrontVersion();
      qc.invalidateQueries({ queryKey: ["public-home"] });
      toast({ title: "Video testimonials saved" });
    } catch (e: any) {
      const msg = e?.message || "";
      const isAuth = e?.code === "42501" || msg.includes("row-level security") || msg.includes("permission");
      toast({
        title: "Save failed",
        description: isAuth ? "Your admin session may have expired. Please sign out and sign in again." : (msg || "Try again"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={16} /> Loading…
      </div>
    );
  }

  const enabledCount = rows.filter((r) => r.enabled).length;
  const featuredCount = rows.filter((r) => r.featured).length;
  const uploadedCount = rows.filter((r) => r.video_url?.startsWith("r2o:")).length;

  return (
    <div className="space-y-4 pb-10">
      {/* Meta strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi icon={VideoIcon} label="Total" value={rows.length} />
        <Kpi icon={Eye} label="Enabled" value={enabledCount} />
        <Kpi icon={Star} label="Featured" value={featuredCount} />
        <Kpi icon={Film} label="Uploaded" value={uploadedCount} />
      </div>

      <div className="flex items-center justify-between">
        <SectionLabel>Videos</SectionLabel>
        <Button variant="outline" onClick={add} size="sm" className="h-9 px-3 rounded-[4px] text-[12px]">
          <Plus size={13} className="mr-1.5" /> Add video
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-background border border-border/60 rounded-[4px] p-8 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] bg-muted/50 text-muted-foreground mb-2">
            <VideoIcon size={16} />
          </div>
          <p className="text-[13px] text-foreground font-medium">No videos yet</p>
          <p className="text-[12px] text-muted-foreground/80 mt-0.5">Add your first customer video to showcase real experiences.</p>
          <Button onClick={add} size="sm" className="h-9 px-3 mt-3 rounded-[4px] text-[12px]">
            <Plus size={13} className="mr-1.5" /> Add video
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id} className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
              {/* Header bar */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    draggable
                    onDragStart={() => (dragIdx.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIdx.current != null) { move(dragIdx.current, i); dragIdx.current = null; } }}
                    className="text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(r.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <ChevronDown
                      size={13}
                      className={cn("text-muted-foreground/60 transition-transform", collapsed.has(r.id) && "-rotate-90")}
                    />
                    <span className="text-[12.5px] font-medium text-foreground truncate">{r.title || "Untitled video"}</span>
                    {r.featured && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", r.enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                  </button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <Trash2 size={13} />
                </Button>
              </div>

              {/* Body */}
              {!collapsed.has(r.id) && (
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4 p-3 sm:p-4">
                {/* Preview */}
                <div className="aspect-[9/16] max-w-[180px] mx-auto md:mx-0 md:max-w-none rounded-[4px] overflow-hidden bg-muted/40 border border-border/60">
                  <PreviewThumb url={r.video_url} thumbnail={r.thumbnail_url} />
                </div>

                <div className="space-y-3.5 min-w-0">
                  <Field label="Video source" hint="Paste a YouTube/Vimeo link, a direct .mp4/.webm/.mov URL, or upload to R2.">
                    <VideoSourceField value={r.video_url} onChange={(url) => update(r.id, { video_url: url })} />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Title">
                      <Input value={r.title || ""} onChange={(e) => update(r.id, { title: e.target.value })}
                        placeholder="e.g. Loves the everyday carry" className="h-9 rounded-[4px] text-[12.5px]" />
                    </Field>
                    <Field label="Subtitle">
                      <Input value={r.subtitle || ""} onChange={(e) => update(r.id, { subtitle: e.target.value })}
                        placeholder="Optional caption" className="h-9 rounded-[4px] text-[12.5px]" />
                    </Field>
                    <Field label="Linked product">
                      <select
                        value={r.product_id || ""}
                        onChange={(e) => update(r.id, { product_id: e.target.value || null })}
                        className="w-full h-9 rounded-[4px] border border-input bg-background px-2.5 text-[12.5px]"
                      >
                        <option value="">— None —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="CTA text">
                      <Input value={r.cta_text || ""} onChange={(e) => update(r.id, { cta_text: e.target.value })}
                        placeholder="Shop Now" className="h-9 rounded-[4px] text-[12.5px]" />
                    </Field>
                  </div>

                  <Field label="Thumbnail" hint="Shown before the video loads. Defaults to the first frame.">
                    <ImageUpload
                      value={r.thumbnail_url ? [r.thumbnail_url] : []}
                      onChange={(urls) => update(r.id, { thumbnail_url: urls[0] || null })}
                      multiple={false}
                    />
                  </Field>

                  <div className="space-y-1.5">
                    <SectionLabel>Behaviour</SectionLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Toggle label="Enabled" checked={r.enabled} onChange={(v) => update(r.id, { enabled: v })} />
                      <Toggle label="Featured" checked={r.featured} onChange={(v) => update(r.id, { featured: v })} />
                      <Toggle label="Show CTA" checked={r.cta_enabled} onChange={(v) => update(r.id, { cta_enabled: v })} />
                      <Toggle label="Autoplay" checked={r.autoplay} onChange={(v) => update(r.id, { autoplay: v })} />
                      <Toggle label="Muted" checked={r.muted} onChange={(v) => update(r.id, { muted: v })} />
                      <Toggle label="Loop" checked={r.loop} onChange={(v) => update(r.id, { loop: v })} />
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>
          ))}

          {dirty && (
            <div className="sticky bottom-3 z-10 bg-background border border-border/60 rounded-[4px] shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2">
              <span className="text-[12.5px] text-muted-foreground">Unsaved video testimonial changes</span>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-9 px-3 rounded-[4px] text-[12px]"
                  onClick={() => { setRows(JSON.parse(JSON.stringify(original))); }} disabled={saving}>
                  Discard
                </Button>
                <Button size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoTestimonialsManager;
