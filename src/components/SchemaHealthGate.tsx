import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { getSchemaHealth, type SchemaHealth, resetSchemaHealthCache } from "@/lib/schemaHealth";

const HEALTH_OK_KEY = "kovo:schema-ok";

interface Props {
  children: ReactNode;
}

/**
 * Runs `schema_health()` once, in the admin only. If the database is
 * uninitialised or objects are missing, replaces the admin with a clear
 * diagnostic screen instead of letting individual pages crash.
 *
 * Never on the storefront: shoppers gain nothing from it (one more request
 * per visit), and a passing database hiccup must not replace the shop with a
 * setup screen.
 */
export default function SchemaHealthGate({ children }: Props) {
  const [state, setState] = useState<SchemaHealth | null>(null);
  const inAdmin = useLocation().pathname.startsWith("/admin");

  useEffect(() => {
    if (!inAdmin) return;
    let cancelled = false;
    // A healthy result is remembered for the session, and the check waits
    // until the page has loaded so it never delays what shoppers see.
    let known = false;
    try { known = sessionStorage.getItem(HEALTH_OK_KEY) === "1"; } catch { /* ignore */ }
    if (known) return;
    const run = () =>
      getSchemaHealth().then((r) => {
        if (r.ok) { try { sessionStorage.setItem(HEALTH_OK_KEY, "1"); } catch { /* ignore */ } }
        if (!cancelled) setState(r);
      });
    const start = () => setTimeout(run, 3000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (document.readyState === "complete") timer = start();
    else window.addEventListener("load", () => { timer = start(); }, { once: true });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [inAdmin]);

  if (!state || !inAdmin) return <>{children}</>;
  if (state.ok === true) return <>{children}</>;

  const failure: Extract<SchemaHealth, { ok: false }> = state;
  if (failure.reason === "network_error") return <>{children}</>;

  const isSetup = failure.reason === "setup_required";
  const missingTables = failure.missingTables ?? [];
  const missingFunctions = failure.missingFunctions ?? [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-[4px] border border-border bg-card p-8 shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {isSetup ? "Setup required" : "Schema mismatch"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {isSetup ? "Database is empty" : "Database is missing required objects"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{failure.message}</p>

        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>Open the Supabase SQL Editor for this project.</li>
          <li>
            Paste the contents of{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">database/full_setup.sql</code>{" "}
            and click <strong>Run</strong>.
          </li>
          <li>Refresh this page.</li>
        </ol>

        {!isSetup && (missingTables.length > 0 || missingFunctions.length > 0) && (
          <div className="mt-6 space-y-3 text-xs">
            {missingTables.length > 0 && (
              <div>
                <p className="font-medium text-foreground">Missing tables</p>
                <p className="mt-1 text-muted-foreground break-words">{missingTables.join(", ")}</p>
              </div>
            )}
            {missingFunctions.length > 0 && (
              <div>
                <p className="font-medium text-foreground">Missing functions</p>
                <p className="mt-1 text-muted-foreground break-words">
                  {missingFunctions.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            resetSchemaHealthCache();
            window.location.reload();
          }}
          className="mt-8 inline-flex h-9 items-center justify-center rounded-[4px] bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
