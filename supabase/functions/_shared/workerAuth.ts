// Shared worker-secret authentication for background Edge Functions invoked
// by pg_cron or trusted server-to-server callers. The secret is stored in
// public.worker_secrets (name = 'worker_cron_secret') and sent as the
// `X-Worker-Secret` request header. Falls back to the WORKER_SECRET env var
// so a deployment can rotate secrets without touching the database.

import { createClient } from "npm:@supabase/supabase-js@2";

let cached: { secret: string; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadDbSecret(): Promise<string | null> {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("worker_secrets")
      .select("secret")
      .eq("name", "worker_cron_secret")
      .maybeSingle();
    return (data?.secret as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns a Response (401) when the request lacks a valid worker secret.
 * Returns null when the caller is authorized.
 */
export async function requireWorkerSecret(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const provided = req.headers.get("x-worker-secret") || req.headers.get("X-Worker-Secret");
  if (!provided) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const envSecret = Deno.env.get("WORKER_SECRET") || "";
  let dbSecret = "";
  if (!cached || Date.now() - cached.ts > CACHE_TTL_MS) {
    dbSecret = (await loadDbSecret()) || "";
    cached = { secret: dbSecret, ts: Date.now() };
  } else {
    dbSecret = cached.secret;
  }

  const valid = (envSecret && timingSafeEqual(provided, envSecret)) ||
                (dbSecret && timingSafeEqual(provided, dbSecret));
  if (!valid) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
