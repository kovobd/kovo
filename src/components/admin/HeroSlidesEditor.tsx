import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, X, ChevronDown, ChevronUp, Copy, GripVertical, Loader2 } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import VideoUpload from "@/components/admin/VideoUpload";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type HeroType = "image_slider" | "video_hero";
type HeroLayout = "single" | "dual";
type InteractionMode = "buttons" | "image" | "both";

interface Slide {
  id: string;
  sort_order: number;
  enabled: boolean;
  image_url: string;
  mobile_image_url: string | null;
  headline: string | null;
  subheadline: string | null;
  button1_text: string | null;
  button1_link: string | null;
  button2_text: string | null;
  button2_link: string | null;
  image_click_link: string | null;
  interaction_mode: InteractionMode;
}

interface HeroSettings {
  id: string;
  hero_type: HeroType;
  hero_layout: HeroLayout;
  enabled: boolean;
  autoplay: boolean;
  transition_speed_ms: number;
  infinite_loop: boolean;
  swipe_enabled: boolean;
  desktop_video_url: string | null;
  mobile_video_url: string | null;
  poster_image_url: string | null;
  video_headline: string | null;
  video_subheadline: string | null;
  video_button1_text: string | null;
  video_button1_link: string | null;
  video_button2_text: string | null;
  video_button2_link: string | null;
  video_click_link: string | null;
  video_autoplay: boolean;
  video_loop: boolean;
  video_muted: boolean;
}

const newSlideDefaults = (sort_order: number): Omit<Slide, "id"> => ({
  sort_order,
  enabled: true,
  image_url: "",
  mobile_image_url: null,
  headline: "",
  subheadline: "",
  button1_text: "Shop Now",
  button1_link: "/shop",
  button2_text: "",
  button2_link: "",
  image_click_link: "",
  interaction_mode: "buttons",
});

const Seg = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`px-3 h-9 text-[12.5px] font-medium rounded-md border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background border-border text-foreground/70 hover:text-foreground"}`}>
    {children}
  </button>
);

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-1.5">
    <label className="text-[11.5px] font-medium text-muted-foreground">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
  </div>
);

const SlideForm = ({ s, set }: { s: Slide; set: (u: Partial<Slide>) => void }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ImageUpload value={s.image_url ? [s.image_url] : []} onChange={(u) => set({ image_url: u[0] || "" })} multiple={false} label="Desktop image (16:9)" hint="Recommended 1920 × 1080 px" />
      <ImageUpload value={s.mobile_image_url ? [s.mobile_image_url] : []} onChange={(u) => set({ mobile_image_url: u[0] || null })} multiple={false} label="Mobile image (9:16)" hint="Recommended 1080 × 1920 px" />
    </div>

    <Field label="Headline">
      <Input value={s.headline ?? ""} onChange={(e) => set({ headline: e.target.value })} placeholder="e.g. New Season Drop" />
    </Field>
    <Field label="Subheadline">
      <Textarea value={s.subheadline ?? ""} onChange={(e) => set({ subheadline: e.target.value })} rows={2} placeholder="Short supporting line" />
    </Field>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Button 1 text"><Input value={s.button1_text ?? ""} onChange={(e) => set({ button1_text: e.target.value })} /></Field>
      <Field label="Button 1 link"><Input value={s.button1_link ?? ""} onChange={(e) => set({ button1_link: e.target.value })} placeholder="/shop" /></Field>
      <Field label="Button 2 text"><Input value={s.button2_text ?? ""} onChange={(e) => set({ button2_text: e.target.value })} /></Field>
      <Field label="Button 2 link"><Input value={s.button2_link ?? ""} onChange={(e) => set({ button2_link: e.target.value })} /></Field>
    </div>

    <Field label="Image click link" hint="Where the image links when interaction mode allows it">
      <Input value={s.image_click_link ?? ""} onChange={(e) => set({ image_click_link: e.target.value })} placeholder="/shop or https://…" />
    </Field>

    <div>
      <p className="text-[11.5px] font-medium text-muted-foreground mb-1.5">Interaction mode</p>
      <div className="flex flex-wrap gap-1.5">
        {(["buttons", "image", "both"] as const).map(m => (
          <Seg key={m} active={s.interaction_mode === m} onClick={() => set({ interaction_mode: m })}>
            {m === "buttons" ? "Buttons only" : m === "image" ? "Image only" : "Buttons + Image"}
          </Seg>
        ))}
      </div>
    </div>
  </div>
);

