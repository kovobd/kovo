#!/usr/bin/env node
/**
 * Post-migration audit.
 *
 * Reports:
 *  - Image counts per table/column (migrated vs legacy)
 *  - Largest text/jsonb payloads still hitting Supabase
 *  - Estimated egress saved
 *
 * Run:  node scripts/audit-storage.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TARGETS = [
  ["product_media", "image_url"],
  ["product_variants", "image_url"],
  ["hero_slides", "image_url"],
  ["categories", "image_url"],
  ["categories", "featured_image_url"],
  ["featured_categories", "image_url"],
  ["testimonials", "image_url"],
  ["testimonials", "main_image_url"],
  ["video_testimonials", "thumbnail_url"],
  ["floating_icons", "icon_url"],
  ["floating_icons_settings", "expand_icon_url"],
  ["brands", "logo_url"],
  ["offers", "banner_image"],
  ["design_settings", "logo_desktop_url"],
  ["design_settings", "logo_mobile_url"],
  ["design_settings", "logo_footer_url"],
  ["design_settings", "favicon_url"],
  ["invoice_settings", "logo_url"],
];

const fmt = (n) => n.toString().padStart(5);

async function main() {
  console.log("\n=== R2 Migration Audit ===\n");
  let totalRows = 0, totalMigrated = 0, totalLegacy = 0;
  console.log(`${"TABLE.COLUMN".padEnd(40)} ${"ROWS".padStart(6)} ${"R2".padStart(6)} ${"LEGACY".padStart(7)} ${"EMPTY".padStart(6)}`);
  console.log("-".repeat(72));
  for (const [t, c] of TARGETS) {
    const { data, error } = await sb.from(t).select(c).limit(10000);
    if (error) { console.log(`${(t + "." + c).padEnd(40)} ERR ${error.message}`); continue; }
    let rows = 0, r2 = 0, legacy = 0, empty = 0;
    for (const row of data ?? []) {
      const v = row[c];
      rows++;
      if (!v) empty++;
      else if (typeof v === "string" && v.startsWith("r2:")) r2++;
      else legacy++;
    }
    totalRows += rows; totalMigrated += r2; totalLegacy += legacy;
    console.log(`${(t + "." + c).padEnd(40)} ${fmt(rows)} ${fmt(r2)} ${fmt(legacy)} ${fmt(empty)}`);
  }
  console.log("-".repeat(72));
  console.log(`${"TOTAL".padEnd(40)} ${fmt(totalRows)} ${fmt(totalMigrated)} ${fmt(totalLegacy)}`);

  console.log("\n=== Largest tables by row count ===\n");
  const big = ["products", "orders", "incomplete_orders", "admin_notifications", "customers", "product_offers", "reviews", "product_media"];
  for (const t of big) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t.padEnd(28)} ${String(count ?? "?").padStart(7)} rows`);
  }

  console.log("\n=== Estimated egress impact ===\n");
  // Heuristic: a typical product image (downsampled) was ~80 KB on Supabase,
  // multiplied by storefront page views. Each migrated row removes that egress.
  const avgImageBytes = 80 * 1024;
  const savedBytesPerView = totalMigrated * avgImageBytes;
  console.log(`  Migrated images:        ${totalMigrated}`);
  console.log(`  Remaining legacy:       ${totalLegacy}`);
  console.log(`  Est. saved per pageview: ${(savedBytesPerView / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Est. saved per 100k views: ${(savedBytesPerView * 100_000 / 1024 / 1024 / 1024).toFixed(2)} GB`);

  console.log("\n=== Remaining bottlenecks to watch ===\n");
  console.log("  1. orders.items JSONB grows linearly — already capped at .limit(500) in admin lists.");
  console.log("  2. incomplete_orders kept to 90 days via pg_cron; check size periodically.");
  console.log("  3. admin_notifications pruned via prune_admin_notifications() — verify cron is active.");
  console.log("  4. mv_orders_daily_90d refresh is the only sustained write — keep cron at 5 min.");
  console.log("  5. Realtime: only `admin_notifications` channel — confirm no other subscriptions added.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
