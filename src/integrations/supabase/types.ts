export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      about_sections: {
        Row: {
          content: Json
          enabled: boolean
          id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content?: Json
          enabled?: boolean
          id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content?: Json
          enabled?: boolean
          id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          admin_seen: boolean
          amount: number
          created_at: string
          customer_name: string | null
          id: string
          message: string | null
          reference_id: string | null
          seen_at: string | null
          title: string
          type: string
          url: string | null
        }
        Insert: {
          admin_seen?: boolean
          amount?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          message?: string | null
          reference_id?: string | null
          seen_at?: string | null
          title: string
          type: string
          url?: string | null
        }
        Update: {
          admin_seen?: boolean
          amount?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          message?: string | null
          reference_id?: string | null
          seen_at?: string | null
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          currency: string | null
          customer_id: string | null
          event_name: string
          id: number
          order_id: string | null
          path: string | null
          product_id: string | null
          props: Json | null
          session_id: string | null
          value: number | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          event_name: string
          id?: number
          order_id?: string | null
          path?: string | null
          product_id?: string | null
          props?: Json | null
          session_id?: string | null
          value?: number | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          event_name?: string
          id?: number
          order_id?: string | null
          path?: string | null
          product_id?: string | null
          props?: Json | null
          session_id?: string | null
          value?: number | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      announcement_bar: {
        Row: {
          bg_color: string
          dismissible: boolean
          enabled: boolean
          id: string
          link: string
          sort_order: number
          text: string
          text_color: string
          updated_at: string
        }
        Insert: {
          bg_color?: string
          dismissible?: boolean
          enabled?: boolean
          id: string
          link?: string
          sort_order?: number
          text?: string
          text_color?: string
          updated_at?: string
        }
        Update: {
          bg_color?: string
          dismissible?: boolean
          enabled?: boolean
          id?: string
          link?: string
          sort_order?: number
          text?: string
          text_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      announcement_bar_settings: {
        Row: {
          direction: string
          id: string
          speed: number
          updated_at: string
        }
        Insert: {
          direction?: string
          id?: string
          speed?: number
          updated_at?: string
        }
        Update: {
          direction?: string
          id?: string
          speed?: number
          updated_at?: string
        }
        Relationships: []
      }
      attribution_touchpoints: {
        Row: {
          campaign: string | null
          content: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          is_first: boolean | null
          is_last: boolean | null
          landing_page: string | null
          medium: string | null
          occurred_at: string
          raw: Json | null
          referrer: string | null
          session_id: string | null
          source: string | null
          term: string | null
          ttclid: string | null
          visitor_id: string | null
        }
        Insert: {
          campaign?: string | null
          content?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_first?: boolean | null
          is_last?: boolean | null
          landing_page?: string | null
          medium?: string | null
          occurred_at?: string
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          term?: string | null
          ttclid?: string | null
          visitor_id?: string | null
        }
        Update: {
          campaign?: string | null
          content?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_first?: boolean | null
          is_last?: boolean | null
          landing_page?: string | null
          medium?: string | null
          occurred_at?: string
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          term?: string | null
          ttclid?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_touchpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_touchpoints_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      bdcourier_verifications: {
        Row: {
          cancelled_parcel: number | null
          checked_by: string | null
          couriers: Json | null
          created_at: string
          fraud_report_count: number | null
          id: string
          order_id: string | null
          phone: string
          raw: Json | null
          reasons: Json | null
          recommendation: string | null
          risk_label: string | null
          risk_level: string | null
          success_parcel: number | null
          success_ratio: number | null
          total_parcel: number | null
        }
        Insert: {
          cancelled_parcel?: number | null
          checked_by?: string | null
          couriers?: Json | null
          created_at?: string
          fraud_report_count?: number | null
          id?: string
          order_id?: string | null
          phone: string
          raw?: Json | null
          reasons?: Json | null
          recommendation?: string | null
          risk_label?: string | null
          risk_level?: string | null
          success_parcel?: number | null
          success_ratio?: number | null
          total_parcel?: number | null
        }
        Update: {
          cancelled_parcel?: number | null
          checked_by?: string | null
          couriers?: Json | null
          created_at?: string
          fraud_report_count?: number | null
          id?: string
          order_id?: string | null
          phone?: string
          raw?: Json | null
          reasons?: Json | null
          recommendation?: string | null
          risk_label?: string | null
          risk_level?: string | null
          success_parcel?: number | null
          success_ratio?: number | null
          total_parcel?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bdcourier_verifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          image_url: string | null
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          image_url?: string | null
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          image_url?: string | null
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      capi_event_logs: {
        Row: {
          attempts: number
          created_at: string
          currency: string | null
          error: string | null
          event_id: string
          event_name: string
          http_status: number | null
          id: string
          order_id: string | null
          payload: Json | null
          product_ids: string[] | null
          response: string | null
          response_time_ms: number | null
          source: string
          status: string
          test_mode: boolean
          value: number | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          currency?: string | null
          error?: string | null
          event_id: string
          event_name: string
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          product_ids?: string[] | null
          response?: string | null
          response_time_ms?: number | null
          source?: string
          status: string
          test_mode?: boolean
          value?: number | null
        }
        Update: {
          attempts?: number
          created_at?: string
          currency?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          product_ids?: string[] | null
          response?: string | null
          response_time_ms?: number | null
          source?: string
          status?: string
          test_mode?: boolean
          value?: number | null
        }
        Relationships: []
      }
      capi_test_results: {
        Row: {
          api_version: string | null
          business_name: string | null
          diagnostics: Json | null
          events_received: number | null
          http_status: number | null
          id: string
          message: string | null
          pixel_id: string | null
          platform: string
          status: string
          test_event_code: string | null
          tested_at: string
          tested_by: string | null
        }
        Insert: {
          api_version?: string | null
          business_name?: string | null
          diagnostics?: Json | null
          events_received?: number | null
          http_status?: number | null
          id?: string
          message?: string | null
          pixel_id?: string | null
          platform?: string
          status: string
          test_event_code?: string | null
          tested_at?: string
          tested_by?: string | null
        }
        Update: {
          api_version?: string | null
          business_name?: string | null
          diagnostics?: Json | null
          events_received?: number | null
          http_status?: number | null
          id?: string
          message?: string | null
          pixel_id?: string | null
          platform?: string
          status?: string
          test_event_code?: string | null
          tested_at?: string
          tested_by?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_type: Database["public"]["Enums"]["category_type"]
          created_at: string
          enabled: boolean
          featured_image_url: string | null
          full_slug: string | null
          id: string
          image_url: string | null
          level: number
          meta_description: string | null
          meta_title: string | null
          name: string
          parent_id: string | null
          path: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_type?: Database["public"]["Enums"]["category_type"]
          created_at?: string
          enabled?: boolean
          featured_image_url?: string | null
          full_slug?: string | null
          id?: string
          image_url?: string | null
          level?: number
          meta_description?: string | null
          meta_title?: string | null
          name: string
          parent_id?: string | null
          path?: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_type?: Database["public"]["Enums"]["category_type"]
          created_at?: string
          enabled?: boolean
          featured_image_url?: string | null
          full_slug?: string | null
          id?: string
          image_url?: string | null
          level?: number
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          parent_id?: string | null
          path?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contact_settings: {
        Row: {
          business_address: string | null
          email_address: string | null
          faq_shortcut_enabled: boolean
          faq_shortcut_items: Json
          id: string
          map_embed: string | null
          map_enabled: boolean
          page_intro: string | null
          page_title: string | null
          phone_field_enabled: boolean
          phone_number: string | null
          receiving_email: string | null
          show_address: boolean
          social_links: Json
          social_section_enabled: boolean
          submit_button_text: string | null
          updated_at: string
        }
        Insert: {
          business_address?: string | null
          email_address?: string | null
          faq_shortcut_enabled?: boolean
          faq_shortcut_items?: Json
          id: string
          map_embed?: string | null
          map_enabled?: boolean
          page_intro?: string | null
          page_title?: string | null
          phone_field_enabled?: boolean
          phone_number?: string | null
          receiving_email?: string | null
          show_address?: boolean
          social_links?: Json
          social_section_enabled?: boolean
          submit_button_text?: string | null
          updated_at?: string
        }
        Update: {
          business_address?: string | null
          email_address?: string | null
          faq_shortcut_enabled?: boolean
          faq_shortcut_items?: Json
          id?: string
          map_embed?: string | null
          map_enabled?: boolean
          page_intro?: string | null
          page_title?: string | null
          phone_field_enabled?: boolean
          phone_number?: string | null
          receiving_email?: string | null
          show_address?: boolean
          social_links?: Json
          social_section_enabled?: boolean
          submit_button_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          name: string
          phone: string | null
          read: boolean
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name: string
          phone?: string | null
          read?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string
          phone?: string | null
          read?: boolean
          status?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          enabled: boolean
          end_date: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          min_cart_total: number | null
          min_order_amount: number | null
          start_date: string | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          enabled?: boolean
          end_date?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_cart_total?: number | null
          min_order_amount?: number | null
          start_date?: string | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          enabled?: boolean
          end_date?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_cart_total?: number | null
          min_order_amount?: number | null
          start_date?: string | null
          used_count?: number
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          acquisition_campaign: string | null
          acquisition_medium: string | null
          acquisition_source: string | null
          avg_order_value: number
          customer_id: string | null
          delivered_count: number
          delivered_value: number
          do_not_remind: boolean
          email: string | null
          first_purchase_at: string | null
          first_visitor_id: string | null
          id: string
          last_purchase_at: string | null
          lifetime_value: number
          order_count: number
          phone: string | null
          primary_visitor_id: string | null
          updated_at: string
        }
        Insert: {
          acquisition_campaign?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          avg_order_value?: number
          customer_id?: string | null
          delivered_count?: number
          delivered_value?: number
          do_not_remind?: boolean
          email?: string | null
          first_purchase_at?: string | null
          first_visitor_id?: string | null
          id?: string
          last_purchase_at?: string | null
          lifetime_value?: number
          order_count?: number
          phone?: string | null
          primary_visitor_id?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_campaign?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          avg_order_value?: number
          customer_id?: string | null
          delivered_count?: number
          delivered_value?: number
          do_not_remind?: boolean
          email?: string | null
          first_purchase_at?: string | null
          first_visitor_id?: string | null
          id?: string
          last_purchase_at?: string | null
          lifetime_value?: number
          order_count?: number
          phone?: string | null
          primary_visitor_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          total_orders: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_aggregates: {
        Row: {
          add_to_carts: number
          checkouts: number
          day: string
          delivered: number
          delivered_revenue: number
          new_customers: number
          pageviews: number
          product_views: number
          purchases: number
          repeat_customers: number
          revenue: number
          sessions: number
          updated_at: string
          visitors: number
        }
        Insert: {
          add_to_carts?: number
          checkouts?: number
          day: string
          delivered?: number
          delivered_revenue?: number
          new_customers?: number
          pageviews?: number
          product_views?: number
          purchases?: number
          repeat_customers?: number
          revenue?: number
          sessions?: number
          updated_at?: string
          visitors?: number
        }
        Update: {
          add_to_carts?: number
          checkouts?: number
          day?: string
          delivered?: number
          delivered_revenue?: number
          new_customers?: number
          pageviews?: number
          product_views?: number
          purchases?: number
          repeat_customers?: number
          revenue?: number
          sessions?: number
          updated_at?: string
          visitors?: number
        }
        Relationships: []
      }
      delivery_analytics: {
        Row: {
          cancelled_at: string | null
          confirmed_at: string | null
          courier: string | null
          courier_cost: number | null
          delivered_at: string | null
          id: string
          order_id: string
          packed_at: string | null
          pending_at: string | null
          returned_at: string | null
          shipped_at: string | null
          stage: Database["public"]["Enums"]["delivery_stage"]
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          courier?: string | null
          courier_cost?: number | null
          delivered_at?: string | null
          id?: string
          order_id: string
          packed_at?: string | null
          pending_at?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          stage?: Database["public"]["Enums"]["delivery_stage"]
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          courier?: string | null
          courier_cost?: number | null
          delivered_at?: string | null
          id?: string
          order_id?: string
          packed_at?: string | null
          pending_at?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          stage?: Database["public"]["Enums"]["delivery_stage"]
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      delivery_partners: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          slug: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          slug: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          areas: Json
          created_at: string
          delivery_charge: number
          enabled: boolean
          estimated_days: string | null
          free_delivery_minimum: number | null
          free_shipping_threshold: number | null
          id: string
          name: string
          shipping_cost: number
          sort_order: number
          zone_name: string | null
        }
        Insert: {
          areas?: Json
          created_at?: string
          delivery_charge?: number
          enabled?: boolean
          estimated_days?: string | null
          free_delivery_minimum?: number | null
          free_shipping_threshold?: number | null
          id?: string
          name?: string
          shipping_cost?: number
          sort_order?: number
          zone_name?: string | null
        }
        Update: {
          areas?: Json
          created_at?: string
          delivery_charge?: number
          enabled?: boolean
          estimated_days?: string | null
          free_delivery_minimum?: number | null
          free_shipping_threshold?: number | null
          id?: string
          name?: string
          shipping_cost?: number
          sort_order?: number
          zone_name?: string | null
        }
        Relationships: []
      }
      design_settings: {
        Row: {
          favicon_url: string | null
          id: string
          logo_desktop_url: string | null
          logo_footer_url: string | null
          logo_mobile_url: string | null
          updated_at: string
        }
        Insert: {
          favicon_url?: string | null
          id: string
          logo_desktop_url?: string | null
          logo_footer_url?: string | null
          logo_mobile_url?: string | null
          updated_at?: string
        }
        Update: {
          favicon_url?: string | null
          id?: string
          logo_desktop_url?: string | null
          logo_footer_url?: string | null
          logo_mobile_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      direct_order_channels: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          identifier: string
          label: string
          message_template: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          identifier?: string
          label?: string
          message_template?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          identifier?: string
          label?: string
          message_template?: string
          sort_order?: number
        }
        Relationships: []
      }
      ecomdrive_logs: {
        Row: {
          created_at: string
          endpoint: string
          error: string | null
          http_status: number | null
          id: string
          invoice_number: string | null
          method: string
          order_id: string | null
          request_payload: Json | null
          response_body: Json | null
          retry_attempt: number
          success: boolean
        }
        Insert: {
          created_at?: string
          endpoint: string
          error?: string | null
          http_status?: number | null
          id?: string
          invoice_number?: string | null
          method?: string
          order_id?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          retry_attempt?: number
          success?: boolean
        }
        Update: {
          created_at?: string
          endpoint?: string
          error?: string | null
          http_status?: number | null
          id?: string
          invoice_number?: string | null
          method?: string
          order_id?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          retry_attempt?: number
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ecomdrive_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_categories: {
        Row: {
          category_id: string | null
          created_at: string
          enabled: boolean
          id: string
          sort_order: number
          title: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string | null
        }
        Relationships: []
      }
      floating_icons: {
        Row: {
          bg_color: string
          created_at: string
          enabled: boolean
          icon_color: string | null
          icon_url: string | null
          id: string
          label: string
          preset_key: string | null
          sort_order: number
          url: string
        }
        Insert: {
          bg_color?: string
          created_at?: string
          enabled?: boolean
          icon_color?: string | null
          icon_url?: string | null
          id?: string
          label?: string
          preset_key?: string | null
          sort_order?: number
          url?: string
        }
        Update: {
          bg_color?: string
          created_at?: string
          enabled?: boolean
          icon_color?: string | null
          icon_url?: string | null
          id?: string
          label?: string
          preset_key?: string | null
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      floating_icons_settings: {
        Row: {
          animation_intensity: string | null
          animation_style: string | null
          enabled: boolean
          expand_icon_url: string | null
          id: string
          radar_animation: boolean
          updated_at: string
        }
        Insert: {
          animation_intensity?: string | null
          animation_style?: string | null
          enabled?: boolean
          expand_icon_url?: string | null
          id: string
          radar_animation?: boolean
          updated_at?: string
        }
        Update: {
          animation_intensity?: string | null
          animation_style?: string | null
          enabled?: boolean
          expand_icon_url?: string | null
          id?: string
          radar_animation?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      footer_settings: {
        Row: {
          address: string
          copyright_text: string
          customer_care_links: Json
          description: string
          email: string
          id: string
          newsletter_enabled: boolean
          phone: string
          quick_links: Json
          social_links: Json
          store_name: string
          updated_at: string
        }
        Insert: {
          address?: string
          copyright_text?: string
          customer_care_links?: Json
          description?: string
          email?: string
          id: string
          newsletter_enabled?: boolean
          phone?: string
          quick_links?: Json
          social_links?: Json
          store_name?: string
          updated_at?: string
        }
        Update: {
          address?: string
          copyright_text?: string
          customer_care_links?: Json
          description?: string
          email?: string
          id?: string
          newsletter_enabled?: boolean
          phone?: string
          quick_links?: Json
          social_links?: Json
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hero_settings: {
        Row: {
          autoplay: boolean
          created_at: string
          desktop_video_url: string | null
          enabled: boolean
          hero_layout: string
          hero_type: string
          id: string
          infinite_loop: boolean
          mobile_video_url: string | null
          poster_image_url: string | null
          swipe_enabled: boolean
          transition_speed_ms: number
          updated_at: string
          video_autoplay: boolean
          video_button1_link: string | null
          video_button1_text: string | null
          video_button2_link: string | null
          video_button2_text: string | null
          video_click_link: string | null
          video_headline: string | null
          video_loop: boolean
          video_muted: boolean
          video_subheadline: string | null
        }
        Insert: {
          autoplay?: boolean
          created_at?: string
          desktop_video_url?: string | null
          enabled?: boolean
          hero_layout?: string
          hero_type?: string
          id?: string
          infinite_loop?: boolean
          mobile_video_url?: string | null
          poster_image_url?: string | null
          swipe_enabled?: boolean
          transition_speed_ms?: number
          updated_at?: string
          video_autoplay?: boolean
          video_button1_link?: string | null
          video_button1_text?: string | null
          video_button2_link?: string | null
          video_button2_text?: string | null
          video_click_link?: string | null
          video_headline?: string | null
          video_loop?: boolean
          video_muted?: boolean
          video_subheadline?: string | null
        }
        Update: {
          autoplay?: boolean
          created_at?: string
          desktop_video_url?: string | null
          enabled?: boolean
          hero_layout?: string
          hero_type?: string
          id?: string
          infinite_loop?: boolean
          mobile_video_url?: string | null
          poster_image_url?: string | null
          swipe_enabled?: boolean
          transition_speed_ms?: number
          updated_at?: string
          video_autoplay?: boolean
          video_button1_link?: string | null
          video_button1_text?: string | null
          video_button2_link?: string | null
          video_button2_text?: string | null
          video_click_link?: string | null
          video_headline?: string | null
          video_loop?: boolean
          video_muted?: boolean
          video_subheadline?: string | null
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          button1_link: string | null
          button1_text: string | null
          button2_link: string | null
          button2_text: string | null
          created_at: string
          enabled: boolean
          headline: string | null
          id: string
          image_click_link: string | null
          image_url: string
          interaction_mode: string
          mobile_image_url: string | null
          sort_order: number
          subheadline: string | null
          updated_at: string
        }
        Insert: {
          button1_link?: string | null
          button1_text?: string | null
          button2_link?: string | null
          button2_text?: string | null
          created_at?: string
          enabled?: boolean
          headline?: string | null
          id?: string
          image_click_link?: string | null
          image_url?: string
          interaction_mode?: string
          mobile_image_url?: string | null
          sort_order?: number
          subheadline?: string | null
          updated_at?: string
        }
        Update: {
          button1_link?: string | null
          button1_text?: string | null
          button2_link?: string | null
          button2_text?: string | null
          created_at?: string
          enabled?: boolean
          headline?: string | null
          id?: string
          image_click_link?: string | null
          image_url?: string
          interaction_mode?: string
          mobile_image_url?: string | null
          sort_order?: number
          subheadline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      home_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          sort_order: number
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          sort_order?: number
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          content: Json
          enabled: boolean
          id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content?: Json
          enabled?: boolean
          id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content?: Json
          enabled?: boolean
          id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      incomplete_orders: {
        Row: {
          address: Json
          cart_items: Json
          checkout_step: string
          converted_order_id: string | null
          coupon: string | null
          created_at: string
          customer_name: string | null
          delivery_charge: number
          email: string | null
          id: string
          last_activity: string
          payment_method: string | null
          phone: string
          recovered: boolean
          recovery_status: string
          session_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          address?: Json
          cart_items?: Json
          checkout_step?: string
          converted_order_id?: string | null
          coupon?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_charge?: number
          email?: string | null
          id?: string
          last_activity?: string
          payment_method?: string | null
          phone: string
          recovered?: boolean
          recovery_status?: string
          session_id: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          address?: Json
          cart_items?: Json
          checkout_step?: string
          converted_order_id?: string | null
          coupon?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_charge?: number
          email?: string | null
          id?: string
          last_activity?: string
          payment_method?: string | null
          phone?: string
          recovered?: boolean
          recovery_status?: string
          session_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_insights: {
        Row: {
          body: string
          category: string | null
          dismissed: boolean
          generated_at: string
          id: string
          metrics: Json | null
          period_end: string | null
          period_start: string | null
          title: string
          tone: string | null
        }
        Insert: {
          body: string
          category?: string | null
          dismissed?: boolean
          generated_at?: string
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          title: string
          tone?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          dismissed?: boolean
          generated_at?: string
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          title?: string
          tone?: string | null
        }
        Relationships: []
      }
      intelligence_settings: {
        Row: {
          ai_insights_enabled: boolean
          attribution_model: Database["public"]["Enums"]["attribution_model"]
          clarity_project_id: string | null
          cod_fee_percent: number
          gateway_fee_percent: number
          id: number
          packaging_cost_default: number
          updated_at: string
        }
        Insert: {
          ai_insights_enabled?: boolean
          attribution_model?: Database["public"]["Enums"]["attribution_model"]
          clarity_project_id?: string | null
          cod_fee_percent?: number
          gateway_fee_percent?: number
          id?: number
          packaging_cost_default?: number
          updated_at?: string
        }
        Update: {
          ai_insights_enabled?: boolean
          attribution_model?: Database["public"]["Enums"]["attribution_model"]
          clarity_project_id?: string | null
          cod_fee_percent?: number
          gateway_fee_percent?: number
          id?: number
          packaging_cost_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          product_id: string | null
          quantity_delta: number
          reason: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity_delta: number
          reason: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity_delta?: number
          reason?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          footer_note: string | null
          footer_text: string | null
          id: string
          logo_url: string | null
          signature_label: string | null
          store_address: string | null
          store_email: string | null
          store_name: string | null
          store_phone: string | null
          terms_text: string | null
          updated_at: string
        }
        Insert: {
          footer_note?: string | null
          footer_text?: string | null
          id: string
          logo_url?: string | null
          signature_label?: string | null
          store_address?: string | null
          store_email?: string | null
          store_name?: string | null
          store_phone?: string | null
          terms_text?: string | null
          updated_at?: string
        }
        Update: {
          footer_note?: string | null
          footer_text?: string | null
          id?: string
          logo_url?: string | null
          signature_label?: string | null
          store_address?: string | null
          store_email?: string | null
          store_name?: string | null
          store_phone?: string | null
          terms_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_audit_log: {
        Row: {
          action: string
          error_message: string | null
          id: string
          object_key: string | null
          performed_at: string
          performed_by: string | null
          ref: string
          success: boolean
          usage: Json | null
        }
        Insert: {
          action: string
          error_message?: string | null
          id?: string
          object_key?: string | null
          performed_at?: string
          performed_by?: string | null
          ref: string
          success: boolean
          usage?: Json | null
        }
        Update: {
          action?: string
          error_message?: string | null
          id?: string
          object_key?: string | null
          performed_at?: string
          performed_by?: string | null
          ref?: string
          success?: boolean
          usage?: Json | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          subscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          subscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          subscribed_at?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          apply_to: string
          banner_image: string | null
          created_at: string
          discount_type: string
          discount_value: number
          enabled: boolean
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          target_ids: string[] | null
        }
        Insert: {
          apply_to?: string
          banner_image?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number
          enabled?: boolean
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          target_ids?: string[] | null
        }
        Update: {
          apply_to?: string
          banner_image?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number
          enabled?: boolean
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          target_ids?: string[] | null
        }
        Relationships: []
      }
      order_analytics: {
        Row: {
          ad_cost: number | null
          courier_cost: number | null
          created_at: string
          customer_profile_id: string | null
          delivered_at: string | null
          first_attribution: Json | null
          gateway_fee: number | null
          gross_profit: number | null
          id: string
          is_delivered: boolean | null
          is_first_purchase: boolean | null
          journey: Json | null
          last_attribution: Json | null
          order_id: string
          packaging_cost: number | null
          product_cost: number | null
          session_id: string | null
          updated_at: string
          visitor_id: string | null
        }
        Insert: {
          ad_cost?: number | null
          courier_cost?: number | null
          created_at?: string
          customer_profile_id?: string | null
          delivered_at?: string | null
          first_attribution?: Json | null
          gateway_fee?: number | null
          gross_profit?: number | null
          id?: string
          is_delivered?: boolean | null
          is_first_purchase?: boolean | null
          journey?: Json | null
          last_attribution?: Json | null
          order_id: string
          packaging_cost?: number | null
          product_cost?: number | null
          session_id?: string | null
          updated_at?: string
          visitor_id?: string | null
        }
        Update: {
          ad_cost?: number | null
          courier_cost?: number | null
          created_at?: string
          customer_profile_id?: string | null
          delivered_at?: string | null
          first_attribution?: Json | null
          gateway_fee?: number | null
          gross_profit?: number | null
          id?: string
          is_delivered?: boolean | null
          is_first_purchase?: boolean | null
          journey?: Json | null
          last_attribution?: Json | null
          order_id?: string
          packaging_cost?: number | null
          product_cost?: number | null
          session_id?: string | null
          updated_at?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      order_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          order_id: string | null
          previous_value: Json | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          order_id?: string | null
          previous_value?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          order_id?: string | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_code: string | null
          created_at: string
          customer_address: string
          customer_city: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          deleted_at: string | null
          delivery_partner: string | null
          discount_amount: number
          id: string
          is_pos: boolean
          items: Json
          notes: string | null
          order_number: string
          order_status: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          restocked_at: string | null
          shipping_address: Json
          shipping_cost: number
          subtotal: number
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          customer_address?: string
          customer_city?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          deleted_at?: string | null
          delivery_partner?: string | null
          discount_amount?: number
          id?: string
          is_pos?: boolean
          items?: Json
          notes?: string | null
          order_number: string
          order_status?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          restocked_at?: string | null
          shipping_address?: Json
          shipping_cost?: number
          subtotal?: number
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          customer_address?: string
          customer_city?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          deleted_at?: string | null
          delivery_partner?: string | null
          discount_amount?: number
          id?: string
          is_pos?: boolean
          items?: Json
          notes?: string | null
          order_number?: string
          order_status?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          restocked_at?: string | null
          shipping_address?: Json
          shipping_cost?: number
          subtotal?: number
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          bkash_enabled: boolean
          bkash_number: string | null
          cod_enabled: boolean
          id: string
          methods: Json | null
          nagad_enabled: boolean
          nagad_number: string | null
          payment_note: string | null
          updated_at: string
        }
        Insert: {
          bkash_enabled?: boolean
          bkash_number?: string | null
          cod_enabled?: boolean
          id?: string
          methods?: Json | null
          nagad_enabled?: boolean
          nagad_number?: string | null
          payment_note?: string | null
          updated_at?: string
        }
        Update: {
          bkash_enabled?: boolean
          bkash_number?: string | null
          cod_enabled?: boolean
          id?: string
          methods?: Json | null
          nagad_enabled?: boolean
          nagad_number?: string | null
          payment_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          content: string
          enabled: boolean
          id: string
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          enabled?: boolean
          id?: string
          slug: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          enabled?: boolean
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_analytics: {
        Row: {
          add_to_cart: number
          checkout_starts: number
          day: string
          delivered: number
          delivered_revenue: number
          id: string
          product_id: string
          purchases: number
          returned: number
          revenue: number
          views: number
        }
        Insert: {
          add_to_cart?: number
          checkout_starts?: number
          day: string
          delivered?: number
          delivered_revenue?: number
          id?: string
          product_id: string
          purchases?: number
          returned?: number
          revenue?: number
          views?: number
        }
        Update: {
          add_to_cart?: number
          checkout_starts?: number
          day?: string
          delivered?: number
          delivered_revenue?: number
          id?: string
          product_id?: string
          purchases?: number
          returned?: number
          revenue?: number
          views?: number
        }
        Relationships: []
      }
      product_costs: {
        Row: {
          packaging_cost: number | null
          product_cost: number
          product_id: string
          updated_at: string
        }
        Insert: {
          packaging_cost?: number | null
          product_cost?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          packaging_cost?: number | null
          product_cost?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_details: {
        Row: {
          created_at: string
          id: string
          label: string
          product_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          product_id: string
          sort_order?: number
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          product_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
        ]
      }
      product_faqs: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          product_id: string
          question: string
          sort_order: number
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          product_id: string
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          product_id?: string
          question?: string
          sort_order?: number
        }
        Relationships: []
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
          type: Database["public"]["Enums"]["media_type"]
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
          type?: Database["public"]["Enums"]["media_type"]
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["media_type"]
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          buy_quantity: number | null
          created_at: string
          discount_value: number | null
          display_text: string
          enabled: boolean
          free_product_id: string | null
          free_variant_id: string | null
          get_quantity: number | null
          id: string
          min_cart_total: number | null
          offer_type: string
          product_id: string
          sort_order: number
          target_variant_ids: string[]
        }
        Insert: {
          buy_quantity?: number | null
          created_at?: string
          discount_value?: number | null
          display_text?: string
          enabled?: boolean
          free_product_id?: string | null
          free_variant_id?: string | null
          get_quantity?: number | null
          id?: string
          min_cart_total?: number | null
          offer_type: string
          product_id: string
          sort_order?: number
          target_variant_ids?: string[]
        }
        Update: {
          buy_quantity?: number | null
          created_at?: string
          discount_value?: number | null
          display_text?: string
          enabled?: boolean
          free_product_id?: string | null
          free_variant_id?: string | null
          get_quantity?: number | null
          id?: string
          min_cart_total?: number | null
          offer_type?: string
          product_id?: string
          sort_order?: number
          target_variant_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_free_variant_id_fkey"
            columns: ["free_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reminders: {
        Row: {
          call_notes: string | null
          called_at: string | null
          completed_at: string | null
          conversion_source: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          due_date: string
          expected_purchase_date: string | null
          follow_up_date: string | null
          id: string
          last_contacted_at: string | null
          next_action_date: string | null
          notes: string | null
          notes_timeline: Json
          order_id: string | null
          order_number: string | null
          priority: Database["public"]["Enums"]["reminder_priority"]
          product_id: string | null
          product_name_snapshot: string | null
          purchase_date: string
          reminder_days: number
          reorder_amount: number | null
          reorder_order_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
        }
        Insert: {
          call_notes?: string | null
          called_at?: string | null
          completed_at?: string | null
          conversion_source?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          due_date: string
          expected_purchase_date?: string | null
          follow_up_date?: string | null
          id?: string
          last_contacted_at?: string | null
          next_action_date?: string | null
          notes?: string | null
          notes_timeline?: Json
          order_id?: string | null
          order_number?: string | null
          priority?: Database["public"]["Enums"]["reminder_priority"]
          product_id?: string | null
          product_name_snapshot?: string | null
          purchase_date: string
          reminder_days: number
          reorder_amount?: number | null
          reorder_order_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Update: {
          call_notes?: string | null
          called_at?: string | null
          completed_at?: string | null
          conversion_source?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          due_date?: string
          expected_purchase_date?: string | null
          follow_up_date?: string | null
          id?: string
          last_contacted_at?: string | null
          next_action_date?: string | null
          notes?: string | null
          notes_timeline?: Json
          order_id?: string | null
          order_number?: string | null
          priority?: Database["public"]["Enums"]["reminder_priority"]
          product_id?: string | null
          product_name_snapshot?: string | null
          purchase_date?: string
          reminder_days?: number
          reorder_amount?: number | null
          reorder_order_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reminders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reminders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reminders_reorder_order_id_fkey"
            columns: ["reorder_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tabs: {
        Row: {
          content: string | null
          created_at: string
          display_style: string
          id: string
          product_id: string
          sort_order: number
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          display_style?: string
          id?: string
          product_id: string
          sort_order?: number
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string
          display_style?: string
          id?: string
          product_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          gallery: string[]
          id: string
          image_url: string | null
          option_values: Json
          price: number
          product_id: string
          reminder_days: number | null
          reminder_notes: string | null
          sale_price: number | null
          sku: string | null
          sort_order: number
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          gallery?: string[]
          id?: string
          image_url?: string | null
          option_values?: Json
          price?: number
          product_id: string
          reminder_days?: number | null
          reminder_notes?: string | null
          sale_price?: number | null
          sku?: string | null
          sort_order?: number
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          gallery?: string[]
          id?: string
          image_url?: string | null
          option_values?: Json
          price?: number
          product_id?: string
          reminder_days?: number | null
          reminder_notes?: string | null
          sale_price?: number | null
          sku?: string | null
          sort_order?: number
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          base_price: number
          best_seller: boolean
          brand_id: string | null
          category_id: string | null
          compare_price: number | null
          created_at: string
          description: string | null
          featured: boolean
          id: string
          is_new_arrival: boolean
          name: string
          option_groups: Json
          price: number
          rating: number
          reminder_days: number | null
          reminder_enabled: boolean
          reminder_notes: string | null
          review_count: number
          sale_price: number | null
          shipping_text: string | null
          short_description: string | null
          show_brand: boolean
          show_offers: boolean
          show_shipping_info: boolean
          show_shipping_text: boolean
          show_stock_status: boolean
          sku: string | null
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          stock_status_text: string | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          best_seller?: boolean
          brand_id?: string | null
          category_id?: string | null
          compare_price?: number | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          is_new_arrival?: boolean
          name: string
          option_groups?: Json
          price?: number
          rating?: number
          reminder_days?: number | null
          reminder_enabled?: boolean
          reminder_notes?: string | null
          review_count?: number
          sale_price?: number | null
          shipping_text?: string | null
          short_description?: string | null
          show_brand?: boolean
          show_offers?: boolean
          show_shipping_info?: boolean
          show_shipping_text?: boolean
          show_stock_status?: boolean
          sku?: string | null
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          stock_status_text?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          best_seller?: boolean
          brand_id?: string | null
          category_id?: string | null
          compare_price?: number | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          is_new_arrival?: boolean
          name?: string
          option_groups?: Json
          price?: number
          rating?: number
          reminder_days?: number | null
          reminder_enabled?: boolean
          reminder_notes?: string | null
          review_count?: number
          sale_price?: number | null
          shipping_text?: string | null
          short_description?: string | null
          show_brand?: boolean
          show_offers?: boolean
          show_shipping_info?: boolean
          show_shipping_text?: boolean
          show_stock_status?: boolean
          sku?: string | null
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          stock_status_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      r2_deletion_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          id: number
          last_error: string | null
          processed_at: string | null
          queued_at: string
          ref: string
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          id?: number
          last_error?: string | null
          processed_at?: string | null
          queued_at?: string
          ref: string
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          id?: number
          last_error?: string | null
          processed_at?: string | null
          queued_at?: string
          ref?: string
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: []
      }
      r2_orphan_sweep_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          grace_hours: number
          id: number
          orphans_found: number
          orphans_queued: number
          scanned: number
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          grace_hours?: number
          id?: number
          orphans_found?: number
          orphans_queued?: number
          scanned?: number
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          grace_hours?: number
          id?: number
          orphans_found?: number
          orphans_queued?: number
          scanned?: number
          started_at?: string
        }
        Relationships: []
      }
      review_hero_settings: {
        Row: {
          avatars: Json
          headline: string
          id: number
          subtitle: string
          updated_at: string
        }
        Insert: {
          avatars?: Json
          headline?: string
          id?: number
          subtitle?: string
          updated_at?: string
        }
        Update: {
          avatars?: Json
          headline?: string
          id?: number
          subtitle?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          product_id: string
          rating: number
          review: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_name: string
          id?: string
          product_id: string
          rating?: number
          review?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          product_id?: string
          rating?: number
          review?: string | null
        }
        Relationships: []
      }
      service_credentials: {
        Row: {
          last_test_message: string | null
          last_test_status: string | null
          last_tested_at: string | null
          service: string
          updated_at: string
          updated_by: string | null
          values: Json
        }
        Insert: {
          last_test_message?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          service: string
          updated_at?: string
          updated_by?: string | null
          values?: Json
        }
        Update: {
          last_test_message?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          service?: string
          updated_at?: string
          updated_by?: string | null
          values?: Json
        }
        Relationships: []
      }
      sessions: {
        Row: {
          clarity_replay_url: string | null
          clarity_session_id: string | null
          converted: boolean | null
          country: string | null
          created_at: string
          device_type: string | null
          duration_seconds: number | null
          ended_at: string | null
          exit_page: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          is_bounce: boolean | null
          landing_page: string | null
          page_count: number
          referrer: string | null
          session_key: string
          started_at: string
          ttclid: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          clarity_replay_url?: string | null
          clarity_session_id?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          exit_page?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_bounce?: boolean | null
          landing_page?: string | null
          page_count?: number
          referrer?: string | null
          session_key: string
          started_at?: string
          ttclid?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          clarity_replay_url?: string | null
          clarity_session_id?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          exit_page?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_bounce?: boolean | null
          landing_page?: string | null
          page_count?: number
          referrer?: string | null
          session_key?: string
          started_at?: string
          ttclid?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          card_cta_mode: string
          card_show_add_to_cart: boolean
          card_show_buy_now: boolean
          card_show_view_details: boolean
          default_sorting: string
          id: string
          pdp_show_shipment_details: boolean
          pdp_show_why_choose_us: boolean
          search_enabled: boolean
          sorting_enabled: boolean
          updated_at: string
        }
        Insert: {
          card_cta_mode?: string
          card_show_add_to_cart?: boolean
          card_show_buy_now?: boolean
          card_show_view_details?: boolean
          default_sorting?: string
          id: string
          pdp_show_shipment_details?: boolean
          pdp_show_why_choose_us?: boolean
          search_enabled?: boolean
          sorting_enabled?: boolean
          updated_at?: string
        }
        Update: {
          card_cta_mode?: string
          card_show_add_to_cart?: boolean
          card_show_buy_now?: boolean
          card_show_view_details?: boolean
          default_sorting?: string
          id?: string
          pdp_show_shipment_details?: boolean
          pdp_show_why_choose_us?: boolean
          search_enabled?: boolean
          sorting_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      site_review_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          external_video_id: string | null
          file_size: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["site_review_media_kind"]
          provider: Database["public"]["Enums"]["site_review_media_provider"]
          r2_key: string | null
          review_id: string
          sort_order: number
          thumbnail_url: string | null
          updated_at: string
          url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          external_video_id?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["site_review_media_kind"]
          provider?: Database["public"]["Enums"]["site_review_media_provider"]
          r2_key?: string | null
          review_id: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          external_video_id?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["site_review_media_kind"]
          provider?: Database["public"]["Enums"]["site_review_media_provider"]
          r2_key?: string | null
          review_id?: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "site_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      site_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_verified_purchase: boolean
          is_visible: boolean
          location: string | null
          rating: number
          review_date: string
          review_type: Database["public"]["Enums"]["site_review_type"]
          reviewer_name: string
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_verified_purchase?: boolean
          is_visible?: boolean
          location?: string | null
          rating?: number
          review_date?: string
          review_type?: Database["public"]["Enums"]["site_review_type"]
          reviewer_name: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_verified_purchase?: boolean
          is_visible?: boolean
          location?: string | null
          rating?: number
          review_date?: string
          review_type?: Database["public"]["Enums"]["site_review_type"]
          reviewer_name?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          type: Database["public"]["Enums"]["tag_type"] | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          type?: Database["public"]["Enums"]["tag_type"] | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["tag_type"] | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          id: string
          image_url: string
          main_image_url: string | null
          name: string
          rating: number
          review: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string
          main_image_url?: string | null
          name: string
          rating?: number
          review?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          main_image_url?: string | null
          name?: string
          rating?: number
          review?: string
          sort_order?: number
        }
        Relationships: []
      }
      tracking_pixels: {
        Row: {
          access_token: string | null
          advanced_matching: boolean
          created_at: string
          enabled: boolean
          id: string
          log_retention_days: number
          logging_paused: boolean
          pixel_id: string
          platform: string
          test_event_code: string | null
          test_mode: boolean
        }
        Insert: {
          access_token?: string | null
          advanced_matching?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          log_retention_days?: number
          logging_paused?: boolean
          pixel_id?: string
          platform: string
          test_event_code?: string | null
          test_mode?: boolean
        }
        Update: {
          access_token?: string | null
          advanced_matching?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          log_retention_days?: number
          logging_paused?: boolean
          pixel_id?: string
          platform?: string
          test_event_code?: string | null
          test_mode?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_testimonials: {
        Row: {
          autoplay: boolean
          created_at: string
          cta_enabled: boolean
          cta_text: string | null
          enabled: boolean
          featured: boolean
          id: string
          loop: boolean
          muted: boolean
          product_id: string | null
          sort_order: number
          subtitle: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_url: string
        }
        Insert: {
          autoplay?: boolean
          created_at?: string
          cta_enabled?: boolean
          cta_text?: string | null
          enabled?: boolean
          featured?: boolean
          id?: string
          loop?: boolean
          muted?: boolean
          product_id?: string | null
          sort_order?: number
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url: string
        }
        Update: {
          autoplay?: boolean
          created_at?: string
          cta_enabled?: boolean
          cta_text?: string | null
          enabled?: boolean
          featured?: boolean
          id?: string
          loop?: boolean
          muted?: boolean
          product_id?: string | null
          sort_order?: number
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_testimonials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_testimonials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_hierarchy"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          customer_id: string | null
          device_type: string | null
          first_landing_page: string | null
          first_referrer: string | null
          first_seen: string
          first_utm: Json | null
          id: string
          last_seen: string
          os: string | null
          total_pageviews: number
          total_sessions: number
          updated_at: string
          visitor_key: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          device_type?: string | null
          first_landing_page?: string | null
          first_referrer?: string | null
          first_seen?: string
          first_utm?: Json | null
          id?: string
          last_seen?: string
          os?: string | null
          total_pageviews?: number
          total_sessions?: number
          updated_at?: string
          visitor_key: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          device_type?: string | null
          first_landing_page?: string | null
          first_referrer?: string | null
          first_seen?: string
          first_utm?: Json | null
          id?: string
          last_seen?: string
          os?: string | null
          total_pageviews?: number
          total_sessions?: number
          updated_at?: string
          visitor_key?: string
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          enabled: boolean
          id: string
          phone_number: string
          radar_animation: boolean
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id: string
          phone_number?: string
          radar_animation?: boolean
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          phone_number?: string
          radar_animation?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      why_choose_us_cards: {
        Row: {
          created_at: string
          description: string
          icon_name: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon_name?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          icon_name?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      worker_secrets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          secret: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          secret: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          secret?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      crm_customers: {
        Row: {
          aliases: string[] | null
          delivered_value: number | null
          email: string | null
          first_order_at: string | null
          last_order_at: string | null
          latest_name: string | null
          lifetime_value: number | null
          phone: string | null
          total_orders: number | null
        }
        Relationships: []
      }
      mv_dashboard_metrics: {
        Row: {
          cancelled_count: number | null
          customers_total: number | null
          delivered_count: number | null
          id: number | null
          incomplete_orders_count: number | null
          low_stock_count: number | null
          orders_30d: number | null
          orders_7d: number | null
          orders_today: number | null
          orders_total: number | null
          out_of_stock_count: number | null
          pending_count: number | null
          processing_count: number | null
          products_total: number | null
          refreshed_at: string | null
          revenue_30d: number | null
          revenue_7d: number | null
          revenue_today: number | null
          revenue_total: number | null
          shipped_count: number | null
        }
        Relationships: []
      }
      mv_orders_daily_90d: {
        Row: {
          day: string | null
          orders: number | null
          revenue: number | null
        }
        Relationships: []
      }
      mv_top_products_30d: {
        Row: {
          product_id: string | null
          product_name: string | null
          revenue: number | null
          units_sold: number | null
        }
        Relationships: []
      }
      products_with_hierarchy: {
        Row: {
          base_price: number | null
          best_seller: boolean | null
          brand_id: string | null
          category_id: string | null
          category_level: number | null
          category_path: string | null
          child_category_id: string | null
          compare_price: number | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          id: string | null
          is_new_arrival: boolean | null
          leaf_category_id: string | null
          main_category_id: string | null
          name: string | null
          price: number | null
          rating: number | null
          review_count: number | null
          sale_price: number | null
          shipping_text: string | null
          short_description: string | null
          show_offers: boolean | null
          show_shipping_info: boolean | null
          show_shipping_text: boolean | null
          show_stock_status: boolean | null
          sku: string | null
          slug: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          stock: number | null
          stock_status_text: string | null
          sub_category_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _media_column_exists: {
        Args: { _column: string; _table: string }
        Returns: boolean
      }
      backfill_product_reminders: { Args: { _days?: number }; Returns: Json }
      bulk_delete_incomplete: { Args: { _ids: string[] }; Returns: undefined }
      bulk_mark_incomplete_contacted: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      bulk_update_sort_order: {
        Args: { _ids: string[]; _table: string }
        Returns: undefined
      }
      decrement_coupon_usage: { Args: { _code: string }; Returns: undefined }
      decrement_product_stock: {
        Args: { _product_id: string; _quantity: number }
        Returns: undefined
      }
      decrement_variant_stock: {
        Args: { _quantity: number; _variant_id: string }
        Returns: undefined
      }
      ensure_cms_defaults: { Args: never; Returns: Json }
      find_media_usage: { Args: { _ref: string }; Returns: Json }
      get_admin_incomplete_order_counts: {
        Args: { _search?: string }
        Returns: Json
      }
      get_admin_incomplete_order_stats: { Args: never; Returns: Json }
      get_admin_incomplete_orders_page: {
        Args: {
          _page?: number
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      get_admin_order_status_counts: {
        Args: {
          _date_from?: string
          _date_to?: string
          _payment_status?: string
          _search?: string
        }
        Returns: Json
      }
      get_admin_orders_page: {
        Args: {
          _date_from?: string
          _date_to?: string
          _page?: number
          _page_size?: number
          _payment_status?: string
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      get_admin_reminder_metrics: { Args: { _today?: string }; Returns: Json }
      get_admin_reminder_tab_counts: {
        Args: { _product_id?: string; _search?: string; _today?: string }
        Returns: Json
      }
      get_admin_reminders_page: {
        Args: {
          _page?: number
          _page_size?: number
          _product_id?: string
          _search?: string
          _sort?: string
          _tab?: string
          _today?: string
        }
        Returns: Json
      }
      get_clarity_project_id: { Args: never; Returns: string }
      get_dashboard_full: { Args: { _range_days?: number }; Returns: Json }
      get_dashboard_metrics: { Args: never; Returns: Json }
      get_order_for_purchase_tracking: {
        Args: { p_order_number: string }
        Returns: {
          created_at: string
          is_cancelled: boolean
          is_deleted: boolean
          order_number: string
          order_status: string
          payment_status: string
          total: number
        }[]
      }
      get_public_contact_settings: {
        Args: never
        Returns: {
          business_address: string
          email_address: string
          faq_shortcut_enabled: boolean
          faq_shortcut_items: Json
          id: string
          map_embed: string
          map_enabled: boolean
          page_intro: string
          page_title: string
          phone_field_enabled: boolean
          phone_number: string
          show_address: boolean
          social_links: Json
          social_section_enabled: boolean
          submit_button_text: string
        }[]
      }
      get_public_tracking_pixels: {
        Args: never
        Returns: {
          pixel_id: string
          platform: string
        }[]
      }
      get_reminder_attention_counts: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_usage: { Args: { _code: string }; Returns: undefined }
      increment_product_stock: {
        Args: { _product_id: string; _quantity: number }
        Returns: undefined
      }
      increment_variant_stock: {
        Args: { _quantity: number; _variant_id: string }
        Returns: undefined
      }
      is_admin_or_staff: { Args: { _user_id: string }; Returns: boolean }
      log_browser_pixel_event: {
        Args: { p_custom_data?: Json; p_event_id: string; p_event_name: string }
        Returns: undefined
      }
      mark_admin_notifications_seen: {
        Args: { _type?: string }
        Returns: undefined
      }
      mark_incomplete_order_recovered: {
        Args: { _order_id: string; _phone: string; _session_id: string }
        Returns: undefined
      }
      meta_capi_cleanup: { Args: { _keep_days?: number }; Returns: number }
      meta_capi_metrics: { Args: { _since?: string }; Returns: Json }
      meta_capi_purge_all: { Args: never; Returns: number }
      meta_capi_search: {
        Args: { _limit?: number; _term: string }
        Returns: {
          attempts: number
          created_at: string
          currency: string | null
          error: string | null
          event_id: string
          event_name: string
          http_status: number | null
          id: string
          order_id: string | null
          payload: Json | null
          product_ids: string[] | null
          response: string | null
          response_time_ms: number | null
          source: string
          status: string
          test_mode: boolean
          value: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "capi_event_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      meta_capi_timeseries: { Args: { _since?: string }; Returns: Json }
      next_order_number: { Args: never; Returns: string }
      prune_admin_notifications: { Args: never; Returns: number }
      prune_capi_event_logs: { Args: never; Returns: undefined }
      r2_claim_queue_batch: {
        Args: { _limit?: number }
        Returns: {
          id: number
          ref: string
        }[]
      }
      r2_coverage_audit: { Args: never; Returns: Json }
      r2_enqueue_refs: {
        Args: { _refs: string[]; _source?: string; _source_id?: string }
        Returns: number
      }
      r2_expedite: { Args: { _ids?: number[] }; Returns: number }
      r2_expedite_orphans: { Args: never; Returns: number }
      r2_mark_failed: {
        Args: { _err: string; _id: number }
        Returns: undefined
      }
      r2_mark_processed: { Args: { _ids: number[] }; Returns: undefined }
      r2_orphan_sweep_record: {
        Args: {
          _error?: string
          _grace_hours?: number
          _orphans_found: number
          _orphans_queued: number
          _scanned: number
        }
        Returns: number
      }
      r2_orphan_sweep_status: { Args: never; Returns: Json }
      r2_prune_processed: { Args: { _older_than?: string }; Returns: number }
      r2_queue_stats: { Args: never; Returns: Json }
      r2_ref_in_use: { Args: { _ref: string }; Returns: boolean }
      r2_refs_in_use: { Args: { _refs: string[] }; Returns: string[] }
      r2_retry_failed: { Args: { _ids?: number[] }; Returns: number }
      refresh_intelligence_aggregates: {
        Args: { _days?: number }
        Returns: undefined
      }
      replace_product_media_and_tags: {
        Args: { _images?: Json; _product_id: string; _tag_ids?: string[] }
        Returns: Json
      }
      reverse_customer_order: {
        Args: { _email: string; _order_total: number }
        Returns: undefined
      }
      schema_health: { Args: never; Returns: Json }
      scrub_jsonb_media_ref: {
        Args: { _data: Json; _ref: string }
        Returns: Json
      }
      set_meta_logging_paused: { Args: { _paused: boolean }; Returns: boolean }
      subscribe_newsletter: { Args: { _email: string }; Returns: undefined }
      track_order: {
        Args: { _order_number: string }
        Returns: {
          created_at: string
          customer_city: string
          customer_name: string
          delivery_partner: string
          discount_amount: number
          items: Json
          order_number: string
          order_status: string
          payment_method: string
          payment_status: string
          shipping_cost: number
          subtotal: number
          total: number
          tracking_number: string
          updated_at: string
        }[]
      }
      track_orders_by_phone: {
        Args: { _phone: string }
        Returns: {
          created_at: string
          customer_city: string
          customer_name: string
          delivery_partner: string
          discount_amount: number
          items: Json
          order_number: string
          order_status: string
          payment_method: string
          payment_status: string
          shipping_cost: number
          subtotal: number
          total: number
          tracking_number: string
          updated_at: string
        }[]
      }
      unlink_media_references: { Args: { _ref: string }; Returns: Json }
      upsert_checkout_customer: {
        Args: {
          _address?: string
          _city?: string
          _email?: string
          _name: string
          _order_total?: number
          _phone?: string
        }
        Returns: undefined
      }
      upsert_incomplete_order: {
        Args: {
          _address?: Json
          _cart_items?: Json
          _checkout_step?: string
          _coupon?: string
          _customer_name?: string
          _delivery_charge?: number
          _email?: string
          _payment_method?: string
          _phone: string
          _session_id: string
          _subtotal?: number
          _total?: number
        }
        Returns: string
      }
      validate_coupon: {
        Args: { _cart_total?: number; _code: string }
        Returns: {
          code: string
          discount_type: string
          discount_value: number
          error: string
          min_order_amount: number
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "user"
      attribution_model: "first_click" | "last_click"
      category_type: "category" | "subcategory" | "child"
      delivery_stage:
        | "pending"
        | "confirmed"
        | "packed"
        | "shipped"
        | "delivered"
        | "returned"
        | "cancelled"
      media_type: "image" | "video" | "360"
      product_status: "draft" | "active" | "archived"
      reminder_priority: "low" | "medium" | "high"
      reminder_status:
        | "pending"
        | "called"
        | "purchased_again"
        | "no_response"
        | "not_interested"
        | "follow_up"
        | "do_not_remind"
        | "superseded"
        | "interested"
        | "manually_closed"
      site_review_media_kind: "image" | "video"
      site_review_media_provider: "upload" | "youtube" | "vimeo"
      site_review_type: "photo" | "video" | "text"
      tag_type: "feature" | "material" | "color" | "style" | "audience"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "user"],
      attribution_model: ["first_click", "last_click"],
      category_type: ["category", "subcategory", "child"],
      delivery_stage: [
        "pending",
        "confirmed",
        "packed",
        "shipped",
        "delivered",
        "returned",
        "cancelled",
      ],
      media_type: ["image", "video", "360"],
      product_status: ["draft", "active", "archived"],
      reminder_priority: ["low", "medium", "high"],
      reminder_status: [
        "pending",
        "called",
        "purchased_again",
        "no_response",
        "not_interested",
        "follow_up",
        "do_not_remind",
        "superseded",
        "interested",
        "manually_closed",
      ],
      site_review_media_kind: ["image", "video"],
      site_review_media_provider: ["upload", "youtube", "vimeo"],
      site_review_type: ["photo", "video", "text"],
      tag_type: ["feature", "material", "color", "style", "audience"],
    },
  },
} as const
