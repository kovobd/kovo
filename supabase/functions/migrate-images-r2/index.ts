// supabase/functions/migrate-images-r2/index.ts
//
// Admin-only batch image migrator: scans every image column in the DB,
// copies each legacy image into R2 with a stable object key, and rewrites
// the DB column to `r2o:{objectKey}`.
//
// Designed to be called repeatedly from the admin UI; each call processes
// a small batch and returns progress so the browser can show a live bar
// and resume if interrupted. Skips already-migrated rows automatically.
//
// POST body: { batchSize?: number, mode?: "process" | "audit" }
// Returns:   { processed, migrated, failed, remaining, totalLegacy, totalMigrated,
//              perTable, errors, done }

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { getR2Config } from "../_shared/serviceSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BATCH_SIZE = 10;
const R2_PROBE_CACHE_MS = 30_000;
const textEncoder = new TextEncoder();

type WorkItem = { table: string; col: string; prefix: string; id: string; url: string };
type PerTable = { target: string; legacy: number; migrated: number; empty: number };
type R2Health = { ok: boolean; message: string };

const TARGETS: { table: string; col: string; prefix: string }[] = [
  { table: "product_media", col: "image_url", prefix: "products" },
  { table: "product_variants", col: "image_url", prefix: "variants" },
  { table: "hero_slides", col: "image_url", prefix: "hero" },
  { table: "categories", col: "image_url", prefix: "categories" },
  { table: "categories", col: "featured_image_url", prefix: "categories" },
  { table: "featured_categories", col: "image_url", prefix: "featured" },
  { table: "testimonials", col: "image_url", prefix: "testimonials" },
  { table: "testimonials", col: "main_image_url", prefix: "testimonials" },
  { table: "video_testimonials", col: "thumbnail_url", prefix: "video-thumbs" },
  { table: "floating_icons", col: "icon_url", prefix: "floating-icons" },
  { table: "floating_icons_settings", col: "expand_icon_url", prefix: "floating-icons" },
  { table: "brands", col: "logo_url", prefix: "brands" },
  { table: "offers", col: "banner_image", prefix: "offers" },
  { table: "design_settings", col: "logo_desktop_url", prefix: "branding" },
  { table: "design_settings", col: "logo_mobile_url", prefix: "branding" },
  { table: "design_settings", col: "logo_footer_url", prefix: "branding" },
  { table: "design_settings", col: "favicon_url", prefix: "branding" },
  { table: "invoice_settings", col: "logo_url", prefix: "branding" },
];

async function r2Runtime() {
  const cfg = await getR2Config();
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  const aws = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return { cfg, endpoint, aws };
}

let cachedR2Health: { checkedAt: number; value: R2Health } | null = null;

async function r2ObjectUrl(key: string) {
  const { cfg, endpoint } = await r2Runtime();
  return `${endpoint}/${cfg.bucket}/${key}`;
}

function summarizeR2Error(text: string, status?: number) {
  const code = text.match(/<Code>([^<]+)<\/Code>/i)?.[1];
  const message = text.match(/<Message>([^<]+)<\/Message>/i)?.[1];
  if (code === "SignatureDoesNotMatch") {
    return "Cloudflare R2 rejected the configured S3 credentials (SignatureDoesNotMatch). Replace R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY with a fresh R2 API token pair.";
  }
  if (code && message) return `${code}: ${message}`;
  if (message) return message;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned || `R2 request failed${status ? ` (${status})` : ""}`;
}

async function ensureR2Available(force = false): Promise<R2Health> {
  const { cfg, aws } = await r2Runtime();
  if (!cfg.accountId || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    return {
      ok: false,
      message: "R2 credentials are missing. Configure them in Settings → API Keys.",
    };
  }

  const now = Date.now();
  if (!force && cachedR2Health && now - cachedR2Health.checkedAt < R2_PROBE_CACHE_MS) {
    return cachedR2Health.value;
  }

  const probeKey = `__migration_probe__/${crypto.randomUUID()}`;
  try {
    const res = await aws.fetch(await r2ObjectUrl(probeKey), { method: "HEAD" });
    const value = [200, 404].includes(res.status)
      ? { ok: true, message: "R2 ready" }
      : {
          ok: false,
          message: summarizeR2Error(await res.text().catch(() => ""), res.status),
        };
    cachedR2Health = { checkedAt: now, value };
    return value;
  } catch (error) {
    const value = {
      ok: false,
      message: `R2 connectivity check failed: ${String((error as Error)?.message || error)}`,
    };
    cachedR2Health = { checkedAt: now, value };
    return value;
  }
}

