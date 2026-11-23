// BD Courier customer verification proxy
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dlog, derror } from "../_shared/log.ts";
import { getBdCourierKey } from "../_shared/serviceSecrets.ts";


const edgeCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...edgeCorsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: edgeCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    console.log("[bdcourier] incoming request", {
      method: req.method,
      hasAuth: authHeader.startsWith("Bearer "),
      origin: req.headers.get("origin"),
      userAgent: req.headers.get("user-agent"),
    });
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = await getBdCourierKey();

    if (!apiKey) return json({ error: "BDCOURIER_API_KEY not configured" }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimData, error: claimErr } = await userClient.auth.getClaims(token);
    if (claimErr || !claimData?.claims) {
      console.error("[bdcourier] getClaims failed", claimErr?.message || claimErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isStaff } = await admin.rpc("is_admin_or_staff", { _user_id: userId });
    if (!isStaff) {
      console.warn("[bdcourier] forbidden user", { userId });
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const phoneRaw = String(body?.phone || "").replace(/\D/g, "");
    const orderId = body?.order_id || null;
    if (!/^01[0-9]{9}$/.test(phoneRaw)) return json({ error: "Invalid phone" }, 400);

    console.log("[bdcourier] calling upstream", { phone: phoneRaw, orderId, keyLen: apiKey.length });

    let upstream: Response;
    try {
      upstream = await fetch("https://api.bdcourier.com/courier-check", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ phone: phoneRaw }),
      });
    } catch (netErr: any) {
      console.error("[bdcourier] network error", netErr?.message);
      return json({ error: "Unable to reach BD Courier", details: String(netErr?.message || netErr) }, 502);
    }

    const text = await upstream.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    console.log("[bdcourier] upstream response", upstream.status, text.slice(0, 400));

    if (!upstream.ok) {
      const msg = payload?.message || payload?.error || `BD Courier API ${upstream.status}`;
      return json({ error: msg, status: upstream.status, details: payload }, 502);
    }


    const data = payload?.data || {};
    const summary = data?.summary || {};
    const verdict = payload?.risk_verdict || {};
    const couriers: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "summary") continue;
      if (v && typeof v === "object") couriers[k] = v;
    }

    const { data: inserted, error: insertErr } = await admin
      .from("bdcourier_verifications")
      .insert({
        phone: phoneRaw,
        order_id: orderId,
        risk_level: payload?.risk_level || verdict?.level || null,
        risk_label: verdict?.label || null,
        recommendation: verdict?.action || null,
        success_ratio: payload?.success_ratio ?? summary?.success_ratio ?? null,
        fraud_report_count: payload?.fraud_report_count ?? 0,
        total_parcel: summary?.total_parcel ?? null,
        success_parcel: summary?.success_parcel ?? null,
        cancelled_parcel: summary?.cancelled_parcel ?? null,
        reasons: verdict?.reasons || [],
        couriers,
        raw: payload,
        checked_by: userId,
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message, payload }, 500);
    return json({ verification: inserted, payload });
  } catch (e: any) {
    console.error("[bdcourier] unexpected error", e?.message || e);
    return json({ error: e?.message || "Unexpected error" }, 500);
  }
});
