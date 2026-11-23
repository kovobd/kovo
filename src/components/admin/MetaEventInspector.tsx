import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw, Search, ChevronDown, ChevronRight, Send,
  CheckCircle2, XCircle, Clock, Layers, Globe, Server, AlertTriangle, Pause, Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Section } from "@/components/admin/ui";

type EventRow = {
  id: string;
  event_name: string;
  event_id: string;
  status: string; // delivered | failed | skipped | sent | exception
  source: "browser" | "server";
  http_status: number | null;
  attempts: number | null;
  error: string | null;
  response: string | null;
  payload: any;
  order_id: string | null;
  product_ids: string[] | null;
  value: number | null;
  currency: string | null;
  response_time_ms: number | null;
  test_mode: boolean;
  created_at: string;
};

const EVENT_TYPES = [
  "all","PageView","ViewContent","Search","AddToCart","InitiateCheckout",
  "AddPaymentInfo","Purchase","Lead","CompleteRegistration",
];

// Mask sensitive fields in payload JSON for display
const SENSITIVE_KEYS = new Set([
  "access_token","accessToken","authorization","Authorization",
  "em","ph","fn","ln","ct","country","zp","external_id",
  "client_ip_address","client_user_agent","fbp","fbc",
]);

function maskPayload(v: any): any {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(maskPayload);
  if (typeof v === "object") {
    const out: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = typeof val === "string" && val.length > 8
          ? `••• masked (${val.length} chars)`
          : "••• masked";
      } else out[k] = maskPayload(val);
    }
    return out;
  }
  return v;
}

const statusTone = (s: string) => {
  if (s === "delivered" || s === "sent") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (s === "failed" || s === "exception") return "text-destructive bg-destructive/10 border-destructive/30";
  if (s === "skipped") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-muted-foreground bg-muted/30 border-border";
};

