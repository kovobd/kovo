import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface ProductDetailRow {
  id?: string;
  label: string;
  value: string;
  sort_order: number;
  _isNew?: boolean;
  _deleted?: boolean;
  _tmpKey?: string;
}

interface Props {
  showStockStatus: boolean;
  showOffers: boolean;
  showBrand: boolean;
  details: ProductDetailRow[];
  onChange: (patch: Partial<{ showStockStatus: boolean; showOffers: boolean; showBrand: boolean }>) => void;
  onDetailsChange: (next: ProductDetailRow[]) => void;
}

const Row: React.FC<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label, hint, checked, onChange,
}) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-t border-border/15 first:border-t-0">
    <div className="min-w-0">
      <p className="text-[13px] text-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground/50 mt-0.5">{hint}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const keyFor = (r: ProductDetailRow, i: number) => r.id ?? r._tmpKey ?? `new-${i}`;

const SortableDetailCard: React.FC<{
  row: ProductDetailRow;
  rowKey: string;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ row, rowKey, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowKey });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border border-border/40 rounded-[4px] px-2.5 py-2 bg-background"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing p-1 touch-none shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical size={13} />
      </button>
      <div className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
        <span className="text-[12px] font-medium text-foreground truncate">{row.label || <span className="text-muted-foreground/50 italic">Untitled</span>}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-[12px] text-muted-foreground truncate">{row.value || <span className="text-muted-foreground/40 italic">—</span>}</span>
      </div>
      <Button
        variant="ghost" size="sm" onClick={onEdit}
        className="text-muted-foreground/60 hover:text-foreground h-7 w-7 p-0 rounded-[4px] shrink-0"
        aria-label="Edit detail"
      >
        <Pencil size={12} />
      </Button>
      <Button
        variant="ghost" size="sm" onClick={onDelete}
        className="text-muted-foreground/40 hover:text-destructive h-7 w-7 p-0 rounded-[4px] shrink-0"
        aria-label="Delete detail"
      >
        <Trash2 size={12} />
      </Button>
    </div>
  );
};

const DisplaySettings: React.FC<Props> = ({
  showStockStatus, showOffers, showBrand, details, onChange, onDetailsChange,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const visible = details.filter((d) => !d._deleted);
  const visibleKeys = visible.map((d) => keyFor(d, details.indexOf(d)));

  // Dialog state: index = -1 means "new"
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const openNew = () => {
    setEditingIdx(-1);
    setDraftLabel("");
    setDraftValue("");
  };
  const openEdit = (origIdx: number) => {
    setEditingIdx(origIdx);
    setDraftLabel(details[origIdx].label);
    setDraftValue(details[origIdx].value);
  };
  const closeDialog = () => setEditingIdx(null);

  const saveDialog = () => {
    if (editingIdx === null) return;
    const label = draftLabel.trim();
    const value = draftValue.trim();
    if (!label && !value) { closeDialog(); return; }
    if (editingIdx === -1) {
      onDetailsChange([
        ...details,
        {
          label, value,
          sort_order: details.filter((d) => !d._deleted).length,
          _isNew: true,
          _tmpKey: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
      ]);
    } else {
      onDetailsChange(details.map((d, i) => (i === editingIdx ? { ...d, label, value } : d)));
    }
    closeDialog();
  };

  const deleteAt = (origIdx: number) => {
    const row = details[origIdx];
    if (row._isNew) onDetailsChange(details.filter((_, i) => i !== origIdx));
    else onDetailsChange(details.map((d, i) => (i === origIdx ? { ...d, _deleted: true } : d)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromVis = visibleKeys.indexOf(String(active.id));
    const toVis = visibleKeys.indexOf(String(over.id));
    if (fromVis < 0 || toVis < 0) return;
    const reorderedVisible = arrayMove(visible, fromVis, toVis).map((d, i) => ({ ...d, sort_order: i }));
    const deletedRows = details.filter((d) => d._deleted);
    onDetailsChange([...reorderedVisible, ...deletedRows]);
  };

  return (
    <div className="space-y-5">
      {/* Single unified Product Details card with toggles + manager */}
      <div className="bg-background rounded-2xl border border-border/30 p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[12px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Product details
            </h3>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              Configure what shows in the Details section on the product page.
            </p>
          </div>
        </div>

        {/* Toggles merged into Product Details */}
        <div className="space-y-0">
          <Row
            label="Show brand"
            hint="Display the brand inside the Details section."
            checked={showBrand}
            onChange={(v) => onChange({ showBrand: v })}
          />
          <Row
            label="Show stock status"
            hint="Display in-stock / low-stock messaging inside Details."
            checked={showStockStatus}
            onChange={(v) => onChange({ showStockStatus: v })}
          />
          <Row
            label="Show offers"
            hint="Display attached offers and Buy-X-Get-Y badges."
            checked={showOffers}
            onChange={(v) => onChange({ showOffers: v })}
          />
        </div>

        {/* Custom details list */}
        <div className="pt-4 border-t border-border/20 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-foreground">Custom details</p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Drag to reorder. Section hides when empty.</p>
            </div>
            <Button size="sm" variant="outline" onClick={openNew} className="h-8 rounded-[4px] text-[12px] shrink-0">
              <Plus size={12} className="mr-1" /> Add detail
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/50 text-center py-5 border border-dashed border-border/40 rounded-[4px]">
              No details yet. Add rows like Material, Origin, Fit, Warranty…
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleKeys} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {visible.map((row) => {
                    const origIdx = details.indexOf(row);
                    const k = keyFor(row, origIdx);
                    return (
                      <SortableDetailCard
                        key={k}
                        rowKey={k}
                        row={row}
                        onEdit={() => openEdit(origIdx)}
                        onDelete={() => deleteAt(origIdx)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Dialog open={editingIdx !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md rounded-[8px]">
          <DialogHeader>
            <DialogTitle className="text-[14px]">{editingIdx === -1 ? "Add detail" : "Edit detail"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Field</Label>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="e.g. Material"
                className="h-9 text-[13px] rounded-[4px]"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Value</Label>
              <Input
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                placeholder="e.g. 100% Cotton"
                className="h-9 text-[13px] rounded-[4px]"
                onKeyDown={(e) => { if (e.key === "Enter") saveDialog(); }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeDialog} className="h-9 rounded-[4px] text-[12px]">Cancel</Button>
            <Button onClick={saveDialog} className="h-9 rounded-[4px] text-[12px]">
              {editingIdx === -1 ? "Add detail" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DisplaySettings;
