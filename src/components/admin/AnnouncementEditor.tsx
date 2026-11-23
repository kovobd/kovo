import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Save, ArrowLeft, ArrowRight } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Announcement {
  id: string;
  text: string;
  link: string;
  enabled: boolean;
  dismissible: boolean;
  bg_color: string;
  text_color: string;
  sort_order: number;
}

const newDraft = (sort_order: number): Announcement => ({
  id: `new-${Math.random().toString(36).slice(2, 10)}`,
  text: "",
  link: "",
  enabled: true,
  dismissible: true,
  bg_color: "#000000",
  text_color: "#ffffff",
  sort_order,
});

interface AnnouncementSettings {
  id: string;
  direction: "left" | "right";
  speed: number;
}

const defaultSettings: AnnouncementSettings = { id: "default", direction: "left", speed: 5 };

const Row = ({
  a, expanded, onToggleExpand, onChange, onSave, onDelete, onToggleEnabled, dirty,
}: {
  a: Announcement;
  expanded: boolean;
  dirty: boolean;
  onToggleExpand: () => void;
  onChange: (u: Partial<Announcement>) => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleEnabled: (v: boolean) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="a-card overflow-hidden">
      <div className="flex items-center gap-1 min-h-[52px] px-1.5 sm:px-3 py-1">
        <button
          {...attributes}
          {...listeners}
          className="h-11 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 transition-colors"
          aria-label="Drag"
        >
          <GripVertical size={14} />
        </button>
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left text-[13.5px] sm:text-sm font-medium text-foreground truncate px-1 h-11 flex items-center"
        >
          {a.text?.trim() || <span className="text-muted-foreground font-normal italic">Untitled announcement</span>}
        </button>
        <div className="h-11 w-11 flex items-center justify-center shrink-0">
          <Switch checked={a.enabled} onCheckedChange={onToggleEnabled} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-destructive shrink-0 rounded-lg"
          onClick={onDelete}
          aria-label="Delete"
        >
          <Trash2 size={14} />
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Announcement text</span>
            <Input
              className="h-10"
              placeholder="🎉 Free shipping on orders over ৳1500!"
              value={a.text}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Link (optional)</span>
            <Input
              className="h-10"
              placeholder="/shop or https://…"
              value={a.link}
              onChange={(e) => onChange({ link: e.target.value })}
            />
          </label>

          {dirty && (
            <div className="flex justify-end pt-1">
              <Button size="sm" className="w-full sm:w-auto h-10" onClick={onSave}>
                <Save size={13} className="mr-1" /> Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AnnouncementEditor = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AnnouncementSettings>(defaultSettings);
  const [settingsBaseline, setSettingsBaseline] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const snapshot = (a: Announcement) => JSON.stringify({ ...a, sort_order: a.sort_order });

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: settingsData }] = await Promise.all([
      supabase
        .from("announcement_bar")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase.from("announcement_bar_settings").select("*").eq("id", "default").maybeSingle(),
    ]);
    const rows = ((data as any[]) ?? []).map((d, i) => ({
      id: d.id, text: d.text ?? "", link: d.link ?? "",
      enabled: !!d.enabled, dismissible: d.dismissible !== false,
      bg_color: d.bg_color ?? "#000000", text_color: d.text_color ?? "#ffffff",
      sort_order: typeof d.sort_order === "number" ? d.sort_order : i,
    })) as Announcement[];
    setItems(rows);
    const base: Record<string, string> = {};
    rows.forEach(r => (base[r.id] = snapshot(r)));
    setBaseline(base);
    const s = settingsData
      ? { id: settingsData.id, direction: settingsData.direction as "left" | "right", speed: settingsData.speed as number }
      : defaultSettings;
    setSettings(s);
    setSettingsBaseline(JSON.stringify(s));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (id: string, u: Partial<Announcement>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...u } : it));
  };

  const isDirty = (a: Announcement) => baseline[a.id] !== snapshot(a) || a.id.startsWith("new-");

  const saveOne = async (id: string) => {
    const a = items.find(i => i.id === id);
    if (!a) return;
    if (!a.text.trim()) {
      toast({ title: "Text required", description: "Please enter announcement text.", variant: "destructive" });
      return;
    }
    if (a.id.startsWith("new-")) {
      const realId = (typeof crypto !== "undefined" && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `ann-${Date.now()}`;
      const payload = {
        id: realId, text: a.text, link: a.link, enabled: a.enabled, dismissible: a.dismissible,
        bg_color: a.bg_color, text_color: a.text_color, sort_order: a.sort_order,
      };
      const { error } = await supabase.from("announcement_bar").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Announcement added" });
    } else {
      const { error } = await supabase.from("announcement_bar").update({
        text: a.text, link: a.link, enabled: a.enabled, dismissible: a.dismissible,
        bg_color: a.bg_color, text_color: a.text_color, sort_order: a.sort_order,
      } as any).eq("id", a.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Announcement saved" });
    }
    qc.invalidateQueries({ queryKey: ["public-layout"] });
    load();
  };

  const toggleEnabled = async (id: string, v: boolean) => {
    if (id.startsWith("new-")) {
      update(id, { enabled: v });
      return;
    }
    const { error } = await supabase.from("announcement_bar").update({ enabled: v } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems(prev => {
      const next = prev.map(it => it.id === id ? { ...it, enabled: v } : it);
      const target = next.find(i => i.id === id);
      if (target) {
        // Only re-baseline the enabled field; preserve dirty state for other fields.
        setBaseline(b => {
          const prevBase = b[id];
          if (!prevBase) return { ...b, [id]: snapshot(target) };
          try {
            const parsed = JSON.parse(prevBase);
            return { ...b, [id]: JSON.stringify({ ...parsed, enabled: v }) };
          } catch {
            return { ...b, [id]: snapshot(target) };
          }
        });
      }
      return next;
    });
    qc.invalidateQueries({ queryKey: ["public-layout"] });
  };

  const removeOne = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    if (id.startsWith("new-")) {
      setItems(prev => prev.filter(i => i.id !== id));
      return;
    }
    const { error } = await supabase.from("announcement_bar").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Announcement deleted" });
    qc.invalidateQueries({ queryKey: ["public-layout"] });
    load();
  };

  const addNew = () => {
    const draft = newDraft(items.length);
    setItems(prev => [...prev, draft]);
    setExpanded(draft.id);
  };

  const setAllDismissible = async (v: boolean) => {
    setItems(prev => prev.map(i => ({ ...i, dismissible: v })));
    const ids = items.filter(i => !i.id.startsWith("new-")).map(i => i.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("announcement_bar").update({ dismissible: v } as any).in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setBaseline(prev => {
      const next = { ...prev };
      items.forEach(i => { if (next[i.id] !== undefined) next[i.id] = snapshot({ ...i, dismissible: v }); });
      return next;
    });
    qc.invalidateQueries({ queryKey: ["public-layout"] });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldI = items.findIndex(i => i.id === e.active.id);
    const newI = items.findIndex(i => i.id === e.over!.id);
    const reordered = arrayMove(items, oldI, newI).map((i, idx) => ({ ...i, sort_order: idx }));
    setItems(reordered);
    // ONE write instead of N — see public.bulk_update_sort_order().
    const ids = reordered.filter(i => !i.id.startsWith("new-")).map(i => i.id);
    if (ids.length) {
      await supabase.rpc("bulk_update_sort_order" as any, { _table: "announcement_bar", _ids: ids });
    }
    setBaseline(prev => {
      const next = { ...prev };
      reordered.forEach(i => { if (next[i.id] !== undefined) next[i.id] = snapshot(i); });
      return next;
    });
    qc.invalidateQueries({ queryKey: ["public-layout"] });
  };

  const settingsDirty = JSON.stringify(settings) !== settingsBaseline;

  const speedLabel = (speed: number): string => {
    if (speed === 0) return "Static";
    if (speed <= 3) return "Slow";
    if (speed <= 6) return "Normal";
    if (speed <= 9) return "Fast";
    return "Very Fast";
  };

  const saveSettings = async () => {
    const { error } = await supabase.from("announcement_bar_settings").update({
      direction: settings.direction,
      speed: settings.speed,
    } as any).eq("id", "default");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSettingsBaseline(JSON.stringify(settings));
    qc.invalidateQueries({ queryKey: ["public-layout"] });
    toast({ title: "Behavior settings saved" });
  };

  const setDirection = (v: "left" | "right") => setSettings(s => ({ ...s, direction: v }));
  const setSpeed = (v: number[]) => setSettings(s => ({ ...s, speed: v[0] }));

  if (loading) return <Skeleton className="h-72 max-w-2xl rounded-2xl" />;

  return (
    <div className="max-w-2xl space-y-3 sm:space-y-4 pb-8 sm:pb-10 px-0 sm:px-0">

      {items.length === 0 ? (
        <>
          <Button size="sm" onClick={addNew} className="w-full h-11">
            <Plus size={14} className="mr-1" /> Add Announcement
          </Button>

          <div className="a-card border-dashed border-border/60 px-3 py-10 sm:py-12 text-center">
            <p className="text-sm font-medium text-foreground">No announcements yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first announcement to show a banner across your site.</p>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {/* Header actions — full-width Add on mobile, inline dismiss row */}
          <Button size="sm" onClick={addNew} className="w-full sm:w-auto h-11">
            <Plus size={14} className="mr-1" /> Add Announcement
          </Button>

          <div className="a-card px-3 sm:px-4 min-h-[52px] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13.5px] sm:text-sm font-medium text-foreground truncate">Allow users to dismiss</div>
              <div className="text-[11px] text-muted-foreground hidden sm:block">Applies to every announcement.</div>
            </div>
            <Switch
              checked={items.length > 0 && items.every(i => i.dismissible)}
              onCheckedChange={(v) => setAllDismissible(v)}
            />
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((a) => (
                  <Row
                    key={a.id}
                    a={a}
                    expanded={expanded === a.id}
                    dirty={isDirty(a)}
                    onToggleExpand={() => setExpanded(expanded === a.id ? null : a.id)}
                    onChange={(u) => update(a.id, u)}
                    onSave={() => saveOne(a.id)}
                    onDelete={() => removeOne(a.id)}
                    onToggleEnabled={(v) => toggleEnabled(a.id, v)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <div className="a-card p-3 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <h3 className="a-h3">Global Announcement Behavior</h3>
            <p className="a-helper mt-0.5">Controls scrolling for all announcements.</p>
          </div>
          {settingsDirty && (
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="ghost" className="flex-1 sm:flex-none h-9" onClick={() => setSettings(JSON.parse(settingsBaseline))}>
                Discard
              </Button>
              <Button size="sm" className="flex-1 sm:flex-none h-9" onClick={saveSettings}>
                <Save size={13} className="mr-1" /> Save
              </Button>
            </div>
          )}
        </div>

        {/* Direction */}
        <div className="space-y-2">
          <span className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-wide block">Direction</span>
          <div className="a-segmented grid grid-cols-2 w-full">
            <button
              onClick={() => setDirection("left")}
              className="!h-10 sm:!h-9 w-full inline-flex items-center justify-center"
              data-active={settings.direction === "left"}
              aria-pressed={settings.direction === "left"}
            >
              <ArrowLeft size={13} className="mr-1.5" /> Left
            </button>
            <button
              onClick={() => setDirection("right")}
              className="!h-10 sm:!h-9 w-full inline-flex items-center justify-center"
              data-active={settings.direction === "right"}
              aria-pressed={settings.direction === "right"}
            >
              <ArrowRight size={13} className="mr-1.5" /> Right
            </button>
          </div>
        </div>

        {/* Speed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-wide">Speed</span>
            <span className="text-[12px] font-medium text-foreground tabular-nums">
              {speedLabel(settings.speed)}
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              <span className="text-muted-foreground">{settings.speed}</span>
            </span>
          </div>
          <Slider
            value={[settings.speed]}
            onValueChange={setSpeed}
            min={0}
            max={10}
            step={1}
            className="py-1"
          />
          <div className="flex justify-between text-[10px] sm:text-[11px] text-muted-foreground/80 leading-tight px-0.5">
            <span>Static</span>
            <span>Slow</span>
            <span>Normal</span>
            <span>Fast</span>
            <span>Very Fast</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementEditor;
