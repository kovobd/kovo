import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, X, GripVertical, LayoutGrid } from "lucide-react";
import { resolveImageSrc } from "@/lib/cdnImage";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Cat {
  id: string;
  sort_order: number;
  enabled: boolean;
  title: string | null;
  category_id: string | null;
}

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
    {children}
  </span>
);

const SortableRow = ({
  c, cats, onSwitch, onDelete, onTitleChange, onCategoryChange, onSave,
}: {
  c: Cat;
  cats: CategoryRef[];
  onSwitch: (v: boolean) => void;
  onDelete: () => void;
  onTitleChange: (v: string) => void;
  onCategoryChange: (id: string) => void;
  onSave: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ref = cats.find((r) => r.id === c.category_id);
  const img = ref?.image_url ? resolveImageSrc(ref.image_url, 400) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background border border-border/60 rounded-[4px] p-2 flex items-center gap-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
        aria-label="Drag"
      >
        <GripVertical size={13} />
      </button>
      <div className="w-10 h-10 rounded-[3px] overflow-hidden bg-muted border border-border/60 flex-shrink-0">
        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <select
        value={c.category_id ?? ""}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="h-9 px-2 rounded-[4px] border border-border bg-background text-[12px] min-w-[140px]"
      >
        <option value="">— Select category —</option>
        {cats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <Input
        placeholder={ref?.name || "Display title (optional)"}
        value={c.title ?? ""}
        onChange={(e) => onTitleChange(e.target.value)}
        className="h-9 flex-1 min-w-0 rounded-[4px] text-[12.5px]"
      />
      <Switch checked={c.enabled} onCheckedChange={onSwitch} />
      <Button
        size="sm"
        variant="outline"
        className="h-9 px-2.5 rounded-[4px] text-[12px]"
        onClick={onSave}
        aria-label="Save"
      >
        <Save size={13} />
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

const FeaturedCategoriesManager = ({ hideTitle: _hideTitle }: { hideTitle?: boolean }) => {
  const [items, setItems] = useState<Cat[]>([]);
  const [cats, setCats] = useState<CategoryRef[]>([]);
  const [adding, setAdding] = useState<{ category_id: string; title: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const invalidatePublic = () => {
    qc.invalidateQueries({ queryKey: ["public-home"] });
  };

  const load = async () => {
    const [{ data: items }, { data: catList }] = await Promise.all([
      supabase.from("featured_categories").select("id, sort_order, enabled, title, category_id").order("sort_order"),
      supabase.from("categories").select("id, name, slug, image_url").order("sort_order"),
    ]);
    setItems((items as Cat[]) ?? []);
    setCats((catList as CategoryRef[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!adding || !adding.category_id) {
      toast({ title: "Pick a category", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("featured_categories").insert({
      category_id: adding.category_id,
      title: adding.title.trim() || null,
      sort_order: items.length,
      enabled: true,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Category added" });
    setAdding(null);
    invalidatePublic();
    load();
  };

  const saveItem = async (c: Cat) => {
    const { error } = await supabase.from("featured_categories")
      .update({ category_id: c.category_id, title: c.title } as any)
      .eq("id", c.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { invalidatePublic(); toast({ title: "Saved" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this category from the homepage?")) return;
    const { error } = await supabase.from("featured_categories").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removed" });
    invalidatePublic();
    load();
  };

  const toggleEnabled = async (id: string, v: boolean) => {
    setItems(prev => prev.map(c => c.id === id ? { ...c, enabled: v } : c));
    const { error } = await supabase.from("featured_categories").update({ enabled: v } as any).eq("id", id);
    if (error) {
      setItems(prev => prev.map(c => c.id === id ? { ...c, enabled: !v } : c));
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    invalidatePublic();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldI = items.findIndex(s => s.id === e.active.id);
    const newI = items.findIndex(s => s.id === e.over!.id);
    const reordered = arrayMove(items, oldI, newI).map((s, i) => ({ ...s, sort_order: i }));
    setItems(reordered);
    // ONE write instead of N — see public.bulk_update_sort_order().
    await supabase.rpc("bulk_update_sort_order" as any, { _table: "featured_categories", _ids: reordered.map(s => s.id) });
    invalidatePublic();
  };

  const enabledCount = items.filter(i => i.enabled).length;

  return (
    <div className="max-w-3xl pb-10 space-y-3">
      {/* Meta strip */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <span className="tabular-nums text-foreground">{items.length}</span>
        <span>categories</span>
        <span className="text-muted-foreground/50">•</span>
        <span className="tabular-nums text-foreground">{enabledCount}</span>
        <span>enabled</span>
      </div>

      {/* List card */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Homepage categories</SectionLabel>
          {!adding && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 rounded-[4px] text-[12px]"
              onClick={() => setAdding({ category_id: "", title: "" })}
            >
              <Plus size={13} className="mr-1" /> Add
            </Button>
          )}
        </div>

        {items.length === 0 && !adding ? (
          <div className="border border-dashed border-border/60 rounded-[4px] py-8 flex flex-col items-center gap-2 text-center">
            <LayoutGrid size={18} className="text-muted-foreground/60" />
            <p className="text-[12.5px] text-muted-foreground">No featured categories yet.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {items.map((c) => (
                  <SortableRow
                    key={c.id}
                    c={c}
                    cats={cats}
                    onSwitch={(v) => toggleEnabled(c.id, v)}
                    onDelete={() => handleDelete(c.id)}
                    onTitleChange={(v) => setItems(prev => prev.map(it => it.id === c.id ? { ...it, title: v } : it))}
                    onCategoryChange={(id) => setItems(prev => prev.map(it => it.id === c.id ? { ...it, category_id: id } : it))}
                    onSave={() => saveItem(c)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {adding && (
          <div className="border border-border/60 rounded-[4px] p-3 bg-muted/30 space-y-2">
            <SectionLabel>New category</SectionLabel>
            <select
              value={adding.category_id}
              onChange={(e) => setAdding({ ...adding, category_id: e.target.value })}
              className="h-9 px-2 rounded-[4px] border border-border bg-background text-[12.5px] w-full"
            >
              <option value="">— Select category —</option>
              {cats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Input
              placeholder="Display title (optional — defaults to category name)"
              value={adding.title}
              onChange={(e) => setAdding({ ...adding, title: e.target.value })}
              className="h-9 rounded-[4px] text-[12.5px]"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={handleAdd}>
                <Save size={13} className="mr-1.5" /> Add
              </Button>
              <Button size="sm" variant="ghost" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={() => setAdding(null)}>
                <X size={13} className="mr-1.5" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-muted-foreground/70">
        Images come from the category's Taxonomy image — edit them in Taxonomy → Categories.
      </p>
    </div>
  );
};

export default FeaturedCategoriesManager;
