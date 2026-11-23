
REVOKE ALL ON public.mv_dashboard_metrics FROM anon, authenticated;
REVOKE ALL ON public.mv_top_products_30d FROM anon, authenticated;
GRANT SELECT ON public.mv_dashboard_metrics TO service_role;
GRANT SELECT ON public.mv_top_products_30d TO service_role;
