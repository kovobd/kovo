/**
 * Admin Review Management.
 *
 * - List view with filter tabs (All / Photo / Video / Text)
 * - Drag-and-drop reordering (dnd-kit), inline visibility toggle
 * - Add / Edit / Delete / Duplicate
 * - Editor dialog handles text, photo (multi-image R2 upload + reorder + remove)
 *   and video (R2 upload OR YouTube/Vimeo URL with auto thumbnail detection)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, GripVertical, Copy, Eye, EyeOff, Pencil, Save, X,
  Image as ImageLucide, Video as VideoLucide, Type as TypeLucide,
  Upload, Loader2, Star,
} from "lucide-react";
import { resolveImageSrc } from "@/lib/cdnImage";
import { uploadToR2, deleteR2Asset } from "@/lib/r2Upload";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseExternalVideo, type ReviewMediaRow, type ReviewType, type ReviewVideoProvider, type SiteReviewRow } from "@/lib/reviewsApi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReviewHeroEditor from "@/components/admin/ReviewHeroEditor";


type Filter = "all" | "photo" | "video" | "text";

const FILTERS: { id: Filter; label: string; Icon: any }[] = [
  { id: "all", label: "All", Icon: Star },
  { id: "photo", label: "Photo", Icon: ImageLucide },
  { id: "video", label: "Video", Icon: VideoLucide },
  { id: "text", label: "Text", Icon: TypeLucide },
];

const emptyReview = (): Partial<SiteReviewRow> => ({
  reviewer_name: "",
  location: "",
  review_date: new Date().toISOString().slice(0, 10),
  title: "",
  body: "",
  rating: 5,
  is_verified_purchase: false,
  is_visible: true,
  review_type: "text",
  sort_order: 0,
});

const StarRow = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="inline-flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((i) => (
      <button
        key={i}
        type="button"
        onClick={() => onChange(i)}
        className="p-0.5"
        aria-label={`${i} star${i > 1 ? "s" : ""}`}
      >
        <Star
          size={18}
          className={i <= value ? "fill-amber-400 text-amber-400" : "fill-transparent text-foreground/30"}
        />
      </button>
    ))}
  </div>
);

/* -------------------- Sortable Row -------------------- */

const SortableRow = ({
  r, onEdit, onDelete, onDuplicate, onToggleVisible,
}: {
  r: SiteReviewRow;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleVisible: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const primary = r.media?.[0];
  const thumb = primary
    ? (primary.thumbnail_url || (primary.r2_key ? resolveImageSrc(primary.r2_key, 400) : primary.url))
    : null;
  const TypeIcon = r.review_type === "photo" ? ImageLucide : r.review_type === "video" ? VideoLucide : TypeLucide;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background border border-border/60 rounded-[4px] p-2.5 flex items-center gap-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
        aria-label="Drag"
      >
        <GripVertical size={14} />
      </button>

      <div className="w-12 h-12 rounded-[4px] overflow-hidden bg-muted border border-border/60 flex-shrink-0 flex items-center justify-center text-muted-foreground">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <TypeIcon size={16} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground truncate">{r.reviewer_name}</span>
          <span className="inline-flex items-center gap-0.5 text-amber-500 text-[11px] tabular-nums">
            {r.rating}★
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
            <TypeIcon size={10} /> {r.review_type}
          </span>
          {r.is_verified_purchase && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] uppercase tracking-wider">Verified</span>
          )}
        </div>
        <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
          {r.title || r.body || r.location || "—"}
        </div>
      </div>

      <Switch checked={r.is_visible} onCheckedChange={onToggleVisible} />
      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-[4px]" onClick={onEdit} aria-label="Edit">
        <Pencil size={13} />
      </Button>
      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-[4px]" onClick={onDuplicate} aria-label="Duplicate">
        <Copy size={13} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 rounded-[4px] text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
};

/* -------------------- Editor dialog -------------------- */

interface DraftMedia {
  // Either persisted (id present) or pending (id absent, ref filled)
  id?: string;
  kind: "image" | "video";
  provider?: ReviewVideoProvider;
  external_video_id?: string | null;
  r2_key?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  file_size?: number | null;
  sort_order: number;
  // upload state
  uploading?: boolean;
  progress?: number;
  error?: string;
  // mark for deletion on save (existing only)
  removed?: boolean;
}

