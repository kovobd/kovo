// supabase/functions/r2-orphan-sweep/index.ts
//
// Periodic reconciliation between Cloudflare R2 and the database.
//
// Scans every object in the R2 bucket via ListObjectsV2, skips anything
// younger than the grace window (default 24h), then asks Postgres which
// of those refs are still referenced anywhere via `r2_refs_in_use(...)`.
// Any object that no DB row points to is considered an orphan: the R2
// key is enqueued into `r2_deletion_queue` with `source_table='orphan_sweep'`
// (the existing cleanup worker re-verifies usage and performs the actual
// DELETE, recording each step in `media_audit_log`).
//
// Run results are written to `r2_orphan_sweep_runs` so the admin
// R2 Cleanup Health dashboard can show last-run stats and orphan counts.
//
// Triggered manually from the admin dashboard ("Run sweep now") and
// automatically once per day by pg_cron.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireWorkerSecret } from "../_shared/workerAuth.ts";
import { AwsClient } from "npm:aws4fetch@1.0.20";
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

// Hard caps so a runaway sweep can never blow the function CPU/time limit.
const MAX_OBJECTS_PER_RUN = 20000;
const PAGE_SIZE = 1000;
const USAGE_BATCH = 500;
const DEFAULT_GRACE_HOURS = 24;

interface R2Object { key: string; lastModified: Date; size: number }

function xmlGet(xml: string, tag: string, from = 0): { value: string; end: number } | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const i = xml.indexOf(open, from);
  if (i < 0) return null;
  const j = xml.indexOf(close, i + open.length);
  if (j < 0) return null;
  return { value: xml.slice(i + open.length, j), end: j + close.length };
}

function parseListResult(xml: string): { objects: R2Object[]; isTruncated: boolean; nextToken: string | null } {
  const objects: R2Object[] = [];
  let cursor = 0;
  // Walk every <Contents> block in order.
  while (true) {
    const block = xmlGet(xml, "Contents", cursor);
    if (!block) break;
    cursor = block.end;
    const inner = block.value;
    const key = xmlGet(inner, "Key")?.value ?? "";
    const lm = xmlGet(inner, "LastModified")?.value ?? "";
    const sz = xmlGet(inner, "Size")?.value ?? "0";
    if (key) {
      objects.push({
        key: decodeXmlEntities(key),
        lastModified: new Date(lm),
        size: Number(sz) || 0,
      });
    }
  }
  const isTruncated = (xmlGet(xml, "IsTruncated")?.value ?? "false").toLowerCase() === "true";
  const nextToken = xmlGet(xml, "NextContinuationToken")?.value ?? null;
  return { objects, isTruncated, nextToken };
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function listAllObjects(maxObjects: number): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let token: string | null = null;
  const { cfg, aws, endpoint } = await r2Client();
  while (out.length < maxObjects) {
    const params = new URLSearchParams({
      "list-type": "2",
      "max-keys": String(Math.min(PAGE_SIZE, maxObjects - out.length)),
    });
    if (token) params.set("continuation-token", token);
    const url = `${endpoint}/${cfg.bucket}?${params.toString()}`;
    const res = await aws.fetch(url, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`R2 list failed: ${res.status} ${txt.slice(0, 300)}`);
    }
    const xml = await res.text();
    const { objects, isTruncated, nextToken } = parseListResult(xml);
    out.push(...objects);
    if (!isTruncated || !nextToken) break;
    token = nextToken;
  }
  return out;
}

/**
 * Build the candidate DB refs for an R2 object key. An object can be
 * referenced as either `r2o:{key}` (current originals) or, for legacy
 * uploads, by `r2:{base}` where {key} = `{base}-{size}.{ext}`.
 */
