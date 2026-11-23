import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, RotateCcw, Trash2, Play, AlertTriangle, CheckCircle2,
  Clock, Database, Search, Zap, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Stats = {
  total: number;
  pending: number;
  in_grace: number;
  processed: number;
  failed: number;
  retrying: number;
  oldest_pending: string | null;
  processed_24h: number;
  queued_24h: number;
};

type QueueRow = {
  id: number;
  ref: string;
  source_table: string | null;
  source_id: string | null;
  queued_at: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  claimed_at: string | null;
};

type Coverage = {
  tables_with_refs: string[];
  tables_with_trigger: string[];
  uncovered: string[];
};
type SweepStatus = {
  last_run: {
    id: number;
    started_at: string;
    finished_at: string | null;
    scanned: number;
    orphans_found: number;
    orphans_queued: number;
    grace_hours: number;
    error: string | null;
  } | null;
  queued_orphans: number;
  total_runs: number;
};

function relative(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts).getTime();
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Compact KPI card (matches CustomerProfile.Kpi) ─────────────────────
const Kpi = ({
  icon: Icon, label, value, tone,
}: {
  icon: any; label: string; value: React.ReactNode;
  tone?: "success" | "warn" | "danger" | "info";
}) => (
  <div className="bg-background border border-border/60 rounded-[4px] px-2.5 py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon
        size={11}
        className={cn(
          "shrink-0",
          tone === "success" ? "text-green-600" :
          tone === "warn" ? "text-amber-600" :
          tone === "danger" ? "text-red-600" :
          tone === "info" ? "text-blue-600" :
          "text-muted-foreground",
        )}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
    <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
  </div>
);

