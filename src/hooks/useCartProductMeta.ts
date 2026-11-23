import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabaseLazy";

export type CartProductMeta = {
  names: Record<string, string>;
  prices: Record<string, number>;
  images: Record<string, string>;
};

/**
 * Shared React Query cache for the lightweight `products` + `product_media`
 * lookup used by Cart and Checkout summaries. The key is the sorted list of
 * product IDs so cache hits cross-page (Cart -> Checkout) as long as the cart
 * + applicable offers reference the same products.
 */
export const cartProductMetaKey = (ids: string[]) =>
  ["public", "cart-product-meta", ids.slice().sort().join(",")] as const;

async function fetchCartProductMeta(ids: string[]): Promise<CartProductMeta> {
  if (!ids.length) return { names: {}, prices: {}, images: {} };
  const supabase = await getSupabase();
  const [{ data }, { data: media }] = await Promise.all([
    supabase.from("products").select("id, name, price, sale_price").in("id", ids),
    supabase
      .from("product_media")
      .select("product_id, image_url, sort_order")
      .in("product_id", ids)
      .is("variant_id", null)
      .order("sort_order"),
  ]);
  const names: Record<string, string> = {};
  const prices: Record<string, number> = {};
  const images: Record<string, string> = {};
  (media ?? []).forEach((m: any) => {
    if (!images[m.product_id]) images[m.product_id] = m.image_url;
  });
  (data ?? []).forEach((p: any) => {
    names[p.id] = p.name;
    prices[p.id] = Number(p.sale_price ?? p.price ?? 0);
  });
  return { names, prices, images };
}

export function useCartProductMeta(ids: string[]) {
  const qc = useQueryClient();
  // Pre-warm: when one of Cart/Checkout has resolved the same id set, the other
  // page renders from cache immediately.
  return useQuery<CartProductMeta>({
    queryKey: cartProductMetaKey(ids),
    queryFn: () => fetchCartProductMeta(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    // Keep the cache hot across mounts
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
