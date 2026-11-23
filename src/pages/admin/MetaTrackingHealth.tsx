/**
 * Meta Tracking Health — operational dashboard for the Meta Pixel + CAPI pipeline.
 *
 * Reads `capi_event_logs`, `tracking_pixels`, and calls the `meta-health-check`
 * edge function. Tracking logic is unchanged — this is presentation only.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Download, RefreshCw,
  Search, ShieldCheck, Trash2, XCircle, Zap, ServerCrash, BarChart3, ShoppingBag, Pause, Play,
} from "lucide-react";

type Metrics = {
  server_total: number; browser_total: number;
  server_delivered: number; server_failed: number; server_skipped: number; server_exception: number;
  server_retried: number; avg_response_ms: number; purchases_delivered: number;
  last_success: string | null; last_failure: string | null; last_purchase: string | null;
  by_event: Record<string, number>;
  deduped_pairs: number; server_events_with_id: number;
  recent_fail_streak: number;
};
type TimeseriesRow = { day: string; delivered: number; failed: number; skipped: number; purchases: number };
type HealthCheck = {
  ok: boolean; stage: string; http_status?: number; message: string;
  dataset_id?: string; dataset_name?: string | null; enabled?: boolean;
  test_mode?: boolean; has_test_event_code?: boolean; advanced_matching?: boolean;
  events_received?: number; fbtrace_id?: string | null; validation_method?: string;
  meta_error?: { code?: number; type?: string; message?: string; fbtrace_id?: string } | null;
  network_error?: string | null; latency_ms?: number;
  has_pixel_id?: boolean; has_access_token?: boolean;
};

const WINDOWS = [
  { label: "Last 24 hours", value: "24h", hours: 24 },
  { label: "Last 7 days", value: "7d", hours: 24 * 7 },
  { label: "Last 30 days", value: "30d", hours: 24 * 30 },
];

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtRelative = (s: string | null) => {
  if (!s) return "—";
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

// ── Small Kpi card mirroring CustomerProfile ───────────────────────────
const Kpi = ({
  icon: Icon, label, value, hint, tone,
}: {
  icon: any; label: string; value: React.ReactNode; hint?: React.ReactNode;
  tone?: "success" | "warn" | "info" | "danger" | "violet";
}) => (
  <div className="bg-background border border-border/60 rounded-[4px] px-2.5 py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon
        size={11}
        className={cn(
          "shrink-0",
          tone === "success" ? "text-emerald-600" :
          tone === "warn" ? "text-amber-600" :
          tone === "info" ? "text-blue-600" :
          tone === "danger" ? "text-red-600" :
          tone === "violet" ? "text-violet-600" :
          "text-muted-foreground/70",
        )}
      />
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 truncate">
        {label}
      </span>
    </div>
    <p
      className={cn(
        "text-base sm:text-xl font-semibold tabular-nums leading-tight",
        tone === "success" ? "text-emerald-700" :
        tone === "danger" ? "text-red-700" :
        tone === "warn" ? "text-amber-700" :
        "text-foreground",
      )}
    >
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[10.5px] text-muted-foreground/80 truncate">{hint}</p>}
  </div>
);

const SectionCard = ({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4">
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="text-[12.5px] font-semibold text-foreground">{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

const StatusBadge = ({
  children, tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "danger" | "warn" | "info" | "outline";
}) => (
  <span
    className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-[3px] text-[10.5px] font-medium tracking-wide border",
      tone === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
      tone === "danger" ? "bg-red-50 text-red-700 border-red-200" :
      tone === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" :
      tone === "info" ? "bg-blue-50 text-blue-700 border-blue-200" :
      tone === "outline" ? "bg-background text-muted-foreground border-border" :
      "bg-muted text-muted-foreground border-border",
    )}
  >
    {children}
  </span>
);

const MetaTrackingHealth = () => {
  const { toast } = useToast();
  const [windowKey, setWindowKey] = useState("7d");
  const win = WINDOWS.find((w) => w.value === windowKey)!;
  const since = useMemo(
    () => new Date(Date.now() - win.hours * 3600_000).toISOString(),
    [win.hours],
  );

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesRow[]>([]);
  const [pixel, setPixel] = useState<any>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const initialLoadRef = useRef(true);
  const [running, setRunning] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [alertThreshold, setAlertThreshold] = useState(95);
  const [loggingPaused, setLoggingPaused] = useState(false);
  const [pausingLogs, setPausingLogs] = useState(false);

  // Log explorer
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  const loadAll = useCallback(async () => {
    if (initialLoadRef.current) setLoading(true);
    try {
      const [{ data: m }, { data: ts }, { data: px }] = await Promise.all([
        supabase.rpc("meta_capi_metrics" as any, { _since: since }),
        supabase.rpc("meta_capi_timeseries" as any, { _since: since }),
        supabase.from("tracking_pixels").select("*").eq("platform", "facebook").maybeSingle(),
      ]);
      setMetrics(m as any);
      setTimeseries((ts as any) ?? []);
      setPixel(px);
      if (px && (px as any).log_retention_days) setRetentionDays((px as any).log_retention_days);
      if (px) setLoggingPaused(!!(px as any).logging_paused);
    } catch (e) {
      console.error("Meta tracking health load failed", e);
    } finally {
      if (initialLoadRef.current) {
        setLoading(false);
        initialLoadRef.current = false;
      }
    }
  }, [since]);

  const loadLogs = useCallback(async () => {
    let q = supabase.from("capi_event_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (filterEvent !== "all") q = q.eq("event_name", filterEvent);
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    if (filterSource !== "all") q = q.eq("source", filterSource);
    if (query.trim()) {
      const term = query.trim();
      q = q.or(`event_id.ilike.%${term}%,order_id.ilike.%${term}%`);
    }
    const { data } = await q;
    setLogs(data ?? []);
  }, [query, filterEvent, filterStatus, filterSource]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const t = setTimeout(() => { loadLogs(); }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadLogs, query]);

  const runHealthCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-health-check", { body: {} });
      if (error) throw error;
      setHealth(data as HealthCheck);
      toast({
        title: (data as any)?.ok ? "Healthy" : "Issue detected",
        description: (data as any)?.message,
        variant: (data as any)?.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Health check failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const saveRetention = async () => {
    if (!pixel?.id) return;
    const { error } = await supabase.from("tracking_pixels").update({ log_retention_days: retentionDays }).eq("id", pixel.id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Retention updated", description: `Logs older than ${retentionDays} days will be removed on next cleanup.` });
  };

  const runCleanup = async () => {
    const { data, error } = await supabase.rpc("meta_capi_cleanup" as any, { _keep_days: retentionDays });
    if (error) { toast({ title: "Cleanup failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cleanup complete", description: `${data ?? 0} old log rows removed.` });
    loadAll(); loadLogs();
  };

  const purgeAllLogs = async () => {
    const confirmed = window.confirm(
      "Delete ALL Meta event logs?\n\nThis permanently removes every row from capi_event_logs and cannot be undone.",
    );
    if (!confirmed) return;
    const { data, error } = await supabase.rpc("meta_capi_purge_all" as any);
    if (error) { toast({ title: "Purge failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "All logs deleted", description: `${data ?? 0} rows removed.` });
    setLogs([]);
    loadAll(); loadLogs();
  };

  const toggleLoggingPaused = async (next: boolean) => {
    setPausingLogs(true);
    const previous = loggingPaused;
    setLoggingPaused(next); // optimistic
    setPixel((p: any) => (p ? { ...p, logging_paused: next } : p));
    const { data, error } = await supabase.rpc("set_meta_logging_paused" as any, { _paused: next });
    setPausingLogs(false);
    if (error) {
      setLoggingPaused(previous);
      setPixel((p: any) => (p ? { ...p, logging_paused: previous } : p));
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      return;
    }
    const saved = data === true;
    setLoggingPaused(saved);
    setPixel((p: any) => (p ? { ...p, logging_paused: saved } : p));
    if (!pixel?.id) loadAll();
    toast({
      title: saved ? "Log creation paused" : "Log creation resumed",
      description: saved
        ? "New browser and server Meta events will not be written to capi_event_logs."
        : "Browser and server Meta events will be recorded again.",
    });
  };

  const exportLogs = (format: "csv" | "json") => {
    if (!logs.length) { toast({ title: "Nothing to export" }); return; }
    let content = ""; let mime = "";
    if (format === "json") {
      content = JSON.stringify(logs, null, 2); mime = "application/json";
    } else {
      const cols = ["created_at","event_name","event_id","source","status","http_status","attempts","response_time_ms","value","currency","order_id","error"];
      const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      content = [cols.join(","), ...logs.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
      mime = "text/csv";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `capi-events-${Date.now()}.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  // Derived
  const serverDeliverable = (metrics?.server_delivered ?? 0) + (metrics?.server_failed ?? 0) + (metrics?.server_exception ?? 0);
  const successRate = pct(metrics?.server_delivered ?? 0, serverDeliverable);
  const failureRate = pct((metrics?.server_failed ?? 0) + (metrics?.server_exception ?? 0), serverDeliverable);
  const dedupRate = pct(metrics?.deduped_pairs ?? 0, metrics?.server_events_with_id ?? 0);
  const retryRate = pct(metrics?.server_retried ?? 0, serverDeliverable);

  const alerts: { level: "danger" | "warn"; text: string }[] = [];
  if (metrics) {
    if (pixel && !pixel.enabled && !pixel.test_mode) alerts.push({ level: "warn", text: "Pixel is disabled and Test Mode is off — no events are being sent to Meta." });
    if (serverDeliverable > 10 && successRate < alertThreshold) alerts.push({ level: "danger", text: `Success rate ${successRate}% is below the ${alertThreshold}% threshold.` });
    if (metrics.recent_fail_streak >= 5) alerts.push({ level: "danger", text: `${metrics.recent_fail_streak} consecutive Graph API failures detected.` });
    if (metrics.browser_total > 50 && metrics.purchases_delivered === 0 && win.hours <= 48) {
      alerts.push({ level: "warn", text: "No Purchase events delivered while browser traffic is active — verify checkout tracking." });
    }
    if (retryRate > 20) alerts.push({ level: "warn", text: `Retry rate is elevated (${retryRate}%) — Meta endpoint may be unstable.` });
    if (metrics.server_events_with_id > 20 && dedupRate < 50 && metrics.browser_total > 0) {
      alerts.push({ level: "warn", text: `Browser↔Server deduplication is low (${dedupRate}%). Verify event_id parity.` });
    }
    if (health && !health.ok) {
      if (health.stage === "token") alerts.push({ level: "danger", text: "Meta Access Token is invalid or revoked." });
      if (health.stage === "dataset") alerts.push({ level: "danger", text: "Meta dataset is unreachable — check the Pixel ID." });
    }
  }

  const maxDay = Math.max(1, ...timeseries.map((d) => d.delivered + d.failed + d.skipped));

  return (
    <div className="max-w-6xl pb-10 space-y-3">
      {/* Top page controls */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Select value={windowKey} onValueChange={setWindowKey}>
          <SelectTrigger className="h-9 w-[140px] rounded-[4px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline" size="sm"
          className="h-9 px-3 rounded-[4px] text-[12px]"
          onClick={() => { loadAll(); loadLogs(); }}
          disabled={loading}
        >
          <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} /> Refresh
        </Button>
        <Button
          size="sm"
          className="h-9 px-3 rounded-[4px] text-[12px]"
          onClick={runHealthCheck}
          disabled={running}
        >
          <ShieldCheck size={13} className="mr-1.5" /> {running ? "Checking…" : "Run health check"}
        </Button>
      </div>

      {/* Pause log creation control */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2">
          {loggingPaused
            ? <Pause size={13} className="mt-0.5 text-amber-600 shrink-0" />
            : <Play size={13} className="mt-0.5 text-emerald-600 shrink-0" />}
          <div className="min-w-0">
            <div className="text-[12px] font-medium">
              {loggingPaused ? "Log creation paused" : "Log creation active"}
            </div>
            <p className="text-[10.5px] text-muted-foreground">
              {loggingPaused
                ? "New CAPI events are still sent to Meta but are not written to capi_event_logs."
                : "Every CAPI event is recorded to capi_event_logs for inspection."}
            </p>
          </div>
        </div>
        <Switch
          checked={loggingPaused}
          disabled={pausingLogs}
          onCheckedChange={toggleLoggingPaused}
        />
      </div>


      {/* Config strip — render only once pixel row is known to avoid flip */}
      {pixel !== null ? (
        <div className="bg-background border border-border/60 rounded-[4px] px-3 py-2.5 flex flex-wrap items-center gap-1.5">
          {pixel?.pixel_id && pixel?.access_token
            ? <StatusBadge tone="success">Pixel configured</StatusBadge>
            : <StatusBadge tone="danger">Pixel not configured</StatusBadge>}
          {pixel?.enabled
            ? <StatusBadge tone="success">CAPI enabled</StatusBadge>
            : <StatusBadge tone="neutral">CAPI disabled</StatusBadge>}
          {pixel?.test_mode && <StatusBadge tone="warn">Test mode ON</StatusBadge>}
          {pixel?.advanced_matching && <StatusBadge tone="outline">Advanced matching</StatusBadge>}
          {pixel?.test_event_code && (
            <StatusBadge tone="outline">
              Test code <span className="ml-1 font-mono">{pixel.test_event_code}</span>
            </StatusBadge>
          )}
        </div>
      ) : (
        <Skeleton className="h-10 rounded-[4px]" />
      )}

      {/* Health result */}
      {health && (
        <div
          className={cn(
            "rounded-[4px] border px-3 py-2.5 text-[12.5px]",
            health.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800",
          )}
        >
          <div className="flex items-start gap-2">
            {health.ok
              ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              : <XCircle size={14} className="mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{health.message}</div>
              <div className="mt-0.5 text-[11px] opacity-80 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>stage: {health.stage}</span>
                {typeof health.events_received === "number" && <span>events_received: {health.events_received}</span>}
                {typeof health.latency_ms === "number" && <span>{health.latency_ms}ms</span>}
                {health.fbtrace_id && <span className="font-mono">{health.fbtrace_id}</span>}
              </div>
              {health.meta_error && (
                <div className="mt-1 text-[11px] opacity-80">
                  Meta error {health.meta_error.code}: {health.meta_error.message}
                </div>
              )}
          </div>
        </div>
      </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-[4px] p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-amber-800 mb-1.5">
            <AlertTriangle size={11} /> Active alerts ({alerts.length})
          </div>
          <ul className="space-y-1 text-[12.5px]">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                {a.level === "danger"
                  ? <ServerCrash size={13} className="mt-0.5 text-red-600 shrink-0" />
                  : <AlertTriangle size={13} className="mt-0.5 text-amber-600 shrink-0" />}
                <span className={a.level === "danger" ? "text-red-800" : "text-amber-900"}>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {loading && !metrics ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-[4px]" />)
        ) : (
          <>
            <Kpi
              icon={CheckCircle2} label="Success rate" value={`${successRate}%`}
              hint={`${metrics?.server_delivered ?? 0} delivered`}
              tone={serverDeliverable === 0 ? undefined : successRate >= alertThreshold ? "success" : "danger"}
            />
            <Kpi
              icon={XCircle} label="Failure rate" value={`${failureRate}%`}
              hint={`${(metrics?.server_failed ?? 0) + (metrics?.server_exception ?? 0)} failed`}
              tone={failureRate > 5 ? "danger" : undefined}
            />
            <Kpi icon={Clock} label="Avg response" value={`${metrics?.avg_response_ms ?? 0}ms`} hint="Meta Graph API" />
            <Kpi
              icon={Zap} label="Dedup rate" value={`${dedupRate}%`}
              hint={`${metrics?.deduped_pairs ?? 0} paired`}
              tone={metrics?.server_events_with_id ? (dedupRate >= 70 ? "success" : "warn") : undefined}
            />
            <Kpi
              icon={Activity} label="Browser / Server"
              value={`${metrics?.browser_total ?? 0} / ${metrics?.server_total ?? 0}`}
            />
            <Kpi
              icon={ShoppingBag} label="Purchases" value={metrics?.purchases_delivered ?? 0}
              hint={`Last: ${fmtRelative(metrics?.last_purchase ?? null)}`}
              tone={(metrics?.purchases_delivered ?? 0) > 0 ? "success" : undefined}
            />
          </>
        )}
      </div>

      {/* Last-seen pair */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-background border border-border/60 rounded-[4px] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70">
            <CheckCircle2 size={11} className="text-emerald-600" /> Last successful event
          </div>
          <div className="mt-1 text-[13px] tabular-nums">{fmtTime(metrics?.last_success ?? null)}</div>
          <div className="text-[11px] text-muted-foreground">{fmtRelative(metrics?.last_success ?? null)}</div>
        </div>
        <div className="bg-background border border-border/60 rounded-[4px] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70">
            <XCircle size={11} className="text-red-600" /> Last failed event
          </div>
          <div className="mt-1 text-[13px] tabular-nums">{fmtTime(metrics?.last_failure ?? null)}</div>
          <div className="text-[11px] text-muted-foreground">{fmtRelative(metrics?.last_failure ?? null)}</div>
        </div>
      </div>

      {/* Daily timeseries */}
      <SectionCard
        title="Daily event volume"
        action={<span className="text-[11px] text-muted-foreground">Server events by status</span>}
      >
        {timeseries.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-6 text-center">No server events in this window.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-36">
            {timeseries.map((d) => {
              const total = d.delivered + d.failed + d.skipped;
              const h = (total / maxDay) * 100;
              return (
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${d.day} · delivered ${d.delivered} · failed ${d.failed} · skipped ${d.skipped} · purchases ${d.purchases}`}
                >
                  <div className="w-full flex flex-col-reverse rounded-[2px] overflow-hidden bg-muted/40" style={{ height: `${h}%` }}>
                    <div className="bg-emerald-500" style={{ height: `${pct(d.delivered, total)}%` }} />
                    <div className="bg-red-500" style={{ height: `${pct(d.failed, total)}%` }} />
                    <div className="bg-muted-foreground/30" style={{ height: `${pct(d.skipped, total)}%` }} />
                  </div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">{d.day.slice(5)}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-3 text-[11px] text-muted-foreground mt-2.5">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-[2px]" /> Delivered</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-500 rounded-[2px]" /> Failed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-muted-foreground/30 rounded-[2px]" /> Skipped</span>
        </div>
      </SectionCard>

      {/* Events by type */}
      <SectionCard title="Events by type">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {Object.entries(metrics?.by_event ?? {})
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-[3px] border border-border/60 bg-background px-2.5 py-1.5"
              >
                <span className="text-[11.5px] truncate">{name}</span>
                <span className="text-[12px] font-medium tabular-nums">{count}</span>
              </div>
            ))}
          {Object.keys(metrics?.by_event ?? {}).length === 0 && (
            <div className="text-[12px] text-muted-foreground col-span-full py-2">No events in this window.</div>
          )}
        </div>
      </SectionCard>

      {/* Log explorer */}
      <SectionCard
        title="Event log"
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-[4px] text-[11.5px]" onClick={() => exportLogs("csv")}>
              <Download size={12} className="mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-[4px] text-[11.5px]" onClick={() => exportLogs("json")}>
              <Download size={12} className="mr-1" /> JSON
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5 mb-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-9 rounded-[4px] text-[12.5px]"
              placeholder="Search Event ID or Order ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={filterEvent} onValueChange={setFilterEvent}>
            <SelectTrigger className="h-9 w-[150px] rounded-[4px] text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration"]
                .map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All events" : v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-[130px] rounded-[4px] text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "delivered", "failed", "skipped", "exception"]
                .map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All statuses" : v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-9 w-[120px] rounded-[4px] text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "server", "browser"]
                .map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All sources" : v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block bg-background border border-border/60 rounded-[4px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/60 border-b-2 border-border">
                <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  <th className="px-2.5 py-2 text-left">Time</th>
                  <th className="px-2.5 py-2 text-left">Event</th>
                  <th className="px-2.5 py-2 text-left">Source</th>
                  <th className="px-2.5 py-2 text-left">Status</th>
                  <th className="px-2.5 py-2 text-right">HTTP</th>
                  <th className="px-2.5 py-2 text-right">ms</th>
                  <th className="px-2.5 py-2 text-left">Order</th>
                  <th className="px-2.5 py-2 text-left">Event ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                    <td className="px-2.5 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-2.5 py-1.5 font-medium">{l.event_name}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground">{l.source}</td>
                    <td className="px-2.5 py-1.5">
                      <StatusBadge
                        tone={
                          l.status === "delivered" ? "success" :
                          l.status === "failed" || l.status === "exception" ? "danger" :
                          "neutral"
                        }
                      >
                        {l.status}
                      </StatusBadge>
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{l.http_status ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{l.response_time_ms ?? "—"}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground">{l.order_id ?? "—"}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[10.5px] truncate max-w-[200px] text-muted-foreground">{l.event_id}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={8} className="px-2.5 py-8 text-center text-muted-foreground text-[12px]">No matching events.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-1.5">
          {logs.map((l) => (
            <div key={l.id} className="border border-border/60 rounded-[4px] p-2.5 bg-background">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12.5px] font-medium truncate">{l.event_name}</span>
                <StatusBadge
                  tone={
                    l.status === "delivered" ? "success" :
                    l.status === "failed" || l.status === "exception" ? "danger" :
                    "neutral"
                  }
                >
                  {l.status}
                </StatusBadge>
              </div>
              <div className="text-[10.5px] text-muted-foreground tabular-nums">
                {new Date(l.created_at).toLocaleString()} · {l.source} · {l.http_status ?? "—"} · {l.response_time_ms ?? "—"}ms
              </div>
              <div className="text-[10px] text-muted-foreground/80 font-mono truncate mt-0.5">{l.event_id}</div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-[12px] text-muted-foreground text-center py-6">No matching events.</div>
          )}
        </div>
      </SectionCard>

      {/* Operations */}
      <SectionCard title="Operations">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-border/60 rounded-[4px] p-3 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1.5">
              Log retention (days)
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                type="number" min={7} max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value) || 30)}
                className="h-9 w-24 rounded-[4px] text-[12.5px] tabular-nums"
              />
              <Button size="sm" variant="outline" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={saveRetention}>
                Save
              </Button>
              <Button size="sm" variant="outline" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={runCleanup}>
                <Trash2 size={13} className="mr-1.5" /> Cleanup now
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Logs older than this are eligible for removal. Minimum 7 days is enforced server-side.
            </p>
          </div>
          <div className="border border-border/60 rounded-[4px] p-3 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1.5">
              Success-rate alert threshold (%)
            </div>
            <Input
              type="number" min={50} max={100}
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(Number(e.target.value) || 95)}
              className="h-9 w-24 rounded-[4px] text-[12.5px] tabular-nums"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              An alert appears when the success rate drops below this for the active window.
            </p>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-3 border border-red-200 bg-red-50/60 rounded-[4px] p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-red-700 mb-1.5">
            <AlertTriangle size={11} /> Danger zone
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-red-800">Delete all event logs</div>
              <p className="text-[11px] text-red-700/80">
                Permanently removes every row from <span className="font-mono">capi_event_logs</span>. This cannot be undone.
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-9 px-3 rounded-[4px] text-[12px] shrink-0"
              onClick={purgeAllLogs}
            >
              <Trash2 size={13} className="mr-1.5" /> Delete all logs
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default MetaTrackingHealth;