function candidateRefsForKey(key: string): string[] {
  const refs = [`r2o:${key}`];
  const m = key.match(/^(.+?)-(?:original|400|800|1600)\.(?:jpg|jpeg|webp|avif|png)$/i);
  if (m) refs.push(`r2:${m[1]}`);
  return refs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Dual auth: cron worker secret OR admin/staff JWT (manual trigger from admin UI).
  const hasWorkerSecret = !!(req.headers.get("x-worker-secret") || req.headers.get("X-Worker-Secret"));
  if (hasWorkerSecret) {
    const fail = await requireWorkerSecret(req, corsHeaders);
    if (fail) return fail;
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
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    }
  } catch { /* ignore */ }
  const pick = (k: string) => url.searchParams.get(k) ?? (body[k] as string | number | undefined);
  const graceHours = Math.max(
    0,
    Math.min(720, Number(pick("grace_hours") ?? DEFAULT_GRACE_HOURS)),
  );
  const dryRun = String(pick("dry_run") ?? "") === "1" || pick("dry_run") === true;
  const maxObjects = Math.max(
    100,
    Math.min(MAX_OBJECTS_PER_RUN, Number(pick("max_objects") ?? MAX_OBJECTS_PER_RUN)),
  );

  const startedAt = Date.now();
  const cutoff = new Date(Date.now() - graceHours * 3_600_000);

  let scanned = 0;
  let orphansFound = 0;
  let orphansQueued = 0;
  let errorMessage: string | null = null;

  try {
    // 1. List R2 objects.
    const all = await listAllObjects(maxObjects);

    // 2. Drop anything younger than the grace window (still mid-upload / mid-transaction).
    const eligible = all.filter((o) => o.lastModified.getTime() <= cutoff.getTime());
    scanned = all.length;

    if (eligible.length === 0) {
      const { data: runId } = await admin.rpc("r2_orphan_sweep_record", {
        _scanned: scanned,
        _orphans_found: 0,
        _orphans_queued: 0,
        _grace_hours: graceHours,
        _error: null,
      });
      return new Response(JSON.stringify({
        ok: true, run_id: runId, scanned, eligible: 0, orphans_found: 0, orphans_queued: 0,
        grace_hours: graceHours, duration_ms: Date.now() - startedAt,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Build candidate refs for each eligible object and ask the DB which
    //    of those refs are still referenced anywhere. Batched to avoid huge
    //    parameter arrays.
    const refsToCheck = new Set<string>();
    const keyToRefs = new Map<string, string[]>();
    for (const o of eligible) {
      const refs = candidateRefsForKey(o.key);
      keyToRefs.set(o.key, refs);
      for (const r of refs) refsToCheck.add(r);
    }

    const inUse = new Set<string>();
    const refsArr = [...refsToCheck];
    for (let i = 0; i < refsArr.length; i += USAGE_BATCH) {
      const slice = refsArr.slice(i, i + USAGE_BATCH);
      const { data, error } = await admin.rpc("r2_refs_in_use", { _refs: slice });
      if (error) throw new Error(`r2_refs_in_use failed: ${error.message}`);
      const used = (data ?? []) as string[];
      for (const r of used) inUse.add(r);
    }

    // 4. Anything where NONE of its candidate refs are in use is an orphan.
    const orphans: { key: string; ref: string }[] = [];
    for (const [key, refs] of keyToRefs) {
      if (refs.every((r) => !inUse.has(r))) {
        orphans.push({ key, ref: `r2o:${key}` });
      }
    }
    orphansFound = orphans.length;

    if (!dryRun && orphans.length > 0) {
      // 5. Enqueue every orphan ref into the existing cleanup queue. The
      //    worker re-runs r2_ref_in_use right before deleting and writes to
      //    media_audit_log, so we get one consistent audit trail.
      const rows = orphans.map((o) => ({
        ref: o.ref,
        source_table: "orphan_sweep",
        source_id: o.key,
      }));
      // Insert in chunks to stay well under any single-statement size limit.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error: insErr } = await admin.from("r2_deletion_queue").insert(slice);
        if (insErr) throw new Error(`enqueue failed: ${insErr.message}`);
        orphansQueued += slice.length;
      }

      // 6. Record the detection in media_audit_log immediately so admins
      //    can see *what* the sweep found even before the worker runs.
      const auditRows = orphans.map((o) => ({
        ref: o.ref,
        object_key: o.key,
        action: "orphan_detected",
        success: true,
        usage: [],
        performed_by: null as string | null,
        error_message: null as string | null,
      }));
      for (let i = 0; i < auditRows.length; i += CHUNK) {
        const slice = auditRows.slice(i, i + CHUNK);
        const { error: auditErr } = await admin.from("media_audit_log").insert(slice);
        if (auditErr) {
          // Audit-log writes are best-effort; don't fail the sweep over them.
          console.warn("[r2-orphan-sweep] audit insert warn", auditErr.message);
          break;
        }
      }
    }
  } catch (e) {
    errorMessage = String((e as Error)?.message ?? e).slice(0, 800);
    console.error("[r2-orphan-sweep] failed", errorMessage);
  }

  const { data: runId } = await admin.rpc("r2_orphan_sweep_record", {
    _scanned: scanned,
    _orphans_found: orphansFound,
    _orphans_queued: orphansQueued,
    _grace_hours: graceHours,
    _error: errorMessage,
  });

  return new Response(JSON.stringify({
    ok: errorMessage === null,
    run_id: runId,
    scanned,
    orphans_found: orphansFound,
    orphans_queued: orphansQueued,
    grace_hours: graceHours,
    dry_run: dryRun,
    error: errorMessage,
    duration_ms: Date.now() - startedAt,
  }), {
    status: errorMessage ? 500 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
