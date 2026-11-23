import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, ChevronDown, Banknote, Smartphone, Wallet, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { resolveImageSrc } from "@/lib/cdnImage";
import {
  clearPaymentOptionsCache, normalizeMethods, slugifyMethod, validateMethods,
  type PaymentMethodConfig,
} from "@/lib/checkoutOptions";

type Row = PaymentMethodConfig & { _key: string };
const newKey = () => Math.random().toString(36).slice(2);

const blank = (): Row => ({
  _key: newKey(), id: "", type: "online", name: "", description: "", receiver_number: "",
  logo: "", show_instructions: false, instructions: "", enabled: true, is_default: false,
});

function MethodCard({ m, index, open, onToggleOpen, onChange, onMakeDefault, onDelete }: {
  m: Row; index: number; open: boolean; onToggleOpen: () => void;
  onChange: (p: Partial<Row>) => void; onMakeDefault: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m._key });
  const Icon = m.type === "cod" ? Banknote : Smartphone;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border border-border bg-card ${isDragging ? "z-10 shadow-lg opacity-90" : ""}`}>
      <div className="flex items-center gap-3 p-4">
        <button type="button" aria-label="Drag to reorder" className="touch-none cursor-grab text-muted-foreground p-1" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggleOpen} className="flex flex-1 min-w-0 items-center gap-3 text-left">
          <span className="h-11 w-11 shrink-0 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
            {m.logo ? <img src={resolveImageSrc(m.logo)} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground truncate">{m.name || "New payment method"}</span>
              {m.is_default && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">
                  <Star className="h-3 w-3" /> Default
                </span>
              )}
            </span>
            <span className="block text-xs text-muted-foreground">
              {m.type === "cod" ? "Cash on delivery" : "Online payment"} · position {index + 1}
            </span>
          </span>
        </button>
        <Switch checked={m.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label="Enabled" />
        <button type="button" onClick={onToggleOpen} aria-label={open ? "Collapse" : "Expand"} className="p-1 text-muted-foreground">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {([["cod", "Cash on delivery", Banknote], ["online", "Online payment", Wallet]] as const).map(([t, label, I]) => (
              <button key={t} type="button" onClick={() => onChange({ type: t })}
                className={`flex items-center gap-2 rounded-xl border px-4 h-11 text-sm transition-colors ${
                  m.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:bg-muted"}`}>
                <I className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={m.name} onChange={(e) => onChange({ name: e.target.value })}
              placeholder={m.type === "cod" ? "Cash on Delivery" : "bKash"} className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label>Short description</Label>
            <Textarea value={m.description} onChange={(e) => onChange({ description: e.target.value })} rows={3}
              placeholder={m.type === "cod" ? "Pay in cash when your order arrives." : "Send money, then place the order."} />
            <p className="text-xs text-muted-foreground">Helper line shown under the name at checkout.</p>
          </div>

          {m.type === "online" && (
            <div className="space-y-1.5">
              <Label>Receiver number</Label>
              <Input value={m.receiver_number} onChange={(e) => onChange({ receiver_number: e.target.value })}
                placeholder="01XXXXXXXXX" inputMode="tel" className="h-11" />
              <p className="text-xs text-muted-foreground">Shown to the customer so they know where to send money.</p>
            </div>
          )}

          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">Logo</h3>
            <p className="text-xs text-muted-foreground mb-2">Square badge shown next to the method at checkout.</p>
            <ImageUpload value={m.logo ? [m.logo] : []} onChange={(urls) => onChange({ logo: urls[0] || "" })}
              multiple={false} cropAspect="1:1" label="Payment logo"
              hint="Recommended 400 × 400 px · 1:1 (square) · kept small (under 100 KB) so checkout stays fast." />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Show payment instructions</p>
              <p className="text-xs text-muted-foreground">Reveals a longer instruction block at checkout.</p>
            </div>
            <Switch checked={m.show_instructions} onCheckedChange={(v) => onChange({ show_instructions: v })} />
          </div>
          {m.show_instructions && (
            <Textarea value={m.instructions} onChange={(e) => onChange({ instructions: e.target.value })} rows={4}
              placeholder="1. Open your app and choose Send Money&#10;2. Send the total to the number above&#10;3. Place the order — we confirm by SMS" />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onMakeDefault} disabled={m.is_default}>
              <Star className="h-4 w-4 mr-1.5" /> {m.is_default ? "Default method" : "Make default"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const PaymentSettings = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { dirty, rebase } = useDirtyForm(rows);
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = async () => {
    const { data } = await supabase.from("payment_settings").select("methods").eq("id", "default").maybeSingle();
    const next = normalizeMethods((data as any)?.methods).map((m) => ({ ...m, _key: newKey() }));
    setRows(next);
    rebase(next);
  };
  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  if (!rows) return <div className="max-w-3xl space-y-3"><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /></div>;

  const update = (key: string, p: Partial<Row>) => setRows(rows.map((r) => (r._key === key ? { ...r, ...p } : r)));
  const makeDefault = (key: string) => setRows(rows.map((r) => ({ ...r, is_default: r._key === key, enabled: r._key === key ? true : r.enabled })));
  const remove = (key: string) => {
    const r = rows.find((x) => x._key === key);
    if (!confirm(`Delete "${r?.name || "this method"}"?`)) return;
    setRows(rows.filter((x) => x._key !== key));
  };
  const add = () => {
    const r = blank();
    setRows([...rows, r]);
    setOpen(new Set([...open, r._key]));
  };
  const toggle = (key: string) => {
    const n = new Set(open);
    n.has(key) ? n.delete(key) : n.add(key);
    setOpen(n);
  };
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r._key));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r._key === active.id);
    const to = rows.findIndex((r) => r._key === over.id);
    setRows(arrayMove(rows, from, to));
  };

  const save = async () => {
    // Give each method a stable unique id (new ones from their name).
    const used = new Set<string>();
    const prepared: PaymentMethodConfig[] = rows.map(({ _key, ...m }) => {
      let id = m.id || slugifyMethod(m.name);
      let base = id, i = 2;
      while (used.has(id)) id = `${base}-${i++}`;
      used.add(id);
      return { ...m, id, name: m.name.trim(), receiver_number: m.type === "online" ? m.receiver_number.trim() : "" };
    });
    const problem = validateMethods(prepared);
    if (problem) {
      toast({ title: "Can't save yet", description: problem, variant: "destructive" });
      return;
    }
    // Ensure exactly one default among enabled methods.
    if (!prepared.some((m) => m.is_default && m.enabled)) {
      prepared.forEach((m) => (m.is_default = false));
      const first = prepared.find((m) => m.enabled);
      if (first) first.is_default = true;
    }
    setSaving(true);
    const { error } = await supabase.from("payment_settings").upsert({ id: "default", methods: prepared } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    clearPaymentOptionsCache();
    const next = prepared.map((m, i) => ({ ...m, _key: rows[i]._key }));
    setRows(next);
    rebase(next);
    await queryClient.invalidateQueries({ queryKey: ["public-layout"] });
    toast({ title: "Payment methods saved" });
  };

  return (
    <div className="max-w-3xl space-y-5 pb-20">
      {!hideTitle && (
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Payment Methods Settings</h1>
          <p className="text-sm text-muted-foreground">Checkout payment options customers can choose</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1.5" /> Add method</Button>
        <Button variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r._key)))}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
        <Button className="ml-auto" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Tap a card to expand it. Drag the handle to change the order customers see at checkout — the default method is preselected.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No payment methods yet. Checkout will offer Cash on Delivery until you add one.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r._key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((m, i) => (
                <MethodCard key={m._key} m={m} index={i} open={open.has(m._key)} onToggleOpen={() => toggle(m._key)}
                  onChange={(p) => update(m._key, p)} onMakeDefault={() => makeDefault(m._key)} onDelete={() => remove(m._key)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default PaymentSettings;
