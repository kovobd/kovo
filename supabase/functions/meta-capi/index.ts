import { dlog, derror } from "../_shared/log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Origin allowlist (comma-separated env var). Empty/unset => disabled.
const ALLOWED_ORIGINS = (Deno.env.get("CAPI_ALLOWED_ORIGINS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function isOriginAllowed(req: Request): boolean {
  if (ALLOWED_ORIGINS.length === 0) return true; // disabled
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  return ALLOWED_ORIGINS.some((o) => origin === o || referer.startsWith(o));
}

const ALLOWED_EVENTS = new Set([
  "PageView", "ViewContent", "Search", "AddToCart",
  "InitiateCheckout", "AddPaymentInfo", "Purchase",
  "Lead", "CompleteRegistration",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchPixelConfig() {
  const url = `${SUPABASE_URL}/rest/v1/tracking_pixels?platform=eq.facebook&select=pixel_id,access_token,test_event_code,test_mode,advanced_matching,enabled,logging_paused&limit=1`;
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

async function logEvent(row: Record<string, unknown>, loggingPaused = false) {
  if (loggingPaused) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/capi_event_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (_) { /* logging is best-effort */ }
}

async function postWithRetry(apiUrl: string, body: string, accessToken: string): Promise<{ ok: boolean; status: number; text: string; attempts: number; error?: string }> {
  const delays = [0, 400, 1200]; // 3 attempts total
  let lastStatus = 0;
  let lastText = "";
  let lastErr: string | undefined;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      // Send access_token in the Authorization header — NOT in the URL query
      // string — so it never lands in upstream/CDN/Edge logs or fbtrace audit.
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      lastStatus = res.status;
      lastText = text;
      // Retry on 5xx + 429 only
      if (res.ok) return { ok: true, status: res.status, text, attempts: i + 1 };
      if (res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status, text, attempts: i + 1 };
      }
    } catch (err) {
      lastErr = String(err);
    }
  }
  return { ok: false, status: lastStatus, text: lastText, attempts: delays.length, error: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require a Supabase JWT (anon or user). verify_jwt defaults to true,
  // but we double-check here for defense-in-depth in case config drifts.
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ") || authHeader.length < 32) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Origin / referer allowlist (skipped when env var is unset).
  if (!isOriginAllowed(req)) {
    return new Response(JSON.stringify({ error: "forbidden_origin" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event_name, event_id, event_time, event_source_url, referrer, custom_data, user_data } = body;

    if (!event_name || !event_id || typeof event_name !== "string" || typeof event_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing event_name or event_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_EVENTS.has(event_name)) {
      return new Response(JSON.stringify({ error: "Unsupported event_name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pixel = await fetchPixelConfig();
    const loggingPaused = pixel?.logging_paused === true;

    // Pre-extract inspector metadata from custom_data (server-side fields the inspector shows)
    const meta = {
      order_id: (custom_data as any)?.order_id ? String((custom_data as any).order_id) : null,
      product_ids: Array.isArray((custom_data as any)?.content_ids)
        ? ((custom_data as any).content_ids as any[]).map((x) => String(x))
        : null,
      value: (custom_data as any)?.value !== undefined ? Number((custom_data as any).value) : null,
      currency: (custom_data as any)?.currency ? String((custom_data as any).currency) : null,
    };

    // Test Mode bypasses the `enabled` flag: if a TEST… code is saved and Test Mode
    // is ON, route events to Meta Test Events even when the integration toggle is off.
    // This lets you validate the full funnel before flipping the pixel live.
    const testModeActive =
      pixel?.test_mode === true &&
      typeof pixel?.test_event_code === "string" &&
      pixel.test_event_code.trim().length > 0;

    if (!pixel?.pixel_id || !pixel?.access_token || (!pixel?.enabled && !testModeActive)) {
      await logEvent({
        event_name, event_id, status: "skipped", attempts: 0,
        source: "server",
        error: !pixel?.pixel_id || !pixel?.access_token
          ? "CAPI not configured (missing pixel_id or access_token)"
          : "CAPI disabled (enable the pixel or turn on Test Mode with a TEST code)",
        order_id: meta.order_id, product_ids: meta.product_ids, value: meta.value, currency: meta.currency,
      }, loggingPaused);
      return new Response(JSON.stringify({ skipped: true, reason: "CAPI not configured or disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side idempotency guard for Purchase: even if a client retries or
    // tampers with localStorage, a second `delivered` send for the same
    // event_id is blocked here. Browser dedup + Meta dedup still apply; this
    // is a defense-in-depth layer that does not depend on client behavior.
    if (event_name === "Purchase") {
      try {
        const dedupUrl = `${SUPABASE_URL}/rest/v1/capi_event_logs?event_name=eq.Purchase&event_id=eq.${encodeURIComponent(event_id)}&status=eq.delivered&select=id&limit=1`;
        const dr = await fetch(dedupUrl, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
        if (dr.ok) {
          const existing = await dr.json();
          if (Array.isArray(existing) && existing.length > 0) {
            await logEvent({
              event_name, event_id, status: "skipped", attempts: 0,
              source: "server",
              error: "Duplicate Purchase event_id — already delivered",
              order_id: meta.order_id, product_ids: meta.product_ids, value: meta.value, currency: meta.currency,
            }, loggingPaused);
            return new Response(JSON.stringify({ skipped: true, reason: "duplicate_purchase_event_id", event_id }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (_) { /* fail-open: never block a real purchase due to a check error */ }
    }

    const userData: Record<string, any> = {
      client_user_agent: req.headers.get("user-agent") || "",
      client_ip_address:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") || "",
    };

    if (user_data && typeof user_data === "object") {
      if (user_data.fbp) userData.fbp = String(user_data.fbp);
      if (user_data.fbc) userData.fbc = String(user_data.fbc);
      if (user_data.external_id) userData.external_id = [await sha256(String(user_data.external_id))];

      // Always hash PII when present (Meta requires SHA-256 hashed PII via CAPI).
      if (user_data.em) userData.em = [await sha256(String(user_data.em))];
      if (user_data.ph) userData.ph = [await sha256(String(user_data.ph).replace(/\D/g, ""))];
      if (user_data.fn) userData.fn = [await sha256(String(user_data.fn))];
      if (user_data.ln) userData.ln = [await sha256(String(user_data.ln))];
      if (user_data.ct) userData.ct = [await sha256(String(user_data.ct))];
      if (user_data.country) userData.country = [await sha256(String(user_data.country))];
      if (user_data.zp) userData.zp = [await sha256(String(user_data.zp))];
    }

    const cd = { ...(custom_data || {}) };
    if (cd.value !== undefined) cd.value = Number(cd.value);
    if (Array.isArray(cd.contents)) {
      cd.contents = cd.contents.map((c: any) => ({
        id: String(c.id),
        quantity: Number(c.quantity) || 1,
        item_price: c.item_price !== undefined ? Number(c.item_price) : undefined,
      }));
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let ts = Number(event_time);
    if (!Number.isFinite(ts) || ts <= 0) ts = nowSec;
    if (ts > nowSec + 60) ts = nowSec;
    if (ts < nowSec - 7 * 24 * 3600) ts = nowSec;

    const activeTestCode = testModeActive ? pixel.test_event_code.trim() : null;

    const eventPayload = {
      data: [
        {
          event_name,
          event_id,
          event_time: ts,
          event_source_url: event_source_url || "",
          ...(referrer ? { referrer_url: referrer } : {}),
          action_source: "website",
          user_data: userData,
          custom_data: cd,
        },
      ],
      ...(activeTestCode ? { test_event_code: activeTestCode } : {}),
    };

    // Per-event diagnostic line (secrets masked) — visible in Edge Function logs.
    const maskedToken = pixel.access_token
      ? `${String(pixel.access_token).slice(0, 6)}…(${String(pixel.access_token).length})`
      : "none";
    dlog("[meta-capi]", JSON.stringify({
      event_name,
      event_id,
      test_mode: pixel.test_mode === true,
      test_event_code: activeTestCode,
      dataset_id: pixel.pixel_id,
      access_token: maskedToken,
      payload: { ...eventPayload, data: eventPayload.data.map((d) => ({ ...d, user_data: { ...d.user_data, client_ip_address: d.user_data.client_ip_address ? "***" : "" } })) },
    }));

    const apiUrl = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events`;
    const startedAt = Date.now();
    const result = await postWithRetry(apiUrl, JSON.stringify(eventPayload), pixel.access_token);
    const responseTimeMs = Date.now() - startedAt;

    let fbtrace_id: string | null = null;
    try { fbtrace_id = JSON.parse(result.text)?.fbtrace_id ?? null; } catch {}
    if (!result.ok) {
      derror("[meta-capi:response] failed", JSON.stringify({
        event_name, event_id, http_status: result.status, fbtrace_id,
        body: result.text?.slice(0, 500),
      }));
    } else {
      dlog("[meta-capi:response]", JSON.stringify({
        event_name, event_id, http_status: result.status, fbtrace_id,
      }));
    }

    await logEvent({
      event_name, event_id,
      status: result.ok ? "delivered" : "failed",
      source: "server",
      test_mode: !!activeTestCode,
      http_status: result.status,
      attempts: result.attempts,
      response_time_ms: responseTimeMs,
      order_id: meta.order_id, product_ids: meta.product_ids, value: meta.value, currency: meta.currency,
      error: result.ok ? null : (result.error || result.text?.slice(0, 500) || null),
      response: result.text?.slice(0, 1000) || null,
      payload: {
        custom_data: cd,
        event_source_url: event_source_url || null,
        has_fbp: !!userData.fbp,
        has_fbc: !!userData.fbc,
        has_external_id: !!userData.external_id,
        am: !!pixel.advanced_matching,
        pii_keys: Object.keys(userData).filter((k) => ["em","ph","fn","ln","ct","country","zp"].includes(k)),
        test_event_code: activeTestCode,
      },
    }, loggingPaused);


    return new Response(JSON.stringify({
      success: result.ok,
      event_id,
      event_name,
      attempts: result.attempts,
      http_status: result.status,
      result: result.text,
    }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = String(err);
    const pixel = await fetchPixelConfig().catch(() => null);
    await logEvent({ event_name: "unknown", event_id: "unknown", status: "exception", attempts: 0, error: msg }, pixel?.logging_paused === true);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
