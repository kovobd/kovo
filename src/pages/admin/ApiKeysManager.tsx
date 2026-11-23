import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Pencil, Save, X, RefreshCw, PlayCircle,
  CheckCircle2, XCircle, Loader2, KeyRound, Cloud, Truck,
} from "lucide-react";
import { setRuntimeR2Base } from "@/lib/cdnImage";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

type FieldInfo = {
  key: string;
  secret: boolean;
  required: boolean;
  configured: boolean;
  source: "db" | "env" | "missing";
  preview: string;
};
type ServiceStatus = {
  service: "r2" | "bdcourier";
  fields: FieldInfo[];
  configured: boolean;
  last_tested_at: string | null;
  last_test_status: "connected" | "failed" | null;
  last_test_message: string | null;
  updated_at: string | null;
};
type StatusResponse = { services: Record<string, ServiceStatus> };
type TestStep = { name: string; ok: boolean; message: string };

const SERVICE_META: Record<string, { title: string; description: string; icon: any }> = {
  r2: {
    title: "Cloudflare R2",
    description: "Object storage for product images and media assets.",
    icon: Cloud,
  },
  bdcourier: {
    title: "BD Courier",
    description: "Customer phone verification against courier history.",
    icon: Truck,
  },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function ApiKeysManager() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("admin-credentials", { body: { action: "status" } });
    setRefreshing(false);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load credential status");
      return;
    }
    setStatus(data as StatusResponse);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading credentials…
      </div>
    );
  }

  const services = status?.services ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4" />
          Secrets are stored encrypted at rest and never sent to the browser except while editing.
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(["r2", "bdcourier"] as const).map((svc) => {
          const s = services[svc];
          if (!s) return null;
          return <ServiceCard key={svc} status={s} onSaved={load} />;
        })}
      </div>
    </div>
  );
}

function StatusBadge({ testing, s }: { testing: boolean; s: ServiceStatus }) {
  if (testing) {
    return (
      <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking…
      </Badge>
    );
  }
  if (s.last_test_status === "connected") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
      </Badge>
    );
  }
  if (s.last_test_status === "failed") {
    return (
      <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
        <XCircle className="h-3 w-3 mr-1" /> Disconnected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 bg-muted/40 text-muted-foreground">
      Untested
    </Badge>
  );
}

function ServiceCard({ status: s, onSaved }: { status: ServiceStatus; onSaved: () => void }) {
  const meta = SERVICE_META[s.service];
  const Icon = meta.icon;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<TestStep[] | null>(null);

  const startEdit = async () => {
    // Prefill all fields (reveal secrets for editing)
    const next: Record<string, string> = {};
    for (const f of s.fields) {
      if (f.secret) {
        const { data, error } = await supabase.functions.invoke("admin-credentials", {
          body: { action: "reveal", service: s.service, field: f.key },
        });
        if (error) { toast.error(error.message); return; }
        next[f.key] = (data as any)?.value || "";
      } else {
        next[f.key] = f.preview || "";
      }
    }
    setValues(next);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setValues({}); setVisible({}); };

  const save = async () => {
    // Client-side required validation
    const missing = s.fields.filter((f) => f.required && !(values[f.key] || "").trim()).map((f) => f.key);
    if (missing.length) {
      toast.error(`Required: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-credentials", {
      body: { action: "save", service: s.service, values },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || "Save failed");
      return;
    }
    toast.success("Credentials saved");
    if (s.service === "r2" && values.R2_PUBLIC_BASE_URL) {
      setRuntimeR2Base(values.R2_PUBLIC_BASE_URL);
      bumpStorefrontVersion();
    }
    cancelEdit();
    onSaved();
    // Auto-test after save
    void runTest();
  };

  const runTest = async () => {
    setTesting(true);
    setSteps(null);
    const { data, error } = await supabase.functions.invoke("admin-credentials", {
      body: { action: "test", service: s.service },
    });
    setTesting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { ok: boolean; steps: TestStep[] };
    setSteps(result.steps);
    if (result.ok) toast.success(`${meta.title}: connection verified`);
    else toast.error(`${meta.title}: connection failed`);
    onSaved();
  };

  const copy = async (val: string) => {
    try { await navigator.clipboard.writeText(val); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg bg-primary/10 text-primary p-2 shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base leading-tight">{meta.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          </div>
        </div>
        <StatusBadge testing={testing} s={s} />
      </div>

      {/* Field list */}
      <div className="space-y-2.5">
        {s.fields.map((f) => {
          const editingValue = values[f.key] ?? "";
          const show = !!visible[f.key];
          return (
            <div key={f.key} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {f.key}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {f.source === "db" ? "Saved" : f.source === "env" ? "Env" : "Missing"}
                </span>
              </div>
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type={f.secret && !show ? "password" : "text"}
                    value={editingValue}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="h-8 text-sm font-mono"
                    autoComplete="off"
                  />
                  {f.secret && (
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => setVisible((v) => ({ ...v, [f.key]: !v[f.key] }))}
                      aria-label={show ? "Hide" : "Show"}>
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 text-sm font-mono truncate text-foreground/90">
                    {f.configured ? (f.secret ? f.preview : f.preview) : (
                      <span className="text-red-500 text-xs">not set</span>
                    )}
                  </div>
                  {f.configured && !f.secret && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(f.preview)} aria-label="Copy">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border/60">
        <div className="text-[11px] text-muted-foreground">
          Last checked: {timeAgo(s.last_tested_at)}
          {s.updated_at && <> · Updated: {timeAgo(s.updated_at)}</>}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" onClick={runTest} disabled={testing}>
                {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1" />}
                Test Connection
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Test results */}
      {(steps || s.last_test_message) && !editing && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          {steps ? (
            <div className="space-y-1">
              {steps.map((st, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {st.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <span className="font-medium">{st.name}:</span>{" "}
                    <span className="text-muted-foreground break-words">{st.message}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Last result:</span> {s.last_test_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
