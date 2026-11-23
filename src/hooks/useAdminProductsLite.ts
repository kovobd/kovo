import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

/**
 * Shared lightweight admin product list.
 *
 * Used by Admin → Orders, POS, and Offer Manager. Each page previously
 * issued its own `select(...).from("products")` query on mount, which meant
 * three independent reads of the full products table per admin session
 * (no cache sharing between routes). This hook consolidates them into a
 * single React Query entry so the three pages share one cache.
 *
 * The column set is the SUPERSET of what the three pages need. Bytes per
 * row are unchanged from what Orders/POS were already pulling individually,
 * and downstream code can keep using the field names it already uses.
 *
 *   Orders → id, name, price, sale_price, stock, category_id, brand_id
 *   POS    → id, name, price, sale_price, stock, sku, category_id
 *   Offers → id, name
 */
export type AdminProductLite = {
  id: string;
  name: string;
  price: number | null;
  sale_price: number | null;
  stock: number | null;
  sku: string | null;
  category_id: string | null;
  brand_id: string | null;
};

export const ADMIN_PRODUCTS_LITE_KEY = ["admin", "products-lite"] as const;

const COLUMNS = "id, name, price, sale_price, stock, sku, category_id, brand_id";

export async function fetchAdminProductsLite(): Promise<AdminProductLite[]> {
  const { data, error } = await supabase
    .from("products")
    .select(COLUMNS)
    .order("name");
  if (error) throw error;
  return (data ?? []) as AdminProductLite[];
}

/**
 * Returns cached rows when fresh (<60s old), otherwise fetches once and
 * primes the shared cache. Safe to call from non-component contexts.
 */
export function ensureAdminProductsLite(): Promise<AdminProductLite[]> {
  return queryClient.ensureQueryData({
    queryKey: ADMIN_PRODUCTS_LITE_KEY,
    queryFn: fetchAdminProductsLite,
    staleTime: 60_000,
  });
}

export function useAdminProductsLite() {
  return useQuery({
    queryKey: ADMIN_PRODUCTS_LITE_KEY,
    queryFn: fetchAdminProductsLite,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
