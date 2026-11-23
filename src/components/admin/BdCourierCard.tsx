import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, AlertCircle, ChevronDown, ChevronUp, Loader2, History, TrendingUp, Package, XCircle, CheckCircle2
} from "lucide-react";

type Verification = {
  id: string;
  phone: string;
  risk_level: string | null;
  risk_label: string | null;
  recommendation: string | null;
  success_ratio: number | null;
  fraud_report_count: number | null;
  total_parcel: number | null;
  success_parcel: number | null;
  cancelled_parcel: number | null;
  reasons: any;
  couriers: Record<string, any>;
  raw: any;
  created_at: string;
};

const riskStyles: Record<string, { dot: string; text: string; ring: string; bg: string; emoji: string }> = {
  safe:   { dot: "bg-emerald-500", text: "text-emerald-700",  ring: "ring-emerald-500/30", bg: "bg-emerald-50 dark:bg-emerald-500/10", emoji: "🟢" },
  low:    { dot: "bg-blue-500",    text: "text-blue-700",     ring: "ring-blue-500/30",    bg: "bg-blue-50 dark:bg-blue-500/10",       emoji: "🔵" },
  medium: { dot: "bg-yellow-500",  text: "text-yellow-700",   ring: "ring-yellow-500/30",  bg: "bg-yellow-50 dark:bg-yellow-500/10",   emoji: "🟡" },
  high:   { dot: "bg-orange-500",  text: "text-orange-700",   ring: "ring-orange-500/30",  bg: "bg-orange-50 dark:bg-orange-500/10",   emoji: "🟠" },
  danger: { dot: "bg-red-500",     text: "text-red-700",      ring: "ring-red-500/30",     bg: "bg-red-50 dark:bg-red-500/10",         emoji: "🔴" },
};

const fmtNum = (n: any) => (n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString());
const fmtPct = (n: any) => (n == null || isNaN(Number(n)) ? "—" : `${Number(n).toFixed(1)}%`);

