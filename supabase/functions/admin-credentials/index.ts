// Admin-only credentials manager for the Settings → API Keys page.
// Action-based POST endpoint. Never echoes raw secret values except in the
// dedicated "reveal" action (admin-only, for populating the edit form).

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { clearServiceCache } from "../_shared/serviceSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type ServiceName = "r2" | "bdcourier";

const SERVICE_FIELDS: Record<ServiceName, { key: string; secret: boolean; required: boolean }[]> = {
  r2: [
    { key: "R2_ACCOUNT_ID", secret: false, required: true },
    { key: "R2_ACCESS_KEY_ID", secret: true, required: true },
    { key: "R2_SECRET_ACCESS_KEY", secret: true, required: true },
    { key: "R2_BUCKET", secret: false, required: true },
    { key: "R2_PUBLIC_BASE_URL", secret: false, required: true },
  ],
  bdcourier: [
    { key: "BDCOURIER_API_KEY", secret: true, required: true },
  ],
};

function mask(value: string | undefined | null): string {
  if (!value) return "";
  const v = String(value);
  if (v.length <= 4) return "••••";
  return "••••••••" + v.slice(-4);
}

function envFallback(key: string): string {
  return Deno.env.get(key) || "";
}

// ---------- R2 tests ----------
async function testR2(values: Record<string, string>) {
  const accountId = values.R2_ACCOUNT_ID || envFallback("R2_ACCOUNT_ID");
  const bucket = values.R2_BUCKET || envFallback("R2_BUCKET");
  const accessKeyId = values.R2_ACCESS_KEY_ID || envFallback("R2_ACCESS_KEY_ID");
  const secretAccessKey = values.R2_SECRET_ACCESS_KEY || envFallback("R2_SECRET_ACCESS_KEY");
  const publicBase = (values.R2_PUBLIC_BASE_URL || envFallback("R2_PUBLIC_BASE_URL")).replace(/\/+$/, "");

  const steps: { name: string; ok: boolean; message: string }[] = [];
  const push = (name: string, ok: boolean, message: string) => steps.push({ name, ok, message });

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    push("Credentials", false, "Missing one or more required R2 fields.");
    return { ok: false, steps };
  }
  push("Credentials", true, "All required fields present.");

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

  // List (bucket exists + read)
  try {
    const res = await aws.fetch(`${endpoint}/${bucket}?list-type=2&max-keys=1`, { method: "GET" });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      push("Bucket read", false, `HTTP ${res.status}: ${text || res.statusText}`);
      return { ok: false, steps };
    }
    push("Bucket read", true, `Bucket "${bucket}" reachable.`);
  } catch (e) {
    push("Bucket read", false, String((e as Error)?.message || e));
    return { ok: false, steps };
  }

  // Write + delete
  const probeKey = `_healthcheck/${crypto.randomUUID()}.txt`;
  const probeBody = new TextEncoder().encode("ok");
  try {
    const put = await aws.fetch(`${endpoint}/${bucket}/${probeKey}`, {
      method: "PUT",
      body: probeBody,
      headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=60" },
    });
    if (!put.ok) {
      const text = (await put.text().catch(() => "")).slice(0, 300);
      push("Bucket write", false, `HTTP ${put.status}: ${text || put.statusText}`);
      return { ok: false, steps };
    }
    push("Bucket write", true, "Write permission confirmed.");
  } catch (e) {
    push("Bucket write", false, String((e as Error)?.message || e));
    return { ok: false, steps };
  }

  // Public URL check (must happen before delete)
  if (publicBase) {
    try {
      // Wait briefly for propagation
      await new Promise((r) => setTimeout(r, 400));
      const probe = await fetch(`${publicBase}/${probeKey}`, { method: "GET" });
      if (probe.ok) {
        push("Public URL", true, `Reachable at ${publicBase}`);
      } else {
        push("Public URL", false, `HTTP ${probe.status} at ${publicBase}. Bucket public binding may point elsewhere.`);
      }
    } catch (e) {
      push("Public URL", false, String((e as Error)?.message || e));
    }
  } else {
    push("Public URL", false, "R2_PUBLIC_BASE_URL not set.");
  }

  // Cleanup
  try {
    await aws.fetch(`${endpoint}/${bucket}/${probeKey}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }

  const ok = steps.every((s) => s.ok);
  return { ok, steps };
}

async function testBdCourier(values: Record<string, string>) {
  const key = (values.BDCOURIER_API_KEY || envFallback("BDCOURIER_API_KEY")).trim();
  const steps: { name: string; ok: boolean; message: string }[] = [];
  if (!key) {
    steps.push({ name: "API key", ok: false, message: "BDCOURIER_API_KEY is missing." });
    return { ok: false, steps };
  }
  steps.push({ name: "API key", ok: true, message: "API key present." });
  try {
    const res = await fetch("https://api.bdcourier.com/courier-check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone: "01700000000" }),
    });
    const text = await res.text();
    if (res.ok) {
      steps.push({ name: "Live probe", ok: true, message: "BD Courier accepted the request." });
      return { ok: true, steps };
    }
    let msg = `HTTP ${res.status}`;
    try {
      const p = JSON.parse(text);
      msg = p?.message || p?.error || msg;
    } catch { /* keep msg */ }
    steps.push({ name: "Live probe", ok: false, message: msg });
    return { ok: false, steps };
  } catch (e) {
    steps.push({ name: "Live probe", ok: false, message: String((e as Error)?.message || e) });
    return { ok: false, steps };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: authErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "status") {
      const { data: rows } = await admin
        .from("service_credentials")
        .select("service, values, last_tested_at, last_test_status, last_test_message, updated_at");
      const map: Record<string, any> = {};
      for (const s of Object.keys(SERVICE_FIELDS) as ServiceName[]) {
        const row = rows?.find((r) => r.service === s);
        const values = (row?.values ?? {}) as Record<string, string>;
        const fields = SERVICE_FIELDS[s].map((f) => {
          const v = values[f.key] || envFallback(f.key);
          return {
            key: f.key,
            secret: f.secret,
            required: f.required,
            configured: !!v,
            source: values[f.key] ? "db" : (envFallback(f.key) ? "env" : "missing"),
            preview: f.secret ? mask(v) : (v || ""),
          };
        });
        map[s] = {
          service: s,
          fields,
          configured: fields.every((f) => !f.required || f.configured),
          last_tested_at: row?.last_tested_at ?? null,
          last_test_status: row?.last_test_status ?? null,
          last_test_message: row?.last_test_message ?? null,
          updated_at: row?.updated_at ?? null,
        };
      }
      return json({ services: map });
    }

    if (action === "reveal") {
      const service = String(body?.service || "") as ServiceName;
      const field = String(body?.field || "");
      if (!SERVICE_FIELDS[service]?.some((f) => f.key === field)) return json({ error: "invalid_field" }, 400);
      const { data } = await admin.from("service_credentials").select("values").eq("service", service).maybeSingle();
      const values = (data?.values ?? {}) as Record<string, string>;
      const value = values[field] || envFallback(field) || "";
      return json({ value });
    }

    if (action === "save") {
      const service = String(body?.service || "") as ServiceName;
      const incoming = (body?.values ?? {}) as Record<string, string>;
      if (!SERVICE_FIELDS[service]) return json({ error: "invalid_service" }, 400);

      const { data: existing } = await admin.from("service_credentials").select("values").eq("service", service).maybeSingle();
      const merged: Record<string, string> = { ...(existing?.values ?? {}) };
      for (const f of SERVICE_FIELDS[service]) {
        if (Object.prototype.hasOwnProperty.call(incoming, f.key)) {
          const v = String(incoming[f.key] ?? "").trim();
          if (v) merged[f.key] = v;
          else delete merged[f.key];
        }
      }
      // Validate required
      const missing = SERVICE_FIELDS[service]
        .filter((f) => f.required && !(merged[f.key] || envFallback(f.key)))
        .map((f) => f.key);
      if (missing.length) return json({ error: "missing_required", fields: missing }, 400);

      const { error: upErr } = await admin
        .from("service_credentials")
        .upsert({ service, values: merged, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "service" });
      if (upErr) return json({ error: upErr.message }, 500);

      clearServiceCache(service);
      return json({ ok: true });
    }

    if (action === "test") {
      const service = String(body?.service || "") as ServiceName;
      const { data } = await admin.from("service_credentials").select("values").eq("service", service).maybeSingle();
      const values = (data?.values ?? {}) as Record<string, string>;
      let result: { ok: boolean; steps: { name: string; ok: boolean; message: string }[] };
      if (service === "r2") result = await testR2(values);
      else if (service === "bdcourier") result = await testBdCourier(values);
      else return json({ error: "invalid_service" }, 400);

      const summary = result.steps
        .filter((s) => !s.ok)
        .map((s) => `${s.name}: ${s.message}`)
        .join(" | ") || "All checks passed.";

      await admin.from("service_credentials").upsert({
        service,
        values,
        last_tested_at: new Date().toISOString(),
        last_test_status: result.ok ? "connected" : "failed",
        last_test_message: summary.slice(0, 500),
      }, { onConflict: "service" });

      return json({ ok: result.ok, steps: result.steps });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[admin-credentials] error", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