// ── Section wrapper matching customer-profile cards ───────────────────
const Section = ({
  icon: Icon, title, description, action, children,
}: {
  icon?: any; title: string; description?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border/60">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {Icon ? <Icon size={12} className="text-muted-foreground" /> : null}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        {description ? (
          <p className="text-xs text-foreground/70 mt-1 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0">{action}</div> : null}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

export default function R2CleanupHealth() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [sweep, setSweep] = useState<SweepStatus | null>(null);
  const [failedRows, setFailedRows] = useState<QueueRow[]>([]);
  const [recentRows, setRecentRows] = useState<QueueRow[]>([]);
  const [orphanRows, setOrphanRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c, sw, f, r, o] = await Promise.all([
      supabase.rpc("r2_queue_stats"),
      supabase.rpc("r2_coverage_audit"),
      supabase.rpc("r2_orphan_sweep_status"),
      supabase
        .from("r2_deletion_queue")
        .select("*")
        .is("processed_at", null)
        .gte("attempts", 8)
        .order("queued_at", { ascending: false })
        .limit(50),
      supabase
        .from("r2_deletion_queue")
        .select("*")
        .order("queued_at", { ascending: false })
        .limit(25),
      supabase
        .from("r2_deletion_queue")
        .select("*")
        .is("processed_at", null)
        .eq("source_table", "orphan_sweep")
        .order("queued_at", { ascending: false })
        .limit(100),
    ]);
    if (s.data) setStats(s.data as Stats);
    if (c.data) setCoverage(c.data as Coverage);
    if (sw.data) setSweep(sw.data as SweepStatus);
    if (f.data) setFailedRows(f.data as QueueRow[]);
    if (r.data) setRecentRows(r.data as QueueRow[]);
    if (o.data) setOrphanRows(o.data as QueueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const runWorker = async (label = "Worker triggered") => {
    const { error } = await supabase.functions.invoke("r2-cleanup-worker", { body: {} });
    if (error) throw error;
    toast.success(label);
  };

  const onRunWorker = async () => {
    setBusy("run");
    try { await runWorker(); await load(); }
    catch (e) { toast.error("Worker run failed", { description: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const retryAll = async () => {
    setBusy("retry");
    try {
      const { data, error } = await supabase.rpc("r2_retry_failed", { _ids: null });
      if (error) throw error;
      toast.success(`Re-queued ${data ?? 0} items`);
      await load();
    } catch (e) {
      toast.error("Retry failed", { description: (e as Error).message });
    } finally { setBusy(null); }
  };

  const retryOne = async (id: number) => {
    const { error } = await supabase.rpc("r2_retry_failed", { _ids: [id] });
    if (error) return toast.error(error.message);
    toast.success("Re-queued");
    load();
  };

  const deleteOne = async (id: number) => {
    setBusy(`del-${id}`);
    try {
      const { data, error } = await supabase.rpc("r2_expedite", { _ids: [id] });
      if (error) throw error;
      if ((data ?? 0) === 0) {
        toast.message("Nothing to expedite (already processed).");
      } else {
        await runWorker("Deletion triggered");
      }
      await load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally { setBusy(null); }
  };

  const deleteAllOrphans = async () => {
    if (!confirm("Permanently delete all unused images from R2 now? This skips the safety grace window.")) return;
    setBusy("del-orphans");
    try {
      const { data, error } = await supabase.rpc("r2_expedite_orphans");
      if (error) throw error;
      const n = (data as number) ?? 0;
      if (n === 0) {
        toast.message("No queued orphans to delete.");
      } else {
        await runWorker(`Deleting ${n} unused file${n === 1 ? "" : "s"}…`);
      }
      await load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally { setBusy(null); }
  };

  const prune = async () => {
    setBusy("prune");
    try {
      const { data, error } = await supabase.rpc("r2_prune_processed", {});
      if (error) throw error;
      toast.success(`Pruned ${data ?? 0} processed rows`);
      await load();
    } catch (e) {
      toast.error("Prune failed", { description: (e as Error).message });
    } finally { setBusy(null); }
  };

  const runSweep = async (graceHours = 1) => {
    setBusy("sweep");
    try {
      const { data, error } = await supabase.functions.invoke("r2-orphan-sweep", {
        body: { grace_hours: graceHours },
      });
      if (error) throw error;
      const res = (data ?? {}) as { scanned?: number; orphans_found?: number; orphans_queued?: number; error?: string | null };
      if (res.error) {
        toast.error("Sweep finished with errors", { description: res.error });
      } else {
        toast.success(`Sweep complete · scanned ${res.scanned ?? 0}, queued ${res.orphans_queued ?? 0} orphans`);
      }
      await load();
    } catch (e) {
      toast.error("Sweep failed", { description: (e as Error).message });
    } finally { setBusy(null); }
  };

  const oldestLabel = useMemo(() => relative(stats?.oldest_pending ?? null), [stats]);
  const lastSweepLabel = useMemo(() => relative(sweep?.last_run?.started_at ?? null), [sweep]);

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">R2 Cleanup Health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Orphan-file deletion queue. Items wait ~2 min in grace before deletion so restores stay safe.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="rounded-[4px] h-8 flex-1 sm:flex-none">
            <RefreshCw size={13} className={cn("mr-1", loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" onClick={onRunWorker} disabled={busy === "run"} className="rounded-[4px] h-8 flex-1 sm:flex-none">
            <Play size={13} className="mr-1" /> Run worker
          </Button>
        </div>
      </div>

      {/* Queue KPIs */}
      <Section icon={Database} title="Deletion queue">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Pending"        value={stats?.pending ?? "—"}       icon={Clock} tone={stats && stats.pending > 100 ? "warn" : undefined} />
          <Kpi label="In grace (≤2m)" value={stats?.in_grace ?? "—"}      icon={Clock} />
          <Kpi label="Failed"         value={stats?.failed ?? "—"}        icon={AlertTriangle} tone={stats && stats.failed > 0 ? "danger" : "success"} />
          <Kpi label="Retrying"       value={stats?.retrying ?? "—"}      icon={RotateCcw} />
          <Kpi label="Processed (24h)"value={stats?.processed_24h ?? "—"} icon={CheckCircle2} tone="success" />
          <Kpi label="Queued (24h)"   value={stats?.queued_24h ?? "—"}    icon={Database} />
          <Kpi
            label="Active in queue"
            value={stats ? Math.max(0, (stats.total ?? 0) - (stats.processed ?? 0)) : "—"}
            icon={Database}
          />
          <Kpi label="Processed (lifetime)" value={stats?.processed ?? "—"} icon={CheckCircle2} />
          <Kpi label="Oldest pending" value={oldestLabel}                 icon={Clock} />
        </div>
      </Section>

      {/* Orphan sweep */}
      <Section
        icon={Search}
        title="Orphan sweep"
        description="Compares every object in R2 against database references and queues anything older than the grace window with no remaining owner. Runs daily; safe to run on demand."
        action={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={deleteAllOrphans}
              disabled={busy === "del-orphans" || (sweep?.queued_orphans ?? 0) === 0}
              className="rounded-[4px] h-8 text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
            >
              <Zap size={13} className="mr-1" />
              {busy === "del-orphans" ? "Deleting…" : "Delete all unused now"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => runSweep(0)} disabled={busy === "sweep"} className="rounded-[4px] h-8">
              <Play size={13} className="mr-1" /> Sweep now (no grace)
            </Button>
            <Button size="sm" onClick={() => runSweep(1)} disabled={busy === "sweep"} className="rounded-[4px] h-8">
              <Play size={13} className="mr-1" /> {busy === "sweep" ? "Sweeping…" : "Run sweep"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Last sweep"        value={lastSweepLabel}                       icon={Clock} />
          <Kpi label="Scanned"           value={sweep?.last_run?.scanned ?? "—"}      icon={Database} />
          <Kpi label="Orphans found"     value={sweep?.last_run?.orphans_found ?? "—"} icon={AlertTriangle}
               tone={sweep?.last_run && sweep.last_run.orphans_found > 0 ? "warn" : "success"} />
          <Kpi label="Awaiting deletion" value={sweep?.queued_orphans ?? "—"}         icon={Trash2}
               tone={sweep && sweep.queued_orphans > 0 ? "warn" : "success"} />
        </div>

        {sweep?.last_run?.error ? (
          <div className="mt-3 text-xs text-red-700 break-all border border-red-200 bg-red-50 rounded-[4px] p-2">
            Last sweep error: {sweep.last_run.error}
          </div>
        ) : null}

        {orphanRows.length > 0 ? (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Unused files awaiting deletion ({orphanRows.length}{orphanRows.length === 100 ? "+" : ""})
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {orphanRows.map((row) => (
                <div key={row.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 text-xs border border-border/60 rounded-[4px] px-3 py-2">
                  <Trash2 size={12} className="text-amber-600 shrink-0" />
                  <span className="font-mono text-[11px] truncate flex-1 min-w-0 basis-[60%] sm:basis-auto">{row.ref}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{relative(row.queued_at)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteOne(row.id)}
                    disabled={busy === `del-${row.id}`}
                    className="rounded-[4px] h-7 px-2 text-red-700 hover:text-red-800 hover:bg-red-50 shrink-0 ml-auto"
                  >
                    <Trash2 size={12} className="mr-1" />
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground mt-3">
          Grace window: {sweep?.last_run?.grace_hours ?? 24}h · Total runs: {sweep?.total_runs ?? 0}.
          Orphans are enqueued with <code className="font-mono">source_table=orphan_sweep</code>.
          The worker re-verifies usage before deleting from R2 — every action is logged to{" "}
          <code className="font-mono">media_audit_log</code>.
        </p>
      </Section>

      {/* Failed items */}
      <Section
        icon={AlertTriangle}
        title="Failed items"
        description="Exceeded 8 retries. Re-queue to attempt deletion again, or delete the queue row only."
        action={
          <Button
            size="sm" variant="outline" onClick={retryAll}
            disabled={busy === "retry" || failedRows.length === 0}
            className="rounded-[4px] h-8"
          >
            <RotateCcw size={13} className="mr-1" /> Retry all
          </Button>
        }
      >
        {failedRows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">No failed items.</div>
        ) : (
          <div className="space-y-2">
            {failedRows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border border-border/60 rounded-[4px] p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] truncate">{row.ref}</div>
                  <div className="text-muted-foreground mt-1">
                    {row.source_table ?? "—"} · queued {relative(row.queued_at)} · {row.attempts} attempts
                  </div>
                  {row.last_error ? (
                    <div className="mt-1 text-red-700 break-all">{row.last_error}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => retryOne(row.id)} className="rounded-[4px] h-7 px-2">
                    Retry
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => deleteOne(row.id)}
                    disabled={busy === `del-${row.id}`}
                    className="rounded-[4px] h-7 px-2 text-red-700 hover:text-red-800 hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Trigger coverage */}
      <Section
        icon={ShieldCheck}
        title="Trigger coverage"
        description="Every public table that stores r2: / r2o: references should have the cleanup trigger."
      >
        {!coverage ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Uncovered tables</div>
              {coverage.uncovered.length === 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 rounded-[4px]">All tables covered</Badge>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {coverage.uncovered.map((t) => (
                    <Badge key={t} variant="destructive" className="rounded-[4px]">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tables with R2 refs ({coverage.tables_with_refs.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {coverage.tables_with_refs.map((t) => (
                    <Badge key={t} variant="secondary" className="rounded-[4px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tables with trigger ({coverage.tables_with_trigger.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {coverage.tables_with_trigger.map((t) => (
                    <Badge key={t} variant="outline" className="rounded-[4px]">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Recent activity */}
      <Section
        icon={Clock}
        title="Recent activity"
        description="Last 25 queue entries."
        action={
          <Button size="sm" variant="ghost" onClick={prune} disabled={busy === "prune"} className="rounded-[4px] h-8 text-muted-foreground">
            <Trash2 size={13} className="mr-1" /> Prune processed &gt;7d
          </Button>
        }
      >
        {recentRows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">Queue is empty.</div>
        ) : (
          <div className="space-y-1.5">
            {recentRows.map((row) => {
              const status =
                row.processed_at ? { label: "processed", cls: "bg-emerald-100 text-emerald-800" } :
                row.attempts >= 8 ? { label: "failed", cls: "bg-red-100 text-red-800" } :
                row.attempts > 0 ? { label: "retrying", cls: "bg-amber-100 text-amber-800" } :
                { label: "pending", cls: "bg-slate-100 text-slate-700" };
              return (
                <div key={row.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 text-xs border border-border/60 rounded-[4px] px-3 py-2">
                  <Badge className={`${status.cls} rounded-[4px] border-0 shrink-0`}>{status.label}</Badge>
                  <span className="font-mono text-[11px] truncate flex-1 min-w-0 basis-full sm:basis-auto order-last sm:order-none">{row.ref}</span>
                  <span className="text-muted-foreground shrink-0 truncate max-w-[40%]">{row.source_table ?? "—"}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums ml-auto sm:ml-0">{relative(row.queued_at)}</span>
                  {!row.processed_at ? (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => deleteOne(row.id)}
                      disabled={busy === `del-${row.id}`}
                      className="rounded-[4px] h-6 px-1.5 text-red-700 hover:text-red-800 hover:bg-red-50 shrink-0"
                      title="Delete from R2 now"
                    >
                      <Trash2 size={12} />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
