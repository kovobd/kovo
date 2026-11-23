// supabase/functions/r2-cleanup-worker/index.ts
//
// Drains public.r2_deletion_queue and deletes each queued object from
// Cloudflare R2. Invoked by pg_cron every minute (see migration). Idempotent:
// the worker atomically claims a batch via r2_claim_queue_batch() so multiple
// invocations never delete the same object twice, and R2 returns 204/404 for
// "already gone" which is treated as success.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { requireWorkerSecret } from "../_shared/workerAuth.ts";
import { getR2Config } from "../_shared/serviceSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function r2Client() {
  const cfg = await getR2Config();
  return {
    cfg,
    aws: new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: "s3",
      region: "auto",
    }),
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
  };
}

function refToKey(ref: string): string | null {
  if (typeof ref !== "string") return null;
  if (ref.startsWith("r2o:")) return ref.slice(4);
  if (ref.startsWith("r2:")) return `${ref.slice(3)}-original.jpg`;
  return null;
}

async function deleteR2(key: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const { cfg, aws, endpoint } = await r2Client();
  const res = await aws.fetch(`${endpoint}/${cfg.bucket}/${encodeURI(key)}`, { method: "DELETE" });
  if (res.ok || res.status === 204 || res.status === 404) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, error: text.slice(0, 300) };
}

// Best-effort: also try deleting the legacy multi-variant siblings so a `r2:` base
// doesn't leave behind 400/800/1600 AVIF/WebP/JPG renditions.
const LEGACY_SUFFIXES = [
  "-original.jpg",
  "-1600.avif","-1600.webp","-1600.jpg",
  "-800.avif","-800.webp","-800.jpg",
  "-400.avif","-400.webp","-400.jpg",
];

async function deleteLegacyVariants(base: string) {
  await Promise.allSettled(
    LEGACY_SUFFIXES.map((s) => deleteR2(`${base}${s}`)),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow either: (a) cron/worker secret header, or (b) authenticated admin/staff JWT
  // (for manual "Run worker now" trigger from the admin UI).
  const hasWorkerSecret = !!(req.headers.get("x-worker-secret") || req.headers.get("X-Worker-Secret"));
  if (hasWorkerSecret) {
    const authFail = await requireWorkerSecret(req, corsHeaders);
    if (authFail) return authFail;
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("is_admin_or_staff", { _user_id: claimsData.claims.sub });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }




  const _r2cfg = await getR2Config();
  if (!_r2cfg.accountId || !_r2cfg.bucket || !_r2cfg.accessKeyId || !_r2cfg.secretAccessKey) {
    return new Response(JSON.stringify({ error: "r2_not_configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "100")));

  const { data: claimed, error: claimErr } = await admin.rpc("r2_claim_queue_batch", { _limit: limit });
  if (claimErr) {
    console.error("[r2-cleanup-worker] claim failed", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (claimed ?? []) as { id: number; ref: string }[];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ processed: 0, failed: 0 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const processedIds: number[] = [];
  let failed = 0;

  for (const row of rows) {
    const key = refToKey(row.ref);
    if (!key) {
      // Invalid ref shape — mark processed to avoid retry forever.
      processedIds.push(row.id);
      continue;
    }
    try {
      // Skip if another row still references this asset (shared media).
      const { data: stillUsed } = await admin.rpc("r2_ref_in_use", { _ref: row.ref });
      if (stillUsed === true) {
        processedIds.push(row.id);
        continue;
      }
      const result = await deleteR2(key);
      if (row.ref.startsWith("r2:")) {
        // legacy: also nuke variant siblings
        await deleteLegacyVariants(row.ref.slice(3));
      }
      if (result.ok) {
        processedIds.push(row.id);
      } else {
        failed++;
        await admin.rpc("r2_mark_failed", { _id: row.id, _err: `${result.status}: ${result.error ?? ""}` });
      }
    } catch (e) {
      failed++;
      await admin.rpc("r2_mark_failed", { _id: row.id, _err: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }

  if (processedIds.length > 0) {
    await admin.rpc("r2_mark_processed", { _ids: processedIds });
  }

  return new Response(JSON.stringify({ processed: processedIds.length, failed }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
