-- schema_health() is called by every visitor at boot (SchemaHealthGate), so it
-- must stay executable by logged-out users. The earlier lockdown migration
-- revoked it by mistake, which made the storefront show "Database is empty".
-- It only returns the names of missing tables/functions.
GRANT EXECUTE ON FUNCTION public.schema_health() TO anon, authenticated, service_role;