async function putR2(key: string, body: Uint8Array, contentType: string) {
  const { aws } = await r2Runtime();
  const res = await aws.fetch(await r2ObjectUrl(key), {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(summarizeR2Error(text, res.status));
  }
}

async function r2ObjectExists(key: string) {
  const { aws } = await r2Runtime();
  const res = await aws.fetch(await r2ObjectUrl(key), { method: "HEAD" });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(summarizeR2Error(await res.text().catch(() => ""), res.status));
}

function sniffMime(bytes: Uint8Array, fallback: string): string {
  if (bytes.length >= 4) {
    const [a, b, c, d] = bytes;
    if (a === 0xff && b === 0xd8) return "image/jpeg";
    if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return "image/png";
    if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return "image/webp";
  }
  return fallback;
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

async function hashSourceUrl(url: string) {
  const digest = await crypto.subtle.digest("SHA-1", textEncoder.encode(url));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveObjectKey(url: string, prefix: string, mime: string) {
  return `${prefix}/${await hashSourceUrl(url)}.${extFromMime(mime)}`;
}

async function processAndUpload(url: string, prefix: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = ct.startsWith("image/") ? ct.split(";")[0].trim().toLowerCase() : sniffMime(bytes, "image/jpeg");
  const objectKey = await deriveObjectKey(url, prefix, mime);
  if (await r2ObjectExists(objectKey)) return objectKey;
  await putR2(objectKey, bytes, mime);
  return objectKey;
}

const isMigrated = (v: unknown) => typeof v === "string" && (v.startsWith("r2:") || v.startsWith("r2o:"));
const isHttp = (v: unknown) => typeof v === "string" && /^https?:\/\//i.test(v);

async function gatherCounts(admin: ReturnType<typeof createClient>) {
  const perTable: PerTable[] = [];
  let totalLegacy = 0;
  let totalMigrated = 0;

  for (const target of TARGETS) {
    let legacy = 0;
    let migrated = 0;
    let empty = 0;

    let offset = 0;
    while (true) {
      const { data } = await admin.from(target.table).select(`id,${target.col}`).range(offset, offset + 999);
      const rows = (data as Record<string, unknown>[]) ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const value = row[target.col];
        if (!value) empty++;
        else if (isMigrated(value)) migrated++;
        else if (isHttp(value)) legacy++;
        else empty++;
      }

      if (rows.length < 1000) break;
      offset += 1000;
    }

    perTable.push({ target: `${target.table}.${target.col}`, legacy, migrated, empty });
    totalLegacy += legacy;
    totalMigrated += migrated;
  }

  return { perTable, totalLegacy, totalMigrated };
}

async function findBatch(admin: ReturnType<typeof createClient>, limit: number) {
  const work: WorkItem[] = [];
  for (const target of TARGETS) {
    if (work.length >= limit) break;
    let offset = 0;
    while (work.length < limit) {
      const { data } = await admin.from(target.table).select(`id,${target.col}`).range(offset, offset + 199);
      const rows = (data as Record<string, string>[]) ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const value = row[target.col];
        if (isHttp(value) && !isMigrated(value)) {
          work.push({ table: target.table, col: target.col, prefix: target.prefix, id: row.id, url: value });
          if (work.length >= limit) break;
        }
      }

      if (rows.length < 200 || work.length >= limit) break;
      offset += 200;
    }
  }
  return work;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authErr } = await user.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("is_admin_or_staff", { _user_id: claims.claims.sub });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "process");
    const batchSize = Math.max(1, Math.min(Number(body?.batchSize ?? 1), MAX_BATCH_SIZE));

    if (mode === "audit") {
      const [counts, r2Health] = await Promise.all([gatherCounts(admin), ensureR2Available()]);
      return new Response(JSON.stringify({ mode: "audit", ...counts, r2Health, done: counts.totalLegacy === 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r2Health = await ensureR2Available(true);
    if (!r2Health.ok) {
      const counts = await gatherCounts(admin);
      return new Response(JSON.stringify({
        mode: "process",
        processed: 0,
        migrated: 0,
        failed: 0,
        remaining: counts.totalLegacy,
        totalMigrated: counts.totalMigrated,
        perTable: counts.perTable,
        errors: [],
        fatalError: r2Health.message,
        r2Health,
        done: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batch = await findBatch(admin, batchSize);
    const errors: { id: string; target: string; message: string }[] = [];
    let migrated = 0;
    let failed = 0;

    for (const item of batch) {
      try {
        const objectKey = await processAndUpload(item.url, item.prefix);
        const { error: updateError } = await admin.from(item.table).update({ [item.col]: `r2o:${objectKey}` }).eq("id", item.id);
        if (updateError) throw updateError;
        migrated++;
      } catch (error) {
        failed++;
        const message = String((error as Error)?.message || error);
        errors.push({ id: item.id, target: `${item.table}.${item.col}`, message });
        console.error(`[migrate] ${item.table}.${item.col}#${item.id} failed:`, error);
      }
    }

    const counts = await gatherCounts(admin);
    return new Response(JSON.stringify({
      mode: "process",
      processed: batch.length,
      migrated,
      failed,
      remaining: counts.totalLegacy,
      totalMigrated: counts.totalMigrated,
      perTable: counts.perTable,
      errors,
      r2Health,
      done: counts.totalLegacy === 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[migrate-images-r2] error", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
