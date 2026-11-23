import { publicRest } from "@/lib/publicRest";
import { REST_QUERIES } from "@/lib/publicRestQueries";
import type { CartItem } from "@/data/cartStore";

export interface ProductOffer {
  id: string;
  product_id: string;
  offer_type: string; // supports legacy + canonical values
  buy_quantity: number | null;
  get_quantity: number | null;
  discount_value: number | null;
  free_product_id: string | null;
  free_variant_id: string | null;
  target_variant_ids: string[]; // empty = entire product (any variant qualifies)
  display_text: string;
  enabled: boolean;
  min_cart_total: number | null;
  sort_order: number;
}

export interface AppliedProductOffer {
  offerId: string;
  offerType: string;
  displayText: string;
  freeItems: {
    productId: string;
    variantId: string | null;
    productName: string;
    quantity: number;
  }[];
  discountAmount: number;
}

let cachedProductOffers: ProductOffer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export async function getAllProductOffers(): Promise<ProductOffer[]> {
  if (cachedProductOffers && Date.now() - cacheTime < CACHE_TTL) return cachedProductOffers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await publicRest<any[]>(REST_QUERIES.productOffers).catch(() => []);
  cachedProductOffers = ((data ?? []) as any[]).map((o) => ({
    ...o,
    target_variant_ids: Array.isArray(o.target_variant_ids) ? o.target_variant_ids : [],
  })) as ProductOffer[];
  cacheTime = Date.now();
  return cachedProductOffers;
}

export function invalidateProductOffersCache() {
  cachedProductOffers = null;
}

const normalizeOfferType = (type: string) => {
  switch (type) {
    case "buy_x_get_y_same":
    case "buy_x_get_y_diff":
      return "buy_x_get_y";
    case "buy_x_get_off":
      return "buy_x_get_discount";
    case "free_delivery":
      return "free_shipping";
    default:
      return type;
  }
};

const getCartProductId = (item: CartItem) => item.productId ?? item.id;

/** Does this cart line match the offer's targeting? */
function itemMatchesOffer(item: CartItem, offer: ProductOffer): boolean {
  if (getCartProductId(item) !== offer.product_id) return false;
  const targets = offer.target_variant_ids ?? [];
  if (targets.length === 0) return true; // whole product
  // Targeting specific variants — line must carry a variantId and it must be in the list.
  return !!item.variantId && targets.includes(item.variantId);
}

/**
 * Calculate which product offers apply to the current cart items.
 * Eligibility is checked at the exact-variant level when the offer targets variants.
 */
