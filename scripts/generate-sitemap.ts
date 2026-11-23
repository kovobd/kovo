// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://gothicvault.shop";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/shop", changefreq: "daily", priority: "0.9" },
  { path: "/reviews", changefreq: "weekly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.5" },
  { path: "/policies", changefreq: "monthly", priority: "0.4" },
  { path: "/track-order", changefreq: "monthly", priority: "0.3" },
];

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);

  const entries: SitemapEntry[] = [];

  const { data: products } = await supabase
    .from("products")
    .select("slug, id, updated_at, status")
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  for (const p of products ?? []) {
    const slug = (p as any).slug || (p as any).id;
    if (!slug) continue;
    entries.push({
      path: `/product/${slug}`,
      lastmod: (p as any).updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name, updated_at, enabled")
    .eq("enabled", true);
  for (const c of categories ?? []) {
    const slug = (c as any).slug;
    if (!slug) continue;
    entries.push({
      path: `/shop?category=${encodeURIComponent(slug)}`,
      lastmod: (c as any).updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.7",
    });
  }

  const { data: policies } = await supabase
    .from("policies")
    .select("slug, id, updated_at")
    .eq("enabled", true);
  for (const p of policies ?? []) {
    const slug = (p as any).slug || (p as any).id;
    if (!slug) continue;
    entries.push({
      path: `/policies/${slug}`,
      lastmod: (p as any).updated_at?.slice(0, 10),
      changefreq: "monthly",
      priority: "0.4",
    });
  }

  return entries;
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  let dynamic: SitemapEntry[] = [];
  try {
    dynamic = await fetchDynamicEntries();
  } catch (e) {
    console.warn("sitemap: failed to fetch dynamic entries, falling back to static only", e);
  }
  const all = [...staticEntries, ...dynamic];
  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(all));
  console.log(`sitemap.xml written (${all.length} entries)`);
}

main();