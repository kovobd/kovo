/**
 * Project-wide constants. Import from "@/constants" instead of hardcoding
 * magic strings across feature code.
 */

/** R2 prefixes used by the image-upload edge function. */
export const R2_PREFIXES = {
  products: "products",
  socialIcons: "social-icons",
  floatingIcons: "floating-icons",
  hero: "hero",
  testimonials: "testimonials",
  brands: "brands",
  categories: "categories",
} as const;

/** Order lifecycle states. Mirrors the `order_status` text values in `public.orders`. */
export const ORDER_STATUS = {
  pending: "pending",
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  returned: "returned",
  refunded: "refunded",
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Payment statuses on `public.orders`. */
export const PAYMENT_STATUS = {
  unpaid: "unpaid",
  paid: "paid",
  refunded: "refunded",
  failed: "failed",
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** Reminder lifecycle (matches `product_reminders.status`). */
export const REMINDER_STATUS = {
  pending: "pending",
  called: "called",
  follow_up: "follow_up",
  no_response: "no_response",
  interested: "interested",
  purchased_again: "purchased_again",
  do_not_remind: "do_not_remind",
  superseded: "superseded",
} as const;
export type ReminderStatus = (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

/** Open (actionable) reminder statuses — used by dashboard tab filters. */
export const OPEN_REMINDER_STATUSES: ReminderStatus[] = [
  REMINDER_STATUS.pending,
  REMINDER_STATUS.called,
  REMINDER_STATUS.follow_up,
  REMINDER_STATUS.no_response,
  REMINDER_STATUS.interested,
];

/** Application roles (mirrors the `app_role` enum). */
export const APP_ROLES = {
  admin: "admin",
  staff: "staff",
  user: "user",
} as const;
export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

/** Default currency for the storefront. */
export const CURRENCY = {
  code: "BDT",
  symbol: "৳",
} as const;
