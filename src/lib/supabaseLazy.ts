/**
 * Loads the Supabase client on first use. Storefront code that only needs it
 * for a follow-up action (newsletter, tracking, offers) imports this instead
 * of the client itself, so the ~60 KB (gzip) SDK stays out of the first load.
 */
export const getSupabase = () =>
  import("@/integrations/supabase/client").then((m) => m.supabase);
