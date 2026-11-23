/**
 * Boot-time schema validation. Calls a single RPC `public.schema_health()`
 * which returns the names of any required tables or functions that are
 * missing from the database. The RPC ships in `database/full_setup.sql`.
 *
 * If the RPC itself is missing (e.g. fresh project where the bundle was not
 * yet applied), the helper returns a friendly "setup required" payload
 * instead of throwing so the UI can render a diagnostic page.
 */
import { supabase } from "@/integrations/supabase/client";

export type SchemaHealth =
  | { ok: true }
  | {
      ok: false;
      reason: "setup_required" | "missing_objects" | "network_error";
      missingTables?: string[];
      missingFunctions?: string[];
      message: string;
    };

let cached: Promise<SchemaHealth> | null = null;

export function getSchemaHealth(): Promise<SchemaHealth> {
  if (!cached) cached = check();
  return cached;
}

export function resetSchemaHealthCache() {
  cached = null;
}

async function check(): Promise<SchemaHealth> {
  try {
    // `schema_health` is part of database/full_setup.sql; the generated
    // RPC type list may not include it on first deploy, so call untyped.
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
    )("schema_health");
    if (error) {
      // PGRST202 = function not found in schema cache → bundle not applied.
      // Only that case means "database not initialised". Any other error
      // (permission denied, transient failure, …) must NOT block the storefront,
      // so it falls through to "network_error", which the gate ignores.
      const code = (error as { code?: string }).code;
      if (code === "PGRST202" || /could not find the function/i.test(error.message)) {
        return {
          ok: false,
          reason: "setup_required",
          message:
            "Database not initialised. Run database/full_setup.sql in the Supabase SQL Editor.",
        };
      }
      return { ok: false, reason: "network_error", message: error.message };
    }
    const result = (data ?? {}) as {
      missing_tables?: string[];
      missing_functions?: string[];
    };
    const missingTables = result.missing_tables ?? [];
    const missingFunctions = result.missing_functions ?? [];
    if (missingTables.length === 0 && missingFunctions.length === 0) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "missing_objects",
      missingTables,
      missingFunctions,
      message: `Schema is missing ${missingTables.length} table(s) and ${missingFunctions.length} function(s). Re-run database/full_setup.sql.`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
