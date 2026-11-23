
ALTER VIEW public.mv_dashboard_metrics SET (security_invoker = true);
ALTER VIEW public.mv_orders_daily_90d SET (security_invoker = true);
ALTER VIEW public.mv_top_products_30d SET (security_invoker = true);
