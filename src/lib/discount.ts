/**
 * Shared manual-discount helpers used by every admin order flow
 * (Manual Order, Order Edit, Re-Order Reminder, Incomplete Orders).
 *
 * A manual discount is stored as a *value* plus a *type*:
 *   - "fixed"      → a flat currency amount (৳)
 *   - "percentage" → a percentage of the order subtotal
 */

export type DiscountType = "fixed" | "percentage";

export const DISCOUNT_TYPES: DiscountType[] = ["fixed", "percentage"];

export const normalizeDiscountType = (v: unknown): DiscountType =>
  v === "percentage" || v === "percent" || v === "%" ? "percentage" : "fixed";

/**
 * Resolve a discount (type + raw value) into a currency amount, clamped to
 * [0, subtotal]. Percentages are clamped to 0–100 first.
 */
export function computeDiscountAmount(
  type: DiscountType | string | null | undefined,
  value: number | string | null | undefined,
  subtotal: number,
): number {
  const t = normalizeDiscountType(type);
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const base = Math.max(0, Number(subtotal) || 0);
  const amount = t === "percentage" ? (base * Math.min(100, raw)) / 100 : raw;
  return Math.max(0, Math.min(Math.round(amount), base));
}

/** Human label for a manual discount, e.g. "15% off" or "৳200 off". */
export function discountLabel(
  type: DiscountType | string | null | undefined,
  value: number | string | null | undefined,
  symbol = "৳",
): string {
  const t = normalizeDiscountType(type);
  const raw = Number(value) || 0;
  return t === "percentage" ? `${raw}% off` : `${symbol}${raw} off`;
}