const SortableRow = ({ s, expanded, onToggle, onSwitch, onDelete, onDuplicate, onChange, onSave, dirty }: {
  s: Slide; expanded: boolean; dirty: boolean;
  onToggle: () => void;
  onSwitch: (v: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onChange: (u: Partial<Slide>) => void;
  onSave: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="bg-secondary/40 rounded-lg border border-border">
      <div className="flex items-center gap-2 px-2 py-2">
        <button {...attributes} {...listeners} className="p-1.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing" aria-label="Drag">
          <GripVertical size={14} />
        </button>
        <button className="flex-1 flex items-center gap-2 text-sm font-medium text-foreground text-left min-w-0" onClick={onToggle}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="truncate">{s.headline || `Slide ${s.sort_order + 1}`}</span>
          {dirty && <span className="text-[10px] font-semibold text-amber-600 ml-1">• unsaved</span>}
        </button>
        <Switch checked={s.enabled} onCheckedChange={onSwitch} />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} aria-label="Duplicate"><Copy size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete} aria-label="Delete"><Trash2 size={13} /></Button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border pt-3">
          <SlideForm s={s} set={onChange} />
          <Button size="sm" className="mt-3" onClick={onSave}><Save size={13} className="mr-1.5" /> Save slide</Button>
        </div>
      )}
    </div>
  );
};

