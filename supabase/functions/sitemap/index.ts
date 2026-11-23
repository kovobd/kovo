// Always-fresh sitemap.xml — reflects current DB state on every request.
// No rebuild required after creating/editing/deleting products, categories, policies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_URL = Deno.env.get("SITEMAP_BASE_URL") || "https://gothicvault.shop";

const xmlHeaders = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=600",
  "Access-Control-Allow-Origin": "*",
};

type Entry = { path: string; lastmod?: string; changefreq?: string; priority?: string };

const staticEntries: Entry[] = [
  { path: "/",            changefreq: "weekly",  priority: "1.0" },
  { path: "/shop",        changefreq: "daily",   priority: "0.9" },
  { path: "/reviews",     changefreq: "weekly",  priority: "0.6" },
  { path: "/about",       changefreq: "monthly", priority: "0.6" },
  { path: "/contact",     changefreq: "monthly", priority: "0.5" },
  { path: "/policies",    changefreq: "monthly", priority: "0.4" },
  { path: "/track-order", changefreq: "monthly", priority: "0.3" },
];

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function render(entries: Entry[]) {
  const urls = entries.map((e) => {
    const parts = [
      `    <loc>${xmlEscape(BASE_URL + e.path)}</loc>`,
      e.lastmod    ? `    <lastmod>${e.lastmod}</lastmod>` : "",
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
      e.priority   ? `    <priority>${e.priority}</priority>` : "",
    ].filter(Boolean).join("\n");
    return `  <url>\n${parts}\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: xmlHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(url, key);

  const entries: Entry[] = [...staticEntries];

  try {
    const [{ data: products }, { data: categories }, { data: policies }] = await Promise.all([
      supabase.from("products")
        .select("slug, id, updated_at, status")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(5000),
      supabase.from("categories")
        .select("slug, updated_at, enabled")
        .eq("enabled", true)
        .limit(500),
      supabase.from("policies")
        .select("slug, id, updated_at, enabled")
        .eq("enabled", true)
        .limit(200),
    ]);

    for (const p of products ?? []) {
      const slug = (p as any).slug || (p as any).id;
      if (!slug) continue;
      entries.push({
        path: `/product/${slug}`,
        lastmod: (p as any).updated_at,
        changefreq: "weekly",
        priority: "0.8",
      });
    }
    for (const c of categories ?? []) {
      const slug = (c as any).slug;
      if (!slug) continue;
      entries.push({
        path: `/shop?category=${encodeURIComponent(slug)}`,
        lastmod: (c as any).updated_at,
        changefreq: "daily",
        priority: "0.9",
      });
    }
    for (const p of policies ?? []) {
      const slug = (p as any).slug || (p as any).id;
      if (!slug) continue;
      entries.push({
        path: `/policies/${slug}`,
        lastmod: (p as any).updated_at,
        changefreq: "monthly",
        priority: "0.4",
      });
    }
  } catch (e) {
    console.error("sitemap dynamic fetch failed", e);
  }

  return new Response(render(entries), { headers: xmlHeaders });
});
