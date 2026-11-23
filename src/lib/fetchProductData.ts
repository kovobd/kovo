import { PublicApi } from "@/lib/publicApi";
import type { Product } from "@/types/database";
import type { VariantRow } from "@/lib/variants";

// Thin wrapper that hits the cached public-product edge function.
// `version` is an opaque cache buster (products.updated_at) so the CDN cache
// invalidates per-product when the product (or its variants / media) changes.
export async function fetchProductData(slug: string, version?: string) {
  const data: any = await PublicApi.product(slug, version);
  if (!data?.product) return null;

  return {
    product: data.product as Product,
    categoryName: data.categoryName ?? "",
    brandName: data.brandName ?? "",
    tabs: data.tabs ?? [],
    faqs: data.faqs ?? [],
    productOffers: data.productOffers ?? [],
    reviews: data.reviews ?? [],
    productDetails: (data.productDetails ?? []) as { id: string; label: string; value: string; sort_order: number }[],
    related: (data.related ?? []) as (Product & { _variantPriceMin?: number | null; _variantPriceMax?: number | null; _variantOrigPriceMin?: number | null; _variantOrigPriceMax?: number | null })[],
    deliveryZones: data.deliveryZones ?? [],
    showShipmentDetails: data.showShipmentDetails !== false,
    showWhyChooseUs: data.showWhyChooseUs !== false,
    whyCards: data.whyCards ?? [],
    variantRows: ((data.variants ?? []) as any[]).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      option_values: r.option_values || {},
      price: Number(r.price ?? 0),
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      stock: Number(r.stock ?? 0),
      sku: r.sku ?? "",
      active: r.active !== false,
      sort_order: Number(r.sort_order ?? 0),
      image_url: r.image_url ?? null,
    })) as VariantRow[],
  };
}

export type ProductPageData = NonNullable<Awaited<ReturnType<typeof fetchProductData>>>;
