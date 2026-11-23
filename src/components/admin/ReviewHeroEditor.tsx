/**
 * Review Hero customization editor — headline, subtitle, and up to 10 customer
 * profile avatars (1:1 cropped, R2-hosted). Drag-and-drop reordering.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, GripVertical, Replace, Upload } from "lucide-react";
import { resolveImageSrc } from "@/lib/cdnImage";
import { uploadToR2, deleteR2Asset } from "@/lib/r2Upload";
import ImageCropper from "@/components/admin/ImageCropper";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { useReviewHero, type ReviewHeroAvatar } from "@/hooks/useReviewHero";

const MAX_AVATARS = 10;

const SortableAvatar = ({
  a, onReplace, onRemove,
}: {
  a: ReviewHeroAvatar;
  onReplace: () => void;
  onRemove: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.r2_key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group w-20 h-20 rounded-full overflow-hidden border border-border/60 bg-muted flex-shrink-0"
    >
      <img src={resolveImageSrc(a.r2_key, 400)} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className="w-7 h-7 rounded-full bg-background/90 flex items-center justify-center cursor-grab active:cursor-grabbing"
          aria-label="Drag"
          type="button"
        >
          <GripVertical size={12} />
        </button>
        <button
          type="button"
          onClick={onReplace}
          className="w-7 h-7 rounded-full bg-background/90 flex items-center justify-center"
          aria-label="Replace"
        >
          <Replace size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 rounded-full bg-background/90 text-destructive flex items-center justify-center"
          aria-label="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

const ReviewHeroEditor = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useReviewHero();
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [avatars, setAvatars] = useState<ReviewHeroAvatar[]>([]);
  const [saving, setSaving] = useState(false);

  // Cropper state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [uploadingProgress, setUploadingProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!data) return;
    setHeadline(data.headline);
    setSubtitle(data.subtitle);
    setAvatars(data.avatars);
  }, [data]);

  const dirty =
    !!data &&
    (headline !== data.headline ||
      subtitle !== data.subtitle ||
      JSON.stringify(avatars) !== JSON.stringify(data.avatars));

  const pickFile = (replaceIdx: number | null) => {
    setReplacingIndex(replaceIdx);
    fileInputRef.current?.click();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (replacingIndex === null && avatars.length >= MAX_AVATARS) {
      toast({ title: `Max ${MAX_AVATARS} avatars`, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(f);
  };

  const handleCropped = async (blob: Blob) => {
    setCropSrc(null);
    setUploadingProgress(0);
    try {
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
      const ref = await uploadToR2(file, {
        prefix: "review-hero-avatars",
        mime: "image/jpeg",
        onProgress: (p) => setUploadingProgress(p),
      });
      if (replacingIndex !== null) {
        const old = avatars[replacingIndex];
        setAvatars((prev) => prev.map((a, i) => i === replacingIndex ? { r2_key: ref, sort_order: i } : a));
        if (old?.r2_key) deleteR2Asset(old.r2_key, { force: true }).catch(() => {});
      } else {
        setAvatars((prev) => [...prev, { r2_key: ref, sort_order: prev.length }]);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploadingProgress(null);
      setReplacingIndex(null);
    }
  };

  const handleRemove = (idx: number) => {
    setAvatars((prev) => {
      const removed = prev[idx];
      if (removed?.r2_key) deleteR2Asset(removed.r2_key, { force: true }).catch(() => {});
      return prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, sort_order: i }));
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setAvatars((prev) => {
      const oldI = prev.findIndex((a) => a.r2_key === active.id);
      const newI = prev.findIndex((a) => a.r2_key === over.id);
      if (oldI < 0 || newI < 0) return prev;
      return arrayMove(prev, oldI, newI).map((a, i) => ({ ...a, sort_order: i }));
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        id: 1,
        headline: headline.trim() || "Loved by our customers.",
        subtitle: subtitle.trim(),
        avatars: avatars.map((a, i) => ({ r2_key: a.r2_key, sort_order: i })),
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase.from("review_hero_settings" as any) as any)
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
      toast({ title: "Hero saved" });
      qc.invalidateQueries({ queryKey: ["review-hero-settings"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-44 rounded-[4px] bg-muted/40 animate-pulse" />;
  }

  return (
    <div className="border border-border/60 rounded-[4px] p-4 sm:p-5 space-y-5 bg-background">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Review Page Hero</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Headline, subtitle, and customer avatars shown above the reviews list.
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-[4px]"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Save size={13} className="mr-1" />}
          Save changes
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Headline</label>
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Loved by our customers."
            className="h-9 mt-1 rounded-[4px]"
            maxLength={120}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Subtitle</label>
          <Textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={2}
            placeholder="Trusted by thousands of happy customers — real photos, real videos, real stories."
            className="mt-1 rounded-[4px]"
            maxLength={280}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">
            Customer Avatars · {avatars.length}/{MAX_AVATARS}
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[4px] h-8"
            disabled={avatars.length >= MAX_AVATARS || uploadingProgress !== null}
            onClick={() => pickFile(null)}
          >
            <Plus size={13} className="mr-1" /> Add avatar
          </Button>
        </div>

        {avatars.length === 0 ? (
          <div className="border border-dashed border-border/60 rounded-[4px] p-6 text-center">
            <p className="text-[12px] text-muted-foreground">
              No avatars yet. Add up to {MAX_AVATARS} customer profile photos.
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={avatars.map((a) => a.r2_key)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap items-center gap-3">
                {avatars.map((a, i) => (
                  <SortableAvatar
                    key={a.r2_key}
                    a={a}
                    onReplace={() => pickFile(i)}
                    onRemove={() => handleRemove(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {uploadingProgress !== null && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Upload size={12} className="animate-pulse" />
            Uploading… {Math.round(uploadingProgress * 100)}%
          </div>
        )}

        {/* Live preview */}
        <div className="mt-4 pt-4 border-t border-border/60">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold mb-2">
            Preview
          </div>
          {avatars.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">Hidden — no avatars uploaded.</p>
          ) : (
            <div className="flex -space-x-2">
              {avatars.map((a, i) => (
                <div key={i} className="w-8 h-8 rounded-full ring-2 ring-background overflow-hidden bg-muted">
                  <img src={resolveImageSrc(a.r2_key, 400)} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />

      <ImageCropper
        open={!!cropSrc}
        imageSrc={cropSrc}
        aspect="1:1"
        outputMaxEdge={400}
        onCancel={() => { setCropSrc(null); setReplacingIndex(null); }}
        onCrop={handleCropped}
      />
    </div>
  );
};

export default ReviewHeroEditor;
