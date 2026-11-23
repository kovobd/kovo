## Settings → API Keys page

A new admin-only page at `/admin/settings/api-keys`, slotted directly above **User Roles** in the settings navigation. Two service cards (Cloudflare R2, BD Courier), real connection tests, masked values, edit-in-place, and secure server-side storage.

### The storage question (important)

Supabase Edge Function Secrets are set via the Supabase Management API and require a personal access token that this project does not have — an edge function cannot rotate its own env vars. To make the "Edit → Save" flow actually work from the UI, I will:

- Create a new admin-only DB table `public.service_credentials` (one row per service, JSONB value column, RLS locked to admins, plus `service_role` grants for edge functions).
- Store the R2 + BD Courier values there, encrypted at rest by Postgres, never readable by `anon` or `authenticated` (only `admin` role via RLS, and `service_role` from edge functions).
- Update `bdcourier-check`, `image-upload`, `migrate-images-r2`, `r2-cleanup-worker`, `r2-orphan-sweep` to read credentials from the DB first, falling back to `Deno.env` so nothing breaks during the transition.
- The existing Lovable-managed secrets stay in place as fallback; the UI becomes the source of truth going forward.

Frontend never receives raw secret values except the one field currently being edited (and only after the admin clicks "Edit", which calls a dedicated `reveal` endpoint gated to admin role).

### Edge functions (new)

`supabase/functions/admin-credentials/index.ts` — single function, action-based:
- `POST { action: "status" }` → returns per-service `{ configured, masked_preview, last_updated_at, last_tested_at, last_test_status }`. No raw values.
- `POST { action: "reveal", service, field }` → returns one raw value for editing. Admin-only, audit-logged.
- `POST { action: "save", service, values }` → validates required fields, upserts row, bumps `updated_at`.
- `POST { action: "test", service }` → runs real connectivity check, persists result.

Test logic:
- **R2**: sign a real AWS SigV4 request to `https://<account>.r2.cloudflarestorage.com/<bucket>?list-type=2&max-keys=1` (read), then `PUT` a tiny `_lovable_healthcheck.txt` and `DELETE` it (write), then `GET` `<R2_PUBLIC_BASE_URL>/_lovable_healthcheck.txt` before delete to verify public access. Each step reports its own pass/fail so the UI can show exactly what broke.
- **BD Courier**: `POST https://api.bdcourier.com/courier-check` with a known throwaway phone (`01700000000`) and the provided key; treat HTTP 200 as connected, surface upstream error message otherwise.

All responses sanitized — never echo the key back.

### Frontend

New file `src/pages/admin/ApiKeysManager.tsx`:
- Two cards using existing `Section`, `StatusPill`, `Button`, `Input` primitives — matches the current admin design system exactly.
- Each card: service name, status pill (green/red/yellow), masked preview (`••••••••abcd` — last 4 chars only, computed server-side), "Last checked" relative time, `[Edit]` and `[Test Connection]` buttons.
- Edit mode: inline form, one input per field, "Save" / "Cancel". Show/Hide toggle on every secret field. Copy button. Required-field validation before Save is enabled.
- After Save, automatically re-runs Test and refreshes the status pill.
- React Query for `status` (30 s stale), mutations for save/test/reveal.

Register the route in `src/App.tsx` and insert the new tab into `settingsTabs` in `src/components/admin/SettingsLayout.tsx` immediately above User Roles.

### Files touched

New:
- `src/pages/admin/ApiKeysManager.tsx`
- `supabase/functions/admin-credentials/index.ts`
- migration: `service_credentials` table + RLS + grants

Edited:
- `src/components/admin/SettingsLayout.tsx` (add tab)
- `src/App.tsx` (add route)
- `supabase/functions/bdcourier-check/index.ts` (DB-first credential lookup)
- `supabase/functions/image-upload/index.ts` (same)
- `supabase/functions/migrate-images-r2/index.ts` (same)
- `supabase/functions/r2-cleanup-worker/index.ts` (same)
- `supabase/functions/r2-orphan-sweep/index.ts` (same)

### Out of scope

- Rotating the actual Lovable-managed env-var secrets from the UI (impossible without a Supabase PAT).
- Any other credentials (Steadfast, Pathao, Meta, GA, tracking) — those already have dedicated managers.
