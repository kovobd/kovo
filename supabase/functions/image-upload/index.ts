// supabase/functions/image-upload/index.ts
//
// Admin-only image uploader. Stores the original bytes directly to
// Cloudflare R2 via the S3 API and returns `r2o:{objectKey}` so the
// frontend serves it via the CDN with no further processing.
//
// NOTE: Server-side variant generation (AVIF/WebP/JPG at 400/800/1600)
// was removed because WASM decode+resize+encode reliably exceeded the
// edge function's 2s CPU limit (WORKER_RESOURCE_LIMIT). Browsers handle
// scaling client-side; if multi-format variants are needed later, do it
// in a background worker or via Cloudflare Image Resizing.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { getR2Config } from "../_shared/serviceSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function r2() {
  const cfg = await getR2Config();
  return {
    cfg,
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    aws: new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: "s3",
      region: "auto",
    }),
  };
}

const SUPPORTED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

async function putR2(key: string, body: Uint8Array, contentType: string) {
  const { cfg, endpoint, aws } = await r2();
  const url = `${endpoint}/${cfg.bucket}/${key}`;
  const res = await aws.fetch(url, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${text}`);
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getR2(key: string) {
  const { cfg, endpoint, aws } = await r2();
  const url = `${endpoint}/${cfg.bucket}/${key}`;
  const res = await aws.fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 GET ${key} failed: ${res.status} ${text}`);
  }
  return res;
}

async function deleteR2(key: string) {
  const { cfg, endpoint, aws } = await r2();
  const url = `${endpoint}/${cfg.bucket}/${key}`;
  const res = await aws.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 DELETE ${key} failed: ${res.status} ${text}`);
  }
}

// Legacy multi-variant siblings that may exist alongside an r2: base.
const LEGACY_SUFFIXES = [
  "-original.jpg",
  "-1600.avif","-1600.webp","-1600.jpg",
  "-800.avif","-800.webp","-800.jpg",
  "-400.avif","-400.webp","-400.jpg",
];

async function deleteAllForRef(ref: string) {
  if (ref.startsWith("r2o:")) {
    await deleteR2(ref.slice(4));
    return;
  }
  if (ref.startsWith("r2:")) {
    const base = ref.slice(3);
    await Promise.allSettled(LEGACY_SUFFIXES.map((s) => deleteR2(`${base}${s}`)));
  }
}

function getObjectKeyFromRef(ref: string): string | null {
  if (ref.startsWith("r2o:")) return ref.slice(4);
  if (ref.startsWith("r2:")) return `${ref.slice(3)}-original.jpg`;
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const _cfg = await getR2Config();
    if (!_cfg.accountId || !_cfg.bucket || !_cfg.accessKeyId || !_cfg.secretAccessKey) {
      return new Response(JSON.stringify({ error: "r2_not_configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin } = await admin.rpc("is_admin_or_staff", { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    if (body?.action === "read") {
      const ref = String(body?.ref || "");
      const objectKey = getObjectKeyFromRef(ref);
      if (!objectKey) {
        return new Response(JSON.stringify({ error: "invalid_ref" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const object = await getR2(objectKey);
      const contentType = object.headers.get("Content-Type") || "image/jpeg";
      const bytes = new Uint8Array(await object.arrayBuffer());
      return new Response(
        JSON.stringify({ dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body?.action === "usage" || body?.action === "delete") {
      const ref = String(body?.ref || "");
      const objectKey = getObjectKeyFromRef(ref);
      if (!objectKey) {
        return new Response(JSON.stringify({ error: "invalid_ref" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Always check usage first via SECURITY DEFINER RPC.
      // Must use the user-scoped client — the RPC checks auth.uid() internally,
      // which is NULL when invoked via the service_role admin client.
      const { data: usage, error: usageErr } = await supabase.rpc("find_media_usage", { _ref: ref });
      if (usageErr) throw usageErr;
      const usageArr = Array.isArray(usage) ? usage : [];

      if (body?.action === "usage") {
        return new Response(JSON.stringify({ usage: usageArr }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // delete
      const force = body?.force === true;
      if (usageArr.length > 0 && !force) {
        await admin.from("media_audit_log").insert({
          ref, object_key: objectKey, action: "delete", success: false,
          error_message: "in_use", usage: usageArr, performed_by: userId,
        });
        return new Response(JSON.stringify({
          error: "in_use",
          message: "This media asset is currently in use and cannot be deleted.",
          usage: usageArr,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Force delete: unlink DB references first so no row points at a missing R2 object.
      // Run this for every forced delete, even if the usage scan returns empty,
      // so newly added/JSON-backed reference paths are still scrubbed safely.
      let unlinkCounts: Record<string, number> | null = null;
      if (force) {
        const { data: counts, error: unlinkErr } = await supabase.rpc("unlink_media_references", { _ref: ref });
        if (unlinkErr) {
          await admin.from("media_audit_log").insert({
            ref, object_key: objectKey, action: "delete", success: false,
            error_message: `unlink_failed: ${unlinkErr.message}`, usage: usageArr, performed_by: userId,
          });
          return new Response(JSON.stringify({ error: "unlink_failed", message: unlinkErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        unlinkCounts = (counts as Record<string, number>) || null;
      }

      try {
        await deleteAllForRef(ref);
        await admin.from("media_audit_log").insert({
          ref, object_key: objectKey, action: "delete", success: true,
          usage: usageArr, performed_by: userId,
        });
        return new Response(JSON.stringify({ ok: true, objectKey, unlinked: unlinkCounts }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (delErr) {
        const msg = String((delErr as Error)?.message || delErr);
        console.error("[image-upload] R2 delete failed", msg);
        await admin.from("media_audit_log").insert({
          ref, object_key: objectKey, action: "delete", success: false,
          error_message: msg, usage: usageArr, performed_by: userId,
        });
        return new Response(JSON.stringify({ error: "r2_delete_failed", message: msg }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    const prefix: string = String(body?.prefix || "uploads").replace(/[^a-z0-9/_-]/gi, "");
    const rawMime = String(body?.mime || "image/jpeg").toLowerCase();
    const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
    const base64: string = String(body?.data || "");

    if (!base64) {
      return new Response(JSON.stringify({ error: "missing_data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!SUPPORTED_MIMES.has(mime)) {
      return new Response(JSON.stringify({ error: "unsupported_mime", mime }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode base64 → bytes
    const bin = atob(base64.includes(",") ? base64.split(",")[1] : base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const ext = EXT_FOR_MIME[mime] ?? "bin";
    const objectKey = `${prefix}/${crypto.randomUUID()}.${ext}`;
    await putR2(objectKey, bytes, mime);

    // Best-effort CDN probe only. Do not block the upload response here: R2 public
    // endpoints can lag briefly after PUT, and waiting/failing here leaves the UI
    // sitting at the finalizing/progress phase even though the object is stored.
    const publicBase = ((await getR2Config()).publicBaseUrl || "").replace(/\/+$/, "");
    if (publicBase) {
      try {
        const probe = await fetchWithTimeout(`${publicBase}/${objectKey}`, { method: "HEAD" }, 2_000);
        if (!probe.ok) {
          console.warn("[image-upload] public CDN probe failed after upload", probe.status, objectKey);
        }
      } catch (probeErr) {
        console.warn("[image-upload] public probe error", probeErr);
      }
    }

    // r2o: ref → frontend serves the original directly via the CDN.
    return new Response(
      JSON.stringify({ baseKey: objectKey, ref: `r2o:${objectKey}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[image-upload] error", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
