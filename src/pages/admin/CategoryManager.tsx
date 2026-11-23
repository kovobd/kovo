import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminCategories, adminKeys } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, FolderTree } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import { Section, FormRow } from "@/components/admin/ui";
import { resolveImageSrc } from "@/lib/cdnImage";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  parent_id: string | null;
  image_url: string | null;
  featured_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

interface TreeNode extends Category {
  depth: number;
}

const CategoryManager = () => {
  const { data, isLoading } = useAdminCategories();
  const categories = (data?.categories ?? []) as Category[];
  const productCounts = data?.productCounts ?? {};
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Flatten tree with depth for table display
  const flattened = useMemo<TreeNode[]>(() => {
    const out: TreeNode[] = [];
    const walk = (parentId: string | null, depth: number) => {
      categories
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((c) => {
          out.push({ ...c, depth });
          walk(c.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [categories]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flattened;
    return flattened.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
  }, [flattened, search]);

  const handleSave = async () => {
    if (!editing || saving) return;
    const slug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const payload = {
      name: editing.name, slug,
      sort_order: editing.sort_order,
      parent_id: editing.parent_id,
      image_url: editing.image_url,
      featured_image_url: editing.featured_image_url,
      meta_title: editing.meta_title,
      meta_description: editing.meta_description,
    };
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
        if (error) throw error;
      }
      bumpStorefrontVersion();
      toast({ title: isNew ? "Category created" : "Category updated" });
      setEditing(null);
      setIsNew(false);
      qc.invalidateQueries({ queryKey: adminKeys.categories });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (productCounts[cat.id]) {
      toast({ title: "Cannot delete", description: `"${cat.name}" has ${productCounts[cat.id]} products assigned.`, variant: "destructive" });
      return;
    }
    const hasChildren = categories.some((c) => c.parent_id === cat.id);
    if (hasChildren) {
      toast({ title: "Cannot delete", description: `"${cat.name}" has subcategories. Remove them first.`, variant: "destructive" });
      return;
    }
    if (!confirm(`Delete "${cat.name}"?`)) return;
    const prev = qc.getQueryData(adminKeys.categories);
    qc.setQueryData(adminKeys.categories, (old: any) => old ? { ...old, categories: old.categories.filter((c: any) => c.id !== cat.id) } : old);
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) {
      qc.setQueryData(adminKeys.categories, prev);
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    bumpStorefrontVersion();
    toast({ title: "Category deleted" });
    qc.invalidateQueries({ queryKey: adminKeys.categories });
  };

  const getParentOptions = (excludeId?: string): Category[] => {
    if (!excludeId) return categories;
    const descendants = new Set<string>();
    const collect = (id: string) => {
      descendants.add(id);
      categories.filter((c) => c.parent_id === id).forEach((c) => collect(c.id));
    };
    collect(excludeId);
    return categories.filter((c) => !descendants.has(c.id));
  };

  const getCategoryPath = (cat: Category): string => {
    const parts: string[] = [cat.name];
    let current = cat;
    while (current.parent_id) {
      const parent = categories.find((c) => c.id === current.parent_id);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts.join(" → ");
  };

  if (editing) {
    const parentOptions = getParentOptions(isNew ? undefined : editing.id);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => { setEditing(null); setIsNew(false); }}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isNew ? "Create" : "Save"}</Button>
        </div>

        <Section title={isNew ? "New category" : "Edit category"} description="Basic information">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </FormRow>
            <FormRow label="Slug" hint="Auto-generated from name if empty">
              <Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="auto" />
            </FormRow>
            <FormRow label="Parent category" className="sm:col-span-2">
              <Select value={editing.parent_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, parent_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (top level)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{getCategoryPath(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Sort order">
              <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: +e.target.value })} />
            </FormRow>
          </div>
        </Section>

        <Section title="Images" description="Category & featured imagery">
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageUpload
              value={editing.image_url ? [editing.image_url] : []}
              onChange={(urls) => setEditing({ ...editing, image_url: urls[0] || null })}
              multiple={false}
              label="Category image"
              cropAspect="1:1"
              hint="1:1 · 1600 × 1600 px"
            />
            <ImageUpload
              value={editing.featured_image_url ? [editing.featured_image_url] : []}
              onChange={(urls) => setEditing({ ...editing, featured_image_url: urls[0] || null })}
              multiple={false}
              label="Featured image"
              cropAspect="4:5"
              hint="Optional · 4:5 · homepage card"
            />
          </div>
        </Section>

        <Section title="SEO" description="Search engine metadata">
          <div className="grid gap-4">
            <FormRow label="Meta title">
              <Input value={editing.meta_title ?? ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} placeholder="Optional" />
            </FormRow>
            <FormRow label="Meta description">
              <Input value={editing.meta_description ?? ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} placeholder="Optional" />
            </FormRow>
          </div>
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
            placeholder="Search categories…"
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => { setEditing({ id: "", name: "", slug: "", sort_order: 0, parent_id: null, image_url: null, featured_image_url: null, meta_title: null, meta_description: null }); setIsNew(true); }}
          className="gap-1.5"
        >
          <Plus size={14} /> Add category
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <div className="text-center text-[13px] text-[hsl(var(--a-soft))] py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))]">
            <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
              <FolderTree size={16} />
            </div>
            <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">No categories yet</div>
            <div className="text-[12px] text-[hsl(var(--a-muted))] px-6">Create your first category to start organizing products.</div>
          </div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className="bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))] p-2.5 flex items-center gap-2.5"
              style={{ marginLeft: c.depth * 12 }}
            >
              {c.image_url ? (
                <img src={resolveImageSrc(c.image_url, 400)} alt="" className="w-11 h-11 rounded-md object-cover bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex-shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-md bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex items-center justify-center text-[hsl(var(--a-soft))] flex-shrink-0">
                  <FolderTree size={16} />
                </div>
              )}
              <button
                type="button"
                onClick={() => { setEditing(c); setIsNew(false); }}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-[13.5px] font-medium text-[hsl(var(--a-ink))] truncate flex items-center gap-1">
                  {c.depth > 0 && <ChevronRight size={11} className="text-[hsl(var(--a-soft))] shrink-0" />}
                  {c.name}
                </div>
                <div className="text-[11.5px] text-[hsl(var(--a-muted))] truncate">/{c.slug} · {productCounts[c.id] || 0} products</div>
              </button>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0" onClick={() => { setEditing(c); setIsNew(false); }}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]" onClick={() => handleDelete(c)}>
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
                <th style={{ width: 56 }}>Image</th>
                <th>Category</th>
                <th className="hidden sm:table-cell">Slug</th>
                <th style={{ width: 100 }}>Products</th>
                <th style={{ width: 96 }} className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center text-[hsl(var(--a-soft))]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                      <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
                        <FolderTree size={16} />
                      </div>
                      <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">No categories yet</div>
                      <div className="text-[12px] text-[hsl(var(--a-muted))]">Create your first category to start organizing products.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => (
                  <tr key={c.id}>
                    <td className="font-mono tabular-nums text-[hsl(var(--a-muted))]">{i + 1}</td>
                    <td>
                      {c.image_url ? (
                        <img src={resolveImageSrc(c.image_url, 400)} alt="" className="w-9 h-9 rounded-md object-cover bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))]" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] border border-[hsl(var(--a-stroke))] flex items-center justify-center text-[hsl(var(--a-soft))]">
                          <FolderTree size={14} />
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: c.depth * 16 }}>
                        {c.depth > 0 && <ChevronRight size={12} className="text-[hsl(var(--a-soft))] shrink-0" />}
                        <button
                          type="button"
                          className="font-medium text-[hsl(var(--a-ink))] hover:text-[hsl(var(--a-accent))] text-left"
                          onClick={() => { setEditing(c); setIsNew(false); }}
                        >
                          {c.name}
                        </button>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <code className="text-[12px] text-[hsl(var(--a-muted))] font-mono">/{c.slug}</code>
                    </td>
                    <td className="font-mono tabular-nums">{productCounts[c.id] || 0}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setIsNew(false); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]" onClick={() => handleDelete(c)}>
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

export default CategoryManager;
