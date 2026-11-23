// Admin-only credential & reachability check for the Meta CAPI integration.
// Calls Meta's Marketing API metadata endpoint for the configured dataset using
// the saved access token. Returns granular flags so the admin dashboard can
// distinguish "no pixel saved" vs "token revoked" vs "dataset unreachable" vs
// "network/timeout". Never returns the access token or sensitive payloads.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return false;
  const u = await r.json();
  if (!u?.id) return false;
  const rr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${u.id}&role=in.(admin,staff)&select=role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = await rr.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

async function fetchPixel() {
  const url = `${SUPABASE_URL}/rest/v1/tracking_pixels?platform=eq.facebook&select=pixel_id,access_token,test_event_code,test_mode,enabled,advanced_matching&limit=1`;
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    if (!(await isAdmin(req.headers.get("Authorization")))) {
      return new Response(JSON.stringify({ ok: false, stage: "auth", message: "Forbidden — admin only." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pixel = await fetchPixel();
    const has_pixel_id = !!pixel?.pixel_id;
    const has_access_token = !!pixel?.access_token;

    if (!has_pixel_id || !has_access_token) {
      return new Response(JSON.stringify({
        ok: false,
        stage: "config",
        has_pixel_id,
        has_access_token,
        message: "Pixel ID or Access Token is not configured.",
        latency_ms: Date.now() - startedAt,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate by sending a sandboxed CAPI test event — the SAME standard the
    // production pipeline uses. Reading `GET /{dataset_id}` requires
    // `ads_management` permissions that CAPI Dataset Access Tokens do NOT
    // carry, which falsely returns (#100) Missing Permission. The authoritative
    // check for a CAPI token is whether Meta accepts an event from it.
    const testCode =
      (pixel.test_event_code && String(pixel.test_event_code).trim()) ||
      `HEALTH_${Date.now().toString(36).toUpperCase()}`;
    const eventTime = Math.floor(Date.now() / 1000);
    const payload = {
      data: [{
        event_name: "PageView",
        event_time: eventTime,
        event_id: `health_${eventTime}_${crypto.randomUUID()}`,
        action_source: "website",
        event_source_url: "https://health.check.local/",
        user_data: {
          client_user_agent: "Lovable-Meta-Health-Check/1.0",
          // Hashed synthetic external_id so Meta accepts user_data
          external_id: ["b3f1c9a0a3f1d2e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"],
        },
      }],
      test_event_code: testCode,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const metaUrl = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events`;
    let httpStatus = 0;
    let body: any = null;
    let errMsg: string | null = null;
    try {
      const r = await fetch(metaUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${pixel.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      httpStatus = r.status;
      const text = await r.text();
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
    } catch (e) {
      errMsg = String(e);
    } finally {
      clearTimeout(timer);
    }

    const fb_error = body?.error;
    const eventsReceived = Number(body?.events_received ?? 0);
    // Token-invalid signals from Meta when posting to /events
    const token_invalid =
      fb_error?.code === 190 ||
      fb_error?.code === 102 ||
      fb_error?.code === 200 ||
      fb_error?.type === "OAuthException";
    // Dataset/pixel-id mismatch posting to /events surfaces as 803 or
    // "Unsupported post request" (#100 subcode 33 on a non-existent node).
    const dataset_unreachable =
      (fb_error?.code === 100 && (fb_error?.error_subcode === 33 || /nonexisting|does not exist/i.test(fb_error?.message || ""))) ||
      fb_error?.code === 803;
    const ok = httpStatus === 200 && !fb_error && !errMsg && eventsReceived >= 1;

    return new Response(JSON.stringify({
      ok,
      stage: ok ? "verified" : (token_invalid ? "token" : (dataset_unreachable ? "dataset" : (errMsg ? "network" : "api"))),
      http_status: httpStatus,
      dataset_id: pixel.pixel_id,
      enabled: !!pixel.enabled,
      test_mode: !!pixel.test_mode,
      has_test_event_code: !!(pixel.test_event_code && String(pixel.test_event_code).trim()),
      advanced_matching: !!pixel.advanced_matching,
      events_received: eventsReceived,
      fbtrace_id: body?.fbtrace_id ?? fb_error?.fbtrace_id ?? null,
      meta_error: fb_error ? { code: fb_error.code, type: fb_error.type, message: fb_error.message, fbtrace_id: fb_error.fbtrace_id, error_subcode: fb_error.error_subcode } : null,
      dataset_name: null,
      network_error: errMsg,
      latency_ms: Date.now() - startedAt,
      validation_method: "capi_test_event",
      message: ok
        ? `Meta accepted a Conversions API test event (events_received=${eventsReceived}). Token and dataset are valid.`
        : (token_invalid ? "Access Token is invalid or has been revoked."
          : (dataset_unreachable ? "Dataset ID is unreachable — verify the Pixel/Dataset ID."
            : (errMsg ? "Network error reaching Meta Graph API."
              : (fb_error?.message || "Meta API returned an error.")))),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false, stage: "exception", message: String(err), latency_ms: Date.now() - startedAt,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
