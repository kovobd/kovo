import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Pause, Play, CheckCircle2, TriangleAlert, Search, Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PerTable = { target: string; legacy: number; migrated: number; empty: number };
type Audit = {
  perTable: PerTable[];
  totalLegacy: number;
  totalMigrated: number;
  r2Health?: { ok: boolean; message: string };
};

type RunErr = { id: string; target: string; message: string };
type HealthState = "green" | "yellow" | "red";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
    {children}
  </span>
);

const Kpi = ({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: React.ReactNode; tone?: "success" | "warn" | "info" }) => (
  <div className="bg-background border border-border/60 rounded-[4px] px-2.5 py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon size={11} className={cn(
        "shrink-0",
        tone === "success" ? "text-green-600" :
        tone === "warn" ? "text-amber-600" :
        tone === "info" ? "text-blue-600" :
        "text-muted-foreground/70",
      )} />
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 truncate">{label}</span>
    </div>
    <p className="text-base sm:text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
  </div>
);

const R2Migration = ({ hideTitle: _hideTitle }: { hideTitle?: boolean }) => {
  const { toast } = useToast();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [running, setRunning] = useState(false);
  const [migrated, setMigrated] = useState(0);
  const [failed, setFailed] = useState(0);
  const [, setRemaining] = useState<number | null>(null);
  const [initialLegacy, setInitialLegacy] = useState<number | null>(null);
  const [errors, setErrors] = useState<RunErr[]>([]);
  const [batchSize, setBatchSize] = useState(1);
  const [search, setSearch] = useState("");
  const [lastAudit, setLastAudit] = useState<Date | null>(null);
  const cancelRef = useRef(false);

  const refreshAudit = async () => {
    setLoadingAudit(true);
    const { data, error } = await supabase.functions.invoke("migrate-images-r2", { body: { mode: "audit" } });
    setLoadingAudit(false);
    if (error || (data as any)?.error) {
      toast({ title: "Audit failed", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    setAudit(data as Audit);
  };

  useEffect(() => { refreshAudit(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (audit) setLastAudit(new Date()); }, [audit]);

  const start = async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setMigrated(0);
    setFailed(0);
    setErrors([]);
    setInitialLegacy(audit?.totalLegacy ?? null);

    try {
      while (!cancelRef.current) {
        const { data, error } = await supabase.functions.invoke("migrate-images-r2", {
          body: { mode: "process", batchSize },
        });
        if (error) throw new Error(error.message);
        const d = data as {
          migrated: number; failed: number; remaining: number; done: boolean;
          errors: RunErr[]; perTable: PerTable[]; totalMigrated: number;
          fatalError?: string;
          r2Health?: { ok: boolean; message: string };
        };
        if ((d as any)?.error) throw new Error((d as any).error);
        if (d.fatalError) throw new Error(d.fatalError);
        setMigrated((m) => m + (d.migrated ?? 0));
        setFailed((f) => f + (d.failed ?? 0));
        setRemaining(d.remaining);
        if (d.errors?.length) setErrors((e) => [...e, ...d.errors].slice(-50));
        setAudit({ perTable: d.perTable, totalLegacy: d.remaining, totalMigrated: d.totalMigrated, r2Health: d.r2Health });
        if (d.done || d.remaining === 0) break;
        if ((d.migrated ?? 0) === 0 && (d.failed ?? 0) === 0) break;
      }
      toast({ title: cancelRef.current ? "Migration paused" : "Migration complete" });
    } catch (e: any) {
      toast({ title: "Migration error", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const stop = () => { cancelRef.current = true; };

  const pct = (() => {
    if (initialLegacy == null || initialLegacy === 0) return 0;
    const done = Math.min(initialLegacy, migrated);
    return Math.round((done / initialLegacy) * 100);
  })();

  const totalImages = (audit?.totalLegacy ?? 0) + (audit?.totalMigrated ?? 0);
  const allDone = (audit?.totalLegacy ?? 0) === 0 && !!audit;

  const healthState: HealthState =
    audit?.r2Health?.ok === false
      ? "red"
      : (audit?.totalLegacy ?? 0) > 0
      ? "yellow"
      : "green";
  const healthLabel = healthState === "green" ? "Healthy" : healthState === "yellow" ? "Warning" : "Error";
  const healthDot =
    healthState === "green" ? "bg-green-500" :
    healthState === "yellow" ? "bg-amber-500" :
    "bg-destructive";

  const currentTable = useMemo(() => {
    if (!audit?.perTable?.length) return null;
    const sorted = [...audit.perTable].filter(r => r.legacy > 0).sort((a, b) => b.legacy - a.legacy);
    return sorted[0]?.target ?? null;
  }, [audit]);

  const filteredRows = useMemo(() => {
    if (!audit) return [];
    const q = search.trim().toLowerCase();
    if (!q) return audit.perTable;
    return audit.perTable.filter(r => r.target.toLowerCase().includes(q));
  }, [audit, search]);

  const btn = "h-9 px-3 rounded-[4px] text-[12px]";

  return (
    <div className="max-w-5xl pb-10 space-y-3">
      {/* Meta strip + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
          <span className={cn("inline-flex items-center gap-1.5")}>
            <span className={cn("w-1.5 h-1.5 rounded-full", healthDot)} />
            <span className="text-foreground">{healthLabel}</span>
          </span>
          {lastAudit && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span>Last audit {lastAudit.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" className={btn} onClick={refreshAudit} disabled={loadingAudit || running}>
          <RefreshCw size={13} className={cn("mr-1.5", loadingAudit && "animate-spin")} />
          {loadingAudit ? "Auditing…" : "Refresh"}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi icon={Cloud} label="Total records" value={totalImages.toLocaleString()} />
        <Kpi icon={CheckCircle2} tone="success" label="On R2 (CDN)" value={(audit?.totalMigrated ?? 0).toLocaleString()} />
        <Kpi icon={TriangleAlert} tone={audit?.totalLegacy ? "warn" : "success"} label="Legacy" value={(audit?.totalLegacy ?? 0).toLocaleString()} />
        <Kpi icon={Search} tone="info" label="Targets" value={audit?.perTable.length ?? 0} />
      </div>

      {/* Run migration */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Run migration</SectionLabel>
          <span className="text-[11.5px] text-muted-foreground/70">Process legacy URLs in batches.</span>
        </div>

        {audit?.r2Health && !audit.r2Health.ok && (
          <div className="flex items-start gap-2 rounded-[4px] border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[12px] text-destructive">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            <span>{audit.r2Health.message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {allDone && !running ? (
              <>
                <Button className={cn(btn, "min-w-[150px]")} disabled>
                  <CheckCircle2 size={13} className="mr-1.5" /> Start migration
                </Button>
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  All migrated
                </span>
              </>
            ) : running ? (
              <>
                <Button className={cn(btn, "min-w-[150px]")} disabled>
                  <RefreshCw size={13} className="animate-spin mr-1.5" /> Migrating…
                </Button>
                <Button variant="outline" className={btn} onClick={stop}>
                  <Pause size={13} className="mr-1.5" /> Pause
                </Button>
              </>
            ) : (
              <Button
                className={cn(btn, "min-w-[150px]")}
                onClick={start}
                disabled={(audit?.totalLegacy ?? 0) === 0 || audit?.r2Health?.ok === false}
              >
                <Play size={13} className="mr-1.5" /> Start migration
              </Button>
            )}
          </div>

          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Batch size
            <input
              type="number"
              min={1}
              max={10}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              disabled={running}
              className="w-16 h-9 px-2 rounded-[4px] border border-border bg-background text-[12.5px] tabular-nums text-center"
            />
          </label>
        </div>

        {(running || migrated > 0 || failed > 0) && (
          <div className="rounded-[4px] border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-[18px] font-semibold tabular-nums text-foreground leading-none">{pct}%</span>
              <span className="text-[11.5px] tabular-nums text-muted-foreground">
                {migrated.toLocaleString()} / {(initialLegacy ?? 0).toLocaleString()} processed
                {failed > 0 && <span className="ml-2 text-amber-600">· {failed} failed</span>}
              </span>
            </div>
            <Progress className="h-1.5" value={pct} />
            {currentTable && running && (
              <div className="text-[11px] font-mono truncate text-muted-foreground">
                Migrating · {currentTable}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit report */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionLabel>Audit report</SectionLabel>
          {audit && audit.perTable.length > 4 && (
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tables…"
                className="h-8 w-[180px] pl-7 text-[12px] rounded-[4px]"
              />
            </div>
          )}
        </div>

        {!audit ? (
          <p className="text-[12.5px] text-muted-foreground">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No matching tables.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-background border border-border/60 rounded-[4px] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b-2 border-border">
                  <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    <th className="px-3 py-2 text-left">Table.column</th>
                    <th className="px-3 py-2 text-right">R2</th>
                    <th className="px-3 py-2 text-right">Legacy</th>
                    <th className="px-3 py-2 text-right">Empty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.target} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-foreground">{r.target}</td>
                      <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-foreground">{r.migrated}</td>
                      <td className={cn("px-3 py-1.5 text-right text-[12px] tabular-nums font-medium", r.legacy > 0 ? "text-amber-600" : "text-muted-foreground")}>
                        {r.legacy}
                      </td>
                      <td className={cn("px-3 py-1.5 text-right text-[12px] tabular-nums", r.empty > 0 ? "text-amber-600/75" : "text-muted-foreground")}>
                        {r.empty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-1.5">
              {filteredRows.map((r) => (
                <div key={r.target} className="rounded-[4px] border border-border/60 p-2.5">
                  <div className="font-mono text-[11.5px] mb-2 break-all text-foreground">{r.target}</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">R2</div>
                      <div className="tabular-nums font-medium text-foreground">{r.migrated}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Legacy</div>
                      <div className={cn("tabular-nums font-medium", r.legacy > 0 ? "text-amber-600" : "text-foreground")}>{r.legacy}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Empty</div>
                      <div className={cn("tabular-nums font-medium", r.empty > 0 ? "text-amber-600/75" : "text-foreground")}>{r.empty}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {errors.length > 0 && (
        <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-2">
          <SectionLabel>Recent errors</SectionLabel>
          <ul className="space-y-1 text-[11.5px] font-mono">
            {errors.slice(-20).map((e, i) => (
              <li key={i} className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-destructive break-all">
                <span className="font-semibold">{e.target}</span>
                <span className="opacity-70"> #{e.id.slice(0, 8)}</span>
                <span> — {e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default R2Migration;
