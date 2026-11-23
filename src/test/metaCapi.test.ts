import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("public Meta CAPI endpoint", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => name === "CAPI_ALLOWED_ORIGINS" ? "https://gothicvault.shop" : "test-value" },
      serve: (callback: typeof handler) => { handler = callback; },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", {
      headers: { "Content-Type": "application/json" },
    })));
    // Keep Deno-only modules out of the browser TypeScript dependency graph.
    const edgeModule = "../../supabase/functions/meta-capi/index.ts";
    await import(/* @vite-ignore */ edgeModule);
  });

  afterEach(() => vi.unstubAllGlobals());

  const request = (eventName = "PageView", origin = "https://gothicvault.shop") => new Request("https://example.test/meta-capi", {
    method: "POST",
    headers: { apikey: "sb_publishable_test", origin, "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: eventName, event_id: "regression-event" }),
  });

  it("accepts a signed-out publishable-key request without a bearer JWT", async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: true, reason: "CAPI not configured or disabled" });
  });

  it("still rejects origins outside the configured allowlist", async () => {
    const response = await handler(request("PageView", "https://other.test"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden_origin" });
  });

  it("still rejects unsupported events", async () => {
    const response = await handler(request("NotAnEvent"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unsupported event_name" });
  });
});