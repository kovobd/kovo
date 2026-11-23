// Shared helper: read service credentials from the DB (admin-editable) with
// a fallback to Deno env vars. This lets the admin API Keys page override
// credentials at runtime without needing a Supabase Management token.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

type ServiceName = "r2" | "bdcourier";

let cache: Record<string, { values: Record<string, string>; at: number }> = {};
const TTL_MS = 15_000;

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function loadServiceValues(service: ServiceName): Promise<Record<string, string>> {
  const cached = cache[service];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.values;
  try {
    const { data } = await admin()
      .from("service_credentials")
      .select("values")
      .eq("service", service)
      .maybeSingle();
    const values = (data?.values ?? {}) as Record<string, string>;
    cache[service] = { values, at: Date.now() };
    return values;
  } catch {
    return {};
  }
}

export async function getR2Config() {
  const db = await loadServiceValues("r2");
  return {
    accountId: db.R2_ACCOUNT_ID || Deno.env.get("R2_ACCOUNT_ID") || "",
    bucket: db.R2_BUCKET || Deno.env.get("R2_BUCKET") || "",
    accessKeyId: db.R2_ACCESS_KEY_ID || Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: db.R2_SECRET_ACCESS_KEY || Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
    publicBaseUrl: (db.R2_PUBLIC_BASE_URL || Deno.env.get("R2_PUBLIC_BASE_URL") || "").replace(/\/+$/, ""),
  };
}

export async function getBdCourierKey(): Promise<string> {
  const db = await loadServiceValues("bdcourier");
  return (db.BDCOURIER_API_KEY || Deno.env.get("BDCOURIER_API_KEY") || "").trim();
}

export function clearServiceCache(service?: ServiceName) {
  if (service) delete cache[service]; else cache = {};
}
