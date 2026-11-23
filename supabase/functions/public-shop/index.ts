import { createClient } from "npm:@supabase/supabase-js@2";
import { cachedJson, errorJson, handlePreflight } from "../_shared/respond.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const COLS =
  "id, name, slug, price, sale_price, base_price, compare_price, stock, rating, review_count, category_id, brand_id, option_groups, show_offers, show_shipping_info, show_stock_status, featured, best_seller, is_new_arrival, sort_order, created_at, updated_at";

function enrichOptionGroups(rawGroups: any, rows: any[] = []) {
  const hasPersistedGroups = Array.isArray(rawGroups) && rawGroups.length > 0;
  const groups = hasPersistedGroups
    ? rawGroups
    : Object.entries(
        rows.reduce((acc: Record<string, Set<string>>, row) => {
          Object.entries(row?.option_values ?? {}).forEach(([key, value]) => {
            const clean = String(value ?? "").trim();
            if (!key || !clean) return;
            (acc[key] ||= new Set<string>()).add(clean);
          });
          return acc;
        }, {}),
      ).map(([name, values]) => ({ name, values: [...values], type: "text", show_on_card: true }));
  if (!groups.length) return groups;
  return groups.map((group: any) => {
    const name = String(group?.name ?? "").trim();
    const values = Array.isArray(group?.values) ? group.values.map((v: any) => String(v ?? "").trim()).filter(Boolean) : [];
    if (!name || !values.length) return group;
    const imageUrlMap = { ...(group.image_url_map && typeof group.image_url_map === "object" ? group.image_url_map : {}) };
    for (const value of values) {
      if (imageUrlMap[value]) continue;
      const match = rows.find((r) => r?.active !== false && r?.option_values?.[name] === value && r?.image_url);
      if (match?.image_url) imageUrlMap[value] = match.image_url;
    }
    const hasImages = Object.keys(imageUrlMap).length > 0;
    const useImageSwatches = group?.type === "image" || (groups.length === 1 && hasImages);
    return { ...group, type: useImageSwatches ? "image" : group?.type, image_url_map: imageUrlMap };
  });
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return errorJson("method not allowed", 405);

  try {
    // Single cached payload of every published product (capped).
    // Client filters/sorts in-memory for snappy UX. Free-tier friendly:
    // one ~50-200KB JSON, fully edge-cached for 5 min.
    const { data: products } = await supabase
      .from("products")
      .select(COLS)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = (products as any[]) ?? [];
    const ids = rows.map((r) => r.id);

    const [{ data: media }, { data: variants }] = await Promise.all([
      ids.length
        ? supabase.from("product_media").select("product_id, image_url, sort_order, variant_id").in("product_id", ids).is("variant_id", null).order("sort_order")
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase.from("product_variants").select("product_id, price, sale_price, stock, active, option_values, image_url").in("product_id", ids).eq("active", true)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const imgMap: Record<string, string[]> = {};
    ((media as any[]) ?? []).forEach((r) => { (imgMap[r.product_id] ||= []).push(r.image_url); });

    const rangeMap: Record<string, { min: number; max: number; origMin: number; origMax: number }> = {};
    const stockMap: Record<string, number> = {};
    const hasVariantMap: Record<string, boolean> = {};
    const variantsByProduct: Record<string, any[]> = {};
    ((variants as any[]) ?? []).forEach((r) => {
      (variantsByProduct[r.product_id] ||= []).push(r);
      hasVariantMap[r.product_id] = true;
      stockMap[r.product_id] = (stockMap[r.product_id] ?? 0) + Number(r.stock ?? 0);
      const p = Number(r.price ?? 0);
      const sp = r.sale_price != null ? Number(r.sale_price) : null;
      const eff = sp != null && sp > 0 && sp < p ? sp : p;
      const cur = rangeMap[r.product_id];
      if (!cur) rangeMap[r.product_id] = { min: eff, max: eff, origMin: p, origMax: p };
      else {
        if (eff < cur.min) cur.min = eff;
        if (eff > cur.max) cur.max = eff;
        if (p < cur.origMin) cur.origMin = p;
        if (p > cur.origMax) cur.origMax = p;
      }
    });


    const items = rows.map((r) => ({
      ...r,
      option_groups: enrichOptionGroups(r.option_groups, variantsByProduct[r.id] ?? []),
      images: imgMap[r.id] ?? [],
      // If this product has variants, use the sum of variant stock as the
      // effective stock so list/card views don't show "Sold out" when at
      // least one variant has inventory.
      stock: hasVariantMap[r.id] ? stockMap[r.id] : r.stock,
    }));

    return await cachedJson(req, {
      products: items,
      variantRanges: rangeMap,
    }, { sMaxAge: 180, maxAge: 60, swr: 86400 });
  } catch (e) {
    return errorJson((e as Error).message);
  }
});
