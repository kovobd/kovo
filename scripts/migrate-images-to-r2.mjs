#!/usr/bin/env node
/**
 * Migrate all image columns in Supabase to Cloudflare R2.
 *
 * - Downloads each legacy image (Supabase storage URL or other http(s))
 * - Encodes 6 variants (AVIF/WebP @ 400/800/1600) + original JPG via `sharp`
 * - Uploads all 7 objects to R2 via aws4fetch (S3 API)
 * - Updates the source row's column with `r2:{baseKey}`
 * - Resumable via `scripts/.r2-migration-state.json`
 *
 * Run:  node scripts/migrate-images-to-r2.mjs
 *
 * Required env (read from .env or shell):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_BASE_URL
 *
 * Optional:   --dry  → log without uploading or updating DB
 *             --only=products,hero_slides  → restrict targets
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".r2-migration-state.json");

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const ONLY = [...args].find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const R2_ENDPOINT = `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
const R2_BUCKET = env("R2_BUCKET");
const R2_BASE = env("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
const aws = new AwsClient({
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});

const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { done: {} };
const saveState = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

const VARIANT_WIDTHS = [400, 800, 1600];
const stats = { migrated: 0, skipped: 0, failed: 0, bytesUploaded: 0 };

async function putR2(key, body, contentType) {
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
  const res = await aws.fetch(url, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) throw new Error(`R2 PUT ${key} → ${res.status} ${await res.text()}`);
  stats.bytesUploaded += body.length;
}

async function uploadVariants(buf, baseKey) {
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");

  // Original backup (normalized JPG)
  const origJpg = await sharp(buf).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  await putR2(`${baseKey}-original.jpg`, origJpg, "image/jpeg");

  for (const w of VARIANT_WIDTHS) {
    const targetW = Math.min(w, meta.width);
    const pipeline = sharp(buf).rotate().resize({ width: targetW, withoutEnlargement: true });
    const [avif, webp, jpg] = await Promise.all([
      pipeline.clone().avif({ quality: 50, effort: 4 }).toBuffer(),
      pipeline.clone().webp({ quality: 78 }).toBuffer(),
      pipeline.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
    ]);
    await Promise.all([
      putR2(`${baseKey}-${w}.avif`, avif, "image/avif"),
      putR2(`${baseKey}-${w}.webp`, webp, "image/webp"),
      putR2(`${baseKey}-${w}.jpg`, jpg, "image/jpeg"),
    ]);
  }
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isMigrated(v) {
  return typeof v === "string" && (v.startsWith("r2:") || v.startsWith(R2_BASE));
}

/** A single column on a table. */
async function migrateScalarColumn({ table, idCol = "id", col, prefix }) {
  if (ONLY && !ONLY.includes(table)) return;
  console.log(`\n— ${table}.${col} —`);
  const { data, error } = await sb.from(table).select(`${idCol},${col}`).limit(10000);
  if (error) throw error;
  for (const row of data ?? []) {
    const url = row[col];
    if (!url || isMigrated(url)) { stats.skipped++; continue; }
    const stateKey = `${table}:${col}:${row[idCol]}`;
    if (state.done[stateKey]) { stats.skipped++; continue; }

    try {
      const baseKey = `${prefix}/${crypto.randomUUID()}`;
      const buf = await fetchBytes(url);
      if (!DRY) {
        await uploadVariants(buf, baseKey);
        const { error: upErr } = await sb.from(table).update({ [col]: `r2:${baseKey}` }).eq(idCol, row[idCol]);
        if (upErr) throw upErr;
      }
      state.done[stateKey] = baseKey;
      saveState();
      stats.migrated++;
      console.log(`  ✓ ${row[idCol]} → r2:${baseKey}`);
    } catch (e) {
      stats.failed++;
      console.error(`  ✗ ${row[idCol]}: ${e.message}`);
    }
  }
}

