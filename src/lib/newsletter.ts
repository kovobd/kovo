import { getSupabase } from "@/lib/supabaseLazy";

// Plain check instead of zod: this runs on every storefront page, and zod
// would add ~60 KB to the first download for one email field.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseEmail(raw: string): { success: true; data: string } | { success: false; message: string } {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { success: false, message: "Please enter a valid email address" };
  if (email.length > 255) return { success: false, message: "Email is too long" };
  return { success: true, data: email };
}

export interface NewsletterResult {
  ok: boolean;
  email?: string;
  reason?: "invalid" | "network";
  message?: string;
}

/**
 * Subscribe an email to the newsletter.
 * The RPC uses ON CONFLICT DO NOTHING so duplicates are silently ignored —
 * we treat the operation as successful regardless. Only real errors (network,
 * RLS, validation) surface as failures.
 */
export async function subscribeToNewsletter(rawEmail: string): Promise<NewsletterResult> {
  const parsed = parseEmail(rawEmail);
  if ("message" in parsed) {
    return { ok: false, reason: "invalid", message: parsed.message };
  }
  const email = parsed.data;
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("subscribe_newsletter", { _email: email });
  if (error) {
    return { ok: false, reason: "network", message: error.message || "Could not subscribe. Please try again." };
  }
  return { ok: true, email };
}
