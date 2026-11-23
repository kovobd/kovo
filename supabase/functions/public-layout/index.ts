import { createClient } from "npm:@supabase/supabase-js@2";
import { cachedJson, errorJson, handlePreflight } from "../_shared/respond.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return errorJson("method not allowed", 405);

  try {
    const [
      design, wa, ann, annSettings, footer, fi, fiSet, shop, dor, pixels, cats, brands, tags, r2Creds,
    ] = await Promise.all([
      supabase.from("design_settings").select("logo_desktop_url, logo_mobile_url, logo_footer_url, favicon_url").eq("id", "default").maybeSingle(),
      supabase.from("whatsapp_settings").select("phone_number, enabled, radar_animation").eq("id", "default").maybeSingle(),
      supabase.from("announcement_bar").select("id, enabled, text, link, bg_color, text_color, dismissible, sort_order").eq("enabled", true).neq("text", "").order("sort_order", { ascending: true }),
      supabase.from("announcement_bar_settings").select("id, direction, speed").eq("id", "default").maybeSingle(),
      supabase.from("footer_settings").select("*").eq("id", "default").maybeSingle(),
      supabase.from("floating_icons").select("id, label, url, icon_url, bg_color, icon_color, preset_key, sort_order, enabled").eq("enabled", true).order("sort_order"),
      supabase.from("floating_icons_settings").select("enabled, radar_animation, animation_style, animation_intensity, expand_icon_url").eq("id", "default").maybeSingle(),
      supabase.from("shop_settings").select("card_show_view_details, card_show_add_to_cart, card_show_buy_now, card_cta_mode, search_enabled, sorting_enabled, default_sorting, pdp_show_shipment_details, pdp_show_why_choose_us").eq("id", "default").maybeSingle(),
      supabase.from("direct_order_channels").select("id, enabled, label, identifier, message_template, sort_order").eq("enabled", true).order("sort_order"),
      // Public projection — never expose `test_event_code` or `access_token`.
      // `test_mode` is required so the browser pixel still injects while admins
      // route events to a CAPI test session.
      supabase.from("tracking_pixels").select("platform, pixel_id, enabled, test_mode, advanced_matching").neq("pixel_id", "").or("enabled.eq.true,test_mode.eq.true"),
      supabase.from("categories").select("id, name, slug, image_url, parent_id, sort_order").order("sort_order"),
      supabase.from("brands").select("id, name, slug, logo_url, image_url, sort_order").eq("enabled", true).order("sort_order"),
      supabase.from("tags").select("id, name, slug, type, icon, color, sort_order").order("sort_order"),
      supabase.from("service_credentials").select("values").eq("service", "r2").maybeSingle(),
    ]);

    const r2Values = (r2Creds.data?.values ?? {}) as Record<string, string>;
    const r2PublicBaseUrl = String(r2Values.R2_PUBLIC_BASE_URL || Deno.env.get("R2_PUBLIC_BASE_URL") || "").replace(/\/+$/, "");

    const payload = {
      design: design.data ?? null,
      whatsapp: wa.data ?? null,
      announcements: ann.data ?? [],
      announcement: (ann.data && ann.data[0]) ?? null,
      announcementSettings: annSettings.data ?? { id: "default", direction: "left", speed: 5 },
      footer: footer.data ?? null,
      floatingIcons: fi.data ?? [],
      floatingSettings: fiSet.data ?? null,
      shopSettings: shop.data ?? null,
      directOrderChannels: dor.data ?? [],
      trackingPixels: pixels.data ?? [],
      categories: cats.data ?? [],
      brands: brands.data ?? [],
      tags: tags.data ?? [],
      r2PublicBaseUrl,
    };

    // Layout rarely changes — cache hard at the edge.
    return await cachedJson(req, payload, { sMaxAge: 600, maxAge: 60, swr: 86400 });
  } catch (e) {
    return errorJson((e as Error).message);
  }
});
