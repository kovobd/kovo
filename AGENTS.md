# Architecture rules

- Keep `meta-capi` public with `verify_jwt = false`: storefront visitors use Supabase publishable API keys without a user JWT; retain origin and event validation, and keep admin tracking tools session-protected.