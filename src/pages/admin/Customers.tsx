import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminCustomers, adminKeys } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Save, Users, Search, Download } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { PageHeader, Section, FormRow } from "@/components/admin/ui";
import { customerQueryKeys, customerQueryFns } from "./CustomerProfile";

const formatMoney = (n: number) => `${CURRENCY_SYMBOL}${Number(n || 0).toLocaleString()}`;
const PAGE_SIZE = 50;

const csvEscape = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const Customers = () => {
  const { data: customers = [], isLoading } = useAdminCustomers();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  // SL = permanent serial: oldest customer is #1. Display order = latest first.
  const sorted = useMemo(() => {
    const asc = [...(customers as any[])].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
    const withSl = asc.map((c, i) => ({ ...c, _sl: i + 1 }));
    return withSl.sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  }, [customers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((c: any) =>
      [c.name, c.email, c.phone].some((v: string | null) => v?.toLowerCase().includes(q)),
    );
  }, [sorted, search]);


  useEffect(() => { setPage(1); }, [search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const totals = useMemo(() => {
    const orders = customers.reduce((s: number, c: any) => s + (c.total_orders || 0), 0);
    const spent = customers.reduce((s: number, c: any) => s + Number(c.total_spent || 0), 0);
    return { orders, spent };
  }, [customers]);

  const addCustomer = async () => {
    if (!form.name || !form.email) {
      toast({ title: "Name and email required", variant: "destructive" });
      return;
    }
    const tempId = crypto.randomUUID();
    const optimistic = {
      id: tempId, name: form.name, email: form.email, phone: form.phone || null,
      total_orders: 0, total_spent: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    qc.setQueryData(adminKeys.customers, (old: any[]) => [optimistic, ...(old ?? [])]);
    setForm({ name: "", email: "", phone: "" });
    setAdding(false);
    toast({ title: "Customer added" });

    const { error } = await supabase.from("customers").insert({
      name: form.name, email: form.email, phone: form.phone || null,
    });
    if (error) {
      qc.setQueryData(adminKeys.customers, (old: any[]) => old?.filter((c) => c.id !== tempId));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: adminKeys.customers });
    }
  };

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      // Fetch ascending so the oldest customer gets SL #1 (permanent serial).
      const { data, error } = await supabase
        .from("customers")
        .select("name,email,phone,address,city,total_orders,total_spent,created_at")
        .order("created_at", { ascending: true })
        .range(0, 9999);
      if (error) throw error;
      const asc = data ?? [];
      // Assign SL by ascending order, then reverse so CSV is latest-first like the screen.
      const withSl = asc.map((c: any, i: number) => ({ ...c, _sl: i + 1 }));
      const rows = withSl.slice().reverse();
      const headers = ["SL", "Name", "Phone", "Email", "Address", "City", "Total Orders", "Lifetime Value", "Created At"];
      const lines = [headers.join(",")];
      rows.forEach((c: any) => {
        lines.push([
          c._sl, c.name, c.phone, c.email, c.address, c.city,
          c.total_orders ?? 0, c.total_spent ?? 0,
          c.created_at ? new Date(c.created_at).toISOString() : "",
        ].map(csvEscape).join(","));
      });
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: `Downloaded ${rows.length} customers` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };


  const prefetchCustomer = (phone?: string | null) => {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits) return;
    qc.prefetchQuery({ queryKey: customerQueryKeys.profile(digits), queryFn: () => customerQueryFns.profile(digits), staleTime: 60_000 });
    qc.prefetchQuery({ queryKey: customerQueryKeys.orders(digits), queryFn: () => customerQueryFns.orders(digits), staleTime: 60_000 });
    qc.prefetchQuery({ queryKey: customerQueryKeys.reminders(digits), queryFn: () => customerQueryFns.reminders(digits), staleTime: 60_000 });
  };

  const openCustomer = (c: any) => {
    const digits = (c.phone || "").replace(/\D/g, "");
    if (!digits) return;
    prefetchCustomer(digits);
    navigate(`/admin/customers/${encodeURIComponent(digits)}`);
  };

  // Prefetch first 20 visible customers in the background once list loads.
  useEffect(() => {
    if (isLoading) return;
    const slice = pageRows.slice(0, 20);
    const t = setTimeout(() => slice.forEach((c) => prefetchCustomer(c.phone)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pageRows]);


  return (
    <div className="max-w-6xl pb-10">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} total · ${totals.orders} orders · ${formatMoney(totals.spent)} lifetime`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={downloadCsv}
              disabled={downloading}
            >
              <Download size={14} className="mr-1" /> {downloading ? "Downloading…" : "Download CSV"}
            </Button>
            <Button size="sm" className="h-9 rounded-none" onClick={() => setAdding((v) => !v)}>
              {adding ? (<><X size={14} className="mr-1" /> Cancel</>) : (<><Plus size={14} className="mr-1" /> Add</>)}
            </Button>
          </div>
        }
      />

      {adding && (
        <Section title="New customer">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormRow label="Full name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 rounded-[6px]" />
            </FormRow>
            <FormRow label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-[6px]" />
            </FormRow>
            <FormRow label="Phone" hint="Optional">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 rounded-[6px]" inputMode="tel" />
            </FormRow>
          </div>
          <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" size="sm" className="h-10 rounded-none" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" className="h-10 rounded-none" onClick={addCustomer}>
              <Save size={14} className="mr-1" /> Save customer
            </Button>
          </div>
        </Section>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="h-9 pl-9 rounded-[6px] text-[12px]"
        />
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-none" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-background border border-border/60 rounded-none p-10 text-center">
          <Users className="mx-auto text-muted-foreground/40 mb-2" size={26} />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching customers." : "No customers yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-background border border-border/60 rounded-none overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "56px" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "36%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead className="bg-muted/60 border-b-2 border-border">
                <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  <th className="px-3 py-2.5 !text-center">SL</th>
                  <th className="px-3 py-2.5 !text-center">Customer</th>
                  <th className="px-3 py-2.5 !text-center">Email</th>
                  <th className="px-3 py-2.5 !text-center">Orders</th>
                  <th className="px-3 py-2.5 !text-center">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c: any, i: number) => (
                  <tr
                    key={c.id}
                    onClick={() => openCustomer(c)}
                    onMouseEnter={() => prefetchCustomer(c.phone)}
                    onFocus={() => prefetchCustomer(c.phone)}
                    className="border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-1.5 align-middle text-center text-[12px] tabular-nums text-muted-foreground">
                      {c._sl}
                    </td>

                    <td className="px-3 py-1.5 align-middle text-center">
                      <div className="leading-tight">
                        <div className="text-[13px] font-medium text-foreground truncate">{c.name || "—"}</div>
                        {c.phone && (
                          <div className="text-[11px] text-muted-foreground/80 tabular-nums truncate">{c.phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 align-middle text-center text-[12px] text-muted-foreground truncate">
                      {c.email || "—"}
                    </td>
                    <td className="px-3 py-1.5 align-middle text-center text-[12px] tabular-nums">
                      {c.total_orders ?? 0}
                    </td>
                    <td className="px-3 py-1.5 align-middle text-center text-[12px] tabular-nums font-medium text-foreground">
                      {formatMoney(c.total_spent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden space-y-1 bg-background border border-border/60 rounded-none">
            {pageRows.map((c: any, i: number) => (
              <div
                key={c.id}
                onClick={() => openCustomer(c)}
                onMouseEnter={() => prefetchCustomer(c.phone)}
                className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 last:border-b-0 cursor-pointer hover:bg-muted/40"
              >
                <div className="text-[11px] text-muted-foreground/70 tabular-nums w-6 shrink-0">
                  {c._sl}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground truncate">{c.name || "—"}</div>
                  {c.phone && (
                    <div className="text-[11px] text-muted-foreground/80 tabular-nums truncate">{c.phone}</div>
                  )}
                  {c.email && (
                    <div className="text-[11px] text-muted-foreground/70 truncate">{c.email}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-foreground tabular-nums">{formatMoney(c.total_spent)}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{c.total_orders ?? 0} orders</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-3">
            <p className="text-[11px] text-muted-foreground">
              Page {page} of {pageCount} · {filtered.length} entries
            </p>
            <div className="flex items-center gap-1.5">
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
        </>
      )}
    </div>
  );
};

export default Customers;
