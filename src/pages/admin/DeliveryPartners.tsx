import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, Truck, ExternalLink, Send, Eye, EyeOff, Plus, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import Section from "@/components/admin/ui/Section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DeliveryPartner {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  api_base_url: string;
  api_token: string;
  store_id: string;
  config: Record<string, any>;
}

const DEFAULT_PARTNERS: Omit<DeliveryPartner, "id">[] = [
  {
    name: "Pathao Courier",
    slug: "pathao",
    enabled: false,
    api_base_url: "https://api-hermes.pathao.com",
    api_token: "",
    store_id: "",
    config: { delivery_type: 48, item_type: 2 },
  },
  {
    name: "RedX Courier",
    slug: "redx",
    enabled: false,
    api_base_url: "https://openapi.redx.com.bd/v1.0.0-beta",
    api_token: "",
    store_id: "",
    config: { pickup_store_id: "" },
  },
  {
    name: "Steadfast Courier",
    slug: "steadfast",
    enabled: false,
    api_base_url: "https://portal.packzy.com/api/v1",
    api_token: "",
    store_id: "",
    config: { delivery_type: 0, connected: false, api_base_url: "https://portal.packzy.com/api/v1" },
  },
];

// --- Small UI helpers --------------------------------------------------------
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}
  </div>
);

const SubCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-lg border border-border bg-muted/30 p-3 space-y-3", className)}>{children}</div>
);

const InfoNote = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
    {children}
  </div>
);

const StatusDot = ({ ok }: { ok: boolean }) => (
  <span className={cn("inline-block w-1.5 h-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-muted-foreground/40")} />
);

