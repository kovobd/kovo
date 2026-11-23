import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import { Search, Phone, CheckCircle2, Inbox, Eye, Pencil, Sparkles, Trash2, PhoneCall, Clock, Package, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import RecoveryDialog, { type IncompleteRow as DialogRow } from "@/components/admin/incomplete/RecoveryDialog";
import BulkRecoverDialog from "@/components/admin/incomplete/BulkRecoverDialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/ui";
import {
  useAdminIncompleteOrdersPage,
  useAdminIncompleteOrderCounts,
  useAdminIncompleteOrderStats,
  incompleteKeys,
  type AdminIncompleteFilters,
} from "@/hooks/useAdminData";


type IncompleteRow = {
  id: string;
  session_id: string;
  customer_name: string | null;
  phone: string;
  email: string | null;
  address: Record<string, any>;
  cart_items: any[];
  subtotal: number;
  delivery_charge: number;
  total: number;
  coupon: string | null;
  payment_method: string | null;
  checkout_step: string;
  recovery_status: string;
  recovered: boolean;
  converted_order_id: string | null;
  last_activity: string;
  created_at: string;
  contact_attempts?: number;
  recovery_notes?: string | null;
};

const PAGE_SIZE = 25;

const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};

const IncompleteOrders = () => {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "contacted" | "recovered">("pending");
  const [selectMode, setSelectMode] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ row: DialogRow | null; mode: "view" | "edit" | "recover" }>({ row: null, mode: "view" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const filters: AdminIncompleteFilters = useMemo(
    () => ({ status: filter, search: debouncedQuery }),
    [filter, debouncedQuery],
  );

  const { data: pageData, isLoading } = useAdminIncompleteOrdersPage(filters, page, pageSize);
  const { data: counts } = useAdminIncompleteOrderCounts(debouncedQuery);
  const { data: stats } = useAdminIncompleteOrderStats();

  const pageRows = useMemo(() => {
    const rows = (pageData?.rows ?? []) as IncompleteRow[];
    // Recovered: newest first. Others (Pending / Failed): oldest first.
    const dir = filter === "recovered" ? -1 : 1;
    return [...rows].sort(
      (a, b) => dir * (new Date(a.last_activity).getTime() - new Date(b.last_activity).getTime()),
    );
  }, [pageData?.rows, filter]);
  const totalEntries = pageData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalEntries / pageSize));

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedQuery, filter, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(
    () => pageRows.filter((r) => selected.has(r.id)),
    [pageRows, selected],
  );

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: incompleteKeys.root });
  };

  const handleBulkContacted = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await (supabase.rpc as any)("bulk_mark_incomplete_contacted", { _ids: ids });
    if (error) toast.error(error.message);
    else {
      toast.success(`Marked ${ids.length} as contacted`);
      invalidateAll();
      clearSelection();
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await (supabase.rpc as any)("bulk_delete_incomplete", { _ids: ids });
    if (error) toast.error(error.message);
    else {
      toast.success(`Deleted ${ids.length}`);
      invalidateAll();
      clearSelection();
    }
    setConfirmDelete(false);
  };

  const handleRowDelete = async (id: string) => {
    // "X" now marks this cart as Failed (moves it to the Failed tab).
    const { error } = await (supabase.rpc as any)("bulk_mark_incomplete_contacted", { _ids: [id] });
    if (error) toast.error(error.message);
    else {
      toast.success("Moved to Failed");
      invalidateAll();
    }
  };


  return (
    <div className="max-w-6xl pb-24">
      <PageHeader
        title="Incomplete orders"
        subtitle="Carts where the customer entered a valid phone but did not place the order."
      />

      {/* Stat cards — compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <StatCard icon={Inbox} label="Total" value={toBanglaDigits(stats?.total ?? 0)} />
        <StatCard icon={CheckCircle2} label="Recovered" value={toBanglaDigits(stats?.recovered ?? 0)} tone="success" />
        <StatCard icon={Clock} label="Recovery rate" value={`${toBanglaDigits(stats?.rate ?? 0)}%`} />
        <StatCard icon={Package} label="Abandoned value" value={`${CURRENCY_SYMBOL}${toBanglaDigits(Math.round(stats?.abandonedValue ?? 0))}`} tone="warn" />
      </div>

      {/* Tabs + Select toggle on a single row */}
      <div className="flex items-stretch gap-1.5 sm:gap-3 sm:justify-between mb-2">
        <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-none min-w-0">
          {([
            { key: "pending", label: "Pending", count: counts?.pending ?? 0 },
            { key: "recovered", label: "Recovered", count: counts?.recovered ?? 0 },
            { key: "contacted", label: "Failed", count: counts?.contacted ?? 0 },
          ] as const).map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  "h-9 flex-1 sm:flex-none sm:w-[128px] min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 text-[11.5px] sm:text-[12px] font-medium rounded-none whitespace-nowrap focus:outline-none transition-colors border",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/60",
                )}
              >
                <span className="leading-none truncate">{t.label}</span>
                <span className={cn(
                  "leading-none text-[11px] tabular-nums",
                  active ? "text-background/70" : "text-muted-foreground/70",
                )}>{toBanglaDigits(t.count)}</span>
              </button>
            );
          })}
        </div>
        <Button
          size="sm"
          variant={selectMode ? "default" : "outline"}
          onClick={() => {
            if (selectMode) clearSelection();
            setSelectMode((v) => !v);
          }}
          className="h-9 w-[72px] sm:w-[120px] text-[11.5px] sm:text-[12px] rounded-none shrink-0"
        >
          {selectMode ? "Cancel" : "Select"}
        </Button>
      </div>

      {selectMode && pageRows.length > 0 && (
        <div className="flex items-center justify-between mb-1.5 px-2.5 py-2 bg-muted/40 border border-border/60 rounded-none">
          <label className="inline-flex items-center gap-2 text-[12px] text-foreground cursor-pointer select-none">
            <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} />
            <span>Select all</span>
          </label>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {toBanglaDigits(selected.size)} selected
          </span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-none" />)}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="bg-background border border-border/60 rounded-none p-10 text-center">
          <Inbox className="mx-auto text-muted-foreground/40 mb-2" size={26} />
          <p className="text-sm text-muted-foreground">No matching incomplete orders.</p>
        </div>
      ) : (
        <TooltipProvider delayDuration={150}>
          {/* Desktop table */}
          <div className="hidden sm:block bg-background border border-border/60 rounded-none overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                {selectMode && <col className="w-[36px]" />}
                <col style={{ width: "20%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "38%" }} />
                <col className="w-[210px]" />
              </colgroup>
              <thead className="bg-muted/60 border-b-2 border-border">
                <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  {selectMode && <th className="px-2 py-2.5"></th>}
                  <th className="px-3 py-2.5 !text-center">Customer</th>
                  <th className="px-3 py-2.5 !text-center">Phone</th>
                  <th className="px-3 py-2.5 !text-center">Product</th>
                  <th className="px-3 py-2.5 !text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    selectMode={selectMode}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                    onView={() => setDialog({ row: r as any, mode: "view" })}
                    onEdit={() => setDialog({ row: r as any, mode: "edit" })}
                    onRecover={() => setDialog({ row: r as any, mode: "recover" })}
                    onDelete={() => handleRowDelete(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <div className="sm:hidden space-y-1.5">
            {pageRows.map((r) => (
              <MobileRow
                key={r.id}
                r={r}
                selectMode={selectMode}
                selected={selected.has(r.id)}
                onToggle={() => toggleOne(r.id)}
                onView={() => setDialog({ row: r as any, mode: "view" })}
                onEdit={() => setDialog({ row: r as any, mode: "edit" })}
                onRecover={() => setDialog({ row: r as any, mode: "recover" })}
                onDelete={() => handleRowDelete(r.id)}
              />
            ))}
          </div>
        </TooltipProvider>
      )}

      {/* Pagination */}
      {totalEntries > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-3">
          <p className="text-[11px] text-muted-foreground">
            Page {toBanglaDigits(page)} of {toBanglaDigits(pageCount)} · {toBanglaDigits(totalEntries)} entries
          </p>
          <div className="flex items-center gap-1.5">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[100px] text-xs rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 h-8 text-xs rounded-none border border-border bg-background hover:bg-muted/60 disabled:opacity-40 transition-colors"
            >Prev</button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="px-3 h-8 text-xs rounded-none border border-border bg-background hover:bg-muted/60 disabled:opacity-40 transition-colors"
            >Next</button>
          </div>
        </div>
      )}

      {/* Sticky bulk action toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:max-w-2xl z-40 bg-background border border-border rounded-none shadow-lg px-3 py-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">
            {toBanglaDigits(selected.size)} selected
          </span>
          <div className="flex-1 min-w-0" />
          <Button size="sm" variant="outline" onClick={handleBulkContacted} className="gap-1.5 h-7 rounded-none text-xs">
            <PhoneCall size={11} /> <span className="hidden xs:inline">Contacted</span>
          </Button>
          <Button size="sm" onClick={() => setBulkOpen(true)} className="gap-1.5 h-7 rounded-none text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            <Sparkles size={11} /> Recover
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="gap-1.5 h-7 rounded-none text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 size={11} />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="h-7 rounded-none text-xs text-muted-foreground">Cancel</Button>
        </div>
      )}

      <RecoveryDialog row={dialog.row} mode={dialog.mode} onClose={() => setDialog({ row: null, mode: "view" })} />
      <BulkRecoverDialog rows={selectedRows as any} open={bulkOpen} onClose={() => { setBulkOpen(false); clearSelection(); }} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} incomplete cart{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatCard = ({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: string; tone?: "success" | "warn" }) => (
  <div className="bg-background border border-border/60 rounded-none px-2.5 py-1.5 sm:py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon size={11} className={cn(
        "shrink-0",
        tone === "success" ? "text-green-600" :
        tone === "warn" ? "text-amber-600" :
        "text-muted-foreground/70",
      )} />
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 truncate">{label}</span>
    </div>
    <p className="text-lg sm:text-2xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
  </div>
);

const statusBadgeClass = (r: IncompleteRow): { label: string; cls: string } => {
  if (r.recovered) return { label: "Recovered", cls: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" };
  if (r.recovery_status === "contacted") return { label: "Contacted", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" };
  if (r.recovery_status === "expired") return { label: "Expired", cls: "bg-muted text-muted-foreground border-border" };
  return { label: "Pending", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20" };
};

type RowProps = {
  r: IncompleteRow;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onEdit: () => void;
  onRecover: () => void;
  onDelete: () => void;
};

const getProductLabel = (r: IncompleteRow) => {
  const first = (r.cart_items ?? [])[0];
  if (!first) return "—";
  const extra = (r.cart_items?.length ?? 0) > 1 ? ` +${(r.cart_items!.length - 1)}` : "";
  return `${first.name ?? "Item"}${extra}`;
};

const IconBtn = ({
  label, onClick, disabled, children, tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "default" | "success" | "danger";
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center h-7 w-7 rounded-none border border-border bg-background text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          tone === "success" && "hover:text-green-600 hover:border-green-500/40 hover:bg-green-500/10",
          tone === "danger" && "hover:text-red-600 hover:border-red-500/40 hover:bg-red-500/10",
          (!tone || tone === "default") && "hover:text-foreground hover:bg-muted/60",
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="text-[11px]">{label}</TooltipContent>
  </Tooltip>
);

const Row = ({ r, selectMode, selected, onToggle, onView, onEdit, onRecover, onDelete }: RowProps) => {
  const productLabel = getProductLabel(r);
  const priceLabel = `${CURRENCY_SYMBOL}${toBanglaDigits(Math.round(Number(r.total ?? 0)))}`;
  return (
    <tr className={cn(
      "border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors",
      selected && "bg-primary/5",
    )}>
      {selectMode && (
        <td className="px-2 py-1.5 align-middle text-center">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        </td>
      )}
      <td className="px-3 py-1.5 align-middle text-center">
        <span className="font-medium text-foreground text-[13px] truncate block text-center">
          {r.customer_name || "Unnamed"}
        </span>
      </td>
      <td className="px-3 py-1.5 align-middle text-center">
        <a href={`tel:${r.phone}`} className="text-[12px] text-muted-foreground tabular-nums truncate block hover:text-foreground text-center">
          {toBanglaDigits(r.phone)}
        </a>
      </td>
      <td className="px-3 py-1.5 align-middle text-center text-[12px]">
        <div className="flex items-center justify-center gap-1.5 truncate">
          <span className="text-foreground">{productLabel}</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="font-semibold text-foreground tabular-nums">{priceLabel}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 align-middle text-center">
        <div className="flex items-center justify-center gap-1">
          <IconBtn label="Call" onClick={() => { window.location.href = `tel:${r.phone}`; }}><PhoneCall size={13} /></IconBtn>
          <IconBtn label="View" onClick={onView}><Eye size={13} /></IconBtn>
          <IconBtn label="Edit" onClick={onEdit} disabled={r.recovered}><Pencil size={13} /></IconBtn>
          <IconBtn label={r.recovered ? "Recovered" : "Recover"} onClick={onRecover} disabled={r.recovered} tone="success"><Sparkles size={13} /></IconBtn>
          <IconBtn label="Mark as Failed" onClick={onDelete} disabled={r.recovered || r.recovery_status === "contacted"} tone="danger"><X size={14} /></IconBtn>
        </div>
      </td>
    </tr>
  );
};

const MobileRow = ({ r, selectMode, selected, onToggle, onView, onEdit, onRecover, onDelete }: RowProps) => {
  const productLabel = getProductLabel(r);
  const priceLabel = `${CURRENCY_SYMBOL}${toBanglaDigits(Math.round(Number(r.total ?? 0)))}`;
  return (
    <div className={cn(
      "bg-background border rounded-none px-2.5 py-2 transition-colors",
      selected ? "border-primary/60 ring-1 ring-primary/20" : "border-border/60",
    )}>
      <div className="flex items-center gap-2">
        {selectMode && (
          <Checkbox checked={selected} onCheckedChange={onToggle} className="shrink-0" />
        )}
        <p className="font-semibold text-foreground text-[14px] truncate flex-1 min-w-0">
          {r.customer_name || "Unnamed"}
        </p>
        <a href={`tel:${r.phone}`} className="text-[12px] text-muted-foreground tabular-nums shrink-0">
          {toBanglaDigits(r.phone)}
        </a>
      </div>
      <div className={cn("mt-0.5 text-[12px] truncate", selectMode && "pl-[26px]")}>
        <span className="text-muted-foreground">{productLabel}</span>
        <span className="mx-1 text-muted-foreground/50">•</span>
        <span className="font-semibold text-foreground tabular-nums">{priceLabel}</span>
      </div>
      <div className={cn("mt-1.5 flex items-center gap-1", selectMode && "pl-[26px]")}>
        <IconBtn label="Call" onClick={() => { window.location.href = `tel:${r.phone}`; }}><PhoneCall size={13} /></IconBtn>
        <IconBtn label="View" onClick={onView}><Eye size={13} /></IconBtn>
        <IconBtn label="Edit" onClick={onEdit} disabled={r.recovered}><Pencil size={13} /></IconBtn>
        <IconBtn label={r.recovered ? "Recovered" : "Recover"} onClick={onRecover} disabled={r.recovered} tone="success"><Sparkles size={13} /></IconBtn>
        <IconBtn label="Mark as Failed" onClick={onDelete} disabled={r.recovered || r.recovery_status === "contacted"} tone="danger"><X size={14} /></IconBtn>
      </div>
    </div>
  );
};

export default IncompleteOrders;
