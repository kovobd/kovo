// Debug-gated logger for Edge Functions.
//
// Production runtime stays silent for routine traffic — we keep `error` and
// `warn` at full volume but everything else (request payloads, customer data,
// vendor request/response bodies) is only emitted when `DEBUG=true` is set on
// the Supabase function environment.
//
// Usage:
//   import { dlog, dwarn, derror } from "../_shared/log.ts";
//   dlog("[meta-capi]", { ... });   // suppressed unless DEBUG=true
//   derror("[meta-capi] failed", e); // always logged

const DEBUG = (Deno.env.get("DEBUG") ?? "").toLowerCase() === "true";

export const isDebug = DEBUG;

export function dlog(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

export function dinfo(...args: unknown[]): void {
  if (DEBUG) console.info(...args);
}

export function dwarn(...args: unknown[]): void {
  console.warn(...args);
}

export function derror(...args: unknown[]): void {
  console.error(...args);
}