// --- Page --------------------------------------------------------------------
const DeliveryPartners = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => { fetchPartners(); }, []);

  const fetchPartners = async () => {
    const { data } = await supabase.from("delivery_partners").select("*").order("name");
    const rows = ((data as any[]) ?? []).map((p) => {
      const cfg = p.config || {};
      return {
        ...p,
        api_base_url: p.api_base_url ?? cfg.api_base_url ?? "",
        api_token: p.api_token ?? cfg.api_token ?? "",
        store_id: p.store_id ?? cfg.store_id ?? "",
        config: cfg,
      };
    });
    setPartners(rows);
    setLoading(false);

  };

  const addPartner = async (template: Omit<DeliveryPartner, "id">) => {
    const row = {
      name: template.name,
      slug: template.slug,
      enabled: template.enabled,
      config: { ...template.config, api_base_url: template.api_base_url, api_token: template.api_token, store_id: template.store_id },
    };
    const { error } = await supabase.from("delivery_partners").insert(row as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${template.name} added` });
      fetchPartners();
    }
  };

  const updatePartner = (id: string, field: string, value: any) => {
    setPartners((prev) => prev.map((p) => {
      if (p.id === id) return { ...p, [field]: value };
      // Only one courier may be enabled at a time — disable others locally too
      if (field === "enabled" && value === true) return { ...p, enabled: false };
      return p;
    }));
  };

  const isConnected = (p: DeliveryPartner) => {
    if (p.slug === "steadfast") return !!p.config?.connected;
    if (p.slug === "pathao") {
      const c = p.config || {};
      return !!(c.client_id && c.client_secret && c.username && c.password);
    }
    return !!p.api_token;
  };

  const toggleEnabled = async (partner: DeliveryPartner, value: boolean) => {
    if (value && !isConnected(partner)) {
      toast({
        title: "Not connected",
        description: "Add credentials and click Save / Connect first.",
        variant: "destructive",
      });
      return;
    }
    updatePartner(partner.id, "enabled", value);
    if (value) {
      const others = partners.filter((p) => p.id !== partner.id && p.enabled);
      await Promise.all(
        others.map((o) => supabase.from("delivery_partners").update({ enabled: false } as any).eq("id", o.id)),
      );
    }
    const { error } = await supabase
      .from("delivery_partners")
      .update({ enabled: value } as any)
      .eq("id", partner.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      fetchPartners();
    } else if (value) {
      toast({ title: `${partner.name} is now the active courier` });
    }
  };


  const updateConfig = (id: string, key: string, value: any) => {
    setPartners((prev) => prev.map((p) => p.id === id ? { ...p, config: { ...p.config, [key]: value } } : p));
  };

  const hasCreds = (partner: DeliveryPartner) => {
    if (partner.slug === "pathao") {
      const c = partner.config || {};
      return !!(c.client_id && c.client_secret && c.username && c.password);
    }
    if (partner.slug === "steadfast") {
      const c = partner.config || {};
      return !!(c.api_key && c.secret_key);
    }
    return !!partner.api_token;
  };

  const savePartner = async (partner: DeliveryPartner) => {
    setSaving(partner.id);
    setTestResult((prev) => ({ ...prev, [partner.id]: null }));

    // 1. Verify credentials before marking as connected/enabled
    let connected = false;
    let connectionError: string | null = null;
    let testMessage = "";
    if (hasCreds(partner)) {
      try {
        const resp = await supabase.functions.invoke("courier-proxy", {
          body: { action: "test", partner_id: partner.id },
        });
        const r: any = resp.data;
        connected = !!r?.success;
        testMessage = r?.message || r?.error || "";
        if (!connected) connectionError = testMessage || "Connection failed";
      } catch (e: any) {
        connectionError = e?.message || "Connection failed";
      }
    } else {
      connectionError = "Missing credentials";
    }

    // 2. Persist — only enable when verified
    const mergedConfig = {
      ...(partner.config || {}),
      api_base_url: partner.api_base_url,
      api_token: partner.api_token,
      store_id: partner.store_id,
      connected,
      connection_error: connected ? null : connectionError,
      last_validated_at: connected ? new Date().toISOString() : partner.config?.last_validated_at ?? null,
    };
    const nextEnabled = connected ? true : false;

    // If activating this partner, disable every other partner in DB first so
    // only one courier is ever `enabled = true`.
    if (nextEnabled) {
      const others = partners.filter((p) => p.id !== partner.id && p.enabled);
      if (others.length) {
        await Promise.all(
          others.map((o) =>
            supabase.from("delivery_partners").update({ enabled: false } as any).eq("id", o.id),
          ),
        );
      }
    }

    const { error } = await supabase
      .from("delivery_partners")
      .update({ enabled: nextEnabled, config: mergedConfig } as any)
      .eq("id", partner.id);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setPartners((prev) => prev.map((p) => p.id === partner.id
        ? { ...p, enabled: nextEnabled, config: mergedConfig }
        : (nextEnabled ? { ...p, enabled: false } : p)));
      setTestResult((prev) => ({
        ...prev,
        [partner.id]: { success: connected, message: connected ? (testMessage || "Connected") : (connectionError || "Connection failed") },
      }));
      toast({
        title: connected ? `${partner.name} connected` : `${partner.name} saved`,
        description: connected ? "Active courier updated" : (connectionError || "Credentials saved but not active"),
        variant: connected ? "default" : "destructive",
      });
      fetchPartners();
    }
    setSaving(null);
  };

  const testConnection = async (partner: DeliveryPartner) => {
    if (!hasCreds(partner)) {
      setTestResult((prev) => ({
        ...prev,
        [partner.id]: {
          success: false,
          message: partner.slug === "pathao"
            ? "Fill in Client ID, Client Secret, Username, and Password."
            : "API token is required",
        },
      }));
      return;
    }
    setTesting(partner.id);
    setTestResult((prev) => ({ ...prev, [partner.id]: null }));

    try {
      if (partner.slug === "steadfast") {
        const { data, error } = await supabase.functions.invoke("steadfast-proxy", { body: { action: "get_balance" } });
        if (error) throw error;
        const ok = (data as any)?.status === 200 || typeof (data as any)?.current_balance === "number";
        setTestResult((prev) => ({
          ...prev,
          [partner.id]: ok
            ? { success: true, message: `Connected. COD balance: ৳${(data as any).current_balance ?? 0}` }
            : { success: false, message: (data as any)?.message || "Connection failed" },
        }));
      } else {
        const resp = await supabase.functions.invoke("courier-proxy", {
          body: { action: "test", partner_id: partner.id },
        });
        const result = resp.data;
        setTestResult((prev) => ({
          ...prev,
          [partner.id]: { success: result?.success || false, message: result?.message || result?.error || "Unknown response" },
        }));
      }
    } catch (err: any) {
      setTestResult((prev) => ({ ...prev, [partner.id]: { success: false, message: err.message || "Connection failed" } }));
    } finally {
      setTesting(null);
    }
  };


  const connectSteadfast = async (partner: DeliveryPartner) => {
    const apiKey = (partner.config?.api_key || "").trim();
    const secretKey = (partner.config?.secret_key || "").trim();
    const baseUrl = (partner.api_base_url || "https://portal.packzy.com/api/v1").trim();
    if (!apiKey || !secretKey) {
      toast({ title: "Api-Key and Secret-Key required", variant: "destructive" });
      return;
    }
    setSaving(partner.id);
    setTestResult((p) => ({ ...p, [partner.id]: null }));
    try {
      const { data, error } = await supabase.functions.invoke("steadfast-proxy", {
        body: { action: "validate", api_key: apiKey, secret_key: secretKey, api_base_url: baseUrl },
      });
      if (error) throw error;
      const ok = (data as any)?.connected === true;
      if (!ok) {
        const msg = (data as any)?.error || "Invalid API Key";
        setTestResult((p) => ({ ...p, [partner.id]: { success: false, message: msg } }));
        toast({ title: "Connection failed", description: msg, variant: "destructive" });
        return;
      }
      const balance = (data as any).balance ?? 0;
      const newConfig = {
        ...(partner.config || {}),
        api_key: apiKey,
        secret_key: secretKey,
        api_base_url: baseUrl,
        connected: true,
        connection_error: null,
        last_validated_at: new Date().toISOString(),
        last_balance: balance,
      };
      const { error: upErr } = await supabase
        .from("delivery_partners")
        .update({ enabled: partner.config?.connected ? partner.enabled : true, config: newConfig } as any)
        .eq("id", partner.id);
      if (upErr) throw upErr;
      setPartners((prev) => prev.map((p) => (p.id === partner.id ? { ...p, enabled: partner.config?.connected ? partner.enabled : true, config: newConfig } : p)));
      setTestResult((p) => ({ ...p, [partner.id]: { success: true, message: `Connected — Balance: ৳${balance}` } }));
      toast({ title: "Steadfast Connected", description: `Balance: ৳${balance}` });
    } catch (e: any) {
      const msg = e?.message || "Connection failed";
      setTestResult((p) => ({ ...p, [partner.id]: { success: false, message: msg } }));
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const refreshSteadfastBalance = async (partner: DeliveryPartner) => {
    setTesting(partner.id);
    try {
      const { data, error } = await supabase.functions.invoke("steadfast-proxy", { body: { action: "get_balance" } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const bal = (data as any)?.current_balance ?? 0;
      const newConfig = { ...(partner.config || {}), last_balance: bal, last_validated_at: new Date().toISOString(), connected: true, connection_error: null };
      setPartners((prev) => prev.map((p) => (p.id === partner.id ? { ...p, config: newConfig } : p)));
      toast({ title: `Balance: ৳${bal}` });
    } catch (e: any) {
      toast({ title: "Could not fetch balance", description: e?.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const existingSlugs = partners.map((p) => p.slug);
  const availableToAdd = DEFAULT_PARTNERS.filter((t) => !existingSlugs.includes(t.slug));

  const toggleExpanded = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  if (loading) return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="a-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {!hideTitle && (
        <PageHeader
          title="Courier API"
          subtitle="Connect courier services to push orders, fetch statuses, and sync balances."
        />
      )}

      {availableToAdd.length > 0 && (
        <Section transparent className="!mb-0">
          <div className="flex flex-wrap gap-2">
            {availableToAdd.map((t) => (
              <Button key={t.slug} size="sm" variant="outline" onClick={() => addPartner(t)} className="gap-1.5 h-9">
                <Plus size={13} /> Add {t.name}
              </Button>
            ))}
          </div>
        </Section>
      )}

      {partners.length === 0 ? (
        <Section transparent>
          <p className="text-sm text-muted-foreground">No delivery partners configured. Add one above.</p>
        </Section>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => {
            const isOpen = !!expanded[partner.id];
            const isSteadfast = partner.slug === "steadfast";
            const sfConnected = isSteadfast && !!partner.config?.connected;
            const connected = isConnected(partner);
            const result = testResult[partner.id];

            return (
              <div key={partner.id} className="a-card overflow-hidden">
                {/* Header row — always visible */}
                <div className="flex items-center gap-3 px-3 sm:px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(partner.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Truck size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">{partner.name}</h3>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <StatusDot ok={connected} />
                          {connected ? "Connected" : "Not connected"}
                        </span>
                        {partner.enabled && connected && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Active</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{partner.api_base_url || "—"}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={cn("text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")}
                    />
                  </button>
                  <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-border">
                    <Switch
                      checked={partner.enabled}
                      onCheckedChange={(v) => toggleEnabled(partner, v)}
                      aria-label={`Enable ${partner.name}`}
                    />
                  </div>
                </div>

                {isOpen && (
                  <div className="px-3 sm:px-5 pb-4 pt-1 space-y-3 border-t border-border">
                    {isSteadfast && (
                      <div className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]",
                        sfConnected
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}>
                        <span className="font-medium truncate">
                          {sfConnected
                            ? <>Connected · Balance ৳{partner.config?.last_balance ?? 0}</>
                            : <>Not connected{partner.config?.connection_error ? ` — ${partner.config.connection_error}` : ""}</>}
                        </span>
                        {sfConnected && (
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => refreshSteadfastBalance(partner)} disabled={testing === partner.id}>
                            {testing === partner.id ? "..." : "Refresh"}
                          </Button>
                        )}
                      </div>
                    )}

                    <Field label="API Base URL">
                      <Input value={partner.api_base_url} onChange={(e) => updatePartner(partner.id, "api_base_url", e.target.value)} />
                    </Field>

                    {partner.slug !== "pathao" && !isSteadfast && (
                      <Field label={partner.slug === "redx" ? "API Access Token" : "API Access Token (Bearer)"}>
                        <div className="relative">
                          <Input
                            type={showToken[partner.id] ? "text" : "password"}
                            value={partner.api_token}
                            onChange={(e) => updatePartner(partner.id, "api_token", e.target.value)}
                            placeholder="Paste your access token"
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((p) => ({ ...p, [partner.id]: !p[partner.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showToken[partner.id] ? "Hide token" : "Show token"}
                          >
                            {showToken[partner.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </Field>
                    )}

                    {isSteadfast && (
                      <SubCard>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Api-Key">
                            <Input
                              type={showToken[`${partner.id}-api`] ? "text" : "password"}
                              value={partner.config?.api_key ?? ""}
                              onChange={(e) => updateConfig(partner.id, "api_key", e.target.value)}
                              placeholder="Steadfast Api-Key"
                            />
                          </Field>
                          <Field label="Secret-Key">
                            <Input
                              type={showToken[`${partner.id}-sec`] ? "text" : "password"}
                              value={partner.config?.secret_key ?? ""}
                              onChange={(e) => updateConfig(partner.id, "secret_key", e.target.value)}
                              placeholder="Steadfast Secret-Key"
                            />
                          </Field>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowToken((p) => ({ ...p, [`${partner.id}-api`]: !p[`${partner.id}-api`], [`${partner.id}-sec`]: !p[`${partner.id}-sec`] }))}
                          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          {showToken[`${partner.id}-api`] ? <EyeOff size={12} /> : <Eye size={12} />} Show / hide keys
                        </button>
                        <InfoNote>
                          In Steadfast Merchant Panel → Developer / API, generate your <strong>Api-Key</strong> and <strong>Secret-Key</strong> and paste them here. Default base URL: <code className="px-1 rounded bg-secondary">https://portal.packzy.com/api/v1</code>. Then press <strong>Connect / Save</strong>.
                        </InfoNote>
                      </SubCard>
                    )}

                    {partner.slug === "pathao" && (
                      <>
                        <Field label="Store ID (merchant_store_id)">
                          <Input value={partner.store_id} onChange={(e) => updatePartner(partner.id, "store_id", e.target.value)} placeholder="Your merchant store ID" />
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Sender Name">
                            <Input value={partner.config?.sender_name ?? ""} onChange={(e) => updateConfig(partner.id, "sender_name", e.target.value)} placeholder="Your store/business name" />
                          </Field>
                          <Field label="Sender Phone">
                            <Input value={partner.config?.sender_phone ?? ""} onChange={(e) => updateConfig(partner.id, "sender_phone", e.target.value)} placeholder="01XXXXXXXXX" />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Delivery Type" hint="48 = Normal · 12 = On-demand">
                            <Input type="number" value={partner.config?.delivery_type ?? 48} onChange={(e) => updateConfig(partner.id, "delivery_type", +e.target.value)} />
                          </Field>
                          <Field label="Item Type" hint="1 = Document · 2 = Parcel">
                            <Input type="number" value={partner.config?.item_type ?? 2} onChange={(e) => updateConfig(partner.id, "item_type", +e.target.value)} />
                          </Field>
                        </div>

                        <SubCard>
                          <div className="space-y-0.5">
                            <p className="text-[12px] font-medium text-foreground">API Credentials</p>
                            <p className="text-[10px] text-muted-foreground">From Pathao Merchant Panel → Developer API → Merchant API Credentials.</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Client ID">
                              <Input value={partner.config?.client_id ?? ""} onChange={(e) => updateConfig(partner.id, "client_id", e.target.value)} placeholder="Pathao Client ID" />
                            </Field>
                            <Field label="Client Secret">
                              <Input type="password" value={partner.config?.client_secret ?? ""} onChange={(e) => updateConfig(partner.id, "client_secret", e.target.value)} placeholder="Pathao Client Secret" />
                            </Field>
                            <Field label="Username (Email)">
                              <Input value={partner.config?.username ?? ""} onChange={(e) => updateConfig(partner.id, "username", e.target.value)} placeholder="Pathao merchant email" />
                            </Field>
                            <Field label="Password">
                              <Input type="password" value={partner.config?.password ?? ""} onChange={(e) => updateConfig(partner.id, "password", e.target.value)} placeholder="Pathao merchant password" />
                            </Field>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Token is auto-managed: initial login via username/password, then auto-refreshed.</p>
                        </SubCard>

                        <InfoNote>
                          <span className="block font-medium text-foreground mb-0.5">Auto City/Zone/Area Lookup</span>
                          City/zone/area IDs are resolved automatically from the customer's district and city via the Pathao API.
                        </InfoNote>
                      </>
                    )}

                    {partner.slug === "redx" && (
                      <Field label="Pickup Store ID">
                        <Input value={partner.config?.pickup_store_id ?? ""} onChange={(e) => updateConfig(partner.id, "pickup_store_id", e.target.value)} placeholder="Your RedX pickup store ID" />
                      </Field>
                    )}

                    {result && (
                      <div className={cn(
                        "text-[11px] rounded-lg px-3 py-2",
                        result.success
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-destructive/10 text-destructive",
                      )}>
                        {result.message}
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                      <div className="flex flex-wrap gap-2 flex-1">
                        {isSteadfast ? (
                          <Button size="sm" className="gap-1.5 h-10 sm:h-9 flex-1 sm:flex-none" onClick={() => connectSteadfast(partner)} disabled={saving === partner.id}>
                            <Send size={13} /> {saving === partner.id ? "Verifying..." : "Connect / Save"}
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" className="gap-1.5 h-10 sm:h-9 flex-1 sm:flex-none" onClick={() => savePartner(partner)} disabled={saving === partner.id}>
                              <Save size={13} /> {saving === partner.id ? "Saving..." : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5 h-10 sm:h-9 flex-1 sm:flex-none" onClick={() => testConnection(partner)} disabled={testing === partner.id}>
                              <Send size={13} /> {testing === partner.id ? "Testing..." : "Test connection"}
                            </Button>
                          </>
                        )}
                      </div>
                      {partner.slug === "pathao" && (
                        <a href="https://merchant.pathao.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 sm:ml-auto">
                          <ExternalLink size={12} /> Pathao Merchant Panel
                        </a>
                      )}
                      {partner.slug === "redx" && (
                        <a href="https://redx.com.bd" target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 sm:ml-auto">
                          <ExternalLink size={12} /> RedX Dashboard
                        </a>
                      )}
                    </div>

                    {partner.slug === "pathao" && (
                      <InfoNote>
                        <span className="block font-medium text-foreground mb-0.5">Pathao API Integration</span>
                        Orders use the simplified API — only full address is required (no city/zone/area IDs).<br />
                        <span className="opacity-80">Endpoint: <code className="px-1 rounded bg-secondary break-all">{partner.api_base_url}/aladdin/api/v1/orders</code></span>
                      </InfoNote>
                    )}
                    {partner.slug === "redx" && (
                      <InfoNote>
                        <span className="block font-medium text-foreground mb-0.5">RedX API Integration</span>
                        Orders are created via the RedX Open API. Area lookup is automatic from district name.<br />
                        <span className="opacity-80">Create: <code className="px-1 rounded bg-secondary break-all">{partner.api_base_url}/parcel</code></span><br />
                        <span className="opacity-80">Areas: <code className="px-1 rounded bg-secondary break-all">{partner.api_base_url}/areas?district_name=Dhaka</code></span>
                      </InfoNote>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveryPartners;
