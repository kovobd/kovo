REVOKE EXECUTE ON FUNCTION public._media_column_exists(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.scrub_jsonb_media_ref(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_media_usage(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unlink_media_references(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._media_column_exists(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrub_jsonb_media_ref(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_media_usage(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlink_media_references(text) TO authenticated, service_role;