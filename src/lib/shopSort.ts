// Sort keys shared by the admin "Default sorting" setting and the shop page.
export type ShopSort = "featured" | "newest" | "price-asc" | "price-desc";

const LEGACY: Record<string, ShopSort> = {
  price_low: "price-asc",
  price_high: "price-desc",
};

/** Maps any stored value (including older admin values) to a shop sort key. */
export function normalizeSort(value: unknown): ShopSort {
  const v = String(value ?? "");
  if (v === "featured" || v === "newest" || v === "price-asc" || v === "price-desc") return v;
  return LEGACY[v] ?? "featured";
}
