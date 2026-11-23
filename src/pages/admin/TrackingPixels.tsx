import { useEffect, useState, forwardRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Plus, Trash2, CheckCircle2, AlertTriangle, XCircle, Loader2, Activity, ExternalLink, RefreshCw, Info, ChevronDown, Facebook, Radio } from "lucide-react";
import { Section, FormRow, StickyActionBar, PageHeader } from "@/components/admin/ui";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import MetaEventInspector from "@/components/admin/MetaEventInspector";
import { cn } from "@/lib/utils";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

/**
 * Compact collapsible card matching the CustomerProfile aesthetic:
 * rounded-[4px], 10px uppercase micro-labels, tight padding, chevron toggle.
 * Pure presentation — no tracking logic changes here.
 */
const CollapsibleCard = ({
  icon: Icon, title, subtitle, badge, actions, defaultOpen = false, children,
}: {
  icon?: any; title: string; subtitle?: string;
  badge?: React.ReactNode; actions?: React.ReactNode;
  defaultOpen?: boolean; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left group"
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
          {Icon && <Icon size={13} className="shrink-0 text-muted-foreground" />}
          <span className="text-[13px] font-semibold text-foreground truncate">{title}</span>
          {badge}
          {subtitle && (
            <span className="hidden sm:inline text-[11.5px] text-muted-foreground/80 truncate">
              · {subtitle}
            </span>
          )}
        </button>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
      {open && (
        <div className="border-t border-border/60 px-3 sm:px-4 py-3 sm:py-4">{children}</div>
      )}
    </div>
  );
};

const MicroLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1">
    {children}
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <MicroLabel>{label}</MicroLabel>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted-foreground/70 leading-relaxed">{hint}</p>}
  </div>
);



interface Pixel {
  id: string;
  platform: string;
  pixel_id: string;
  enabled: boolean;
  access_token: string;
  test_event_code: string;
  test_mode: boolean;
  advanced_matching: boolean;
}

const PLATFORMS = [
  { value: "facebook", name: "Meta (Facebook) Pixel", placeholder: "e.g. 123456789012345", help: "Find in Meta Events Manager → Data Sources → Pixel ID" },
  { value: "google_analytics", name: "Google Analytics (GA4)", placeholder: "e.g. G-XXXXXXXXXX", help: "Find in GA4 → Admin → Data Streams → Measurement ID" },
  { value: "tiktok", name: "TikTok Pixel", placeholder: "e.g. CXXXXXXXXXXXXXXX", help: "Find in TikTok Ads → Assets → Events → Pixel ID" },
];

type Check = { name: string; status: "pass" | "fail" | "skip"; detail?: string };
type TestResult = {
  status: "ok" | "warning" | "failed";
  pixel_id?: string | null;
  business_name?: string | null;
  api_version?: string | null;
  http_status?: number | null;
  events_received?: number | null;
  test_event_code?: string | null;
  message?: string | null;
  diagnostics?: {
    request_id?: string;
    checks?: Check[];
    request?: { url?: string; method?: string; api_version?: string; payload?: unknown };
    response?: { http_status?: number; response_time_ms?: number; body?: unknown; fbtrace_id?: string | null };
    meta_error?: {
      message?: string | null; type?: string | null; code?: number | null;
      error_subcode?: number | null; error_user_title?: string | null;
      error_user_msg?: string | null; fbtrace_id?: string | null;
    } | null;
    [k: string]: unknown;
  } | null;
  tested_at?: string | null;
};


