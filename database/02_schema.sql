-- Sequences

-- Tables
CREATE TABLE IF NOT EXISTS public.about_sections (
    id text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    reference_id uuid,
    customer_name text,
    amount numeric DEFAULT 0 NOT NULL,
    title text NOT NULL,
    message text,
    url text,
    admin_seen boolean DEFAULT false NOT NULL,
    seen_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id bigint DEFAULT nextval('analytics_events_id_seq'::regclass) NOT NULL,
    event_name text NOT NULL,
    visitor_id uuid,
    session_id uuid,
    customer_id uuid,
    order_id uuid,
    product_id uuid,
    path text,
    value numeric,
    currency text DEFAULT 'BDT'::text,
    props jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcement_bar (
    id text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    link text DEFAULT ''::text NOT NULL,
    bg_color text DEFAULT '#000000'::text NOT NULL,
    text_color text DEFAULT '#ffffff'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    dismissible boolean DEFAULT true NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcement_bar_settings (
    id text DEFAULT 'default'::text NOT NULL,
    direction text DEFAULT 'left'::text NOT NULL,
    speed integer DEFAULT 5 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attribution_touchpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid,
    session_id uuid,
    occurred_at timestamptz DEFAULT now() NOT NULL,
    source text,
    medium text,
    campaign text,
    term text,
    content text,
    referrer text,
    landing_page text,
    fbclid text,
    gclid text,
    ttclid text,
    raw jsonb DEFAULT '{}'::jsonb,
    is_first boolean DEFAULT false,
    is_last boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.bdcourier_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    order_id uuid,
    risk_level text,
    risk_label text,
    recommendation text,
    success_ratio numeric,
    fraud_report_count integer,
    total_parcel integer,
    success_parcel integer,
    cancelled_parcel integer,
    reasons jsonb DEFAULT '[]'::jsonb,
    couriers jsonb DEFAULT '{}'::jsonb,
    raw jsonb,
    checked_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    logo_url text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.capi_event_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    event_id text NOT NULL,
    status text NOT NULL,
    http_status integer,
    attempts integer DEFAULT 1 NOT NULL,
    error text,
    response text,
    payload jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    source text DEFAULT 'server'::text NOT NULL,
    order_id text,
    product_ids text[],
    value numeric,
    currency text,
    response_time_ms integer,
    test_mode boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.capi_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text DEFAULT 'facebook'::text NOT NULL,
    status text NOT NULL,
    pixel_id text,
    business_name text,
    api_version text,
    http_status integer,
    events_received integer,
    test_event_code text,
    message text,
    diagnostics jsonb,
    tested_at timestamptz DEFAULT now() NOT NULL,
    tested_by uuid
);

CREATE TABLE IF NOT EXISTS public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    image_url text,
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    category_type public.category_type DEFAULT 'category'::category_type NOT NULL,
    path text DEFAULT ''::text NOT NULL,
    full_slug text,
    meta_title text,
    meta_description text,
    featured_image_url text,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.contact_settings (
    id text NOT NULL,
    page_title text,
    page_intro text,
    phone_number text,
    email_address text,
    receiving_email text,
    show_address boolean DEFAULT true NOT NULL,
    business_address text,
    phone_field_enabled boolean DEFAULT true NOT NULL,
    submit_button_text text DEFAULT 'Send Message'::text,
    social_section_enabled boolean DEFAULT false NOT NULL,
    social_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    faq_shortcut_enabled boolean DEFAULT false NOT NULL,
    faq_shortcut_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    map_enabled boolean DEFAULT false NOT NULL,
    map_embed text,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text DEFAULT 'percentage'::text NOT NULL,
    discount_value numeric DEFAULT 0 NOT NULL,
    min_cart_total numeric DEFAULT 0,
    min_order_amount numeric DEFAULT 0,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    start_date timestamptz,
    end_date timestamptz,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.crm_customers (
    phone text,
    latest_name text,
    aliases text[],
    email text,
    first_order_at timestamptz,
    last_order_at timestamptz,
    total_orders integer,
    lifetime_value numeric,
    delivered_value numeric
);

CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    phone text,
    email text,
    first_visitor_id uuid,
    primary_visitor_id uuid,
    lifetime_value numeric DEFAULT 0 NOT NULL,
    delivered_value numeric DEFAULT 0 NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    delivered_count integer DEFAULT 0 NOT NULL,
    avg_order_value numeric DEFAULT 0 NOT NULL,
    first_purchase_at timestamptz,
    last_purchase_at timestamptz,
    acquisition_source text,
    acquisition_medium text,
    acquisition_campaign text,
    updated_at timestamptz DEFAULT now() NOT NULL,
    do_not_remind boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    email text,
    phone text,
    address text,
    city text,
    notes text,
    total_orders integer DEFAULT 0 NOT NULL,
    total_spent numeric DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.daily_aggregates (
    day date NOT NULL,
    visitors integer DEFAULT 0 NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    pageviews integer DEFAULT 0 NOT NULL,
    product_views integer DEFAULT 0 NOT NULL,
    add_to_carts integer DEFAULT 0 NOT NULL,
    checkouts integer DEFAULT 0 NOT NULL,
    purchases integer DEFAULT 0 NOT NULL,
    delivered integer DEFAULT 0 NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    delivered_revenue numeric DEFAULT 0 NOT NULL,
    new_customers integer DEFAULT 0 NOT NULL,
    repeat_customers integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    stage public.delivery_stage DEFAULT 'pending'::delivery_stage NOT NULL,
    pending_at timestamptz,
    confirmed_at timestamptz,
    packed_at timestamptz,
    shipped_at timestamptz,
    delivered_at timestamptz,
    returned_at timestamptz,
    cancelled_at timestamptz,
    courier text,
    courier_cost numeric,
    total_hours numeric,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    zone_name text,
    areas jsonb DEFAULT '[]'::jsonb NOT NULL,
    delivery_charge numeric DEFAULT 0 NOT NULL,
    shipping_cost numeric DEFAULT 0 NOT NULL,
    free_delivery_minimum numeric,
    free_shipping_threshold numeric,
    estimated_days text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.design_settings (
    id text NOT NULL,
    logo_desktop_url text,
    logo_mobile_url text,
    logo_footer_url text,
    favicon_url text,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.direct_order_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    identifier text DEFAULT ''::text NOT NULL,
    message_template text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ecomdrive_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    invoice_number text,
    endpoint text NOT NULL,
    method text DEFAULT 'POST'::text NOT NULL,
    request_payload jsonb,
    response_body jsonb,
    http_status integer,
    success boolean DEFAULT false NOT NULL,
    error text,
    retry_attempt integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.featured_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    title text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.floating_icons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    icon_url text,
    bg_color text DEFAULT '#000000'::text NOT NULL,
    icon_color text DEFAULT '#ffffff'::text,
    preset_key text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.floating_icons_settings (
    id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    animation_style text DEFAULT 'pulse'::text,
    animation_intensity text DEFAULT 'medium'::text,
    radar_animation boolean DEFAULT true NOT NULL,
    expand_icon_url text,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.footer_settings (
    id text NOT NULL,
    store_name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    copyright_text text DEFAULT '© {year}'::text NOT NULL,
    social_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    quick_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    customer_care_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    newsletter_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hero_settings (
    id text DEFAULT 'default'::text NOT NULL,
    hero_type text DEFAULT 'image_slider'::text NOT NULL,
    hero_layout text DEFAULT 'single'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    autoplay boolean DEFAULT true NOT NULL,
    transition_speed_ms integer DEFAULT 6000 NOT NULL,
    infinite_loop boolean DEFAULT true NOT NULL,
    swipe_enabled boolean DEFAULT true NOT NULL,
    desktop_video_url text,
    mobile_video_url text,
    poster_image_url text,
    video_headline text,
    video_subheadline text,
    video_button1_text text,
    video_button1_link text,
    video_button2_text text,
    video_button2_link text,
    video_click_link text,
    video_autoplay boolean DEFAULT true NOT NULL,
    video_loop boolean DEFAULT true NOT NULL,
    video_muted boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hero_slides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    mobile_image_url text,
    headline text,
    subheadline text,
    button1_text text,
    button1_link text,
    button2_text text,
    button2_link text,
    image_click_link text,
    interaction_mode text DEFAULT 'buttons'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.home_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.homepage_sections (
    id text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.incomplete_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    customer_name text,
    phone text NOT NULL,
    email text,
    address jsonb DEFAULT '{}'::jsonb NOT NULL,
    cart_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    delivery_charge numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    coupon text,
    payment_method text,
    checkout_step text DEFAULT 'started'::text NOT NULL,
    recovery_status text DEFAULT 'pending'::text NOT NULL,
    recovered boolean DEFAULT false NOT NULL,
    converted_order_id uuid,
    last_activity timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intelligence_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    generated_at timestamptz DEFAULT now() NOT NULL,
    period_start date,
    period_end date,
    category text,
    title text NOT NULL,
    body text NOT NULL,
    tone text DEFAULT 'neutral'::text,
    metrics jsonb DEFAULT '{}'::jsonb,
    dismissed boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intelligence_settings (
    id integer DEFAULT 1 NOT NULL,
    clarity_project_id text,
    packaging_cost_default numeric DEFAULT 0 NOT NULL,
    gateway_fee_percent numeric DEFAULT 0 NOT NULL,
    cod_fee_percent numeric DEFAULT 1 NOT NULL,
    ai_insights_enabled boolean DEFAULT true NOT NULL,
    attribution_model public.attribution_model DEFAULT 'last_click'::attribution_model NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    product_id uuid,
    variant_id uuid,
    quantity_delta integer NOT NULL,
    reason text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_settings (
    id text NOT NULL,
    store_name text,
    store_address text,
    store_phone text,
    store_email text,
    logo_url text,
    footer_note text,
    footer_text text,
    signature_label text,
    terms_text text,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.media_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ref text NOT NULL,
    object_key text,
    action text NOT NULL,
    success boolean NOT NULL,
    error_message text,
    usage jsonb,
    performed_by uuid,
    performed_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mv_dashboard_metrics (
    id integer,
    orders_today bigint,
    orders_7d bigint,
    orders_30d bigint,
    orders_total bigint,
    revenue_today numeric,
    revenue_7d numeric,
    revenue_30d numeric,
    revenue_total numeric,
    pending_count bigint,
    processing_count bigint,
    shipped_count bigint,
    delivered_count bigint,
    cancelled_count bigint,
    low_stock_count bigint,
    out_of_stock_count bigint,
    products_total bigint,
    customers_total bigint,
    incomplete_orders_count bigint,
    refreshed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.mv_orders_daily_90d (
    day date,
    orders integer,
    revenue numeric
);

CREATE TABLE IF NOT EXISTS public.mv_top_products_30d (
    product_id uuid,
    product_name text,
    units_sold bigint,
    revenue numeric
);

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    subscribed_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    discount_type text DEFAULT 'percentage'::text NOT NULL,
    discount_value numeric DEFAULT 0 NOT NULL,
    apply_to text DEFAULT 'entire_store'::text NOT NULL,
    target_ids text[],
    banner_image text,
    enabled boolean DEFAULT true NOT NULL,
    start_date timestamptz,
    end_date timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    visitor_id uuid,
    session_id uuid,
    customer_profile_id uuid,
    first_attribution jsonb DEFAULT '{}'::jsonb,
    last_attribution jsonb DEFAULT '{}'::jsonb,
    journey jsonb DEFAULT '[]'::jsonb,
    is_first_purchase boolean DEFAULT false,
    is_delivered boolean DEFAULT false,
    delivered_at timestamptz,
    product_cost numeric,
    packaging_cost numeric,
    courier_cost numeric,
    gateway_fee numeric,
    ad_cost numeric,
    gross_profit numeric,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    admin_id uuid,
    action text NOT NULL,
    previous_value jsonb,
    new_value jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    customer_name text DEFAULT ''::text NOT NULL,
    customer_email text,
    customer_phone text DEFAULT ''::text NOT NULL,
    customer_address text DEFAULT ''::text NOT NULL,
    customer_city text,
    shipping_address jsonb DEFAULT '{}'::jsonb NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    shipping_cost numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    coupon_code text,
    total numeric DEFAULT 0 NOT NULL,
    payment_method text DEFAULT 'cod'::text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    order_status text DEFAULT 'pending'::text NOT NULL,
    tracking_number text,
    delivery_partner text,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    is_pos boolean DEFAULT false NOT NULL,
    paid_at timestamptz,
    transaction_id text,
    restocked_at timestamptz,
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    day date NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    add_to_cart integer DEFAULT 0 NOT NULL,
    checkout_starts integer DEFAULT 0 NOT NULL,
    purchases integer DEFAULT 0 NOT NULL,
    delivered integer DEFAULT 0 NOT NULL,
    returned integer DEFAULT 0 NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    delivered_revenue numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_costs (
    product_id uuid NOT NULL,
    product_cost numeric DEFAULT 0 NOT NULL,
    packaging_cost numeric,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    label text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    image_url text NOT NULL,
    alt_text text,
    type public.media_type DEFAULT 'image'::media_type NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    offer_type text NOT NULL,
    display_text text DEFAULT ''::text NOT NULL,
    buy_quantity integer,
    get_quantity integer,
    free_product_id uuid,
    min_cart_total numeric,
    discount_value numeric,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    target_variant_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    free_variant_id uuid
);

CREATE TABLE IF NOT EXISTS public.product_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    product_name_snapshot text,
    order_id uuid,
    order_number text,
    customer_id uuid,
    customer_phone text NOT NULL,
    customer_name text,
    customer_email text,
    reminder_days integer NOT NULL,
    purchase_date timestamptz NOT NULL,
    due_date date NOT NULL,
    status public.reminder_status DEFAULT 'pending'::reminder_status NOT NULL,
    priority public.reminder_priority DEFAULT 'low'::reminder_priority NOT NULL,
    notes text,
    call_notes text,
    follow_up_date date,
    called_at timestamptz,
    resolved_at timestamptz,
    reorder_order_id uuid,
    reorder_amount numeric(12,2),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    next_action_date date,
    expected_purchase_date date,
    last_contacted_at timestamptz,
    notes_timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
    conversion_source text
);

CREATE TABLE IF NOT EXISTS public.product_tabs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    display_style text DEFAULT 'text'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_tags (
    product_id uuid NOT NULL,
    tag_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    option_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    sale_price numeric,
    stock integer DEFAULT 0 NOT NULL,
    sku text,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    image_url text,
    gallery text[] DEFAULT '{}'::text[] NOT NULL,
    reminder_days integer,
    reminder_notes text
);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    short_description text,
    description text,
    sku text,
    category_id uuid,
    brand_id uuid,
    price numeric DEFAULT 0 NOT NULL,
    sale_price numeric,
    stock integer DEFAULT 0 NOT NULL,
    rating numeric DEFAULT 0 NOT NULL,
    review_count integer DEFAULT 0 NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    best_seller boolean DEFAULT false NOT NULL,
    show_offers boolean DEFAULT true NOT NULL,
    show_shipping_info boolean DEFAULT true NOT NULL,
    show_stock_status boolean DEFAULT true NOT NULL,
    show_shipping_text boolean DEFAULT true NOT NULL,
    shipping_text text,
    stock_status_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    base_price numeric DEFAULT 0 NOT NULL,
    compare_price numeric,
    status public.product_status DEFAULT 'draft'::product_status NOT NULL,
    is_new_arrival boolean DEFAULT false NOT NULL,
    reminder_enabled boolean DEFAULT false NOT NULL,
    reminder_days integer,
    reminder_notes text,
    option_groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    show_brand boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products_with_hierarchy (
    id uuid,
    name text,
    slug text,
    short_description text,
    description text,
    sku text,
    category_id uuid,
    brand_id uuid,
    price numeric,
    sale_price numeric,
    stock integer,
    rating numeric,
    review_count integer,
    featured boolean,
    best_seller boolean,
    show_offers boolean,
    show_shipping_info boolean,
    show_stock_status boolean,
    show_shipping_text boolean,
    shipping_text text,
    stock_status_text text,
    sort_order integer,
    created_at timestamptz,
    updated_at timestamptz,
    base_price numeric,
    compare_price numeric,
    status public.product_status,
    is_new_arrival boolean,
    leaf_category_id uuid,
    main_category_id uuid,
    sub_category_id uuid,
    child_category_id uuid,
    category_path text,
    category_level integer
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.r2_deletion_queue (
    id bigint DEFAULT nextval('r2_deletion_queue_id_seq'::regclass) NOT NULL,
    ref text NOT NULL,
    source_table text,
    source_id text,
    queued_at timestamptz DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamptz,
    claimed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.r2_orphan_sweep_runs (
    id bigint DEFAULT nextval('r2_orphan_sweep_runs_id_seq'::regclass) NOT NULL,
    started_at timestamptz DEFAULT now() NOT NULL,
    finished_at timestamptz,
    scanned integer DEFAULT 0 NOT NULL,
    orphans_found integer DEFAULT 0 NOT NULL,
    orphans_queued integer DEFAULT 0 NOT NULL,
    grace_hours integer DEFAULT 24 NOT NULL,
    error text
);

CREATE TABLE IF NOT EXISTS public.review_hero_settings (
    id integer DEFAULT 1 NOT NULL,
    headline text DEFAULT 'Loved by our customers.'::text NOT NULL,
    subtitle text DEFAULT 'Trusted by thousands of happy customers — real photos, real videos, real stories.'::text NOT NULL,
    avatars jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    customer_name text NOT NULL,
    rating integer DEFAULT 5 NOT NULL,
    comment text,
    review text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_credentials (
    service text NOT NULL,
    values jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_tested_at timestamptz,
    last_test_status text,
    last_test_message text,
    updated_by uuid,
    updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_credentials TO authenticated;
GRANT ALL ON public.service_credentials TO service_role;

CREATE TABLE IF NOT EXISTS public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_key text NOT NULL,
    visitor_id uuid,
    started_at timestamptz DEFAULT now() NOT NULL,
    ended_at timestamptz,
    duration_seconds integer,
    page_count integer DEFAULT 0 NOT NULL,
    landing_page text,
    exit_page text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    fbclid text,
    gclid text,
    ttclid text,
    clarity_session_id text,
    clarity_replay_url text,
    device_type text,
    country text,
    is_bounce boolean DEFAULT true,
    converted boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shop_settings (
    id text NOT NULL,
    default_sorting text DEFAULT 'newest'::text NOT NULL,
    sorting_enabled boolean DEFAULT true NOT NULL,
    search_enabled boolean DEFAULT true NOT NULL,
    card_cta_mode text DEFAULT 'view_details'::text NOT NULL,
    card_show_add_to_cart boolean DEFAULT true NOT NULL,
    card_show_view_details boolean DEFAULT true NOT NULL,
    card_show_buy_now boolean DEFAULT true NOT NULL,
    pdp_show_why_choose_us boolean DEFAULT true NOT NULL,
    pdp_show_shipment_details boolean DEFAULT true NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.site_review_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    kind public.site_review_media_kind NOT NULL,
    provider public.site_review_media_provider DEFAULT 'upload'::site_review_media_provider NOT NULL,
    external_video_id text,
    r2_key text,
    url text,
    thumbnail_url text,
    width integer,
    height integer,
    file_size bigint,
    duration_seconds numeric,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.site_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reviewer_name text NOT NULL,
    location text,
    review_date date DEFAULT (now())::date NOT NULL,
    title text,
    body text,
    rating integer DEFAULT 5 NOT NULL,
    review_type public.site_review_type DEFAULT 'text'::site_review_type NOT NULL,
    is_verified_purchase boolean DEFAULT false NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    type public.tag_type DEFAULT 'feature'::tag_type,
    icon text,
    color text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    review text DEFAULT ''::text NOT NULL,
    rating integer DEFAULT 5 NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    main_image_url text
);

CREATE TABLE IF NOT EXISTS public.tracking_pixels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    pixel_id text DEFAULT ''::text NOT NULL,
    access_token text,
    test_event_code text,
    advanced_matching boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    test_mode boolean DEFAULT false NOT NULL,
    log_retention_days integer DEFAULT 30 NOT NULL,
    logging_paused boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.video_testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_url text NOT NULL,
    thumbnail_url text,
    title text,
    subtitle text,
    product_id uuid,
    cta_text text DEFAULT 'Shop Now'::text,
    cta_enabled boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    autoplay boolean DEFAULT true NOT NULL,
    muted boolean DEFAULT true NOT NULL,
    loop boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.visitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_key text NOT NULL,
    first_seen timestamptz DEFAULT now() NOT NULL,
    last_seen timestamptz DEFAULT now() NOT NULL,
    total_sessions integer DEFAULT 0 NOT NULL,
    total_pageviews integer DEFAULT 0 NOT NULL,
    device_type text,
    browser text,
    os text,
    country text,
    city text,
    first_landing_page text,
    first_referrer text,
    first_utm jsonb DEFAULT '{}'::jsonb,
    customer_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
    id text NOT NULL,
    phone_number text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    radar_animation boolean DEFAULT true NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.why_choose_us_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    icon_name text DEFAULT 'Shield'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.worker_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    secret text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Constraints
DO $$ BEGIN ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_type_check CHECK ((type = ANY (ARRAY['order'::text, 'incomplete_order'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_settings ADD CONSTRAINT hero_settings_layout_check CHECK ((hero_layout = ANY (ARRAY['single'::text, 'dual'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_settings ADD CONSTRAINT hero_settings_singleton CHECK ((id = 'default'::text)); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_settings ADD CONSTRAINT hero_settings_type_check CHECK ((hero_type = ANY (ARRAY['image_slider'::text, 'video_hero'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_slides ADD CONSTRAINT hero_slides_interaction_mode_check CHECK ((interaction_mode = ANY (ARRAY['buttons'::text, 'image'::text, 'both'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.intelligence_settings ADD CONSTRAINT only_one_row CHECK ((id = 1)); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.review_hero_settings ADD CONSTRAINT single_row CHECK ((id = 1)); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.site_reviews ADD CONSTRAINT site_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.attribution_touchpoints ADD CONSTRAINT attribution_touchpoints_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.attribution_touchpoints ADD CONSTRAINT attribution_touchpoints_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bdcourier_verifications ADD CONSTRAINT bdcourier_verifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.ecomdrive_logs ADD CONSTRAINT ecomdrive_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.order_audit_log ADD CONSTRAINT order_audit_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_details ADD CONSTRAINT product_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_media ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_media ADD CONSTRAINT product_media_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_offers ADD CONSTRAINT product_offers_free_variant_id_fkey FOREIGN KEY (free_variant_id) REFERENCES product_variants(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_reminders ADD CONSTRAINT product_reminders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_reminders ADD CONSTRAINT product_reminders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_reminders ADD CONSTRAINT product_reminders_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_reminders ADD CONSTRAINT product_reminders_reorder_order_id_fkey FOREIGN KEY (reorder_order_id) REFERENCES orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_tags ADD CONSTRAINT product_tags_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_tags ADD CONSTRAINT product_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sessions ADD CONSTRAINT sessions_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.site_review_media ADD CONSTRAINT site_review_media_review_id_fkey FOREIGN KEY (review_id) REFERENCES site_reviews(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.video_testimonials ADD CONSTRAINT video_testimonials_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.about_sections ADD CONSTRAINT about_sections_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.announcement_bar ADD CONSTRAINT announcement_bar_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.announcement_bar_settings ADD CONSTRAINT announcement_bar_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.attribution_touchpoints ADD CONSTRAINT attribution_touchpoints_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bdcourier_verifications ADD CONSTRAINT bdcourier_verifications_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.capi_event_logs ADD CONSTRAINT capi_event_logs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.capi_test_results ADD CONSTRAINT capi_test_results_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contact_settings ADD CONSTRAINT contact_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupons ADD CONSTRAINT coupons_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.customer_profiles ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.daily_aggregates ADD CONSTRAINT daily_aggregates_pkey PRIMARY KEY (day); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.delivery_analytics ADD CONSTRAINT delivery_analytics_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.delivery_partners ADD CONSTRAINT delivery_partners_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.design_settings ADD CONSTRAINT design_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.direct_order_channels ADD CONSTRAINT direct_order_channels_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.ecomdrive_logs ADD CONSTRAINT ecomdrive_logs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.featured_categories ADD CONSTRAINT featured_categories_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.floating_icons ADD CONSTRAINT floating_icons_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.floating_icons_settings ADD CONSTRAINT floating_icons_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.footer_settings ADD CONSTRAINT footer_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_settings ADD CONSTRAINT hero_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.hero_slides ADD CONSTRAINT hero_slides_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.home_faqs ADD CONSTRAINT home_faqs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.incomplete_orders ADD CONSTRAINT incomplete_orders_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.intelligence_insights ADD CONSTRAINT intelligence_insights_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.intelligence_settings ADD CONSTRAINT intelligence_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.invoice_settings ADD CONSTRAINT invoice_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.media_audit_log ADD CONSTRAINT media_audit_log_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.offers ADD CONSTRAINT offers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.order_analytics ADD CONSTRAINT order_analytics_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.order_audit_log ADD CONSTRAINT order_audit_log_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.policies ADD CONSTRAINT policies_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_analytics ADD CONSTRAINT product_analytics_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_costs ADD CONSTRAINT product_costs_pkey PRIMARY KEY (product_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_details ADD CONSTRAINT product_details_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_faqs ADD CONSTRAINT product_faqs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_media ADD CONSTRAINT product_media_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_offers ADD CONSTRAINT product_offers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_reminders ADD CONSTRAINT product_reminders_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_tabs ADD CONSTRAINT product_tabs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_tags ADD CONSTRAINT product_tags_pkey PRIMARY KEY (product_id, tag_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.r2_deletion_queue ADD CONSTRAINT r2_deletion_queue_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.r2_orphan_sweep_runs ADD CONSTRAINT r2_orphan_sweep_runs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.review_hero_settings ADD CONSTRAINT review_hero_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.shop_settings ADD CONSTRAINT shop_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.site_review_media ADD CONSTRAINT site_review_media_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.site_reviews ADD CONSTRAINT site_reviews_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.service_credentials ADD CONSTRAINT service_credentials_pkey PRIMARY KEY (service); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.tracking_pixels ADD CONSTRAINT tracking_pixels_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.video_testimonials ADD CONSTRAINT video_testimonials_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.visitors ADD CONSTRAINT visitors_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.whatsapp_settings ADD CONSTRAINT whatsapp_settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.why_choose_us_cards ADD CONSTRAINT why_choose_us_cards_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.worker_secrets ADD CONSTRAINT worker_secrets_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.brands ADD CONSTRAINT brands_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.capi_test_results ADD CONSTRAINT capi_test_results_platform_key UNIQUE (platform); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.categories ADD CONSTRAINT categories_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupons ADD CONSTRAINT coupons_code_key UNIQUE (code); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.customer_profiles ADD CONSTRAINT customer_profiles_customer_id_key UNIQUE (customer_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.delivery_analytics ADD CONSTRAINT delivery_analytics_order_id_key UNIQUE (order_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.delivery_partners ADD CONSTRAINT delivery_partners_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.incomplete_orders ADD CONSTRAINT incomplete_orders_session_id_phone_key UNIQUE (session_id, phone); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.order_analytics ADD CONSTRAINT order_analytics_order_id_key UNIQUE (order_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.policies ADD CONSTRAINT policies_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_analytics ADD CONSTRAINT product_analytics_product_id_day_key UNIQUE (product_id, day); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_key_key UNIQUE (session_key); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.tags ADD CONSTRAINT tags_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.visitors ADD CONSTRAINT visitors_visitor_key_key UNIQUE (visitor_key); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.worker_secrets ADD CONSTRAINT worker_secrets_name_key UNIQUE (name); EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_seen_created ON public.admin_notifications USING btree (admin_seen, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_created ON public.admin_notifications USING btree (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unseen ON public.admin_notifications USING btree (type, created_at DESC) WHERE (admin_seen = false);
CREATE INDEX IF NOT EXISTS events_name_time_idx ON public.analytics_events USING btree (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS events_order_idx ON public.analytics_events USING btree (order_id);
CREATE INDEX IF NOT EXISTS events_product_idx ON public.analytics_events USING btree (product_id);
CREATE INDEX IF NOT EXISTS events_session_idx ON public.analytics_events USING btree (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_visitor_idx ON public.analytics_events USING btree (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_bar_sort ON public.announcement_bar USING btree (sort_order);
CREATE INDEX IF NOT EXISTS attr_visitor_idx ON public.attribution_touchpoints USING btree (visitor_id, occurred_at);
CREATE INDEX IF NOT EXISTS bdcourier_verifications_order_idx ON public.bdcourier_verifications USING btree (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bdcourier_verifications_phone_idx ON public.bdcourier_verifications USING btree (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS capi_event_logs_created_at_idx ON public.capi_event_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS capi_event_logs_created_event_idx ON public.capi_event_logs USING btree (created_at DESC, event_name);
CREATE INDEX IF NOT EXISTS capi_event_logs_created_status_idx ON public.capi_event_logs USING btree (created_at DESC, status);
CREATE INDEX IF NOT EXISTS capi_event_logs_event_id_idx ON public.capi_event_logs USING btree (event_id);
CREATE UNIQUE INDEX categories_full_slug_idx ON public.categories USING btree (full_slug);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories USING btree (parent_id);
CREATE INDEX IF NOT EXISTS cp_ltv_idx ON public.customer_profiles USING btree (lifetime_value DESC);
CREATE INDEX IF NOT EXISTS cp_phone_idx ON public.customer_profiles USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers USING btree (email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_created_at ON public.ecomdrive_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_order_id ON public.ecomdrive_logs USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_success ON public.ecomdrive_logs USING btree (success);
CREATE INDEX IF NOT EXISTS idx_featured_categories_enabled_sort ON public.featured_categories USING btree (sort_order) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS idx_hero_slides_enabled_sort ON public.hero_slides USING btree (sort_order) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_last_activity ON public.incomplete_orders USING btree (last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_last_activity_desc ON public.incomplete_orders USING btree (last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_phone ON public.incomplete_orders USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_recovered ON public.incomplete_orders USING btree (recovered);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_session ON public.incomplete_orders USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_status ON public.incomplete_orders USING btree (recovery_status);
CREATE INDEX IF NOT EXISTS idx_inv_tx_order ON public.inventory_transactions USING btree (order_id, reason);
CREATE UNIQUE INDEX uniq_inv_tx_cancel_restock ON public.inventory_transactions USING btree (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (reason = 'cancel_restock'::text);
CREATE INDEX IF NOT EXISTS idx_media_audit_log_performed_at ON public.media_audit_log USING btree (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_audit_log_ref ON public.media_audit_log USING btree (ref);
CREATE INDEX IF NOT EXISTS oa_visitor_idx ON public.order_analytics USING btree (visitor_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_action ON public.order_audit_log USING btree (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_audit_order ON public.order_audit_log USING btree (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON public.orders USING btree (created_at DESC, order_status);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders USING btree (deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_is_pos_true ON public.orders USING btree (created_at DESC) WHERE (is_pos = true);
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON public.orders USING btree (paid_at) WHERE ((payment_status = 'paid'::text) AND (deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders USING btree (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders USING btree (order_status);
CREATE INDEX IF NOT EXISTS pa_day_idx ON public.product_analytics USING btree (day DESC);
CREATE INDEX IF NOT EXISTS product_details_product_id_idx ON public.product_details USING btree (product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_faqs_product ON public.product_faqs USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_media_product_sort ON public.product_media USING btree (product_id, sort_order);
CREATE INDEX IF NOT EXISTS product_media_product_idx ON public.product_media USING btree (product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_free_variant ON public.product_offers USING btree (free_variant_id) WHERE (free_variant_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_product_offers_product ON public.product_offers USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_product_enabled ON public.product_offers USING btree (product_id) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS idx_product_reminders_completed_at ON public.product_reminders USING btree (completed_at);
CREATE INDEX IF NOT EXISTS idx_product_reminders_customer_phone ON public.product_reminders USING btree (customer_phone);
CREATE INDEX IF NOT EXISTS idx_product_reminders_due ON public.product_reminders USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_due_date ON public.product_reminders USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_followup ON public.product_reminders USING btree (follow_up_date) WHERE (status = 'follow_up'::reminder_status);
CREATE INDEX IF NOT EXISTS idx_product_reminders_next_action ON public.product_reminders USING btree (next_action_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_phone ON public.product_reminders USING btree (customer_phone);
CREATE INDEX IF NOT EXISTS idx_product_reminders_product ON public.product_reminders USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_product_id ON public.product_reminders USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_reorder_amount ON public.product_reminders USING btree (reorder_amount);
CREATE INDEX IF NOT EXISTS idx_product_reminders_resolved_at ON public.product_reminders USING btree (resolved_at);
CREATE INDEX IF NOT EXISTS idx_product_reminders_status ON public.product_reminders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_product_reminders_status_due ON public.product_reminders USING btree (status, due_date);
CREATE UNIQUE INDEX product_reminders_open_uniq ON public.product_reminders USING btree (customer_phone, product_id) WHERE (status = ANY (ARRAY['pending'::reminder_status, 'called'::reminder_status, 'follow_up'::reminder_status, 'no_response'::reminder_status, 'interested'::reminder_status]));
CREATE INDEX IF NOT EXISTS product_reminders_phone_product_status_idx ON public.product_reminders USING btree (customer_phone, product_id, status);
CREATE INDEX IF NOT EXISTS product_reminders_status_due_idx ON public.product_reminders USING btree (status, due_date);
CREATE INDEX IF NOT EXISTS idx_product_tabs_product ON public.product_tabs USING btree (product_id);
CREATE INDEX IF NOT EXISTS product_tags_tag_idx ON public.product_tags USING btree (tag_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON public.product_variants USING btree (product_id) WHERE (active = true);
CREATE INDEX IF NOT EXISTS product_variants_product_active_sort_idx ON public.product_variants USING btree (product_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_best_seller ON public.products USING btree (sort_order) WHERE (best_seller = true);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products USING btree (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_products_category_sort ON public.products USING btree (category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_created_desc ON public.products USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products USING btree (sort_order) WHERE (featured = true);
CREATE INDEX IF NOT EXISTS idx_products_new_arrival ON public.products USING btree (sort_order) WHERE (is_new_arrival = true);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON public.products USING btree (sort_order);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products USING btree (status);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products USING btree (category_id);
CREATE INDEX IF NOT EXISTS products_flags_idx ON public.products USING btree (featured, best_seller, is_new_arrival);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products USING btree (status);
CREATE INDEX IF NOT EXISTS idx_r2q_pending ON public.r2_deletion_queue USING btree (queued_at) WHERE (processed_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_r2_sweep_runs_started ON public.r2_orphan_sweep_runs USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews USING btree (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_clarity_idx ON public.sessions USING btree (clarity_session_id);
CREATE INDEX IF NOT EXISTS sessions_started_idx ON public.sessions USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_visitor_idx ON public.sessions USING btree (visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_review_media_review ON public.site_review_media USING btree (review_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_site_reviews_type ON public.site_reviews USING btree (review_type);
CREATE INDEX IF NOT EXISTS idx_site_reviews_visible_sort ON public.site_reviews USING btree (is_visible, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS tags_type_idx ON public.tags USING btree (type);
CREATE INDEX IF NOT EXISTS idx_video_testimonials_enabled_sort ON public.video_testimonials USING btree (sort_order) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS visitors_customer_idx ON public.visitors USING btree (customer_id);
CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON public.visitors USING btree (last_seen DESC);