const HeroManager = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<HeroSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<HeroSettings | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [savedSlides, setSavedSlides] = useState<Record<string, Slide>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newSlide, setNewSlide] = useState<Omit<Slide, "id"> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    setLoading(true);
    const [s, sl] = await Promise.all([
      supabase.from("hero_settings").select("*").eq("id", "default").maybeSingle(),
      supabase.from("hero_slides").select("*").order("sort_order"),
    ]);
    let settingsRow = s.data as HeroSettings | null;
    if (!settingsRow) {
      const ins = await supabase.from("hero_settings").insert({ id: "default" }).select("*").single();
      settingsRow = ins.data as HeroSettings;
    }
    setSettings(settingsRow);
    setSavedSettings(settingsRow ? { ...settingsRow } : null);
    const list = (sl.data as Slide[]) ?? [];
    setSlides(list);
    setSavedSlides(Object.fromEntries(list.map(x => [x.id, { ...x }])));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const settingsDirty = !!settings && !!savedSettings && JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const setSetting = <K extends keyof HeroSettings>(k: K, v: HeroSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [k]: v });
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    const { id, ...payload } = settings;
    const { error } = await supabase.from("hero_settings").update(payload as any).eq("id", "default");
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setSavedSettings({ ...settings }); toast({ title: "Hero settings saved" }); }
  };

  // Slides
  const startNew = () => setNewSlide(newSlideDefaults(slides.length));

  const saveNew = async () => {
    if (!newSlide) return;
    if (!newSlide.image_url) { toast({ title: "Desktop image required", variant: "destructive" }); return; }
    const { error, data } = await supabase.from("hero_slides").insert(newSlide as any).select("*").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Slide added" });
    setNewSlide(null);
    const row = data as Slide;
    setSlides(prev => [...prev, row]);
    setSavedSlides(prev => ({ ...prev, [row.id]: { ...row } }));
  };

  const saveSlide = async (s: Slide) => {
    const { id, ...payload } = s;
    const { error } = await supabase.from("hero_slides").update(payload as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Slide updated" });
    setSavedSlides(prev => ({ ...prev, [id]: { ...s } }));
  };

  const deleteSlide = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    await supabase.from("hero_slides").delete().eq("id", id);
    setSlides(prev => prev.filter(x => x.id !== id));
    setSavedSlides(prev => { const c = { ...prev }; delete c[id]; return c; });
    toast({ title: "Slide deleted" });
  };

  const duplicateSlide = async (s: Slide) => {
    const { id, ...payload } = s;
    const copy: any = { ...payload, sort_order: slides.length, headline: (s.headline || "Slide") + " (copy)" };
    const { error, data } = await supabase.from("hero_slides").insert(copy).select("*").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const row = data as Slide;
    setSlides(prev => [...prev, row]);
    setSavedSlides(prev => ({ ...prev, [row.id]: { ...row } }));
    toast({ title: "Slide duplicated" });
  };

  const toggleEnabled = async (id: string, v: boolean) => {
    setSlides(prev => prev.map(sl => sl.id === id ? { ...sl, enabled: v } : sl));
    setSavedSlides(prev => prev[id] ? ({ ...prev, [id]: { ...prev[id], enabled: v } }) : prev);
    await supabase.from("hero_slides").update({ enabled: v } as any).eq("id", id);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldI = slides.findIndex(s => s.id === e.active.id);
    const newI = slides.findIndex(s => s.id === e.over!.id);
    const reordered = arrayMove(slides, oldI, newI).map((s, i) => ({ ...s, sort_order: i }));
    setSlides(reordered);
    // ONE write instead of N — see public.bulk_update_sort_order().
    await supabase.rpc("bulk_update_sort_order" as any, { _table: "hero_slides", _ids: reordered.map(s => s.id) });
    setSavedSlides(Object.fromEntries(reordered.map(x => [x.id, { ...x }])));
  };

  const updateSlide = (id: string, u: Partial<Slide>) =>
    setSlides(prev => prev.map(sl => sl.id === id ? { ...sl, ...u } : sl));

  if (loading || !settings) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 size={14} className="animate-spin" /> Loading hero…</div>;
  }

  const isSlider = settings.hero_type === "image_slider";
  const isVideo = settings.hero_type === "video_hero";

  return (
    <div className="space-y-5">
      {/* Hero Type */}
      <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Hero type</p>
        <div className="flex flex-wrap gap-1.5">
          <Seg active={isSlider} onClick={() => setSetting("hero_type", "image_slider")}>Image Slider</Seg>
          <Seg active={isVideo} onClick={() => setSetting("hero_type", "video_hero")}>Video Hero</Seg>
        </div>

        {isSlider && (
          <div className="mt-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Hero layout</p>
            <div className="flex flex-wrap gap-1.5">
              <Seg active={settings.hero_layout === "single"} onClick={() => setSetting("hero_layout", "single")}>Single Hero</Seg>
              <Seg active={settings.hero_layout === "dual"} onClick={() => setSetting("hero_layout", "dual")}>Dual Hero</Seg>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Dual displays two slides side-by-side on desktop. Mobile always shows one slide at a time.</p>
          </div>
        )}
      </div>

      {/* Global settings */}
      <div className="rounded-lg border border-border bg-background p-3 sm:p-4 space-y-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Global settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>Hero enabled</span>
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSetting("enabled", v)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>Autoplay</span>
            <Switch checked={settings.autoplay} onCheckedChange={(v) => setSetting("autoplay", v)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>Swipe support</span>
            <Switch checked={settings.swipe_enabled} onCheckedChange={(v) => setSetting("swipe_enabled", v)} />
          </label>
          {isSlider && (
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>Infinite loop</span>
              <Switch checked={settings.infinite_loop} onCheckedChange={(v) => setSetting("infinite_loop", v)} />
            </label>
          )}
          {isSlider && (
            <Field label={`Transition speed (${(settings.transition_speed_ms / 1000).toFixed(1)}s)`}>
              <Input
                type="number" min={2000} max={20000} step={500}
                value={settings.transition_speed_ms}
                onChange={(e) => setSetting("transition_speed_ms", Math.max(2000, +e.target.value || 6000))}
              />
            </Field>
          )}
        </div>

        {settingsDirty && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => settings && savedSettings && setSettings({ ...savedSettings })} disabled={saving}>Discard</Button>
            <Button size="sm" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
          </div>
        )}
      </div>

      {/* Image Slider editor */}
      {isSlider && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Slides</p>
            {!newSlide && (
              <Button size="sm" variant="outline" onClick={startNew}><Plus size={13} className="mr-1.5" /> Add slide</Button>
            )}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {slides.map((s) => (
                  <SortableRow
                    key={s.id} s={s} expanded={expanded === s.id}
                    dirty={JSON.stringify(s) !== JSON.stringify(savedSlides[s.id])}
                    onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
                    onSwitch={(v) => toggleEnabled(s.id, v)}
                    onDelete={() => deleteSlide(s.id)}
                    onDuplicate={() => duplicateSlide(s)}
                    onChange={(u) => updateSlide(s.id, u)}
                    onSave={() => saveSlide(slides.find(sl => sl.id === s.id)!)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {newSlide && (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[12px] font-medium text-foreground mb-3">New slide</p>
              <SlideForm s={{ id: "", ...newSlide }} set={(u) => setNewSlide(prev => prev ? { ...prev, ...u } : prev)} />
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={saveNew}><Save size={13} className="mr-1.5" /> Add slide</Button>
                <Button size="sm" variant="ghost" onClick={() => setNewSlide(null)}><X size={13} className="mr-1.5" /> Cancel</Button>
              </div>
            </div>
          )}

          {slides.length === 0 && !newSlide && (
            <p className="text-[12.5px] text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">No slides yet. Add your first slide to get started.</p>
          )}
        </div>
      )}

      {/* Video Hero editor */}
      {isVideo && (
        <div className="rounded-lg border border-border bg-background p-3 sm:p-4 space-y-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Video hero</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VideoUpload value={settings.desktop_video_url} onChange={(v) => setSetting("desktop_video_url", v)} label="Desktop video (16:9)" hint="MP4 / WebM · up to 30MB" />
            <VideoUpload value={settings.mobile_video_url} onChange={(v) => setSetting("mobile_video_url", v)} label="Mobile video (9:16)" hint="MP4 / WebM · up to 30MB" />
          </div>

          <ImageUpload
            value={settings.poster_image_url ? [settings.poster_image_url] : []}
            onChange={(u) => setSetting("poster_image_url", u[0] || null)}
            multiple={false}
            label="Poster image (optional)"
            hint="Shown until the video loads"
          />

          <Field label="Headline">
            <Input value={settings.video_headline ?? ""} onChange={(e) => setSetting("video_headline", e.target.value)} />
          </Field>
          <Field label="Subheadline">
            <Textarea value={settings.video_subheadline ?? ""} onChange={(e) => setSetting("video_subheadline", e.target.value)} rows={2} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Button 1 text"><Input value={settings.video_button1_text ?? ""} onChange={(e) => setSetting("video_button1_text", e.target.value)} /></Field>
            <Field label="Button 1 link"><Input value={settings.video_button1_link ?? ""} onChange={(e) => setSetting("video_button1_link", e.target.value)} /></Field>
            <Field label="Button 2 text"><Input value={settings.video_button2_text ?? ""} onChange={(e) => setSetting("video_button2_text", e.target.value)} /></Field>
            <Field label="Button 2 link"><Input value={settings.video_button2_link ?? ""} onChange={(e) => setSetting("video_button2_link", e.target.value)} /></Field>
          </div>

          <Field label="Video click link (optional)">
            <Input value={settings.video_click_link ?? ""} onChange={(e) => setSetting("video_click_link", e.target.value)} placeholder="/shop or https://…" />
          </Field>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <label className="flex items-center justify-between gap-2 text-[13px] rounded-md border border-border px-3 h-10">
              <span>Autoplay</span>
              <Switch checked={settings.video_autoplay} onCheckedChange={(v) => setSetting("video_autoplay", v)} />
            </label>
            <label className="flex items-center justify-between gap-2 text-[13px] rounded-md border border-border px-3 h-10">
              <span>Loop</span>
              <Switch checked={settings.video_loop} onCheckedChange={(v) => setSetting("video_loop", v)} />
            </label>
            <label className="flex items-center justify-between gap-2 text-[13px] rounded-md border border-border px-3 h-10">
              <span>Muted</span>
              <Switch checked={settings.video_muted} onCheckedChange={(v) => setSetting("video_muted", v)} />
            </label>
          </div>

          {settingsDirty && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => settings && savedSettings && setSettings({ ...savedSettings })} disabled={saving}>Discard</Button>
              <Button size="sm" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save video hero"}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeroManager;