export default function MetaEventInspector() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const [intervalSec] = useState(7);

  // Filters
  const [eventType, setEventType] = useState("all");
  const [source, setSource] = useState<"all"|"browser"|"server">("all");
  const [outcome, setOutcome] = useState<"all"|"success"|"failed">("all");
  const [days, setDays] = useState<"1"|"7"|"30">("7");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;


  const load = useCallback(async () => {
    const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("capi_event_logs" as any)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast({ title: "Failed to load events", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  }, [days, toast]);

  const loadPauseState = useCallback(async () => {
    const { data } = await supabase
      .from("tracking_pixels")
      .select("logging_paused")
      .eq("platform", "facebook")
      .maybeSingle();
    const next = !!(data as any)?.logging_paused;
    setPaused(next);
    pausedRef.current = next;
  }, []);

  useEffect(() => { load(); loadPauseState(); }, [load, loadPauseState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribe = () => {
      if (channel) return;
      channel = supabase
        .channel(`meta-logging-pause-state:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "tracking_pixels", filter: "platform=eq.facebook" },
          (payload) => {
            const next = !!(payload.new as any)?.logging_paused;
            setPaused(next);
            pausedRef.current = next;
          })
        .subscribe();
    };
    const unsubscribe = () => { if (channel) { supabase.removeChannel(channel); channel = null; } };
    const onVis = () => {
      if (document.visibilityState === "visible") { subscribe(); loadPauseState(); }
      else unsubscribe();
    };
    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); unsubscribe(); };
  }, [loadPauseState]);

  const togglePause = async () => {
    const next = !pausedRef.current;
    const previous = pausedRef.current;
    setTogglingPause(true);
    setPaused(next);
    pausedRef.current = next;
    const { data, error } = await supabase.rpc("set_meta_logging_paused" as any, { _paused: next });
    setTogglingPause(false);
    if (error) {
      setPaused(previous);
      pausedRef.current = previous;
      toast({ title: "Pause failed", description: error.message, variant: "destructive" });
      return;
    }
    const saved = data === true;
    setPaused(saved);
    pausedRef.current = saved;
    toast({
      title: saved ? "Live logging paused" : "Live logging resumed",
      description: saved
        ? "New browser and server events will stop being written while the inspector stays frozen."
        : "New events will be written and live updates can resume.",
    });
    if (!saved) load();
  };

  useEffect(() => {
    if (!auto || paused) return;
    // Pause polling while the tab is hidden — prevents background tabs from
    // hammering `capi_event_logs` indefinitely.
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") load();
    }, intervalSec * 1000);
    return () => clearInterval(t);
  }, [auto, paused, intervalSec, load]);

  // Realtime updates — paused state freezes the stream so the operator can
  // inspect the current snapshot without it scrolling underneath them.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribe = () => {
      if (channel) return;
      channel = supabase
        .channel(`capi-logs-inspector:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "capi_event_logs" },
          () => { if (!pausedRef.current) load(); })
        .subscribe();
    };
    const unsubscribe = () => { if (channel) { supabase.removeChannel(channel); channel = null; } };
    const onVis = () => {
      if (document.visibilityState === "visible") { subscribe(); if (!pausedRef.current) load(); }
      else unsubscribe();
    };
    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); unsubscribe(); };
  }, [load]);

  // Dedupe pairs: same event_id appearing in both browser + server
  const dedupePairs = useMemo(() => {
    const m = new Map<string, { browser?: EventRow; server?: EventRow }>();
    for (const r of rows) {
      const e = m.get(r.event_id) ?? {};
      if (r.source === "browser") e.browser = r;
      else e.server = r;
      m.set(r.event_id, e);
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (eventType !== "all" && r.event_name !== eventType) return false;
      if (source !== "all" && r.source !== source) return false;
      if (outcome === "success" && !(r.status === "delivered" || r.status === "sent")) return false;
      if (outcome === "failed" && !(r.status === "failed" || r.status === "exception")) return false;
      if (needle) {
        const hay = [
          r.event_id, r.order_id ?? "",
          ...(r.product_ids ?? []),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, eventType, source, outcome, q]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [eventType, source, outcome, q, days]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  );


  // Summary
  const summary = useMemo(() => {
    const total = filtered.length;
    const ok = filtered.filter((r) => r.status === "delivered" || r.status === "sent").length;
    const failed = filtered.filter((r) => r.status === "failed" || r.status === "exception").length;
    const serverEvents = filtered.filter((r) => r.source === "server");
    const browserCount = filtered.filter((r) => r.source === "browser").length;
    const avg = serverEvents.length
      ? Math.round(serverEvents.reduce((a, r) => a + (r.response_time_ms ?? 0), 0) / serverEvents.length)
      : 0;
    let deduped = 0;
    dedupePairs.forEach((p) => { if (p.browser && p.server) deduped++; });
    const dedupBase = serverEvents.length || 1;
    return {
      total, ok, failed,
      successRate: total ? Math.round((ok / total) * 100) : 0,
      avgMs: avg,
      browserCount,
      serverCount: serverEvents.length,
      dedupeRate: Math.round((deduped / dedupBase) * 100),
    };
  }, [filtered, dedupePairs]);

  const resendTest = async (r: EventRow) => {
    if (!r.test_mode) {
      toast({ title: "Production events cannot be resent", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("meta-capi-test", {
      body: { test_event_code: r.payload?.test_event_code || undefined },
    });
    if (error) toast({ title: "Resend failed", description: error.message, variant: "destructive" });
    else toast({ title: (data as any)?.status === "ok" ? "Test resent" : "Resent with warnings" });
    load();
  };

  return (
    <Section
      title="Live Event Inspector"
      description="Real-time visibility of browser & server Meta events. Sensitive fields are masked."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={paused ? "default" : "outline"}
            className="h-9 px-2.5"
            onClick={togglePause}
            disabled={togglingPause}
            title={paused ? "Resume log creation and live updates" : "Pause log creation and live updates"}
          >
            {paused
              ? <><Play size={13} className="mr-1" />Resume</>
              : <><Pause size={13} className="mr-1" />Pause</>}
          </Button>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Auto <Switch checked={auto} onCheckedChange={setAuto} disabled={paused} className="scale-75" />
          </label>
          <Button size="sm" variant="outline" className="h-9" onClick={load} disabled={paused || togglingPause}>
            <RefreshCw size={13} className={loading ? "animate-spin mr-1" : "mr-1"} />Refresh
          </Button>
        </div>
      }
    >
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {[
          { label: "Total", value: summary.total, icon: Layers },
          { label: "Success rate", value: `${summary.successRate}%`, icon: CheckCircle2, tone: "text-emerald-700" },
          { label: "Failed", value: summary.failed, icon: XCircle, tone: summary.failed ? "text-destructive" : "" },
          { label: "Avg response", value: `${summary.avgMs}ms`, icon: Clock },
          { label: "Browser / Server", value: `${summary.browserCount} / ${summary.serverCount}`, icon: Globe },
          { label: "Dedupe rate", value: `${summary.dedupeRate}%`, icon: Server },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border/60 bg-background/60 p-2.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <m.icon size={11} />{m.label}
            </div>
            <div className={`text-[15px] font-semibold mt-0.5 tabular-nums ${m.tone ?? ""}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by Order ID, Event ID, Product ID"
            className="h-9 pl-8 text-[12px]"
          />
        </div>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="h-9 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All events" : t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as any)}>
          <SelectTrigger className="h-9 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="browser">Browser</SelectItem>
            <SelectItem value="server">Server</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={(v) => setOutcome(v as any)}>
          <SelectTrigger className="h-9 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={(v) => setDays(v as any)}>
          <SelectTrigger className="h-9 w-[100px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">24 hours</SelectItem>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Event list */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-muted-foreground">
            {loading ? "Loading events…" : "No events match your filters yet."}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {paged.map((r) => {
              const pair = dedupePairs.get(r.event_id);
              const isDeduped = !!(pair?.browser && pair?.server);
              const isOpen = !!expanded[r.id];
              return (
                <div key={r.id} className="text-[12px]">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                    className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/30 text-left"
                  >
                    {isOpen ? <ChevronDown size={13} className="mt-0.5 shrink-0" /> : <ChevronRight size={13} className="mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 sm:col-span-3 flex items-center gap-1.5 min-w-0">
                        {r.source === "browser" ? <Globe size={11} className="text-muted-foreground" /> : <Server size={11} className="text-muted-foreground" />}
                        <span className="font-medium truncate">{r.event_name}</span>
                        {r.test_mode && <span className="text-[9px] uppercase px-1 py-px rounded bg-amber-50 text-amber-700 border border-amber-200">test</span>}
                        {isDeduped && <span className="text-[9px] uppercase px-1 py-px rounded bg-blue-50 text-blue-700 border border-blue-200" title="Both browser + server fires recorded — Meta will dedupe">dedup</span>}
                      </div>
                      <div className="col-span-6 sm:col-span-3 font-mono text-[10px] text-muted-foreground truncate">{r.event_id}</div>
                      <div className="col-span-6 sm:col-span-2 truncate text-muted-foreground">{r.order_id ?? "—"}</div>
                      <div className="col-span-6 sm:col-span-1 tabular-nums">{r.value != null ? `${r.value} ${r.currency ?? ""}` : "—"}</div>
                      <div className="col-span-6 sm:col-span-1 tabular-nums text-muted-foreground">{r.http_status ?? "—"}</div>
                      <div className="col-span-8 sm:col-span-1">
                        <span className={`inline-block text-[10px] uppercase px-1.5 py-0.5 rounded border ${statusTone(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="col-span-4 sm:col-span-1 text-right text-[10px] text-muted-foreground tabular-nums">
                        {new Date(r.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <Field label="Source">{r.source}</Field>
                        <Field label="Attempts">{r.attempts ?? "—"}</Field>
                        <Field label="Response time">{r.response_time_ms ? `${r.response_time_ms}ms` : "—"}</Field>
                        <Field label="HTTP">{r.http_status ?? "—"}</Field>
                        <Field label="Order ID">{r.order_id ?? "—"}</Field>
                        <Field label="Products">{(r.product_ids ?? []).join(", ") || "—"}</Field>
                        <Field label="Value">{r.value != null ? `${r.value} ${r.currency ?? ""}` : "—"}</Field>
                        <Field label="Created">{new Date(r.created_at).toLocaleString()}</Field>
                      </div>
                      {r.error && (
                        <div className="flex items-start gap-1.5 text-[11px] text-destructive rounded-lg bg-destructive/5 border border-destructive/20 p-2">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span className="break-all">{r.error}</span>
                        </div>
                      )}
                      {r.response && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Meta response</div>
                          <pre className="text-[10px] font-mono bg-background/70 border border-border/50 rounded-lg p-2 overflow-x-auto">{r.response}</pre>
                        </div>
                      )}
                      {r.payload && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payload (sensitive fields masked)</div>
                          <pre className="text-[10px] font-mono bg-background/70 border border-border/50 rounded-lg p-2 overflow-x-auto">
{JSON.stringify(maskPayload(r.payload), null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.test_mode && r.event_name !== "Purchase" && (
                        <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => resendTest(r)}>
                          <Send size={11} className="mr-1" /> Resend test event
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
          <div className="tabular-nums">
            Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <span className="tabular-nums">Page {pageSafe} / {totalPages}</span>
            <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        25 events per page • up to 1,000 in the selected window. Sensitive fields (tokens, hashed PII, IP, user-agent, cookies) are masked. Admin-only.
      </p>

    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate">{children}</div>
    </div>
  );
}
