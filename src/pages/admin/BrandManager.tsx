import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminBrands, adminKeys } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronLeft, Search, Tag } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import { Section, FormRow } from "@/components/admin/ui";
import { resolveImageSrc } from "@/lib/cdnImage";

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  image_url: string | null;
  description: string | null;
  enabled: boolean;
  sort_order: number;
}

const emptyBrand: Omit<Brand, "id"> = {
  name: "", slug: "", logo_url: null, image_url: null, description: null, enabled: true, sort_order: 0,
};

const BrandManager = () => {
  const { data, isLoading } = useAdminBrands();
  const brands = (data?.brands ?? []) as Brand[];
  const productCounts = data?.productCounts ?? {};
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Brand | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands
      .filter((b) => !q || b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [brands, search]);

  const handleSave = async () => {
    if (!editing || saving) return;
    const slug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const payload = { ...editing, slug };
    setSaving(true);
    try {
      if (isNew) {
        const { id, ...rest } = payload as any;
        const { error } = await supabase.from("brands").insert(rest);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("brands").update(payload).eq("id", editing.id);
        if (error) throw error;
      }
      toast({ title: isNew ? "Brand created" : "Brand updated" });
      setEditing(null);
      setIsNew(false);
      qc.invalidateQueries({ queryKey: adminKeys.brands });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (productCounts[brand.id]) {
      toast({ title: "Cannot delete", description: `${brand.name} has ${productCounts[brand.id]} active products.`, variant: "destructive" });
      return;
    }
    if (!confirm(`Delete "${brand.name}"?`)) return;
    const prev = qc.getQueryData(adminKeys.brands);
    qc.setQueryData(adminKeys.brands, (old: any) => old ? { ...old, brands: old.brands.filter((b: any) => b.id !== brand.id) } : old);
    const { error } = await supabase.from("brands").delete().eq("id", brand.id);
    if (error) {
      qc.setQueryData(adminKeys.brands, prev);
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Brand deleted" });
    qc.invalidateQueries({ queryKey: adminKeys.brands });
  };

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => { setEditing(null); setIsNew(false); }}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isNew ? "Create" : "Save"}</Button>
        </div>

        <Section title={isNew ? "New brand" : "Edit brand"} description="Brand details">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Brand name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </FormRow>
            <FormRow label="Slug" hint="Auto-generated if empty">
              <Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="auto" />
            </FormRow>
            <FormRow label="Description" className="sm:col-span-2">
              <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} />
            </FormRow>
          </div>
        </Section>

        <Section title="Logo">
          <ImageUpload
            value={editing.logo_url ? [editing.logo_url] : []}
            onChange={(urls) => setEditing({ ...editing, logo_url: urls[0] || null })}
            label="Brand logo"
            hint="400 × 200 px · transparent PNG recommended"
          />
        </Section>

        <Section title="Showcase image" description="Editorial image shown in the homepage Brands section (like categories).">
          <ImageUpload
            value={editing.image_url ? [editing.image_url] : []}
            onChange={(urls) => setEditing({ ...editing, image_url: urls[0] || null })}
            label="Showcase image"
            hint="Recommended 1200 × 1500 px · portrait, high quality"
          />
        </Section>

        <Section title="Visibility">
          <FormRow label="Enabled" hint="Show this brand on the storefront" inline>
            <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
          </FormRow>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="a-toolbar">
        <div className="a-toolbar-search relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--a-soft))] pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditing({ id: "", ...emptyBrand } as Brand); setIsNew(true); }} className="gap-1.5">
          <Plus size={14} /> Add brand
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <div className="text-center text-[13px] text-[hsl(var(--a-soft))] py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))]">
            <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
              <Tag size={16} />
            </div>
            <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">No brands yet</div>
            <div className="text-[12px] text-[hsl(var(--a-muted))] px-6">Add brands to associate them with products.</div>
          </div>
        ) : (
          rows.map((b) => (
            <div key={b.id} className="bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))] p-2.5 flex items-center gap-2.5">
              {b.logo_url ? (
                <img src={resolveImageSrc(b.logo_url, 400)} alt={b.name} className="w-11 h-11 rounded-md object-contain bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex-shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-md bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex items-center justify-center text-[hsl(var(--a-soft))] flex-shrink-0">
                  <Tag size={16} />
                </div>
              )}
              <button
                type="button"
                onClick={() => { setEditing(b); setIsNew(false); }}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-medium text-[hsl(var(--a-ink))] truncate">{b.name}</span>
                  <span className={`a-status ${b.enabled ? "is-on" : "is-off"} shrink-0`}>
                    <span className="dot" />{b.enabled ? "On" : "Off"}
                  </span>
                </div>
                <div className="text-[11.5px] text-[hsl(var(--a-muted))] truncate">/{b.slug} · {productCounts[b.id] || 0} products</div>
              </button>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0" onClick={() => { setEditing(b); setIsNew(false); }}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]" onClick={() => handleDelete(b)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop / tablet table */}
      <div className="a-section overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}>SL</th>
                <th style={{ width: 56 }}>Logo</th>
                <th>Brand</th>
                <th className="hidden sm:table-cell">Slug</th>
                <th style={{ width: 100 }}>Products</th>
                <th className="hidden md:table-cell" style={{ width: 100 }}>Status</th>
                <th style={{ width: 96 }} className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center text-[hsl(var(--a-soft))]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                      <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
                        <Tag size={16} />
                      </div>
                      <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">No brands yet</div>
                      <div className="text-[12px] text-[hsl(var(--a-muted))]">Add brands to associate them with products.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((b, i) => (
                  <tr key={b.id}>
                    <td className="font-mono tabular-nums text-[hsl(var(--a-muted))]">{i + 1}</td>
                    <td>
                      {b.logo_url ? (
                        <img src={resolveImageSrc(b.logo_url, 400)} alt={b.name} className="w-9 h-9 rounded-md object-contain bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))]" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex items-center justify-center text-[hsl(var(--a-soft))]">
                          <Tag size={14} />
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-[hsl(var(--a-ink))] hover:text-[hsl(var(--a-accent))] text-left"
                        onClick={() => { setEditing(b); setIsNew(false); }}
                      >
                        {b.name}
                      </button>
                    </td>
                    <td className="hidden sm:table-cell">
                      <code className="text-[12px] text-[hsl(var(--a-muted))] font-mono">/{b.slug}</code>
                    </td>
                    <td className="font-mono tabular-nums">{productCounts[b.id] || 0}</td>
                    <td className="hidden md:table-cell">
                      <span className={`a-status ${b.enabled ? "is-on" : "is-off"}`}>
                        <span className="dot" />{b.enabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(b); setIsNew(false); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]" onClick={() => handleDelete(b)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BrandManager;