const measureImage = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ReviewEditor = ({
  open, onOpenChange, value, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: SiteReviewRow | null;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<SiteReviewRow>>(value ?? emptyReview());
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [typeOverride, setTypeOverride] = useState<ReviewType | null>(null);
  const [saving, setSaving] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setForm(value ?? emptyReview());
    const initialMedia = (value?.media ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      provider: m.provider ?? undefined,
      external_video_id: m.external_video_id,
      r2_key: m.r2_key,
      url: m.url,
      thumbnail_url: m.thumbnail_url,
      width: m.width,
      height: m.height,
      file_size: m.file_size,
      sort_order: m.sort_order,
    }));
    setMedia(initialMedia);
    // Seed override only when existing review_type diverges from what auto-detect would produce
    const autoFromMedia: ReviewType =
      initialMedia.some((m) => m.kind === "image") ? "photo"
      : initialMedia.some((m) => m.kind === "video") ? "video"
      : "text";
    setTypeOverride(value?.review_type && value.review_type !== autoFromMedia ? value.review_type : null);
    setVideoUrlInput("");
  }, [value, open]);


  const update = (patch: Partial<SiteReviewRow>) => setForm((f) => ({ ...f, ...patch }));

  const hasMedia = () => media.some((m) => !m.removed);

  const addImages = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (arr.length > 1) {
      toast({ title: "Only one media allowed", description: "A review can have just one image or video.", variant: "destructive" });
      return;
    }
    if (hasMedia()) {
      toast({ title: "Media already added", description: "Remove the existing one first to replace it.", variant: "destructive" });
      return;
    }
    const file = arr[0];
    const draftIndex = media.length;
    setMedia((prev) => [...prev, { kind: "image", sort_order: 0, uploading: true, progress: 0 }]);
    try {
      const dims = await measureImage(file).catch(() => ({ width: 0, height: 0 }));
      const ref = await uploadToR2(file, {
        prefix: "site-reviews",
        mime: file.type,
        onProgress: (p) =>
          setMedia((prev) => prev.map((m, idx) => idx === draftIndex ? { ...m, progress: p } : m)),
      });
      setMedia((prev) => prev.map((m, idx) =>
        idx === draftIndex
          ? { ...m, uploading: false, progress: 1, r2_key: ref, width: dims.width, height: dims.height, file_size: file.size }
          : m
      ));
    } catch (e: any) {
      setMedia((prev) => prev.map((m, idx) =>
        idx === draftIndex ? { ...m, uploading: false, error: e?.message || "Upload failed" } : m
      ));
      toast({ title: "Upload failed", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const uploadVideoFile = async (file: File) => {
    if (hasMedia()) {
      toast({ title: "Media already added", description: "Remove the existing one first to replace it.", variant: "destructive" });
      return;
    }
    const idx = media.length;
    setMedia((prev) => [...prev, { kind: "video", provider: "upload", sort_order: 0, uploading: true, progress: 0 }]);
    try {
      const ref = await uploadToR2(file, {
        prefix: "site-reviews",
        mime: file.type,
        onProgress: (p) => setMedia((prev) => prev.map((m, i) => i === idx ? { ...m, progress: p } : m)),
      });
      setMedia((prev) => prev.map((m, i) =>
        i === idx ? { ...m, uploading: false, progress: 1, r2_key: ref, file_size: file.size } : m
      ));
    } catch (e: any) {
      setMedia((prev) => prev.map((m, i) => i === idx ? { ...m, uploading: false, error: e?.message } : m));
      toast({ title: "Video upload failed", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const addExternalVideo = () => {
    if (hasMedia()) {
      toast({ title: "Media already added", description: "Remove the existing one first to replace it.", variant: "destructive" });
      return;
    }
    const parsed = parseExternalVideo(videoUrlInput);
    if (!parsed) {
      toast({ title: "Unsupported URL", description: "Paste a YouTube or Vimeo link.", variant: "destructive" });
      return;
    }
    setMedia((prev) => [...prev, {
      kind: "video",
      provider: parsed.provider,
      external_video_id: parsed.id,
      thumbnail_url: parsed.thumbnail,
      url: videoUrlInput.trim(),
      sort_order: 0,
    }]);
    setVideoUrlInput("");
  };


  const removeMedia = (idx: number) => {
    setMedia((prev) => {
      const m = prev[idx];
      if (m.id) {
        // mark removal, will delete on save
        return prev.map((x, i) => i === idx ? { ...x, removed: true } : x);
      }
      // pending: drop and best-effort R2 cleanup
      if (m.r2_key) deleteR2Asset(m.r2_key, { force: true }).catch(() => {});
      return prev.filter((_, i) => i !== idx);
    });
  };

  const moveMedia = (idx: number, dir: -1 | 1) => {
    setMedia((prev) => {
      const arr = prev.filter((m) => !m.removed);
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      const reordered = arrayMove(arr, idx, j).map((m, i) => ({ ...m, sort_order: i }));
      // Re-merge removed entries at the end
      const removed = prev.filter((m) => m.removed);
      return [...reordered, ...removed];
    });
  };

  const visibleMedia = media.filter((m) => !m.removed);
  const detectedType: ReviewType =
    visibleMedia.some((m) => m.kind === "image") ? "photo"
    : visibleMedia.some((m) => m.kind === "video") ? "video"
    : "text";
  const reviewType: ReviewType = typeOverride ?? detectedType;


  const save = async () => {
    if (!form.reviewer_name?.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (visibleMedia.some((m) => m.uploading)) {
      toast({ title: "Uploads still in progress", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Compute next sort_order for new reviews
      let savedId = form.id as string | undefined;

      const payload: any = {
        reviewer_name: form.reviewer_name.trim(),
        location: form.location?.trim() || null,
        review_date: form.review_date || new Date().toISOString().slice(0, 10),
        title: form.title?.trim() || null,
        body: form.body?.trim() || null,
        rating: Math.max(1, Math.min(5, Number(form.rating) || 5)),
        is_verified_purchase: !!form.is_verified_purchase,
        is_visible: form.is_visible !== false,
        review_type: reviewType,
      };

      if (!savedId) {
        const { count } = await supabase
          .from("site_reviews" as any)
          .select("id", { count: "exact", head: true });
        payload.sort_order = (count ?? 0);
        const { data, error } = await (supabase.from("site_reviews" as any) as any)
          .insert(payload).select("id").single();
        if (error) throw error;
        savedId = data.id;
      } else {
        const { error } = await (supabase.from("site_reviews" as any) as any)
          .update(payload).eq("id", savedId);
        if (error) throw error;
      }

      // Persist media changes
      const toDelete = media.filter((m) => m.removed && m.id);
      if (toDelete.length) {
        await (supabase.from("site_review_media" as any) as any)
          .delete().in("id", toDelete.map((m) => m.id));
        toDelete.forEach((m) => {
          if (m.r2_key) deleteR2Asset(m.r2_key, { force: true }).catch(() => {});
        });
      }

      const live = media.filter((m) => !m.removed);
      // Upsert each: insert new, update existing sort_order
      for (let i = 0; i < live.length; i++) {
        const m = live[i];
        const row = {
          review_id: savedId,
          kind: m.kind,
          provider: m.provider ?? null,
          external_video_id: m.external_video_id ?? null,
          r2_key: m.r2_key ?? null,
          url: m.url ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
          width: m.width ?? null,
          height: m.height ?? null,
          file_size: m.file_size ?? null,
          sort_order: i,
        };
        if (m.id) {
          await (supabase.from("site_review_media" as any) as any).update({ sort_order: i }).eq("id", m.id);
        } else {
          await (supabase.from("site_review_media" as any) as any).insert(row);
        }
      }

      toast({ title: "Review saved" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Review" : "Add Review"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Reviewer Name *</label>
              <Input value={form.reviewer_name ?? ""} onChange={(e) => update({ reviewer_name: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Location</label>
              <Input value={form.location ?? ""} onChange={(e) => update({ location: e.target.value })} className="h-9 mt-1 rounded-[4px]" placeholder="Dhaka, BD" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Date</label>
              <Input type="date" value={form.review_date ?? ""} onChange={(e) => update({ review_date: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Rating</label>
              <div className="h-9 mt-1 flex items-center"><StarRow value={form.rating ?? 5} onChange={(v) => update({ rating: v })} /></div>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Title (optional)</label>
            <Input value={form.title ?? ""} onChange={(e) => update({ title: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Review Text</label>
            <Textarea value={form.body ?? ""} onChange={(e) => update({ body: e.target.value })} rows={3} className="mt-1 rounded-[4px]" />
          </div>

          <label className="flex items-center gap-2 text-[12.5px]">
            <Switch checked={!!form.is_verified_purchase} onCheckedChange={(v) => update({ is_verified_purchase: v })} />
            Verified Purchase
          </label>

          {/* Media — one image OR one video per review */}
          <div className="border-t border-border/60 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">Media</div>
              <div className="text-[10.5px] text-muted-foreground">1 image OR 1 video</div>
            </div>

            <input ref={imgInputRef} type="file" accept="image/*" hidden
              onChange={(e) => { if (e.target.files) addImages(e.target.files); e.currentTarget.value = ""; }} />
            <input ref={videoInputRef} type="file" accept="video/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideoFile(f); e.currentTarget.value = ""; }} />

            {visibleMedia.length === 0 ? (
              <>
                <div className="flex gap-2 mb-3">
                  <Button type="button" variant="outline" size="sm" className="rounded-[4px] flex-1" onClick={() => imgInputRef.current?.click()}>
                    <ImageLucide size={13} className="mr-1.5" /> Upload Image
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-[4px] flex-1" onClick={() => videoInputRef.current?.click()}>
                    <VideoLucide size={13} className="mr-1.5" /> Upload Video
                  </Button>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="…or paste YouTube / Vimeo URL"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    className="h-9 rounded-[4px] flex-1"
                  />
                  <Button type="button" variant="secondary" size="sm" className="rounded-[4px] h-9" onClick={addExternalVideo}>Add</Button>
                </div>
                <div className="text-[11.5px] text-muted-foreground border border-dashed border-border/60 rounded-[4px] p-3 text-center">
                  No media — this will be saved as a text review.
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {visibleMedia.slice(0, 1).map((m, idx) => {
                  const src = m.kind === "image"
                    ? (m.r2_key ? resolveImageSrc(m.r2_key, 800) : m.url)
                    : (m.thumbnail_url || (m.r2_key ? resolveImageSrc(m.r2_key, 800) : null));
                  return (
                    <div key={(m.id ?? "new-") + idx} className="relative w-full max-w-xs aspect-square rounded-[4px] overflow-hidden border border-border/60 bg-muted">
                      {src ? (
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><VideoLucide size={20} /></div>
                      )}
                      {m.kind === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center text-[12px]">▶</span>
                        </div>
                      )}
                      {m.uploading && (
                        <div className="absolute inset-0 bg-background/85 flex flex-col items-center justify-center gap-1">
                          <Loader2 className="animate-spin" size={18} />
                          <div className="text-[10px] tabular-nums">{Math.round((m.progress ?? 0) * 100)}%</div>
                        </div>
                      )}
                      {m.error && (
                        <div className="absolute inset-0 bg-destructive/90 text-destructive-foreground text-[10px] flex items-center justify-center p-1 text-center">
                          {m.error}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-[4px]"
                    onClick={() => {
                      const m = visibleMedia[0];
                      const realIdx = media.findIndex((x) => !x.removed);
                      if (realIdx >= 0) removeMedia(realIdx);
                      setTimeout(() => {
                        if (m.kind === "image") imgInputRef.current?.click();
                        else videoInputRef.current?.click();
                      }, 0);
                    }}>
                    <Upload size={13} className="mr-1.5" /> Replace
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-[4px] text-destructive hover:text-destructive"
                    onClick={() => {
                      const realIdx = media.findIndex((m) => !m.removed);
                      if (realIdx >= 0) removeMedia(realIdx);
                    }}>
                    <Trash2 size={13} className="mr-1.5" /> Remove
                  </Button>
                </div>

              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">Review Type</div>
                <div className="text-[10.5px] text-muted-foreground">
                  Auto-detected: <span className="text-foreground font-medium uppercase">{detectedType}</span>
                </div>
              </div>
              <div className="inline-flex items-center p-0.5 rounded-[4px] border border-border/60 bg-muted/40 w-full sm:w-auto">
                {([
                  { id: null, label: "Auto" },
                  { id: "photo" as const, label: "Photo" },
                  { id: "video" as const, label: "Video" },
                  { id: "text" as const, label: "Text" },
                ]).map((opt) => {
                  const active = typeOverride === opt.id;
                  return (
                    <button
                      key={String(opt.id)}
                      type="button"
                      onClick={() => setTypeOverride(opt.id)}
                      className={`flex-1 sm:flex-none px-3 h-7 rounded-[3px] text-[11.5px] font-medium transition ${
                        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                {typeOverride
                  ? <>Manually set to <span className="uppercase font-medium text-foreground">{typeOverride}</span>. Saved as-is.</>
                  : <>Effective type: <span className="uppercase font-medium text-foreground">{reviewType}</span> — follows attached media.</>}
              </p>
            </div>
          </div>

        </div>


        <DialogFooter>
          <Button variant="outline" className="rounded-[4px]" onClick={() => onOpenChange(false)} disabled={saving}>
            <X size={14} className="mr-1" /> Cancel
          </Button>
          <Button className="rounded-[4px]" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Save Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* -------------------- Manager -------------------- */

const ReviewsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SiteReviewRow | null>(null);

  const { data: reviews = [], refetch, isLoading } = useQuery({
    queryKey: ["admin-site-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_reviews" as any)
        .select("*, media:site_review_media(*)")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data as unknown as SiteReviewRow[]) ?? [];
      rows.forEach((r) => r.media?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      return rows;
    },
  });

  const filtered = useMemo(() => {
    if (filter === "all") return reviews;
    return reviews.filter((r) => r.review_type === filter);
  }, [reviews, filter]);

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["site-reviews"] });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = filtered.findIndex((r) => r.id === active.id);
    const newI = filtered.findIndex((r) => r.id === over.id);
    if (oldI < 0 || newI < 0) return;
    const reordered = arrayMove(filtered, oldI, newI);
    // Persist sort_order in batches
    try {
      await Promise.all(reordered.map((r, i) =>
        (supabase.from("site_reviews" as any) as any).update({ sort_order: i }).eq("id", r.id)
      ));
      refresh();
    } catch (err: any) {
      toast({ title: "Reorder failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleDelete = async (r: SiteReviewRow) => {
    if (!confirm(`Delete review by ${r.reviewer_name}?`)) return;
    // Clean R2 assets first
    const refs = (r.media ?? []).map((m) => m.r2_key).filter(Boolean) as string[];
    try {
      const { error } = await (supabase.from("site_reviews" as any) as any).delete().eq("id", r.id);
      if (error) throw error;
      refs.forEach((ref) => deleteR2Asset(ref, { force: true }).catch(() => {}));
      toast({ title: "Review deleted" });
      refresh();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (r: SiteReviewRow) => {
    try {
      const { data, error } = await (supabase.from("site_reviews" as any) as any).insert({
        reviewer_name: `${r.reviewer_name} (copy)`,
        location: r.location,
        review_date: r.review_date,
        title: r.title,
        body: r.body,
        rating: r.rating,
        review_type: r.review_type,
        is_verified_purchase: r.is_verified_purchase,
        is_visible: false,
        sort_order: reviews.length,
      }).select("id").single();
      if (error) throw error;
      // Duplicate media rows (referencing same R2 assets — not copied)
      if (r.media?.length) {
        await (supabase.from("site_review_media" as any) as any).insert(
          r.media.map((m, i) => ({
            review_id: data.id, kind: m.kind, provider: m.provider, external_video_id: m.external_video_id,
            r2_key: m.r2_key, url: m.url, thumbnail_url: m.thumbnail_url,
            width: m.width, height: m.height, file_size: m.file_size, sort_order: i,
          }))
        );
      }
      toast({ title: "Duplicated" });
      refresh();
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleToggleVisible = async (r: SiteReviewRow) => {
    try {
      await (supabase.from("site_reviews" as any) as any).update({ is_visible: !r.is_visible }).eq("id", r.id);
      refresh();
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <ReviewHeroEditor />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-muted/60 border border-border/60">
          {FILTERS.map(({ id, label, Icon }) => {
            const active = filter === id;
            const count = id === "all" ? reviews.length : reviews.filter((r) => r.review_type === id).length;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-medium transition ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={12} /> {label}
                <span className="text-[10.5px] text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        <Button
          className="rounded-[4px]"
          onClick={() => { setEditing(null); setEditorOpen(true); }}
        >
          <Plus size={14} className="mr-1" /> Add Review
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-[4px] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border/60 rounded-[4px] p-10 text-center">
          <p className="text-[13px] text-muted-foreground">No reviews in this view.</p>
          <Button className="mt-3 rounded-[4px]" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus size={14} className="mr-1" /> Add First Review
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filtered.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filtered.map((r) => (
                <SortableRow
                  key={r.id}
                  r={r}
                  onEdit={() => { setEditing(r); setEditorOpen(true); }}
                  onDelete={() => handleDelete(r)}
                  onDuplicate={() => handleDuplicate(r)}
                  onToggleVisible={() => handleToggleVisible(r)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ReviewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        value={editing}
        onSaved={refresh}
      />
    </div>
  );
};

export default ReviewsManager;
