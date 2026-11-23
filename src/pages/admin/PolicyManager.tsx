import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3, List, ListOrdered, Link2,
  Undo2, Redo2, Eye, Pencil, Plus, Trash2, GripVertical, AlertTriangle, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


type Policy = {
  id: string;
  slug: string;
  title: string;
  content: string;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
};

const EDITABLE_KEYS: (keyof Policy)[] = ["title", "slug", "content", "enabled"];

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "policy";

const serializeEditable = (p: Policy | null | undefined) =>
  p ? JSON.stringify({ title: p.title, slug: p.slug, content: p.content, enabled: p.enabled }) : "";

const TabChip = ({
  p, isActive, onSelect, onEdit, onDelete, dirty, canDelete,
}: {
  p: Policy;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dirty: boolean;
  canDelete: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
        className={cn(
          "group inline-flex items-center gap-0 w-full sm:w-auto h-11 sm:h-10 rounded-none border text-[13px] font-medium transition-all shadow-none flex-shrink-0 overflow-hidden",
          isActive
            ? "bg-[#f3f4f6] dark:bg-zinc-800/80 text-foreground font-semibold border-border"
            : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:bg-foreground/[0.03]"
        )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className={cn(
          "h-full w-9 sm:w-6 flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0",
          isActive ? "opacity-70 hover:opacity-100" : "opacity-50 hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 h-full px-1 sm:px-2 min-w-0 truncate inline-flex items-center text-left"
      >
        <span className="truncate">{p.title || "Untitled"}</span>
        {dirty && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
        {!p.enabled && <span className="ml-1.5 text-[10px] opacity-70 shrink-0">·off</span>}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label="Edit policy"
        title="Edit policy"
        className={cn(
          "h-full w-10 sm:w-8 inline-flex items-center justify-center shrink-0 rounded-none transition-colors",
          isActive ? "hover:bg-foreground/10" : "hover:bg-foreground/5"
        )}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete policy"
        title={canDelete ? "Delete policy" : "At least one policy is required"}
        disabled={!canDelete}
        className={cn(
          "h-full w-10 sm:w-8 inline-flex items-center justify-center shrink-0 rounded-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
          isActive ? "hover:bg-foreground/10 hover:text-red-500" : "hover:bg-foreground/5 hover:text-destructive"
        )}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};


const PolicyManager = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [confirmDelete, setConfirmDelete] = useState<Policy | null>(null);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();

  // Per-policy baseline (server-truth) — drives dirty detection without forcing reload.
  const baselineRef = useRef<Record<string, string>>({});
  // Per-policy content history for proper undo/redo (works with controlled textarea).
  const historyRef = useRef<Record<string, { stack: string[]; index: number }>>({});

  const current = policies.find((p) => p.id === active) || null;

  const dirtyMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of policies) m[p.id] = serializeEditable(p) !== (baselineRef.current[p.id] ?? "");
    return m;
  }, [policies]);
  const dirty = current ? !!dirtyMap[current.id] : false;
  const anyDirty = Object.values(dirtyMap).some(Boolean);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("policies").select("*").order("sort_order");
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Policy[];
    setPolicies(list);
    const nextBaseline: Record<string, string> = {};
    for (const p of list) {
      nextBaseline[p.id] = serializeEditable(p);
      if (!historyRef.current[p.id]) {
        historyRef.current[p.id] = { stack: [p.content ?? ""], index: 0 };
      }
    }
    baselineRef.current = nextBaseline;
    setActive((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Warn on unload when anything is dirty.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const updatePolicy = (id: string, patch: Partial<Policy>) => {
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  // Content updates also push onto the history stack (debounced by content equality).
  const pushHistory = (id: string, content: string) => {
    const h = historyRef.current[id] ?? { stack: [""], index: 0 };
    // Trim any "redo" branch then push if it actually changed.
    const trimmed = h.stack.slice(0, h.index + 1);
    if (trimmed[trimmed.length - 1] === content) return;
    trimmed.push(content);
    // Cap history length.
    const MAX = 200;
    const next = trimmed.length > MAX ? trimmed.slice(trimmed.length - MAX) : trimmed;
    historyRef.current[id] = { stack: next, index: next.length - 1 };
  };

  const onContentChange = (id: string, content: string) => {
    updatePolicy(id, { content });
    pushHistory(id, content);
  };

  const undo = () => {
    if (!current) return;
    const h = historyRef.current[current.id];
    if (!h || h.index <= 0) return;
    h.index -= 1;
    updatePolicy(current.id, { content: h.stack[h.index] });
  };
  const redo = () => {
    if (!current) return;
    const h = historyRef.current[current.id];
    if (!h || h.index >= h.stack.length - 1) return;
    h.index += 1;
    updatePolicy(current.id, { content: h.stack[h.index] });
  };

  const switchTo = (id: string) => {
    setActive(id);
    setEditing(false);
    setMode("edit");
  };

  const save = async () => {
    if (!current) return;
    setSaving(true);
    const nextSlug = current.slug?.trim() ? slugify(current.slug) : slugify(current.title);
    const payload = {
      title: current.title?.trim() || "Untitled",
      content: current.content ?? "",
      enabled: current.enabled,
      slug: nextSlug,
    };
    const { data, error } = await supabase
      .from("policies").update(payload).eq("id", current.id).select().maybeSingle();
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      toast({ title: "Policy not found", description: "It may have been deleted elsewhere.", variant: "destructive" });
      load();
      return;
    }
    const saved = data as Policy;
    setPolicies((prev) => prev.map((p) => (p.id === current.id ? { ...p, ...saved } : p)));
    baselineRef.current[current.id] = serializeEditable(saved);
    toast({ title: "Policy saved" });
  };

  const discard = () => {
    if (!current) return;
    const baseline = baselineRef.current[current.id];
    if (!baseline) return;
    const parsed = JSON.parse(baseline) as Pick<Policy, "title" | "slug" | "content" | "enabled">;
    updatePolicy(current.id, parsed);
    historyRef.current[current.id] = { stack: [parsed.content ?? ""], index: 0 };
  };

  const openEdit = () => {
    setMode("edit");
    setEditing(true);
  };

  const closeEdit = () => {
    if (current) discard();
    setEditing(false);
  };

  const addPolicy = async () => {
    const title = "New Policy";
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
    const sort_order = (policies[policies.length - 1]?.sort_order ?? 0) + 1;
    const { data, error } = await supabase
      .from("policies")
      .insert({ title, slug, content: "", enabled: false, sort_order })
      .select().single();
    if (error) {
      toast({ title: "Couldn't create", description: error.message, variant: "destructive" });
      return;
    }
    const created = data as Policy;
    setPolicies((prev) => [...prev, created]);
    baselineRef.current[created.id] = serializeEditable(created);
    historyRef.current[created.id] = { stack: [""], index: 0 };
    setActive(created.id);
    toast({ title: "Policy created" });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    if (policies.length <= 1) {
      toast({ title: "Can't delete", description: "Keep at least one policy.", variant: "destructive" });
      setConfirmDelete(null);
      return;
    }
    const { error } = await supabase.from("policies").delete().eq("id", confirmDelete.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      setConfirmDelete(null);
      return;
    }
    const remaining = policies.filter((p) => p.id !== confirmDelete.id);
    setPolicies(remaining);
    delete baselineRef.current[confirmDelete.id];
    delete historyRef.current[confirmDelete.id];
    if (active === confirmDelete.id) setActive(remaining[0]?.id ?? null);
    setConfirmDelete(null);
    toast({ title: "Policy deleted" });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIdx = policies.findIndex((p) => p.id === a.id);
    const newIdx = policies.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(policies, oldIdx, newIdx).map((p, i) => ({ ...p, sort_order: i + 1 }));
    setPolicies(reordered);
    // sort_order is not in EDITABLE_KEYS so it doesn't affect dirty state. Re-baseline anyway.
    for (const p of reordered) baselineRef.current[p.id] = serializeEditable(p);
    // ONE write instead of N — see public.bulk_update_sort_order().
    // bulk_update_sort_order assigns 1..N based on array position, matching the
    // sort_order values we set above.
    const { error } = await supabase.rpc("bulk_update_sort_order" as any, { _table: "policies", _ids: reordered.map(p => p.id) });
    if (error) toast({ title: "Reorder failed", variant: "destructive" });
  };

  // Markdown helpers — all route through onContentChange so undo/redo works.
  const wrap = (before: string, after = before, placeholder = "") => {
    const ta = textareaRef.current; if (!ta || !current) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const value = current.content ?? "";
    const sel = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onContentChange(current.id, next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length + sel.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const linePrefix = (prefix: string | ((i: number) => string)) => {
    const ta = textareaRef.current; if (!ta || !current) return;
    const value = current.content ?? "";
    const start = ta.selectionStart, end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const slice = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
    const lines = slice.split("\n").map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l);
    const next = value.slice(0, lineStart) + lines.join("\n") + value.slice(lineEnd === -1 ? value.length : lineEnd);
    onContentChange(current.id, next);
  };


  const insertLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    wrap("[", `](${url})`, "link text");
  };

  // Keyboard shortcuts: cmd/ctrl+s save, cmd/ctrl+z undo, cmd/ctrl+shift+z redo.
  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "s") { e.preventDefault(); if (dirty && !saving) save(); }
    else if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
  };

  const previewHtml = useMemo(() => {
    const md = current?.content ?? "";
    const raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [current?.content]);

  // Auto-resize textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(320, ta.scrollHeight) + "px";
  }, [current?.content, current?.id, mode]);

  if (loading) {
    return (
      <div className="max-w-5xl space-y-4">
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-5xl">
        <EmptyState
          tone="danger"
          icon={<AlertTriangle size={28} />}
          title="Couldn't load policies"
          description={errorMsg}
          action={<Button size="sm" onClick={load}>Try again</Button>}
        />
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="max-w-5xl">
        <EmptyState
          title="No policies yet"
          description="Create your first policy to get started."
          action={<Button size="sm" onClick={addPolicy}><Plus size={14} className="mr-1.5" />New policy</Button>}
        />
      </div>
    );
  }

  const historyState = current ? historyRef.current[current.id] : undefined;
  const canUndo = !!historyState && historyState.index > 0;
  const canRedo = !!historyState && historyState.index < historyState.stack.length - 1;

  return (
    <div className="max-w-5xl space-y-4">
      {!hideTitle && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Policies</h1>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Manage the legal & informational pages shown on your storefront.
            </p>
          </div>
        </div>
      )}

      {/* Tabs: vertical stack on mobile, horizontal wrap on desktop/tablet */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-2">
        <div className="flex-1 min-w-0 w-full">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={policies.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:overflow-visible">
                {policies.map((p) => (
                  <TabChip
                    key={p.id}
                    p={p}
                    isActive={active === p.id}
                    onSelect={() => switchTo(p.id)}
                    onEdit={() => { setActive(p.id); openEdit(); }}
                    onDelete={() => setConfirmDelete(p)}
                    canDelete={policies.length > 1}
                    dirty={!!dirtyMap[p.id]}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-11 sm:h-10 w-full sm:w-auto rounded-none shrink-0 gap-1.5 text-[13px] font-medium"
          onClick={addPolicy}
        >
          <Plus size={14} /> New
        </Button>
      </div>


      {current && editing && (
        <div className="rounded-xl sm:rounded-2xl border border-border bg-card overflow-hidden">
          {/* Card header: title preview + published toggle + close */}
          <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-tight truncate min-w-0">
                {current.title?.trim() || "Untitled Policy"}
              </h2>
              <div className="flex items-center gap-2 sm:gap-1 shrink-0">
                <div className="flex items-center gap-2 h-11">
                  <Switch
                    checked={current.enabled}
                    onCheckedChange={(v) => updatePolicy(current.id, { enabled: v })}
                  />
                  <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                    {current.enabled ? "Published" : "Draft"}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={closeEdit}
                  aria-label="Close editor"
                  title="Close editor"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>
          </div>


          {editing && (
            <>
              {/* Policy title input */}
              <div className="px-4 sm:px-5 py-3 border-b border-border space-y-2">
                <label className="block text-[12px] font-medium text-muted-foreground">
                  Policy Title
                </label>
                <Input
                  value={current.title}
                  onChange={(e) => updatePolicy(current.id, { title: e.target.value })}
                  placeholder="Policy title"
                  className="h-11 sm:h-10 text-[14px] sm:text-[13px]"
                />
              </div>

              {/* Slug row */}
              <div className="px-4 sm:px-5 py-2 flex items-center gap-2 text-[12px] text-muted-foreground border-b border-border">
                <span className="opacity-70 shrink-0">/policies/</span>
                <Input
                  value={current.slug ?? ""}
                  onChange={(e) => updatePolicy(current.id, { slug: e.target.value })}
                  onBlur={(e) => updatePolicy(current.id, { slug: slugify(e.target.value || current.title) })}
                  placeholder={slugify(current.title)}
                  className="h-10 sm:h-8 text-[12px] px-2 flex-1 sm:max-w-[240px]"
                />
              </div>

              {/* Editor toolbar: Edit/Preview toggle on its own row, formatting buttons wrap naturally */}
              <div className="border-b border-border bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-5 pt-2 sm:pt-2 pb-2 sm:pb-1">
                  <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium hidden sm:inline">
                    Format
                  </span>
                  <div className="flex items-center w-full sm:w-auto h-10 sm:h-7 rounded-full sm:rounded-md border border-border bg-muted/50 sm:bg-background p-0.5 sm:p-0 overflow-hidden text-[12px]">
                    <button
                      type="button"
                      onClick={() => setMode("edit")}
                      className={`flex-1 sm:flex-none h-full px-2 sm:px-3 rounded-full sm:rounded-none flex items-center justify-center gap-1 transition-colors ${mode === "edit" ? "bg-background text-foreground shadow-sm sm:shadow-none sm:bg-muted" : "text-muted-foreground"}`}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("preview")}
                      className={`flex-1 sm:flex-none h-full px-2 sm:px-3 rounded-full sm:rounded-none flex items-center justify-center gap-1 transition-colors ${mode === "preview" ? "bg-background text-foreground shadow-sm sm:shadow-none sm:bg-muted" : "text-muted-foreground"}`}
                    >
                      <Eye size={13} /> Preview
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-4 sm:px-5 pb-2 sm:pb-1.5">
                  <TbBtn onClick={() => wrap("**", "**", "bold")} label="Bold"><Bold size={15} /></TbBtn>
                  <TbBtn onClick={() => wrap("*", "*", "italic")} label="Italic"><Italic size={15} /></TbBtn>
                  <TbBtn onClick={() => wrap("<u>", "</u>", "underline")} label="Underline"><Underline size={15} /></TbBtn>
                  <Sep />
                  <TbBtn onClick={() => linePrefix("# ")} label="H1"><Heading1 size={15} /></TbBtn>
                  <TbBtn onClick={() => linePrefix("## ")} label="H2"><Heading2 size={15} /></TbBtn>
                  <TbBtn onClick={() => linePrefix("### ")} label="H3"><Heading3 size={15} /></TbBtn>
                  <Sep />
                  <TbBtn onClick={() => linePrefix("- ")} label="Bulleted list"><List size={15} /></TbBtn>
                  <TbBtn onClick={() => linePrefix((i) => `${i + 1}. `)} label="Numbered list"><ListOrdered size={15} /></TbBtn>
                  <Sep />
                  <TbBtn onClick={insertLink} label="Link"><Link2 size={15} /></TbBtn>
                  <Sep />
                  <TbBtn onClick={undo} label="Undo" disabled={!canUndo}><Undo2 size={15} /></TbBtn>
                  <TbBtn onClick={redo} label="Redo" disabled={!canRedo}><Redo2 size={15} /></TbBtn>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {mode === "edit" ? (
                  <Textarea
                    ref={textareaRef}
                    value={current.content ?? ""}
                    onChange={(e) => onContentChange(current.id, e.target.value)}
                    onKeyDown={onEditorKeyDown}
                    placeholder="Write your policy in Markdown…"
                    className="font-mono text-[13px] sm:text-[12.5px] leading-6 sm:leading-relaxed resize-none min-h-[50vh] sm:min-h-[320px] max-h-[70vh]"
                  />
                ) : (
                  <article
                    className="prose max-w-none dark:prose-invert prose-headings:tracking-tight prose-h1:text-2xl sm:prose-h1:text-3xl prose-h2:text-xl sm:prose-h2:text-2xl prose-h3:text-lg sm:prose-h3:text-xl prose-h1:font-semibold prose-h2:font-semibold prose-h3:font-semibold prose-h1:mb-3 prose-h2:mb-2.5 prose-h3:mb-2 prose-table:text-[13px] prose-a:text-foreground prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-[#2563eb] prose-a:transition-colors"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>

              {dirty && (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2 border-t border-border bg-muted/20">
                  <span className="text-[11px] sm:text-[12px] text-muted-foreground">Unsaved changes</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={discard} disabled={saving} className="h-8 text-[12px]">Discard</Button>
                    <Button size="sm" onClick={save} disabled={saving} className="h-8 text-[12px]">{saving ? "Saving…" : "Save"}</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the policy and its content. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const TbBtn = ({
  onClick, label, children, disabled,
}: { onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className="h-10 w-10 sm:h-7 sm:w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

const Sep = () => <span className="mx-0.5 sm:mx-1 h-5 sm:h-4 w-px bg-border" />;

export default PolicyManager;
