// Admin-only end-to-end Meta connection test.
//
// Validates a Conversions API (CAPI) Dataset Access Token by sending ONE
// sandboxed test event (test_event_code only — never enters production analytics).
//
// IMPORTANT: We deliberately do NOT call `GET /{dataset_id}?fields=...`.
// That endpoint requires a System/User access token with `ads_management` or
// business-asset permissions. A CAPI Dataset Access Token is scoped ONLY to
// POST events to that dataset, so the GET reads back as (#100) Missing Permission
// even when the token is perfectly valid for sending events. The authoritative
// test for a CAPI token is sending an event and parsing Meta's response.

import { dlog } from "../_shared/log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const API_VERSION = "v21.0";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(authHeader: string | null): Promise<{ ok: boolean; userId?: string }> {
  if (!authHeader) return { ok: false };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return { ok: false };
  const u = await r.json();
  if (!u?.id) return { ok: false };
  const rr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${u.id}&role=eq.admin&select=role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = await rr.json().catch(() => []);
  return { ok: Array.isArray(rows) && rows.length > 0, userId: u.id };
}

async function fetchPixelConfig() {
  const url = `${SUPABASE_URL}/rest/v1/tracking_pixels?platform=eq.facebook&select=pixel_id,access_token,test_event_code,enabled&limit=1`;
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

async function persistResult(row: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/capi_test_results?on_conflict=platform`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (_) { /* best-effort */ }
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Check = { name: string; status: "pass" | "fail" | "skip"; detail?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  const auth = await isAdmin(req.headers.get("Authorization"));
  if (!auth.ok) return respond({ error: "Forbidden — admin role required" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  // ── Recheck mode: do NOT send a new event. Re-read last result + restate
  //    Meta's verification limitation. Useful while waiting for propagation.
  if (body?.mode === "recheck") {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/capi_test_results?platform=eq.facebook&select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const rows = await r.json().catch(() => []);
    const last = Array.isArray(rows) ? rows[0] : null;
    if (!last) return respond({ status: "failed", message: "No prior test event to recheck. Run a test first." });
    const ageMs = Date.now() - new Date(last.tested_at).getTime();
    return respond({
      ...last,
      recheck: {
        mode: "recheck",
        last_test_age_ms: ageMs,
        propagation_window_seconds: [5, 30],
        verifiable_via_graph_api: false,
        reason:
          "Meta's Graph API does not expose a public endpoint that returns Test Events session contents. " +
          "Visibility can only be confirmed by opening Events Manager → Test Events. " +
          "events_received ≥ 1 with no error remains the strongest server-side confirmation.",
      },
    });
  }


  const pixel = await fetchPixelConfig();
  const pixelId: string | undefined = body?.pixel_id || pixel?.pixel_id;
  const accessToken: string | undefined = body?.access_token || pixel?.access_token;

  // Test-code provenance — tracked end-to-end so any mismatch is obvious.
  const testCodeFromRequest: string | null = ((body?.test_event_code ?? "") + "").trim() || null;
  const testCodeFromDb: string | null = ((pixel?.test_event_code ?? "") + "").trim() || null;
  const testCode: string = (testCodeFromRequest || testCodeFromDb || "").trim();

  const checks: Check[] = [];
  const diagnostics: Record<string, unknown> = {
    request_id: requestId,
    api_version: API_VERSION,
    has_pixel_id: !!pixelId,
    has_access_token: !!accessToken,
    enabled: !!pixel?.enabled,
    test_code_provenance: {
      entered_in_request: testCodeFromRequest,
      stored_in_db: testCodeFromDb,
      sent_to_meta: testCode || null,
      returned_by_meta: null as string | null,
      all_match: null as boolean | null,
    },
  };

  // Credentials present
  checks.push({
    name: "Credentials present",
    status: pixelId && accessToken ? "pass" : "fail",
    detail: pixelId && accessToken ? `Dataset ${pixelId}` : "Dataset ID and/or Access Token missing",
  });

  // test_event_code present — without it Meta routes the event to PRODUCTION,
  // not Test Events, and it will never appear in Events Manager → Test Events.
  checks.push({
    name: "Test event code present",
    status: testCode ? "pass" : "fail",
    detail: testCode
      ? `code="${testCode}"`
      : "Missing. Copy the TEST… code from Events Manager → Test Events into the Test event code field, Save, then re-run.",
  });

  if (!pixelId || !accessToken || !testCode) {
    const row = {
      platform: "facebook",
      status: "failed",
      pixel_id: pixelId ?? null,
      api_version: API_VERSION,
      test_event_code: testCode || null,
      message: !testCode
        ? "❌ No test_event_code is set. Without it Meta accepts the event into PRODUCTION analytics, not Test Events — that's why nothing appears in Events Manager → Test Events. Paste the TEST… code from Events Manager → Test Events into Settings → Tracking pixels → Meta → Test event code, Save, then re-run."
        : "Missing Dataset ID or Access Token.",
      diagnostics: { ...diagnostics, checks },
      tested_at: new Date().toISOString(),
      tested_by: auth.userId,
    };
    await persistResult(row);
    return respond({ status: "failed", ...row });
  }

  // Send ONE sandboxed test event. This is the authoritative validation for a
  // CAPI Dataset Access Token. Token is sent in the Authorization header
  // (avoids leaking it in URL/server logs / fbtrace logs).
  const eventId = `connection_test_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const requestUrl = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`;
  const payload = {
    data: [
      {
        event_name: "PageView",
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: "https://example.com/__capi_test__",
        action_source: "website",
        user_data: {
          client_user_agent: req.headers.get("user-agent") || "Mozilla/5.0 (capi-test)",
          client_ip_address:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("cf-connecting-ip") || "127.0.0.1",
          external_id: [await sha256(`capi-test-${pixelId}`)],
        },
        custom_data: { __capi_test__: true },
      },
    ],
    test_event_code: testCode,
  };

  let httpStatus = 0;
  let eventsReceived = 0;
  let metaJson: any = null;
  let metaError: any = null;
  let networkError: string | null = null;
  const tSent = Date.now();

  try {
    const r = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    httpStatus = r.status;
    metaJson = await r.json().catch(() => ({}));
    eventsReceived = Number(metaJson?.events_received ?? 0);
    metaError = metaJson?.error ?? null;
  } catch (err) {
    networkError = String(err);
  }

  const responseMs = Date.now() - tSent;

  // Granular checks
  checks.push({
    name: "Network reachable",
    status: networkError ? "fail" : "pass",
    detail: networkError ?? `${responseMs}ms`,
  });
  checks.push({
    name: "HTTP 200 from Graph API",
    status: httpStatus === 200 ? "pass" : "fail",
    detail: `HTTP ${httpStatus || "—"}`,
  });
  checks.push({
    name: "No Graph API error object",
    status: !metaError ? "pass" : "fail",
    detail: metaError
      ? `(#${metaError.code}${metaError.error_subcode ? "/" + metaError.error_subcode : ""}) ${metaError.message}`
      : "clean",
  });
  checks.push({
    name: "Test event accepted by Meta (events_received ≥ 1)",
    status: eventsReceived >= 1 ? "pass" : (httpStatus === 200 && !metaError ? "skip" : "fail"),
    detail: `events_received=${eventsReceived}`,
  });

  // Update provenance with what Meta echoed back (Graph API echoes test_event_code
  // in the response when it routed the event to a Test Events session).
  const returnedTestCode: string | null =
    (metaJson?.test_event_code ?? metaJson?.messages?.[0]?.test_event_code ?? null) || null;
  const provenance = diagnostics.test_code_provenance as Record<string, unknown>;
  provenance.returned_by_meta = returnedTestCode;
  provenance.all_match =
    !!returnedTestCode &&
    returnedTestCode === testCode &&
    (!testCodeFromDb || testCodeFromDb === testCode);

  checks.push({
    name: "Test code echoed by Meta matches the one sent",
    status:
      returnedTestCode == null
        ? "skip"
        : returnedTestCode === testCode
        ? "pass"
        : "fail",
    detail:
      returnedTestCode == null
        ? "Meta did not echo a test_event_code in the response (this is normal for some API versions; rely on events_received and Events Manager → Test Events)."
        : returnedTestCode === testCode
        ? `matches "${testCode}"`
        : `sent "${testCode}" but Meta echoed "${returnedTestCode}"`,
  });

  // Structured server log (NO access token, NO PII) — payload echoed for audit;
  // payload contains only test data (no PII).
  const maskedPayload = JSON.parse(JSON.stringify(payload));
  console.log(JSON.stringify({
    fn: "meta-capi-test",
    request_id: requestId,
    endpoint: requestUrl,
    method: "POST",
    api_version: API_VERSION,
    pixel_id: pixelId,
    test_event_code_sent: testCode,
    test_event_code_returned: returnedTestCode,
    outbound_payload: maskedPayload,
    http_status: httpStatus,
    response_time_ms: responseMs,
    events_received: eventsReceived,
    fbtrace_id: metaJson?.fbtrace_id ?? null,
    meta_response_body: metaJson,
    error: metaError ?? null,
    total_ms: Date.now() - t0,
    timestamp: new Date().toISOString(),
  }));


  const ok = httpStatus === 200 && eventsReceived >= 1 && !metaError;
  const warn = httpStatus === 200 && eventsReceived === 0 && !metaError;
  const status = ok ? "ok" : warn ? "warning" : "failed";

  // ── Post-send "visibility verification" stage ─────────────────────────
  //
  // Meta DOES NOT expose a public Graph API endpoint that returns the
  // contents of a Test Events session (no GET /{pixel}/test_events).
  // We wait briefly to allow propagation, then return an honest visibility
  // verdict instead of fabricating a "visible" status we cannot prove.
  //
  // Three distinct stages a developer must understand:
  //   1. Accepted by CAPI ........ events_received >= 1, no error (we verify)
  //   2. Visible in Test Events .. only confirmable in Events Manager UI (we DO NOT)
  //   3. Processed into reporting  24–48h aggregation pipeline      (we DO NOT)
  if (ok) {
    await new Promise((r) => setTimeout(r, 3000)); // give Meta ~3s to propagate
  }
  const visibility = {
    stage_1_accepted_by_capi: ok,
    stage_2_visible_in_test_events: null as boolean | null,   // not programmatically verifiable
    stage_3_processed_into_reporting: null as boolean | null, // 24–48h aggregation
    verifiable_via_graph_api: false,
    propagation_window_seconds: [5, 30] as [number, number],
    reason:
      "Meta's Graph API does not expose a public endpoint that returns Test Events session contents " +
      "(no GET /{dataset_id}/test_events). events_received ≥ 1 with no error is the strongest server-side " +
      "confirmation available. Final visibility must be confirmed in Events Manager → Test Events.",
    open_in_events_manager_url: pixelId
      ? `https://business.facebook.com/events_manager2/list/dataset/${pixelId}/test_events`
      : null,
  };

  const failingCheck = checks.find((c) => c.status === "fail");
  const message = ok
    ? `✅ Stage 1: Event accepted by Meta CAPI (events_received=${eventsReceived}). ` +
      `⚠️ Stage 2: Visibility in Events Manager → Test Events cannot be confirmed programmatically — ` +
      `Meta provides no Graph API endpoint for that. Open Test Events for dataset ${pixelId} (code "${testCode}") to confirm.`
    : warn
    ? "⚠️ Meta returned HTTP 200 but did not report any events received. Verify the Test event code in Events Manager → Test Events."
    : metaError
    ? `❌ Meta rejected the test event: (#${metaError.code}${metaError.error_subcode ? "/" + metaError.error_subcode : ""}) ${metaError.error_user_msg || metaError.message}. ` +
      `This typically means the Access Token isn't a Conversions API token for Dataset ${pixelId}, or the token was generated under a different Business/Dataset. ` +
      `Regenerate the token in Events Manager → Settings → Conversions API → Generate access token for THIS dataset.`
    : networkError
    ? `❌ Network error contacting Meta: ${networkError}`
    : failingCheck
    ? `❌ ${failingCheck.name} — ${failingCheck.detail}`
    : `❌ Test failed (HTTP ${httpStatus}).`;

  const fullDiagnostics = {
    ...diagnostics,
    checks,
    visibility,
    request: {
      url: requestUrl,           // token NOT in URL
      method: "POST",
      api_version: API_VERSION,
      // payload echoed back so admin can inspect what we sent; no secrets in it
      payload,
    },
    response: {
      http_status: httpStatus,
      response_time_ms: responseMs,
      body: metaJson,
      fbtrace_id: metaJson?.fbtrace_id ?? null,
    },
    meta_error: metaError
      ? {
          message: metaError.message ?? null,
          type: metaError.type ?? null,
          code: metaError.code ?? null,
          error_subcode: metaError.error_subcode ?? null,
          error_user_title: metaError.error_user_title ?? null,
          error_user_msg: metaError.error_user_msg ?? null,
          fbtrace_id: metaJson?.fbtrace_id ?? null,
        }
      : null,
  };


  const row = {
    platform: "facebook",
    status,
    pixel_id: pixelId,
    business_name: null, // unavailable to dataset tokens; intentionally not fetched
    api_version: API_VERSION,
    http_status: httpStatus,
    events_received: eventsReceived,
    test_event_code: testCode,
    message,
    diagnostics: fullDiagnostics,
    tested_at: new Date().toISOString(),
    tested_by: auth.userId,
  };
  await persistResult(row);

  return respond({ status, ...row });
});