export function calculateAppliedOffers(
  items: CartItem[],
  offers: ProductOffer[],
  productNames: Record<string, string>,
  productPrices: Record<string, number> = {}
): AppliedProductOffer[] {
  const applied: AppliedProductOffer[] = [];

  const cartTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  for (const offer of offers) {
    const normalizedType = normalizeOfferType(offer.offer_type);

    // Lines that qualify for THIS offer (variant-scoped when applicable).
    const matchingLines = items.filter((i) => itemMatchesOffer(i, offer));
    const matchedQty = matchingLines.reduce((s, i) => s + i.quantity, 0);
    const matchedLineTotal = matchingLines.reduce((s, i) => s + i.price * i.quantity, 0);
    // Pick a representative purchased line — used for same-variant BXGY free items.
    const representative = matchingLines[0] ?? null;

    switch (normalizedType) {
      case "buy_x_get_y":
      case "buy_x_get_y_free_delivery": {
        if (offer.buy_quantity && offer.get_quantity && matchedQty >= offer.buy_quantity) {
          const isSameProduct =
            offer.offer_type === "buy_x_get_y_same" ||
            offer.offer_type === "buy_x_get_y_free_delivery";

          const freeProductId = isSameProduct
            ? offer.product_id
            : offer.free_product_id || offer.product_id;
          // For same-product BXGY → free variant is the purchased variant (representative line).
          // For different-product BXGY → admin-chosen free_variant_id (if any).
          const freeVariantId = isSameProduct
            ? representative?.variantId ?? null
            : offer.free_variant_id ?? null;

          const freeProductName =
            productNames[freeProductId] || productNames[offer.product_id] || "Free Item";
          const setsQualified = Math.floor(matchedQty / offer.buy_quantity);
          const freeQty = setsQualified * offer.get_quantity;
          const freeItemUnitPrice =
            productPrices[freeProductId] ??
            representative?.price ??
            0;

          applied.push({
            offerId: offer.id,
            offerType: normalizedType,
            displayText:
              offer.display_text || `Buy ${offer.buy_quantity} Get ${offer.get_quantity} Free`,
            freeItems: [
              {
                productId: freeProductId,
                variantId: freeVariantId,
                productName: freeProductName,
                quantity: freeQty,
              },
            ],
            // Same-product BXGY: free item is additive → no order-level discount.
            // Different-product BXGY: the free item's value IS the discount.
            discountAmount: isSameProduct ? 0 : freeQty * freeItemUnitPrice,
          });
        }
        break;
      }
      case "buy_x_get_discount": {
        if (offer.buy_quantity && offer.discount_value && matchedQty >= offer.buy_quantity) {
          const setsQualified = Math.floor(matchedQty / offer.buy_quantity);
          applied.push({
            offerId: offer.id,
            offerType: normalizedType,
            displayText:
              offer.display_text || `Buy ${offer.buy_quantity} and save ৳${offer.discount_value}`,
            freeItems: [],
            discountAmount: setsQualified * offer.discount_value,
          });
        }
        break;
      }
      case "flat_percent": {
        if (!offer.discount_value || matchedQty <= 0) break;
        if (offer.buy_quantity && matchedQty < offer.buy_quantity) break;
        if (matchedLineTotal <= 0) break;
        applied.push({
          offerId: offer.id,
          offerType: normalizedType,
          displayText:
            offer.display_text ||
            `${offer.discount_value}% off${offer.buy_quantity ? ` when you buy ${offer.buy_quantity}+` : ""}`,
          freeItems: [],
          discountAmount: Math.round((matchedLineTotal * offer.discount_value) / 100),
        });
        break;
      }
      case "min_cart_discount": {
        if (offer.min_cart_total && offer.discount_value && cartTotal >= offer.min_cart_total) {
          applied.push({
            offerId: offer.id,
            offerType: normalizedType,
            displayText:
              offer.display_text || `Spend ৳${offer.min_cart_total}+ and save ৳${offer.discount_value}`,
            freeItems: [],
            discountAmount: offer.discount_value,
          });
        }
        break;
      }
      case "free_shipping": {
        if (!offer.min_cart_total || cartTotal >= offer.min_cart_total) {
          applied.push({
            offerId: offer.id,
            offerType: normalizedType,
            displayText:
              offer.display_text ||
              (offer.min_cart_total ? "Free shipping unlocked!" : "Free shipping included!"),
            freeItems: [],
            discountAmount: 0,
          });
        }
        break;
      }
    }
  }

  return applied;
}

export function getOffersForProduct(productId: string, offers: ProductOffer[]): ProductOffer[] {
  return offers.filter((o) => o.product_id === productId);
}

/** Raw DB offer types that use buy_quantity for qualification */
export const BUY_QTY_OFFER_TYPES = new Set([
  "buy_x_get_y_same",
  "buy_x_get_y_diff",
  "buy_x_get_off",
  "buy_x_get_y_free_delivery",
  "flat_percent",
]);

export function getNearQualifyingOffers(
  quantityByProduct: Record<string, number>,
  offers: ProductOffer[]
): { offer: ProductOffer; needed: number }[] {
  const result: { offer: ProductOffer; needed: number }[] = [];
  for (const o of offers) {
    if (!BUY_QTY_OFFER_TYPES.has(o.offer_type) || !o.buy_quantity) continue;
    const qty = quantityByProduct[o.product_id] ?? 0;
    if (qty > 0 && qty < o.buy_quantity) {
      result.push({ offer: o, needed: o.buy_quantity - qty });
    }
  }
  return result;
}

export function simulateOffersForProduct(
  productId: string,
  quantity: number,
  price: number,
  offers: ProductOffer[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
  variantId?: string | null
): { applied: AppliedProductOffer[]; nearQualifying: { offer: ProductOffer; needed: number }[] } {
  const syntheticItems: CartItem[] = [
    {
      id: productId,
      productId,
      variantId: variantId ?? undefined,
      name: productNames[productId] || "",
      price,
      image: "",
      quantity,
    },
  ];
  const scoped = offers.filter((o) => o.product_id === productId);
  const applied = calculateAppliedOffers(syntheticItems, scoped, productNames, productPrices);
  const qtyMap: Record<string, number> = { [productId]: quantity };
  const nearQualifying = getNearQualifyingOffers(qtyMap, scoped);
  return { applied, nearQualifying };
}
