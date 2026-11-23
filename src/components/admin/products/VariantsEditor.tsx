import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, Image as ImageIcon, Check, Type, Palette, Image as ImagePicker, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { uploadToR2 } from "@/lib/r2Upload";
import { resolveImageSrc } from "@/lib/cdnImage";
import {
  type OptionGroup,
  type VariantRow,
  buildVariantCombinations,
  variantKey,
} from "@/lib/variants";

interface BasePatch {
  price?: number;
  sale_price?: number | null;
  stock?: number;
  sku?: string;
  reminder_days?: number | null;
  reminder_notes?: string | null;
}

interface Props {
  basePrice: number;
  baseSalePrice: number | null;
  baseStock: number;
  baseSku: string;
  baseReminderDays?: number | null;
  baseReminderNotes?: string | null;
  images: string[];
  onImagesChange?: (imgs: string[]) => void;
  optionGroups: OptionGroup[];
  onOptionGroupsChange: (g: OptionGroup[]) => void;
  variantRows: VariantRow[];
  onVariantRowsChange: (r: VariantRow[]) => void;
  onBaseChange: (patch: BasePatch) => void;
}

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.08em] block mb-1.5">
    {children}
  </label>
);

const PALETTE_PRESETS = [
  "#000000","#FFFFFF","#6B4F3A","#8B5A3C","#C19A6B","#A0522D",
  "#1F2937","#374151","#9CA3AF","#E5E7EB","#DC2626","#EA580C",
  "#CA8A04","#16A34A","#0891B2","#2563EB","#7C3AED","#DB2777",
  "#F5F5DC","#F0E6D2","#D4AF37","#B76E79","#2E2E2E","#5C4033",
];

async function uploadValueImage(file: File): Promise<string> {
  return uploadToR2(file, { prefix: "products", mime: file.type });
}

