import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { adminKeys, useAdminTags } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Tag as TagIcon, ChevronLeft } from "lucide-react";
import { Section, FormRow } from "@/components/admin/ui";

interface Tag {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const emptyTag: Omit<Tag, "id"> = { name: "", slug: "", sort_order: 0 };

const TagManager = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useAdminTags();
  const tags = (data?.tags ?? []) as Tag[];
  const productCounts = data?.productCounts ?? {};
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Tag | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editing || saving) return;
    const name = editing.name.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const slug = (editing.slug || slugify(name)).trim();
    try {
      if (isNew) {
        const { error } = await supabase.from("tags").insert({
          name, slug, sort_order: editing.sort_order ?? tags.length,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tags")
          .update({ name, slug, sort_order: editing.sort_order })
          .eq("id", editing.id);
        if (error) throw error;
      }
      toast({ title: isNew ? "Tag created" : "Tag updated" });
      setEditing(null);
      setIsNew(false);
      qc.invalidateQueries({ queryKey: adminKeys.tags });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (productCounts[tag.id]) {
      toast({ title: "Cannot delete", description: `"${tag.name}" is used by ${productCounts[tag.id]} products.`, variant: "destructive" });
      return;
    }
    if (!confirm(`Delete "${tag.name}"?`)) return;
    qc.setQueryData(adminKeys.tags, (old: any) => old ? { ...old, tags: old.tags.filter((t: any) => t.id !== tag.id) } : old);
    await supabase.from("tags").delete().eq("id", tag.id);
    qc.invalidateQueries({ queryKey: adminKeys.tags });
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tags.filter((t) => !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tags, search]);


  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => { setEditing(null); setIsNew(false); }}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isNew ? "Create" : "Save"}</Button>
        </div>
        <Section title={isNew ? "New tag" : "Edit tag"} description="Tag details">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Tag name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </FormRow>
            <FormRow label="Slug" hint="Auto-generated if empty">
              <Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="auto" />
            </FormRow>
            <FormRow label="Sort order">
              <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: +e.target.value })} />
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
            placeholder="Search tags…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditing({ id: "", ...emptyTag } as Tag); setIsNew(true); }} className="gap-1.5">
          <Plus size={14} /> Add tag
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <div className="text-center text-[13px] text-[hsl(var(--a-soft))] py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))]">
            <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
              <TagIcon size={16} />
            </div>
            <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">
              {search ? "No matching tags" : "No tags yet"}
            </div>
            <div className="text-[12px] text-[hsl(var(--a-muted))] px-6">
              {search ? "Try a different search." : "Create your first tag to start organizing products."}
            </div>
          </div>
        ) : (
          rows.map((t) => (
            <div key={t.id} className="bg-[hsl(var(--a-surface))] rounded-xl border border-[hsl(var(--a-stroke))] p-2.5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => { setEditing(t); setIsNew(false); }}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-[13.5px] font-medium text-[hsl(var(--a-ink))] truncate">{t.name}</div>
                <div className="text-[11.5px] text-[hsl(var(--a-muted))] truncate">/{t.slug} · {productCounts[t.id] || 0} products</div>
              </button>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0" onClick={() => { setEditing(t); setIsNew(false); }}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 a-keep-size !min-h-0 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]" onClick={() => handleDelete(t)}>
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
                <th>Tag</th>
                <th className="hidden sm:table-cell">Slug</th>
                <th style={{ width: 100 }}>Products</th>
                <th style={{ width: 96 }} className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center text-[hsl(var(--a-soft))]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                      <div className="w-9 h-9 rounded-md bg-[hsl(var(--a-sunken))] flex items-center justify-center text-[hsl(var(--a-soft))]">
                        <TagIcon size={16} />
                      </div>
                      <div className="text-[13px] font-medium text-[hsl(var(--a-ink))]">
                        {search ? "No matching tags" : "No tags yet"}
                      </div>
                      <div className="text-[12px] text-[hsl(var(--a-muted))]">
                        {search ? "Try a different search." : "Create your first tag to start organizing products."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((t, i) => (
                  <tr key={t.id}>
                    <td className="font-mono tabular-nums text-[hsl(var(--a-muted))]">{i + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-[hsl(var(--a-ink))] hover:text-[hsl(var(--a-accent))] text-left"
                        onClick={() => { setEditing(t); setIsNew(false); }}
                      >
                        {t.name}
                      </button>
                    </td>
                    <td className="hidden sm:table-cell">
                      <code className="text-[12px] text-[hsl(var(--a-muted))] font-mono">/{t.slug}</code>
                    </td>
                    <td className="font-mono tabular-nums">{productCounts[t.id] || 0}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setIsNew(false); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[hsl(var(--a-soft))] hover:text-[hsl(var(--a-danger))]"
                          onClick={() => handleDelete(t)}
                        >
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

export default TagManager;