/** Array column (e.g. images[] on products is via product_media table). */
async function migrateArrayColumn({ table, idCol = "id", col, prefix }) {
  if (ONLY && !ONLY.includes(table)) return;
  console.log(`\n— ${table}.${col} (array) —`);
  const { data, error } = await sb.from(table).select(`${idCol},${col}`).limit(10000);
  if (error) throw error;
  for (const row of data ?? []) {
    const arr = row[col];
    if (!Array.isArray(arr) || arr.length === 0) { stats.skipped++; continue; }
    const next = [];
    let changed = false;
    for (const url of arr) {
      if (!url || isMigrated(url)) { next.push(url); continue; }
      try {
        const baseKey = `${prefix}/${crypto.randomUUID()}`;
        const buf = await fetchBytes(url);
        if (!DRY) await uploadVariants(buf, baseKey);
        next.push(`r2:${baseKey}`);
        changed = true;
        stats.migrated++;
      } catch (e) {
        stats.failed++;
        next.push(url);
        console.error(`  ✗ ${row[idCol]} img: ${e.message}`);
      }
    }
    if (changed && !DRY) {
      const { error: upErr } = await sb.from(table).update({ [col]: next }).eq(idCol, row[idCol]);
      if (upErr) { stats.failed++; console.error(`  ✗ update ${row[idCol]}: ${upErr.message}`); }
    }
  }
}

const TARGETS = [
  { kind: "scalar", table: "product_media", col: "image_url", prefix: "products" },
  { kind: "scalar", table: "product_variants", col: "image_url", prefix: "variants" },
  { kind: "scalar", table: "hero_slides", col: "image_url", prefix: "hero" },
  { kind: "scalar", table: "categories", col: "image_url", prefix: "categories" },
  { kind: "scalar", table: "categories", col: "featured_image_url", prefix: "categories" },
  { kind: "scalar", table: "featured_categories", col: "image_url", prefix: "featured" },
  { kind: "scalar", table: "testimonials", col: "image_url", prefix: "testimonials" },
  { kind: "scalar", table: "testimonials", col: "main_image_url", prefix: "testimonials" },
  { kind: "scalar", table: "video_testimonials", col: "thumbnail_url", prefix: "video-thumbs" },
  { kind: "scalar", table: "floating_icons", col: "icon_url", prefix: "floating-icons" },
  { kind: "scalar", table: "floating_icons_settings", col: "expand_icon_url", prefix: "floating-icons" },
  { kind: "scalar", table: "brands", col: "logo_url", prefix: "brands" },
  { kind: "scalar", table: "offers", col: "banner_image", prefix: "offers" },
  { kind: "scalar", table: "design_settings", col: "logo_desktop_url", prefix: "branding" },
  { kind: "scalar", table: "design_settings", col: "logo_mobile_url", prefix: "branding" },
  { kind: "scalar", table: "design_settings", col: "logo_footer_url", prefix: "branding" },
  { kind: "scalar", table: "design_settings", col: "favicon_url", prefix: "branding" },
  { kind: "scalar", table: "invoice_settings", col: "logo_url", prefix: "branding" },
];

async function main() {
  console.log(`Migrating images to R2 ${DRY ? "(DRY RUN)" : ""}`);
  for (const t of TARGETS) {
    try {
      if (t.kind === "scalar") await migrateScalarColumn(t);
      else await migrateArrayColumn(t);
    } catch (e) {
      console.error(`Target ${t.table}.${t.col} failed:`, e.message);
    }
  }
  console.log("\n=== Summary ===");
  console.log(`Migrated: ${stats.migrated}`);
  console.log(`Skipped:  ${stats.skipped}`);
  console.log(`Failed:   ${stats.failed}`);
  console.log(`Uploaded: ${(stats.bytesUploaded / 1024 / 1024).toFixed(2)} MB to R2`);
}

main().catch((e) => { console.error(e); process.exit(1); });