export default function BdCourierCard({ phone, orderId }: { phone?: string | null; orderId?: string | null }) {
  const { toast } = useToast();
  const [latest, setLatest] = useState<Verification | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCouriers, setOpenCouriers] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const phoneDigits = (phone || "").replace(/\D/g, "");
  const phoneValid = /^01[0-9]{9}$/.test(phoneDigits);

  const loadHistory = useCallback(async () => {
    if (!phoneValid) return;
    const { data } = await supabase
      .from("bdcourier_verifications")
      .select("*")
      .eq("phone", phoneDigits)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data || []) as Verification[];
    setHistory(rows);
    setLatest(rows[0] || null);
    setInitialized(true);
  }, [phoneDigits, phoneValid]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runCheck = useCallback(async () => {
    if (!phoneValid) {
      setError("Customer phone is missing or invalid.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your admin session expired. Please log in again, then retry verification.");
      }

      const { data, error: fnErr } = await supabase.functions.invoke("bdcourier-check", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { phone: phoneDigits, order_id: orderId || null },
      });
      const apiErr = (data as any)?.error;
      const status = (fnErr as any)?.context?.status;
      if (fnErr || apiErr) {
        const message =
          (data as any)?.error ||
          (fnErr as any)?.context?.error ||
          fnErr?.message ||
          "Unable to verify customer at the moment.";

        if (status === 401 || /unauthorized/i.test(String(message))) {
          throw new Error("Your admin session expired. Please log in again, then retry verification.");
        }

        if (status === 403 || /forbidden/i.test(String(message))) {
          throw new Error("This admin account does not have permission to run BD Courier verification.");
        }

        throw new Error(typeof message === "string" ? message : JSON.stringify(message));
      }
      await loadHistory();
      toast({ title: "Customer verified", description: "Latest delivery history loaded." });
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || "Unable to verify customer at the moment.";
      setError(String(msg));
    } finally {
      setLoading(false);
    }

  }, [phoneDigits, phoneValid, orderId, loadHistory, toast]);

  const risk = (latest?.risk_level || "").toLowerCase();
  const rs = riskStyles[risk] || { dot: "bg-muted", text: "text-muted-foreground", ring: "ring-border", bg: "bg-muted/40", emoji: "⚪" };
  const couriers = latest?.couriers || {};
  const courierEntries = Object.entries(couriers).filter(([, v]) => v && typeof v === "object");

  return (
    <div className="bg-background rounded-2xl border border-border/40 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield size={16} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] sm:text-[14px] font-semibold text-foreground tracking-tight leading-tight">Customer Delivery History</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-0.5">BD Courier · informational only</p>
          </div>
        </div>
      </div>

      {!phoneValid && (
        <p className="text-[12px] text-muted-foreground/60">Add a valid 11-digit phone to enable verification.</p>
      )}

      {phoneValid && !latest && !loading && initialized && !error && (
        <div className="text-center py-6">
          <p className="text-[13px] text-muted-foreground/70 mb-3">No verification yet for this customer.</p>
          <Button onClick={runCheck} size="sm" className="rounded-xl h-8 text-[12px]">
            Check Delivery History
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5">
          <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-destructive font-medium">Unable to verify customer at the moment.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 break-words">{error}</p>
            <Button onClick={runCheck} size="sm" variant="outline" className="mt-2 h-7 rounded-lg text-[11px]">
              Retry Verification
            </Button>
          </div>
        </div>
      )}

      {loading && !latest && (
        <div className="flex items-center justify-center py-8 text-muted-foreground/60 text-[12px] gap-2">
          <Loader2 size={14} className="animate-spin" /> Verifying customer…
        </div>
      )}

      {latest && (
        <div className="space-y-3 sm:space-y-4">
          {/* Risk + Recommendation */}
          <div className={`rounded-2xl border border-border/40 p-3 sm:p-4 ring-1 ${rs.ring}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold w-fit ${rs.text} ${rs.bg}`}>
                  <span className={`w-2 h-2 rounded-full ${rs.dot}`} />
                  {latest.risk_label || latest.risk_level || "Unknown"}
                </span>
                {latest.recommendation && (
                  <span className="text-[11px] text-muted-foreground/70 leading-snug">{latest.recommendation}</span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Success</p>
                <p className={`text-[18px] font-semibold tabular-nums leading-tight ${rs.text}`}>{fmtPct(latest.success_ratio)}</p>
              </div>
            </div>

            {Array.isArray(latest.reasons) && latest.reasons.length > 0 && (
              <ul className="space-y-1 mb-3">
                {latest.reasons.map((r: string, i: number) => (
                  <li key={i} className="text-[12px] text-muted-foreground/80 flex gap-1.5">
                    <span className="text-muted-foreground/40 shrink-0">•</span>
                    <span className="min-w-0 break-words">{r}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/30">
              <Stat icon={<Package size={11} />} label="Total" value={fmtNum(latest.total_parcel)} />
              <Stat icon={<CheckCircle2 size={11} />} label="Successful" value={fmtNum(latest.success_parcel)} tone="text-emerald-600" />
              <Stat icon={<XCircle size={11} />} label="Cancelled" value={fmtNum(latest.cancelled_parcel)} tone="text-orange-600" />
              <Stat icon={<AlertCircle size={11} />} label="Fraud" value={fmtNum(latest.fraud_report_count)} tone={Number(latest.fraud_report_count) > 0 ? "text-red-600" : ""} />
            </div>

            <p className="text-[10px] text-muted-foreground/50 mt-3">
              Last checked · {new Date(latest.created_at).toLocaleString()}
            </p>
          </div>

          {/* Courier breakdown */}
          {courierEntries.length > 0 && (
            <div className="rounded-2xl border border-border/40 overflow-hidden">
              <button
                onClick={() => setOpenCouriers(v => !v)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <TrendingUp size={13} /> Courier Performance ({courierEntries.length})
                </span>
                {openCouriers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {openCouriers && (
                <div className="border-t border-border/30 divide-y divide-border/20">
                  {courierEntries.map(([key, c]: any) => (
                    <div key={key} className="p-3.5">
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.logo && <img src={c.logo} alt="" className="w-6 h-6 rounded-md object-contain bg-muted/40" />}
                          <span className="text-[13px] font-medium text-foreground capitalize truncate">{c.name || key}</span>
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">{fmtPct(c.success_ratio)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <MiniStat label="Total" value={fmtNum(c.total_parcel)} />
                        <MiniStat label="Success" value={fmtNum(c.success_parcel)} tone="text-emerald-600" />
                        <MiniStat label="Cancel" value={fmtNum(c.cancelled_parcel)} tone="text-orange-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <div className="rounded-2xl border border-border/40 overflow-hidden">
              <button
                onClick={() => setOpenHistory(v => !v)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <History size={13} /> Verification History ({history.length})
                </span>
                {openHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {openHistory && (
                <div className="border-t border-border/30 divide-y divide-border/20">
                  {history.map(h => {
                    const r = (h.risk_level || "").toLowerCase();
                    const hs = riskStyles[r] || rs;
                    return (
                      <div key={h.id} className="p-3 flex items-center justify-between gap-2 text-[11px] sm:text-[12px]">
                        <span className="text-muted-foreground/70 tabular-nums min-w-0 truncate">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1 ${hs.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${hs.dot}`} />
                            {h.risk_label || h.risk_level || "—"}
                          </span>
                          <span className="tabular-nums text-foreground">{fmtPct(h.success_ratio)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-[13px] font-semibold tabular-nums mt-0.5 ${tone || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground/60">{label}</p>
      <p className={`text-[12px] font-medium tabular-nums ${tone || "text-foreground"}`}>{value}</p>
    </div>
  );
}
