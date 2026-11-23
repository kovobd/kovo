# Deployment Guide — Smart Gadget Zone 5

This project is fully portable. You can duplicate the Lovable project,
attach it to a brand-new Supabase project, run the bundled SQL, set
env vars, and the app boots without any manual code changes.

---

## 1. Provision a fresh Supabase project

1. Create a new project at https://supabase.com/dashboard.
2. From **Project Settings → API** copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` publishable key → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Project ref (subdomain of URL) → `VITE_SUPABASE_PROJECT_ID`
3. From **Project Settings → Database** copy the connection string → set
   as `SUPABASE_DB_URL` for the local tooling (`db:verify`, `db:export`).

## 2. Import the schema

The full database state is committed in two places — pick one:

| Source | When to use |
|---|---|
| `database/full_setup.sql` | One-shot bootstrap for a brand-new project. |
| `supabase/migrations/*.sql` | When using the Supabase CLI / preserving migration history. |

**One-shot bootstrap:**

```bash
psql "$SUPABASE_DB_URL" -f database/full_setup.sql
```

The bundle creates: 58 tables, 9 enums, 26 functions, 28 triggers,
113 RLS policies, 2 views, 3 materialised views. All in the `public`
schema. No manual SQL is required afterwards.

Verify locally:

```bash
npm run db:verify
```

## 3. Storage — Cloudflare R2 (no Supabase Storage buckets)

This project uses **Cloudflare R2** for every image and asset. There are
**no Supabase Storage buckets** to create. The dormant `media` bucket SQL
in `database/06_storage.sql` is a no-op kept only for legacy reference and
can be omitted from a fresh import.

Configure R2 once:

1. Create an R2 bucket in your Cloudflare account.
2. Create an R2 API token with **Object Read & Write** on that bucket.
3. Set these **edge function secrets** in Supabase
   (Dashboard → Edge Functions → Secrets):

   | Secret | Source |
   |---|---|
   | `R2_ACCOUNT_ID` | Cloudflare dashboard sidebar |
   | `R2_BUCKET` | Bucket name |
   | `R2_ACCESS_KEY_ID` | From the R2 API token |
   | `R2_SECRET_ACCESS_KEY` | From the R2 API token |
   | `R2_PUBLIC_BASE_URL` | Public r2.dev or custom CDN domain |

4. Set the public base URL in your frontend `.env`:

   ```
   VITE_R2_PUBLIC_BASE_URL="https://cdn.your-domain.com"
   ```

All uploads route through the `image-upload` edge function via
`src/lib/r2Upload.ts` (the single, enforced entry point).

### Maximising Cloudflare edge cache hits for images

The frontend already:

- Serves every image **directly** from the R2 public host (no proxy, no
  redirect, no server-side processing sits between the browser and R2).
- Emits responsive `srcset` + `sizes` and picks AVIF → WebP → JPG variants.
- Marks the site logo and hero LCP image with `fetchpriority="high"` +
  `<link rel="preload">`; below-the-fold images use `loading="lazy"` and
  `decoding="async"`.
- Ships a service worker (`public/sw.js`) that keeps a stale-while-revalidate
  cache of R2 images per user (dedupes downloads across navigations / React
  re-renders).
- Runtime-injects `<link rel="preconnect">` for whatever host
  `VITE_R2_PUBLIC_BASE_URL` points at (so a remixed project instantly
  connects to its own bucket without editing `index.html`).

r2.dev public URLs are already fronted by Cloudflare's global edge
(`Server: cloudflare`, `CF-RAY:` on every response) and R2 sets
`Cache-Control: public, max-age=14400` by default — so unique visitors
worldwide are served from the nearest Cloudflare colo, not R2 origin,
once an object is warm at that edge.

**Recommended (optional) — 1-year immutable at the edge:**

For maximum reuse across unique users, front the R2 bucket with a Cloudflare
custom domain and add a Cache Rule:

1. Cloudflare Dashboard → R2 → your bucket → **Settings → Custom domains**
   → connect (e.g. `cdn.your-domain.com`). Update
   `VITE_R2_PUBLIC_BASE_URL` and `R2_PUBLIC_BASE_URL` to that domain.
2. Cloudflare Dashboard → your zone → **Caching → Cache Rules → Create**:
   - **When incoming requests match:** *Hostname equals `cdn.your-domain.com`*
   - **Cache eligibility:** Eligible for cache
   - **Edge TTL:** Override — `1 year`
   - **Browser TTL:** Override — `1 year`
   - **Response headers → Set:** `Cache-Control: public, max-age=31536000, immutable`

Object keys emitted by `image-upload` include a content hash, so every
upload is a new URL — `immutable` is safe and never causes a stale image.
R2 sets `ETag` and `Last-Modified` automatically, so conditional GETs
from the edge to origin remain correct.



## 4. Environment variables

### Frontend `.env` (copy from `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase REST endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | `anon` key, safe to ship to browser |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Used for direct edge-function URLs |
| `VITE_R2_PUBLIC_BASE_URL` | ✅ | CDN base for image resolution |

> When deployed via Lovable, these are auto-injected from the connected
> Supabase project. For self-hosting, set them in your hosting platform.

### Edge function secrets (Supabase Dashboard)

Auto-provided by Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`,
`LOVABLE_API_KEY`.

You must add:

| Secret | Used by |
|---|---|
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | `image-upload`, `migrate-images-r2` |
| `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` | `steadfast-proxy`, `steadfast-sync-status` |
| `ECOMDRIVE_API_KEY` | `ecomdrive-proxy` |
| `BDCOURIER_API_KEY` | `bdcourier-check` |
| `META_PIXEL_ACCESS_TOKEN` (optional) | `meta-capi` |

## 5. Seed an admin user

After signing up the first account in the app:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<auth-user-id>', 'admin');
```

(Lovable instructions explicitly forbid storing roles on `profiles`;
this project uses the `user_roles` table with a `has_role()` security
definer function.)

## 6. Run

```bash
bun install
bun run dev
```

Then publish via Lovable's **Publish** button or self-host the
`dist/` output behind any static host.

---

## Common failure points

| Symptom | Cause | Fix |
|---|---|---|
| `[config] Missing required env vars` warning in console | `.env` not set | Copy `.env.example` to `.env`, fill all `VITE_*` keys |
| Images don't render | `VITE_R2_PUBLIC_BASE_URL` empty or R2 secrets missing | Set both frontend env var and the 5 R2 edge-function secrets |
| `forbidden` from `image-upload` | Caller is not in `user_roles` with `admin`/`staff` | Insert role row (see step 5) |
| "permission denied for table …" | New table created without `GRANT` statements | Re-run `database/05_policies.sql` or the relevant migration |
| Reminders not auto-closing on reorder | `trg_orders_schedule_reminders` trigger missing | Re-run `database/04_triggers.sql` |
| Cron-driven sync not firing | `pg_cron` not enabled on the new project | Enable extensions, then re-run cron `select` statements |

---

## Verification checklist

After deployment, in the SQL editor:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,        -- 58
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e') AS enums,      -- 9
  (SELECT count(*) FROM information_schema.routines WHERE routine_schema='public') AS functions,                              -- 26
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers, -- 28
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies;     -- 113
```

If those numbers match, the schema imported cleanly.