const VariantsEditor: React.FC<Props> = ({
  basePrice,
  baseSalePrice,
  baseStock,
  baseSku,
  baseReminderDays,
  baseReminderNotes,
  images,
  onImagesChange,
  optionGroups,
  onOptionGroupsChange,
  variantRows,
  onVariantRowsChange,
  onBaseChange,
}) => {
  const combos = useMemo(() => buildVariantCombinations(optionGroups), [optionGroups]);
  const expectedCount = combos.length;
  const hasOptions = optionGroups.some((g) => g.name.trim() && g.values.length > 0);

  const [mode, setMode] = React.useState<"single" | "variant">(
    hasOptions || variantRows.length > 0 ? "variant" : "single"
  );
  const userPickedRef = useRef(false);

  // If the parent loads variants/options after first render, switch into
  // variant mode automatically — but never override an explicit user choice.
  useEffect(() => {
    if (userPickedRef.current) return;
    if ((hasOptions || variantRows.length > 0) && mode !== "variant") {
      setMode("variant");
    }
  }, [hasOptions, variantRows.length, mode]);

  // Auto-sync variant rows from combos
  useEffect(() => {
    if (mode !== "variant") return;
    if (expectedCount === 0) {
      if (variantRows.length > 0) onVariantRowsChange([]);
      return;
    }
    const sameLength = variantRows.length === expectedCount;
    const allMatch =
      sameLength &&
      combos.every((c) =>
        variantRows.find((r) => variantKey(r.option_values) === variantKey(c))
      );
    if (allMatch) return;

    const next: VariantRow[] = combos.map((combo, i) => {
      const existing = variantRows.find(
        (r) => variantKey(r.option_values) === variantKey(combo)
      );
      if (existing) return { ...existing, sort_order: i };
      return {
        option_values: combo,
        price: basePrice || 0,
        sale_price: baseSalePrice,
        stock: 0,
        sku: baseSku ? `${baseSku}-${Object.values(combo).join("-")}` : "",
        active: true,
        sort_order: i,
        image_url: null,
      };
    });
    onVariantRowsChange(next);
     
  }, [JSON.stringify(combos)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── option group helpers ─────────────────────────────
  const addGroup = () =>
    onOptionGroupsChange([
      ...optionGroups,
      { name: "", values: [], type: "text", show_on_card: true, image_map: {}, color_map: {} },
    ]);
  const updateGroup = (idx: number, patch: Partial<OptionGroup>) =>
    onOptionGroupsChange(optionGroups.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const removeGroup = (idx: number) =>
    onOptionGroupsChange(optionGroups.filter((_, i) => i !== idx));
  const addValue = (idx: number, v: string) => {
    const value = v.trim();
    if (!value) return;
    const g = optionGroups[idx];
    if (g.values.includes(value)) return;
    updateGroup(idx, { values: [...g.values, value] });
  };
  const removeValue = (idx: number, value: string) => {
    const g = optionGroups[idx];
    const im = { ...(g.image_map || {}) };
    const cm = { ...(g.color_map || {}) };
    delete im[value];
    delete cm[value];
    updateGroup(idx, {
      values: g.values.filter((x) => x !== value),
      image_map: im,
      color_map: cm,
    });
  };

  const updateRow = (idx: number, patch: Partial<VariantRow>) =>
    onVariantRowsChange(variantRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      {/* ── Mode selector ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { v: "single", label: "Single product", hint: "One price · one SKU" },
          { v: "variant", label: "With variants", hint: "Shade · size · etc." },
        ] as const).map((m) => {
          const active = mode === m.v;
          return (
            <button
              key={m.v}
              type="button"
              onClick={() => {
                if (m.v === "single" && mode === "variant" && (optionGroups.length > 0 || variantRows.length > 0)) {
                  const ok = window.confirm(
                    "Switching to single product will remove all options and variant rows. Continue?"
                  );
                  if (!ok) return;
                }
                if (m.v === "single") {
                  onOptionGroupsChange([]);
                  onVariantRowsChange([]);
                }
                userPickedRef.current = true;
                setMode(m.v);
              }}
              className={`group flex items-center gap-2.5 p-3 rounded-[4px] border text-left transition ${
                active
                  ? "border-foreground bg-foreground/[0.03] "
                  : "border-border hover:border-border bg-background"
              }`}
            >
              <span
                className={`w-8 h-8 rounded-[4px] flex items-center justify-center ${
                  active ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {m.v === "single" ? <ImagePicker size={14} /> : <Palette size={14} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-foreground">{m.label}</span>
                <span className="block text-[10.5px] text-muted-foreground/60">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Single product mode ── */}
      {mode === "single" && (
        <div className="bg-background rounded-[4px] border border-border p-4 sm:p-6 space-y-4">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Pricing & inventory</h3>
            <p className="text-[11.5px] text-muted-foreground/60 mt-0.5">
              Applies to every sale of this product.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <FieldLabel>Price ({CURRENCY_SYMBOL})</FieldLabel>
              <Input
                type="number"
                value={basePrice}
                onChange={(e) => onBaseChange({ price: +e.target.value })}
                className="h-10 tabular-nums rounded-[4px]"
              />
            </div>
            <div>
              <FieldLabel>Sale price</FieldLabel>
              <Input
                type="number"
                value={baseSalePrice ?? ""}
                onChange={(e) =>
                  onBaseChange({ sale_price: e.target.value ? +e.target.value : null })
                }
                className="h-10 tabular-nums rounded-[4px]"
              />
            </div>
            <div>
              <FieldLabel>Stock</FieldLabel>
              <Input
                type="number"
                value={baseStock}
                onChange={(e) => onBaseChange({ stock: +e.target.value })}
                className="h-10 tabular-nums rounded-[4px]"
              />
            </div>
            <div>
              <FieldLabel>SKU</FieldLabel>
              <Input
                value={baseSku}
                onChange={(e) => onBaseChange({ sku: e.target.value })}
                placeholder="ABC-001"
                className="h-10 font-mono text-[12px] rounded-[4px]"
              />
            </div>
            <div>
              <FieldLabel>Reorder days</FieldLabel>
              <Input
                type="number"
                min="1"
                max="365"
                value={baseReminderDays ?? ""}
                onChange={(e) =>
                  onBaseChange({ reminder_days: e.target.value === "" ? null : +e.target.value })
                }
                placeholder="e.g. 30"
                className="h-10 tabular-nums rounded-[4px]"
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <FieldLabel>Reorder notes</FieldLabel>
              <Input
                value={baseReminderNotes ?? ""}
                onChange={(e) => onBaseChange({ reminder_notes: e.target.value })}
                placeholder="Internal note shown to staff when calling"
                className="h-10 rounded-[4px] text-[13px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Options ── */}
      {mode === "variant" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-foreground">Options</h3>
              <p className="text-[11.5px] text-muted-foreground/60 mt-0.5">
                Add an option like Shade or Size. Each combination becomes a variant.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addGroup}
              className="rounded-[4px] h-9 px-3.5 text-[12px] w-full sm:w-auto"
            >
              <Plus size={13} className="mr-1.5" /> Add option
            </Button>
          </div>


          {optionGroups.length === 0 && (
            <div className="rounded-[4px] border border-dashed border-border bg-background p-10 text-center">
              <p className="text-[12.5px] text-muted-foreground/70">
                No options yet. Add one to start building variants.
              </p>
            </div>
          )}

          {optionGroups.map((g, gi) => {
            const type = g.type ?? "text";
            const showOnCard = g.show_on_card !== false;
            return (
              <div
                key={gi}
                className="bg-background rounded-[4px] border border-border p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0"
              >
                {/* Name + delete */}
                <div className="space-y-2 min-w-0">
                  <FieldLabel>Option name</FieldLabel>
                  <div className="flex items-center gap-2 min-w-0">
                    <Input
                      value={g.name}
                      onChange={(e) => updateGroup(gi, { name: e.target.value })}
                      placeholder="e.g. Color, Size, Material"
                      className="flex-1 min-w-0 h-9 rounded-[4px] text-[12.5px] font-medium"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGroup(gi)}
                      className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0 rounded-[4px]"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>

                {/* Display type + show on cards */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[4px] border border-border bg-muted/[0.04] px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[12px] font-medium text-foreground shrink-0">Display</span>
                    <div className="inline-flex rounded-[4px] border border-border bg-background p-0.5 flex-1 sm:flex-initial">
                      {([
                        { v: "text", icon: Type, label: "Text" },
                        { v: "color", icon: Palette, label: "Color" },
                        { v: "image", icon: ImageIcon, label: "Image" },
                      ] as const).map((t) => {
                        const Ic = t.icon;
                        const active = type === t.v;
                        return (
                          <button
                            key={t.v}
                            type="button"
                            onClick={() => updateGroup(gi, { type: t.v })}
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-[4px] text-[12px] font-medium transition flex-1 sm:flex-initial ${
                              active
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Ic size={12} /> {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center justify-between sm:justify-start gap-2.5 cursor-pointer select-none">
                    <span className="text-[12px] text-muted-foreground">Show on cards</span>
                    <Switch
                      checked={showOnCard}
                      onCheckedChange={(v) => updateGroup(gi, { show_on_card: v })}
                    />
                  </label>
                </div>


                {/* Values */}
                <div>
                  <FieldLabel>Values</FieldLabel>
                  <div className="flex flex-wrap gap-2 items-center">
                    {g.values.map((val) => (
                      <ValueChip
                        key={val}
                        value={val}
                        type={type}
                        colorHex={g.color_map?.[val] || ""}
                        imageIdx={g.image_map?.[val]}
                        images={images}
                        onColor={(hex) =>
                          updateGroup(gi, {
                            color_map: { ...(g.color_map || {}), [val]: hex },
                          })
                        }
                        onImage={(idx) =>
                          updateGroup(gi, {
                            image_map: { ...(g.image_map || {}), [val]: idx },
                          })
                        }
                        onUpload={async (file) => {
                          if (!onImagesChange) return;
                          const url = await uploadValueImage(file);
                          const nextImages = [...images, url];
                          onImagesChange(nextImages);
                          updateGroup(gi, {
                            image_map: { ...(g.image_map || {}), [val]: nextImages.length - 1 },
                          });
                        }}
                        onRemove={() => removeValue(gi, val)}
                      />
                    ))}
                    <ValueAdder onAdd={(v) => addValue(gi, v)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Variants ── */}
      {mode === "variant" && hasOptions && variantRows.length > 0 && (
        <div className="bg-background rounded-[4px] border border-border p-3.5 sm:p-7 space-y-4 sm:space-y-5 min-w-0">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground tracking-tight">
              Variants{" "}
              <span className="text-muted-foreground/45 font-normal">· {variantRows.length}</span>
            </h3>
            <p className="text-[12.5px] text-muted-foreground/55 mt-1">
              Per-combination price, stock and media. Reorder days: leave blank to use the product default, set 0 to disable reminders for that variant.
            </p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[1.5fr_120px_120px_100px_160px_60px_60px] gap-3 px-4 pb-3 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/45 font-medium">
              <div>Variant</div>
              <div>Price</div>
              <div>Sale</div>
              <div>Stock</div>
              <div>SKU</div>
              <div className="text-center">Media</div>
              <div className="text-center">On</div>
            </div>
            <div className="space-y-2">
              {variantRows.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-[4px] border border-border bg-background hover:border-border transition px-4 py-3.5 space-y-3"
                >
                  <div className="grid grid-cols-[1.5fr_120px_120px_100px_160px_60px_60px] gap-3 items-center">
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 min-w-0 text-[13px]">
                      {Object.entries(row.option_values).map(([k, v]) => (
                        <span key={k} className="inline-flex items-baseline gap-1.5">
                          <span className="text-muted-foreground/55">{k}:</span>
                          <span className="text-foreground font-semibold">{v}</span>
                        </span>
                      ))}
                    </div>
                    <Input
                      type="number"
                      value={row.price}
                      onChange={(e) => updateRow(idx, { price: +e.target.value })}
                      className="h-10 text-[13px] tabular-nums px-3 rounded-[4px]"
                    />
                    <Input
                      type="number"
                      value={row.sale_price ?? ""}
                      onChange={(e) =>
                        updateRow(idx, { sale_price: e.target.value ? +e.target.value : null })
                      }
                      placeholder={CURRENCY_SYMBOL}
                      className="h-10 text-[13px] tabular-nums px-3 rounded-[4px]"
                    />
                    <Input
                      type="number"
                      value={row.stock}
                      onChange={(e) => updateRow(idx, { stock: +e.target.value })}
                      className="h-10 text-[13px] tabular-nums px-3 rounded-[4px]"
                    />
                    <Input
                      value={row.sku}
                      onChange={(e) => updateRow(idx, { sku: e.target.value })}
                      placeholder="SKU"
                      className="h-10 text-[12.5px] font-mono px-3 rounded-[4px]"
                    />
                    <div className="flex justify-center">
                      <MediaPicker
                        images={images}
                        value={row.image_url ?? null}
                        onChange={(url) => updateRow(idx, { image_url: url })}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={row.active}
                        onCheckedChange={(v) => updateRow(idx, { active: v })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.5fr_120px_minmax(0,1fr)_60px_60px] gap-3 items-center">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/45 font-medium pl-1">Reorder</span>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={row.reminder_days ?? ""}
                      onChange={(e) =>
                        updateRow(idx, { reminder_days: e.target.value === "" ? null : +e.target.value })
                      }
                      placeholder="Days"
                      className="h-10 text-[13px] tabular-nums px-3 rounded-[4px]"
                    />
                    <Input
                      value={row.reminder_notes ?? ""}
                      onChange={(e) => updateRow(idx, { reminder_notes: e.target.value })}
                      placeholder="Reorder notes (optional)"
                      className="h-10 text-[13px] px-3 rounded-[4px]"
                    />
                    <div />
                    <div />
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {variantRows.map((row, idx) => (
              <div
                key={idx}
                className="rounded-[4px] border border-border p-3 bg-background space-y-3 min-w-0"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0 flex-1">
                    {Object.entries(row.option_values).map(([k, v]) => (
                      <span key={k} className="inline-flex items-baseline gap-1 text-[12.5px] min-w-0">
                        <span className="text-muted-foreground/50">{k}:</span>
                        <span className="text-foreground font-medium truncate">{v}</span>
                      </span>
                    ))}
                  </div>
                  <Switch
                    checked={row.active}
                    onCheckedChange={(v) => updateRow(idx, { active: v })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <FieldLabel>Price</FieldLabel>
                    <Input
                      type="number"
                      value={row.price}
                      onChange={(e) => updateRow(idx, { price: +e.target.value })}
                      className="h-10 tabular-nums rounded-[4px]"
                    />
                  </div>
                  <div>
                    <FieldLabel>Sale</FieldLabel>
                    <Input
                      type="number"
                      value={row.sale_price ?? ""}
                      onChange={(e) =>
                        updateRow(idx, { sale_price: e.target.value ? +e.target.value : null })
                      }
                      placeholder={CURRENCY_SYMBOL}
                      className="h-10 tabular-nums rounded-[4px]"
                    />
                  </div>
                  <div>
                    <FieldLabel>Stock</FieldLabel>
                    <Input
                      type="number"
                      value={row.stock}
                      onChange={(e) => updateRow(idx, { stock: +e.target.value })}
                      className="h-10 tabular-nums rounded-[4px]"
                    />
                  </div>
                  <div>
                    <FieldLabel>SKU</FieldLabel>
                    <Input
                      value={row.sku}
                      onChange={(e) => updateRow(idx, { sku: e.target.value })}
                      placeholder="SKU"
                      className="h-10 font-mono text-[13px] rounded-[4px]"
                    />
                  </div>
                  <div>
                    <FieldLabel>Reorder days</FieldLabel>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={row.reminder_days ?? ""}
                      onChange={(e) =>
                        updateRow(idx, { reminder_days: e.target.value === "" ? null : +e.target.value })
                      }
                      placeholder="e.g. 30"
                      className="h-10 tabular-nums rounded-[4px]"
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Reorder notes</FieldLabel>
                    <Input
                      value={row.reminder_notes ?? ""}
                      onChange={(e) => updateRow(idx, { reminder_notes: e.target.value })}
                      placeholder="Internal note (optional)"
                      className="h-10 rounded-[4px] text-[13px]"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <FieldLabel>Media</FieldLabel>
                  <MediaPicker
                    images={images}
                    value={row.image_url ?? null}
                    onChange={(url) => updateRow(idx, { image_url: url })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── ValueChip: renders text / color swatch / image swatch ─────────────────
const ValueChip: React.FC<{
  value: string;
  type: "text" | "color" | "image";
  colorHex: string;
  imageIdx?: number;
  images: string[];
  onColor: (hex: string) => void;
  onImage: (idx: number) => void;
  onUpload?: (file: File) => Promise<void>;
  onRemove: () => void;
}> = ({ value, type, colorHex, imageIdx, images, onColor, onImage, onUpload, onRemove }) => {
  const hasImage = imageIdx != null && imageIdx < images.length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(f);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Try again", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5 bg-background border border-border rounded-[8px] pl-1 pr-2 py-1 text-[12.5px] hover:border-border transition">
      {type === "color" && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={colorHex || "Pick color"}
              className="w-6 h-6 rounded-full border border-border overflow-hidden shrink-0"
              style={{
                background:
                  colorHex ||
                  "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 8px 8px",
              }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-[244px] p-3 space-y-2" align="start">
            <p className="text-[11px] font-medium text-foreground">Color for "{value}"</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorHex || "#000000"}
                onChange={(e) => onColor(e.target.value)}
                className="w-10 h-10 rounded-[4px] border border-border cursor-pointer bg-transparent"
              />
              <Input
                value={colorHex}
                onChange={(e) => onColor(e.target.value)}
                placeholder="#000000"
                className="h-9 font-mono text-[12px] uppercase"
              />
            </div>
            <div className="grid grid-cols-8 gap-1.5 pt-1">
              {PALETTE_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onColor(hex)}
                  style={{ background: hex }}
                  className={`w-6 h-6 rounded-full border ${
                    colorHex.toUpperCase() === hex
                      ? "ring-2 ring-foreground border-foreground"
                      : "border-border"
                  }`}
                  title={hex}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {type === "image" && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={hasImage ? `Image ${(imageIdx as number) + 1}` : "Pick image"}
              className={`w-6 h-6 rounded-full overflow-hidden shrink-0 border ${
                hasImage
                  ? "border-foreground/40"
                  : "border-dashed border-border bg-muted/30 flex items-center justify-center"
              }`}
            >
              {hasImage ? (
                <img
                  src={resolveImageSrc(images[imageIdx as number], 400)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon size={10} className="text-muted-foreground/50" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3 space-y-2.5" align="start">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-foreground">Image for "{value}"</p>
              {onUpload && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[10.5px] font-medium text-foreground hover:text-primary disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </>
              )}
            </div>
            {images.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground/60">
                Upload an image for this value, or add images in the Media tab.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {images.map((src, idx) => {
                  const active = imageIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onImage(idx)}
                      className={`relative aspect-square rounded-[4px] overflow-hidden border-2 transition ${
                        active
                          ? "border-foreground ring-2 ring-foreground/15"
                          : "border-transparent hover:border-border"
                      }`}
                    >
                      <img src={resolveImageSrc(src, 400)} alt="" className="w-full h-full object-cover" />
                      {active && (
                        <span className="absolute inset-0 bg-foreground/15 flex items-center justify-center">
                          <Check size={12} className="text-background drop-shadow" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      <span className="text-foreground font-medium">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="w-4 h-4 rounded-full hover:bg-destructive/15 flex items-center justify-center text-muted-foreground/60 hover:text-destructive"
      >
        <X size={10} />
      </button>
    </span>
  );
};

// ── MediaPicker: per-variant media from product gallery ─────────────────
const MediaPicker: React.FC<{
  images: string[];
  value: string | null;
  onChange: (url: string | null) => void;
}> = ({ images, value, onChange }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={value ? "Change media" : "Select media"}
          className={`w-9 h-9 rounded-[4px] overflow-hidden border flex items-center justify-center transition ${
            value
              ? "border-border"
              : "border-dashed border-border bg-muted/20 hover:border-border"
          }`}
        >
          {value ? (
            <img src={resolveImageSrc(value, 400)} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={13} className="text-muted-foreground/60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="end">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11.5px] font-medium text-foreground">Select media</p>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[10.5px] text-muted-foreground hover:text-destructive"
            >
              Clear
            </button>
          )}
        </div>
        {images.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/60">
            Upload product images first in the Media tab.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {images.map((src, idx) => {
              const active = value === src;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onChange(src)}
                  className={`relative aspect-square rounded-[4px] overflow-hidden border-2 transition ${
                    active
                      ? "border-foreground ring-2 ring-foreground/15"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <img src={resolveImageSrc(src, 400)} alt="" className="w-full h-full object-cover" />
                  {active && (
                    <span className="absolute inset-0 bg-foreground/15 flex items-center justify-center">
                      <Check size={12} className="text-background drop-shadow" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const ValueAdder: React.FC<{ onAdd: (v: string) => void }> = ({ onAdd }) => {
  const [val, setVal] = React.useState("");
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          if (val.trim()) {
            onAdd(val);
            setVal("");
          }
        }
      }}
      onBlur={() => {
        if (val.trim()) {
          onAdd(val);
          setVal("");
        }
      }}
      placeholder="Add value"
      className="bg-transparent border border-dashed border-border rounded-[8px] px-3.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/40 min-w-[120px]"
    />
  );
};

export default VariantsEditor;