const TrackingPixels = forwardRef<HTMLDivElement, { hideTitle?: boolean }>(({ hideTitle }, ref) => {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();
  const { dirty, rebase } = useDirtyForm(pixels);
  const qc = useQueryClient();

  // Countdown after a test send — Meta's typical propagation window is 5–30s.
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);


  const load = async () => {
    const { data } = await supabase.from("tracking_pixels").select("*").order("platform");
    const next = (data as any[]) ?? [];
    setPixels(next);
    rebase(next);
    const { data: tr } = await supabase
      .from("capi_test_results" as any)
      .select("*")
      .eq("platform", "facebook")
      .maybeSingle();
    if (tr) setTestResult(tr as any);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const runTest = async () => {
    const fb = pixels.find((p) => p.platform === "facebook");
    if (!fb?.pixel_id || !fb?.access_token) {
      toast({ title: "Add Dataset ID and Access Token first", variant: "destructive" });
      return;
    }
    if (dirty) {
      toast({ title: "Save your changes before testing", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi-test", {
        body: { test_event_code: fb.test_event_code || undefined },
      });
      if (error) {
        const fail: TestResult = { status: "failed", message: error.message };
        setTestResult(fail);
        toast({ title: "Test failed", description: error.message, variant: "destructive" });
      } else {
        setTestResult(data as TestResult);
        toast({
          title:
            (data as any).status === "ok"
              ? "✅ Connected to Meta"
              : (data as any).status === "warning"
              ? "⚠️ Test reached Meta with warnings"
              : "❌ Test failed",
          description: (data as any).message,
          variant: (data as any).status === "failed" ? "destructive" : "default",
        });
        if ((data as any).status === "ok") setCountdown(30);
      }
    } finally {
      setTesting(false);
    }
  };

  const recheck = async () => {
    setRechecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi-test", {
        body: { mode: "recheck" },
      });
      if (error) {
        toast({ title: "Recheck failed", description: error.message, variant: "destructive" });
      } else {
        setTestResult(data as TestResult);
        toast({
          title: "Recheck complete",
          description: "Visibility in Events Manager → Test Events still cannot be confirmed programmatically — open the dataset to confirm.",
        });
      }
    } finally {
      setRechecking(false);
    }
  };




  const update = (id: string, field: string, value: any) => {
    setPixels((p) => p.map((px) => (px.id === id ? { ...px, [field]: value } : px)));
  };

  const addPixel = async (platform: string) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("tracking_pixels").insert({
      platform, pixel_id: "", enabled: false, access_token: "", test_event_code: "", test_mode: false, advanced_matching: true,
    } as any).select().single();
    if (error) {
      toast({
        title: "Error adding pixel",
        description: error.code === "42501" ? "You don't have permission. Try re-logging in." : error.message,
        variant: "destructive",
      });
      return;
    }
    const next = [...pixels, data as any];
    setPixels(next);
    rebase(next);
    toast({ title: `${PLATFORMS.find(p => p.value === platform)?.name || platform} added` });
  };

  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const removePixel = (id: string) => {
    setPendingRemoveId(id);
  };

  const confirmRemovePixel = async () => {
    const id = pendingRemoveId;
    if (!id) return;
    setPendingRemoveId(null);
    await supabase.from("tracking_pixels").delete().eq("id", id);
    const next = pixels.filter(px => px.id !== id);
    setPixels(next);
    rebase(next);
    bumpStorefrontVersion();
    toast({ title: "Pixel removed" });
  };

  const save = async () => {
    setSaving(true);
    const results = await Promise.all(
      pixels.map((px) =>
        supabase.from("tracking_pixels").update({
          pixel_id: px.pixel_id, enabled: px.enabled, access_token: px.access_token,
          test_event_code: px.test_event_code, test_mode: px.test_mode, advanced_matching: px.advanced_matching,
        } as any).eq("id", px.id),
      ),
    );
    setSaving(false);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      toast({
        title: `${failed.length} pixel${failed.length > 1 ? "s" : ""} failed to save`,
        description: failed[0].error?.message,
        variant: "destructive",
      });
      return;
    }
    rebase(pixels);
    bumpStorefrontVersion();
    qc.invalidateQueries({ queryKey: ["public-layout"] });
    toast({ title: "Tracking pixels saved" });
  };

  if (loading) return <div ref={ref}><Skeleton className="h-64 max-w-2xl rounded-2xl" /></div>;

  const existingPlatforms = new Set(pixels.map(px => px.platform));
  const availablePlatforms = PLATFORMS.filter(p => !existingPlatforms.has(p.value));
  const fbPixel = pixels.find((px) => px.platform === "facebook");
  const otherPixels = pixels.filter((px) => px.platform !== "facebook");

  const AddBar = () =>
    availablePlatforms.length > 0 ? (
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:justify-start">
        {availablePlatforms.map((p, idx) => (
          <Button
            key={p.value}
            variant="outline"
            size="sm"
            className={`h-10 gap-1.5 text-[12px] w-full sm:w-auto ${idx === 0 ? "sm:order-1" : ""}`}
            onClick={() => addPixel(p.value)}
          >
            <Plus size={12} /> {p.name}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div ref={ref} className="max-w-4xl space-y-5 pb-20">
      {!hideTitle && <PageHeader title="Tracking pixels" subtitle="Browser pixels and server-side conversion APIs for Meta, Google Analytics, and TikTok." />}

      {pixels.length === 0 ? (
        <AddBar />
      ) : (
        <>
          {fbPixel && (
            <CollapsibleCard
              icon={Facebook}
              title="Meta (Facebook) Pixel"
              subtitle="Browser pixel + Conversions API"
              defaultOpen={false}
              badge={
                <span
                  className={cn(
                    "ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium border",
                    fbPixel.test_mode
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : fbPixel.enabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    fbPixel.test_mode ? "bg-amber-500" : fbPixel.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )} />
                  {fbPixel.test_mode ? "Test" : fbPixel.enabled ? "Live" : "Off"}
                </span>
              }
              actions={
                <>
                  <Switch checked={fbPixel.enabled} onCheckedChange={(v) => update(fbPixel.id, "enabled", v)} />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-[4px] text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); removePixel(fbPixel.id); }}>
                    <Trash2 size={13} />
                  </Button>
                </>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Dataset ID" hint="Events Manager → Data Sources → Dataset ID">
                    <Input className="h-9 rounded-[4px] text-[12.5px]" inputMode="numeric" value={fbPixel.pixel_id} onChange={(e) => update(fbPixel.id, "pixel_id", e.target.value)} placeholder="e.g. 123456789012345" />
                  </Field>
                  <Field label="Test event code" hint="Events Manager → Test Events. Used only when Test Mode is ON.">
                    <Input className="h-9 rounded-[4px] text-[12.5px]" value={fbPixel.test_event_code || ""} onChange={(e) => update(fbPixel.id, "test_event_code", e.target.value)} placeholder="TEST12345" />
                  </Field>
                </div>

                <Field label="Conversions API access token" hint="Required for server-side tracking.">
                  <div className="relative">
                    <Input
                      className="h-9 pr-9 rounded-[4px] text-[12.5px]"
                      type={showToken ? "text" : "password"}
                      value={fbPixel.access_token || ""}
                      onChange={(e) => update(fbPixel.id, "access_token", e.target.value)}
                      placeholder="EAAxxxxxxx..."
                    />
                    <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>

                {/* Test Mode + Advanced matching as compact toggle rows */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-start justify-between gap-2 rounded-[4px] border border-border/60 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-foreground">Test mode</p>
                      <p className="text-[10.5px] text-muted-foreground/70 mt-0.5 leading-snug">
                        Routes every CAPI event to Meta Test Events.
                      </p>
                    </div>
                    <Switch
                      checked={!!fbPixel.test_mode}
                      onCheckedChange={(v) => update(fbPixel.id, "test_mode", v)}
                      disabled={!((fbPixel.test_event_code || "").trim())}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2 rounded-[4px] border border-border/60 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-foreground">Advanced matching</p>
                      <p className="text-[10.5px] text-muted-foreground/70 mt-0.5 leading-snug">
                        Hash & send email/phone for attribution (SHA-256).
                      </p>
                    </div>
                    <Switch checked={fbPixel.advanced_matching ?? true} onCheckedChange={(v) => update(fbPixel.id, "advanced_matching", v)} />
                  </div>
                </div>

                {fbPixel.test_mode && (fbPixel.test_event_code || "").trim() && (
                  <div className="rounded-[4px] border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 leading-snug flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      <strong className="font-semibold">All CAPI events route to Test Events.</strong> They won't count toward production analytics. Disable before going live.
                    </span>
                  </div>
                )}

                {fbPixel.access_token && !fbPixel.test_mode && (
                  <div className="rounded-[4px] bg-muted/40 border border-border/40 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    Server-side tracking (CAPI) is active.
                  </div>
                )}

                {/* Test connection — collapsible inside Meta card */}
                <CollapsibleCard
                  icon={Activity}
                  title="Test connection"
                  subtitle="Validates dataset, token & sends a sandboxed event"
                  defaultOpen={false}
                  badge={
                    testResult ? (
                      <span className={cn(
                        "ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium border",
                        testResult.status === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        testResult.status === "warning" ? "bg-amber-50 text-amber-800 border-amber-200" :
                        "bg-red-50 text-red-700 border-red-200",
                      )}>
                        {testResult.status === "ok" ? "Connected" : testResult.status === "warning" ? "Warning" : "Failed"}
                      </span>
                    ) : null
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 rounded-[4px] text-[11.5px]"
                      onClick={(e) => { e.stopPropagation(); runTest(); }}
                      disabled={testing || !fbPixel.pixel_id || !fbPixel.access_token}
                    >
                      {testing ? (<><Loader2 size={12} className="animate-spin mr-1.5" />Testing…</>) : "Run test"}
                    </Button>
                  }
                >
                  {!testResult ? (
                    <p className="text-[11.5px] text-muted-foreground">Run a test to validate your dataset and token. Won't affect production analytics.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[12px] font-medium">
                        {testResult.status === "ok" && <><CheckCircle2 size={13} className="text-emerald-600" /><span className="text-emerald-700">Connected</span></>}
                        {testResult.status === "warning" && <><AlertTriangle size={13} className="text-amber-600" /><span className="text-amber-700">Warning</span></>}
                        {testResult.status === "failed" && <><XCircle size={13} className="text-destructive" /><span className="text-destructive">Failed</span></>}
                      </div>
                      {testResult.message && (
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{testResult.message}</p>
                      )}

                      {testResult.status !== "failed" && (
                        <div className="rounded-[4px] border border-border/50 bg-muted/20 p-2.5 space-y-1.5">
                          <MicroLabel>Verification stages</MicroLabel>
                          <ul className="space-y-1 text-[11px]">
                            <li className="flex items-start gap-2">
                              <CheckCircle2 size={11} className="mt-0.5 text-emerald-600 shrink-0" />
                              <span><span className="font-medium">1. Accepted by CAPI</span> — confirmed programmatically.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <AlertTriangle size={11} className="mt-0.5 text-amber-600 shrink-0" />
                              <span><span className="font-medium">2. Visible in Test Events</span> — <span className="text-muted-foreground">verify in Meta UI.</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Info size={11} className="mt-0.5 text-muted-foreground shrink-0" />
                              <span><span className="font-medium">3. Processed into reporting</span> — <span className="text-muted-foreground">24–48h pipeline.</span></span>
                            </li>
                          </ul>
                        </div>
                      )}

                      {testResult.status !== "failed" && testResult.pixel_id && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <a
                            href={`https://business.facebook.com/events_manager2/list/dataset/${testResult.pixel_id}/test_events`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-[4px] border border-border/60 bg-background px-2.5 h-8 text-[11px] font-medium hover:bg-muted/40"
                          >
                            <ExternalLink size={11} /> Open in Meta
                          </a>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2.5 rounded-[4px] text-[11px] gap-1.5"
                            onClick={recheck}
                            disabled={rechecking}
                          >
                            {rechecking
                              ? <><Loader2 size={11} className="animate-spin" /> Rechecking…</>
                              : <><RefreshCw size={11} /> Recheck</>}
                          </Button>
                          {countdown > 0 && (
                            <span className="text-[10px] text-muted-foreground">Next check in {countdown}s</span>
                          )}
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        {testResult.pixel_id && (<><dt className="text-muted-foreground">Dataset</dt><dd className="font-mono truncate">{testResult.pixel_id}</dd></>)}
                        {testResult.api_version && (<><dt className="text-muted-foreground">API</dt><dd>{testResult.api_version}</dd></>)}
                        {testResult.http_status != null && (<><dt className="text-muted-foreground">HTTP</dt><dd>{testResult.http_status}</dd></>)}
                        {testResult.events_received != null && (<><dt className="text-muted-foreground">Events</dt><dd>{testResult.events_received}</dd></>)}
                        {testResult.diagnostics?.response?.response_time_ms != null && (<><dt className="text-muted-foreground">Latency</dt><dd>{testResult.diagnostics.response.response_time_ms}ms</dd></>)}
                        {testResult.diagnostics?.response?.fbtrace_id && (<><dt className="text-muted-foreground">fbtrace</dt><dd className="font-mono truncate">{testResult.diagnostics.response.fbtrace_id}</dd></>)}
                        {testResult.test_event_code && (<><dt className="text-muted-foreground">Code</dt><dd className="font-mono truncate">{testResult.test_event_code}</dd></>)}
                        {testResult.tested_at && (<><dt className="text-muted-foreground">Tested</dt><dd>{new Date(testResult.tested_at).toLocaleString()}</dd></>)}
                      </dl>

                      {testResult.diagnostics?.checks && testResult.diagnostics.checks.length > 0 && (
                        <ul className="space-y-1">
                          {testResult.diagnostics.checks.map((c, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px]">
                              {c.status === "pass" && <CheckCircle2 size={11} className="mt-0.5 text-emerald-600 shrink-0" />}
                              {c.status === "fail" && <XCircle size={11} className="mt-0.5 text-destructive shrink-0" />}
                              {c.status === "skip" && <AlertTriangle size={11} className="mt-0.5 text-muted-foreground shrink-0" />}
                              <span className="font-medium text-foreground">{c.name}</span>
                              {c.detail && <span className="text-muted-foreground">— {c.detail}</span>}
                            </li>
                          ))}
                        </ul>
                      )}

                      {testResult.diagnostics?.meta_error && (
                        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 p-2 text-[11px] space-y-1">
                          <div className="font-medium text-destructive">Meta Graph API error</div>
                          <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px]">
                            {Object.entries(testResult.diagnostics.meta_error).map(([k, v]) =>
                              v == null ? null : (
                                <div key={k} className="contents">
                                  <dt className="text-muted-foreground">{k}</dt>
                                  <dd className="break-all">{String(v)}</dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </div>
                      )}

                      {testResult.status !== "failed" && (
                        <details className="rounded-[4px] border border-amber-500/30 bg-amber-500/5 p-2 text-[10.5px] text-amber-900/90 dark:text-amber-200/90">
                          <summary className="cursor-pointer font-medium flex items-center gap-1.5 list-none">
                            <ChevronDown size={10} /> If the event doesn't appear in Test Events
                          </summary>
                          <ul className="mt-1.5 list-disc pl-4 space-y-0.5 marker:text-amber-700/60">
                            <li>The Test event code doesn't match the active code in Meta (Meta rotates these per session).</li>
                            <li>Meta processing delay (5–30s, sometimes up to a minute).</li>
                            <li>An ad blocker or privacy extension is blocking the Events Manager UI.</li>
                            <li>You're viewing a different dataset/business than the one the token belongs to.</li>
                          </ul>
                        </details>
                      )}

                      {(testResult.diagnostics as any)?.test_code_provenance && (
                        <details className="text-[10.5px]">
                          <summary className="cursor-pointer text-muted-foreground font-medium">Test code trace</summary>
                          <dl className="mt-1 grid grid-cols-[150px_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px]">
                            {Object.entries((testResult.diagnostics as any).test_code_provenance).map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="text-muted-foreground">{k}</dt>
                                <dd className="break-all">{v === null ? "—" : String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}

                      {testResult.diagnostics?.request?.url && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer text-muted-foreground font-medium">View raw Meta request / response</summary>
                          <div className="mt-1.5 space-y-2">
                            <div><span className="text-muted-foreground">Endpoint: </span><span className="font-mono break-all">{testResult.diagnostics.request.method} {testResult.diagnostics.request.url}</span></div>
                            <div>
                              <div className="text-muted-foreground mb-0.5">Request payload</div>
                              <pre className="font-mono bg-background/70 border border-border/50 rounded-[3px] p-2 overflow-x-auto">{JSON.stringify(testResult.diagnostics.request.payload ?? {}, null, 2)}</pre>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-0.5">Response body</div>
                              <pre className="font-mono bg-background/70 border border-border/50 rounded-[3px] p-2 overflow-x-auto">{JSON.stringify(testResult.diagnostics.response?.body ?? {}, null, 2)}</pre>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </CollapsibleCard>
              </div>
            </CollapsibleCard>
          )}

          {fbPixel && (
            <CollapsibleCard
              icon={Radio}
              title="Live event inspector"
              subtitle="Real-time CAPI event stream"
              defaultOpen={false}
            >
              <MetaEventInspector />
            </CollapsibleCard>
          )}



          {otherPixels.map((px) => {
            const label = PLATFORMS.find(p => p.value === px.platform) || { name: px.platform, placeholder: "Pixel ID", help: "" };
            return (
              <Section
                key={px.id}
                title={label.name}
                actions={
                  <>
                    <Switch checked={px.enabled} onCheckedChange={(v) => update(px.id, "enabled", v)} />
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive hover:text-destructive" onClick={() => removePixel(px.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </>
                }
              >
                <FormRow label="Pixel / Measurement ID" hint={label.help}>
                  <Input className="h-11" value={px.pixel_id} onChange={(e) => update(px.id, "pixel_id", e.target.value)} placeholder={label.placeholder} />
                </FormRow>
              </Section>
            );
          })}

          {availablePlatforms.length > 0 && <AddBar />}
        </>
      )}

      <StickyActionBar visible={dirty} message="Unsaved tracking changes">
        <Button size="sm" variant="ghost" onClick={load} disabled={saving}>Discard</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </StickyActionBar>

      <AlertDialog open={!!pendingRemoveId} onOpenChange={(o) => !o && setPendingRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this pixel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the pixel configuration. Server-side events for this pixel will stop firing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemovePixel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

TrackingPixels.displayName = "TrackingPixels";
export default TrackingPixels;
