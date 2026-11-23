// Ensures the CMS Settings pages (Homepage, Shop, About, Contact, Footer)
// always have editable default rows. Backed by the SECURITY DEFINER Postgres
// function `public.ensure_cms_defaults()`, which is idempotent — it only
// inserts rows that don't already exist and never overwrites edited data.
//
// The DB migration seeds defaults at deploy time. This client-side call
// covers cases where the database was imported from a schema-only export
// (structure without rows), or where a row was accidentally deleted before
// an admin opens a Settings page.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "__cms_defaults_ensured_v1__";
let inFlight: Promise<void> | null = null;

const safeGet = (k: string) => {
  try { return sessionStorage.getItem(k); } catch { return null; }
};
const safeSet = (k: string, v: string) => {
  try { sessionStorage.setItem(k, v); } catch { /* ignore */ }
};

export function ensureCmsDefaults({ force = false } = {}): Promise<void> {
  if (!force && safeGet(STORAGE_KEY) === "1") return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Fire-and-forget: any error is non-fatal — the pages still render
      // whatever rows do exist, and the next call retries.
      await supabase.rpc("ensure_cms_defaults" as any);
      safeSet(STORAGE_KEY, "1");
    } catch {
      /* swallow — will retry on next call */
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
