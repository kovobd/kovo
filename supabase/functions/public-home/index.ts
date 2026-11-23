import { createClient } from "npm:@supabase/supabase-js@2";
import { cachedJson, errorJson, handlePreflight } from "../_shared/respond.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PRODUCT_CARD_COLS =
  "id, name, slug, price, sale_price, base_price, compare_price, stock, rating, review_count, category_id, brand_id, option_groups, show_offers, show_shipping_info, show_stock_status, featured, best_seller, is_new_arrival";

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

async function attachImages<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return rows.map((r) => ({ ...r, images: [] as string[] }));
  const ids = rows.map((r) => r.id);
  const { data } = await supabase
    .from("product_media")
    .select("product_id, image_url, sort_order, variant_id")
    .in("product_id", ids)
    .is("variant_id", null)
    .order("sort_order");
  const map: Record<string, string[]> = {};
  ((data as any[]) ?? []).forEach((r) => {
    (map[r.product_id] ||= []).push(r.image_url);
  });
  return rows.map((r) => ({ ...r, images: map[r.id] ?? [] }));
}

async function variantRanges(ids: string[]) {
  if (!ids.length) return { ranges: {} as Record<string, { min: number; max: number; origMin: number; origMax: number }>, stock: {} as Record<string, number>, rowsByProduct: {} as Record<string, any[]> };
  const { data } = await supabase
    .from("product_variants")
    .select("product_id, price, sale_price, stock, active, option_values, image_url")
    .in("product_id", ids)
    .eq("active", true);
  const ranges: Record<string, { min: number; max: number; origMin: number; origMax: number }> = {};
  const stock: Record<string, number> = {};
  const rowsByProduct: Record<string, any[]> = {};
  ((data as any[]) ?? []).forEach((r) => {
    (rowsByProduct[r.product_id] ||= []).push(r);
    stock[r.product_id] = (stock[r.product_id] ?? 0) + Number(r.stock ?? 0);
    const p = Number(r.price ?? 0);
    const sp = r.sale_price != null ? Number(r.sale_price) : null;
    const eff = sp != null && sp > 0 && sp < p ? sp : p;
    const cur = ranges[r.product_id];
    if (!cur) ranges[r.product_id] = { min: eff, max: eff, origMin: p, origMax: p };
    else {
      if (eff < cur.min) cur.min = eff;
      if (eff > cur.max) cur.max = eff;
      if (p < cur.origMin) cur.origMin = p;
      if (p > cur.origMax) cur.origMax = p;
    }
  });
  return { ranges, stock, rowsByProduct };
}


Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return errorJson("method not allowed", 405);

  try {
    const [hero, heroSettings, sections, featured, bestSellers, featCats, testimonials, faqs, why, reels, offers] = await Promise.all([
      supabase.from("hero_slides").select("id, image_url, mobile_image_url, headline, subheadline, button1_text, button1_link, button2_text, button2_link, image_click_link, interaction_mode, sort_order").eq("enabled", true).order("sort_order"),
      supabase.from("hero_settings").select("*").eq("id", "default").maybeSingle(),
      supabase.from("homepage_sections").select("id, enabled, content, sort_order").order("sort_order"),
      supabase.from("products").select(PRODUCT_CARD_COLS).eq("featured", true).eq("status", "active").order("sort_order").limit(8),
      supabase.from("products").select(PRODUCT_CARD_COLS).eq("best_seller", true).eq("status", "active").order("sort_order").limit(8),
      supabase.from("featured_categories").select("id, category_id, title, sort_order, categories:category_id(image_url, name)").eq("enabled", true).order("sort_order"),
      supabase.from("testimonials").select("id, name, review, rating, image_url, main_image_url, sort_order").order("sort_order"),
      supabase.from("home_faqs").select("id, question, answer, sort_order").order("sort_order"),
      supabase.from("why_choose_us_cards").select("id, title, description, icon_name, sort_order").order("sort_order"),
      supabase.from("video_testimonials").select("*").eq("enabled", true).order("sort_order"),
      supabase.from("offers").select("id, name, discount_type, discount_value, apply_to, target_ids, banner_image, start_date, end_date").eq("enabled", true),
    ]);

    const [featuredImgs, bestImgs] = await Promise.all([
      attachImages(((featured.data as any[]) ?? [])),
      attachImages(((bestSellers.data as any[]) ?? [])),
    ]);
    const allIds = [...featuredImgs, ...bestImgs].map((p) => p.id);
    const { ranges, stock: variantStockMap, rowsByProduct } = await variantRanges(allIds);
    // Override product.stock with summed variant stock when a product has variants,
    // so cards don't incorrectly show "Sold out".
    const applyVariantStock = (arr: any[]) => arr.map((p) =>
      ({
        ...p,
        option_groups: enrichOptionGroups(p.option_groups, rowsByProduct[p.id] ?? []),
        stock: variantStockMap[p.id] != null ? variantStockMap[p.id] : p.stock,
      })
    );
    const featuredFinal = applyVariantStock(featuredImgs);
    const bestFinal = applyVariantStock(bestImgs);

    // Reels: bolt product info (cheap, scoped).
    const reelRows = (reels.data as any[]) ?? [];
    const reelProductIds = [...new Set(reelRows.map((r) => r.product_id).filter(Boolean))];
    let reelMap: Record<string, any> = {};
    if (reelProductIds.length) {
      const { data: rp } = await supabase
        .from("products")
        .select("id, name, slug, price, sale_price")
        .in("id", reelProductIds);
      const withImgs = await attachImages(((rp as any[]) ?? []));
      reelMap = Object.fromEntries(
        withImgs.map((p: any) => [p.id, { ...p, image: p.images?.[0] ?? null }]),
      );
    }
    const enrichedReels = reelRows.map((r) => ({
      ...r,
      product: r.product_id ? reelMap[r.product_id] ?? null : null,
    }));

    // Filter active offers by date here so client doesn't need to.
    const now = Date.now();
    const activeOffers = ((offers.data as any[]) ?? []).filter((o) => {
      const start = o.start_date ? new Date(o.start_date).getTime() : -Infinity;
      const end = o.end_date ? new Date(o.end_date).getTime() : Infinity;
      return now >= start && now <= end;
    });

    return await cachedJson(req, {
      heroSlides: hero.data ?? [],
      heroSettings: heroSettings.data ?? null,
      sections: sections.data ?? [],
      featured: featuredFinal,
      bestSellers: bestFinal,
      variantRanges: ranges,
      featuredCategories: ((featCats.data as any[]) ?? []).map((r) => ({
        id: r.id,
        category_id: r.category_id,
        sort_order: r.sort_order,
        title: r.title || r.categories?.name || null,
        image_url: r.categories?.image_url ?? null,
      })),
      testimonials: testimonials.data ?? [],
      faqs: faqs.data ?? [],
      whyCards: why.data ?? [],
      reels: enrichedReels,
      activeOffers,
    }, { sMaxAge: 300, maxAge: 60, swr: 86400 });
  } catch (e) {
    return errorJson((e as Error).message);
  }
});
