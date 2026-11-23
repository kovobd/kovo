# /database — Portable Supabase setup

One folder, one SQL file, zero manual dashboard clicks.

## TL;DR — Install on a fresh project

1. Create a new Supabase project.
2. Open **SQL Editor → New query**.
3. Paste the entire contents of [`full_setup.sql`](./full_setup.sql) and click **Run**.
4. Configure the frontend environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (a.k.a. `VITE_SUPABASE_PUBLISHABLE_KEY`)
   - `VITE_SUPABASE_PROJECT_ID`
5. Deploy the frontend. Visit `/admin/login`, sign up your first user, then run once in SQL Editor:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<your-auth-user-uuid>', 'admin');
   ```

The script is fully idempotent — re-running it is safe and never creates duplicates.

## Zero seed data

This bundle ships **only the database structure**. There are no rows in any table. Every admin page handles the empty state and creates its first record on save.

## What it installs

| File | Contents |
|---|---|
| `full_setup.sql` | Single-file installer (concatenation of the 0N_*.sql parts) |
| `01_extensions.sql` | Postgres extensions + enums |
| `02_schema.sql` | Sequences, tables, constraints, indexes |
| `03_functions.sql` | Functions + views |
| `04_triggers.sql` | Triggers |
| `05_policies.sql` | RLS policies + grants |
| `06_storage.sql` | Storage notes — assets live in Cloudflare R2 |

## Regenerate from a live database

The bundle is generated directly from `pg_catalog` / `information_schema`. To refresh it from a live project, run the queries in `/tmp/dbdump/assemble.py` (one per section) and execute the script.

## Reset the database

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
```
Then re-run `full_setup.sql`.
