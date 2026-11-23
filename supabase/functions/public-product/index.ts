import { createClient } from "npm:@supabase/supabase-js@2";
import { cachedJson, errorJson, handlePreflight } from "../_shared/respond.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchImages(ids: string[]) {
  if (!ids.length) return {} as Record<string, string[]>;
  const { data } = await supabase
    .from("product_media")
    .select("product_id, image_url, sort_order, variant_id")
    .in("product_id", ids)
    .is("variant_id", null)
    .order("sort_order");
  const map: Record<string, string[]> = {};
  ((data as any[]) ?? []).forEach((r) => { (map[r.product_id] ||= []).push(r.image_url); });
  return map;
}

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
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return errorJson("slug required", 400);

    let { data: prod } = await supabase.from("products").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
    if (!prod) {
      const res = await supabase.from("products").select("*").eq("id", slug).eq("status", "active").maybeSingle();
      prod = res.data;
    }
    if (!prod) return errorJson("not found", 404);

    const isUUID = UUID_RE.test(prod.id);

    const [tabs, faqs, offers, reviews, cat, brand, related, variants, zones, shop, why, details] = await Promise.all([
      isUUID ? supabase.from("product_tabs").select("id, title, content, display_style, sort_order").eq("product_id", prod.id).order("sort_order") : Promise.resolve({ data: [] }),
      isUUID ? supabase.from("product_faqs").select("id, question, answer, sort_order").eq("product_id", prod.id).order("sort_order") : Promise.resolve({ data: [] }),
      isUUID ? supabase.from("product_offers").select("*").eq("product_id", prod.id).eq("enabled", true).order("sort_order") : Promise.resolve({ data: [] }),
      isUUID ? supabase.from("reviews").select("id, customer_name, rating, comment, review, created_at").eq("product_id", prod.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      prod.category_id ? supabase.from("categories").select("name").eq("id", prod.category_id).maybeSingle() : Promise.resolve({ data: null }),
      prod.brand_id ? supabase.from("brands").select("name").eq("id", prod.brand_id).maybeSingle() : Promise.resolve({ data: null }),
      prod.category_id && isUUID
        ? supabase.from("products").select("id, name, slug, price, sale_price, base_price, compare_price, stock, rating, review_count, category_id, option_groups, show_offers, show_shipping_info, show_stock_status, featured, best_seller, is_new_arrival").eq("category_id", prod.category_id).eq("status", "active").neq("id", prod.id).limit(4)
        : Promise.resolve({ data: [] }),
      isUUID ? supabase.from("product_variants").select("*").eq("product_id", prod.id).eq("active", true).order("sort_order") : Promise.resolve({ data: [] }),
      supabase.from("delivery_zones").select("*").eq("enabled", true).order("sort_order"),
      supabase.from("shop_settings").select("pdp_show_shipment_details, pdp_show_why_choose_us").eq("id", "default").maybeSingle(),
      supabase.from("why_choose_us_cards").select("id, title, description, icon_name, sort_order").order("sort_order"),
      isUUID ? supabase.from("product_details").select("id, label, value, sort_order").eq("product_id", prod.id).order("sort_order") : Promise.resolve({ data: [] }),
    ]);

    const relatedRaw = (related.data as any[]) ?? [];
    const relatedIds = relatedRaw.map((r) => r.id);
    const imgMap = await fetchImages([prod.id, ...relatedIds]);

    // Fetch related variant rows for price-range + aggregate stock display.
    let relatedVariantRanges: Record<string, { min: number; max: number; origMin: number; origMax: number }> = {};
    let relatedVariantStock: Record<string, number> = {};
    let relatedVariantRows: Record<string, any[]> = {};
    if (relatedIds.length > 0) {
      const { data: rv } = await supabase
        .from("product_variants")
        .select("product_id, price, sale_price, stock, active, option_values, image_url")
        .in("product_id", relatedIds)
        .eq("active", true);
      ((rv as any[]) ?? []).forEach((r) => {
        (relatedVariantRows[r.product_id] ||= []).push(r);
        const p = Number(r.price ?? 0);
        const eff = r.sale_price != null && Number(r.sale_price) > 0 && Number(r.sale_price) < p
          ? Number(r.sale_price) : p;
        const cur = relatedVariantRanges[r.product_id];
        if (!cur) relatedVariantRanges[r.product_id] = { min: eff, max: eff, origMin: p, origMax: p };
        else {
          cur.min = Math.min(cur.min, eff); cur.max = Math.max(cur.max, eff);
          cur.origMin = Math.min(cur.origMin, p); cur.origMax = Math.max(cur.origMax, p);
        }
        relatedVariantStock[r.product_id] = (relatedVariantStock[r.product_id] ?? 0) + Number(r.stock ?? 0);
      });
    }


    return await cachedJson(req, {
      product: { ...prod, option_groups: enrichOptionGroups(prod.option_groups, (variants.data as any[]) ?? []), images: imgMap[prod.id] ?? [] },
      categoryName: (cat.data as any)?.name ?? "",
      brandName: (brand.data as any)?.name ?? "",
      tabs: (tabs.data ?? []) as any[],
      faqs: faqs.data ?? [],
      productOffers: offers.data ?? [],
      reviews: reviews.data ?? [],
      productDetails: details.data ?? [],
      related: relatedRaw.map((r) => ({
        ...r,
        option_groups: enrichOptionGroups(r.option_groups, relatedVariantRows[r.id] ?? []),
        images: imgMap[r.id] ?? [],
        // If a product uses variants, surface aggregate variant stock so the card
        // doesn't show "Sold out" based on the product-level stock column alone.
        stock: relatedVariantStock[r.id] != null
          ? Math.max(Number(r.stock ?? 0), relatedVariantStock[r.id])
          : r.stock,
        _variantPriceMin: relatedVariantRanges[r.id]?.min ?? null,
        _variantPriceMax: relatedVariantRanges[r.id]?.max ?? null,
        _variantOrigPriceMin: relatedVariantRanges[r.id]?.origMin ?? null,
        _variantOrigPriceMax: relatedVariantRanges[r.id]?.origMax ?? null,
        _variantStockTotal: relatedVariantStock[r.id] ?? null,

      })),
      deliveryZones: zones.data ?? [],
      showShipmentDetails: ((shop.data as any)?.pdp_show_shipment_details !== false),
      showWhyChooseUs: ((shop.data as any)?.pdp_show_why_choose_us !== false),
      whyCards: why.data ?? [],
      variants: ((variants.data ?? []) as any[]).map((r) => ({
        id: r.id,
        product_id: r.product_id,
        option_values: (r.option_values || {}),
        price: Number(r.price ?? 0),
        sale_price: r.sale_price != null ? Number(r.sale_price) : null,
        stock: Number(r.stock ?? 0),
        sku: r.sku ?? "",
        active: r.active !== false,
        sort_order: Number(r.sort_order ?? 0),
        image_url: r.image_url ?? null,
      })),
    }, { sMaxAge: 120, swr: 86400 });
  } catch (e) {
    return errorJson((e as Error).message);
  }
});
