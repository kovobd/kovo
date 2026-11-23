// Read-only storefront queries served from the Worker's edge cache at
// /api/public/rest/<table>?<query> (worker/index.ts) instead of each visitor
// asking Supabase (Seoul) directly. The Worker also embeds the ones a page
// needs into its HTML, so those pages render without waiting for a request.
//
// Pure module (no app imports): the Worker and the app both use it, and the
// cache key / embedded-data key is restKey(query), so they must agree.
//
// Only tables whose changes bump public.storefront_version may be listed
// (migrations 20261123130000 and 20261124120000), or the cache could serve
// data the admin has already changed. Queries are plain PostgREST syntax.

export const REST_QUERIES = {
  about: "about_sections?select=id,enabled,content,sort_order&order=sort_order.asc",
  contact:
    "contact_settings?select=id,page_title,page_intro,phone_number,email_address,show_address,business_address," +
    "phone_field_enabled,submit_button_text,social_section_enabled,social_links,faq_shortcut_enabled," +
    "faq_shortcut_items,map_enabled,map_embed&id=eq.default",
  policies: "policies?select=id,title,slug,content,sort_order,enabled&enabled=eq.true&order=sort_order.asc",
  siteReviews: "site_reviews?select=*,media:site_review_media(*)&is_visible=eq.true&order=sort_order.asc,created_at.desc",
  reviewHero: "review_hero_settings?select=headline,subtitle,avatars&id=eq.1",
  paymentSettings: "payment_settings?select=methods&id=eq.default",
  deliveryZones:
    "delivery_zones?select=id,name,zone_name,areas,delivery_charge,shipping_cost,free_delivery_minimum," +
    "free_shipping_threshold,estimated_days,enabled,sort_order&enabled=eq.true&order=sort_order.asc",
  productOffers:
    "product_offers?select=id,product_id,offer_type,buy_quantity,get_quantity,discount_value,free_product_id," +
    "free_variant_id,target_variant_ids,display_text,enabled,min_cart_total,sort_order&enabled=eq.true&order=sort_order.asc&limit=500",
} as const;

/** Tables the Worker will serve through /api/public/rest/. */
export const REST_TABLES: ReadonlySet<string> = new Set(
  Object.values(REST_QUERIES).map((q) => q.slice(0, q.indexOf("?"))),
);

/** Canonical form of a query (parameters sorted): the cache and embedded-data key. */
export function restKey(query: string): string {
  const i = query.indexOf("?");
  if (i < 0) return query;
  const params = [...new URLSearchParams(query.slice(i + 1)).entries()].sort(([a], [b]) => a.localeCompare(b));
  return `${query.slice(0, i)}?${new URLSearchParams(params).toString()}`;
}

/** The queries a page needs on first render, which the Worker embeds in its HTML. */
export function restQueriesForPath(pathname: string): string[] {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/about") return [REST_QUERIES.about];
  if (p === "/contact") return [REST_QUERIES.contact];
  if (p === "/policies" || p.startsWith("/policies/")) return [REST_QUERIES.policies];
  if (p === "/reviews") return [REST_QUERIES.siteReviews, REST_QUERIES.reviewHero];
  if (p === "/cart") return [REST_QUERIES.deliveryZones, REST_QUERIES.productOffers];
  if (p === "/checkout") return [REST_QUERIES.paymentSettings, REST_QUERIES.deliveryZones, REST_QUERIES.productOffers];
  return [];
}
