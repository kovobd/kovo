// Shared helpers for cached public JSON edge functions.
// ETag + stale-while-revalidate, CORS, and request coalescing-friendly headers.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, if-none-match",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function cachedJson(
  req: Request,
  data: unknown,
  opts: { sMaxAge?: number; maxAge?: number; swr?: number } = {},
): Promise<Response> {
  const body = JSON.stringify({ data, cachedAt: new Date().toISOString() });
  const hash = (await sha1Hex(body)).slice(0, 16);
  const etag = `W/"${hash}"`;
  const ifNoneMatch = req.headers.get("if-none-match");

  const sMaxAge = opts.sMaxAge ?? 300;
  const maxAge = opts.maxAge ?? 60;
  const swr = opts.swr ?? 86400;

  // When both maxAge and sMaxAge are 0, force per-request revalidation via ETag
  // (response body is only re-sent when content changes → 304 otherwise).
  const cacheControl =
    maxAge === 0 && sMaxAge === 0
      ? "public, max-age=0, must-revalidate"
      : `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;

  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": `public, s-maxage=${sMaxAge}`,
    Vary: "Accept-Encoding, If-None-Match",
    ETag: etag,
  };

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

export function errorJson(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
