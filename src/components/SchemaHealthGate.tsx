import { useEffect, useState, type ReactNode } from "react";
import { getSchemaHealth, type SchemaHealth, resetSchemaHealthCache } from "@/lib/schemaHealth";

interface Props {
  children: ReactNode;
}

/**
 * Runs `schema_health()` once at boot. If the database is uninitialised or
 * objects are missing, replaces the app with a clear diagnostic screen
 * instead of letting individual pages crash.
 */
export default function SchemaHealthGate({ children }: Props) {
  const [state, setState] = useState<SchemaHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSchemaHealth().then((r) => {
      if (!cancelled) setState(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return <>{children}</>;
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
