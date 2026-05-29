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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activation_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: string
          metadata: Json | null
          reseller_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: string
          metadata?: Json | null
          reseller_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: string
          metadata?: Json | null
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_logs_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_payments: {
        Row: {
          activated_at: string | null
          amount_cents: number
          copy_paste: string | null
          created_at: string
          expires_at: string | null
          id: string
          paid_at: string | null
          proof_note: string | null
          proof_url: string | null
          provider: string
          provider_transaction_id: string | null
          qr_code_base64: string | null
          raw_response: Json | null
          reseller_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          amount_cents?: number
          copy_paste?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          proof_note?: string | null
          proof_url?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          amount_cents?: number
          copy_paste?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          proof_note?: string | null
          proof_url?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_payments_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      affiliate_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          max_uses: number | null
          owner_reseller_id: string | null
          updated_at: string
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          owner_reseller_id?: string | null
          updated_at?: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          owner_reseller_id?: string | null
          updated_at?: string
          uses?: number
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          priority: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      balance_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          id: string
          kind: string
          promotion_id: string | null
          reference_id: string | null
          reseller_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          promotion_id?: string | null
          reference_id?: string | null
          reseller_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          promotion_id?: string | null
          reference_id?: string | null
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_extensions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          extension_id: string
          id: string
          reseller_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          extension_id: string
          id?: string
          reseller_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          extension_id?: string
          id?: string
          reseller_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_extensions_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_extensions_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pricing_plans: {
        Row: {
          created_at: string | null
          credits_amount: number
          id: string
          is_active: boolean | null
          label: string
          price_cents: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_amount: number
          id?: string
          is_active?: boolean | null
          label: string
          price_cents?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_amount?: number
          id?: string
          is_active?: boolean | null
          label?: string
          price_cents?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      direct_sales: {
        Row: {
          amount_cents: number
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          plan_name: string | null
          provider_transaction_id: string | null
          raw_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          plan_name?: string | null
          provider_transaction_id?: string | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          plan_name?: string | null
          provider_transaction_id?: string | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      extension_customizations: {
        Row: {
          banner_enabled: boolean
          banner_link: string | null
          banner_url: string | null
          brand_badge: string
          brand_kicker: string
          brand_name: string
          card_bg_color: string | null
          card_border_color: string | null
          card_border_hover_color: string | null
          card_muted_text_color: string | null
          card_text_color: string | null
          color_bg: string
          color_bg_elevated: string
          color_bg_surface: string
          color_primary: string
          color_primary_hover: string
          color_secondary: string
          color_success: string | null
          color_wave_azure: string
          color_wave_blue: string
          color_wave_cyan: string
          color_wave_deep: string
          color_wave_ice: string
          color_wave_navy: string
          created_at: string
          currency_symbol: string | null
          display_version: string
          extension_id: string
          footer_text: string | null
          greeting_badge_text: string | null
          greeting_text: string | null
          header_badge_text: string | null
          history_enabled: boolean
          icon_128_url: string | null
          icon_16_url: string | null
          icon_32_url: string | null
          icon_48_url: string | null
          id: string
          is_template: boolean
          license_button_text: string | null
          license_buy_button_text: string | null
          license_description: string | null
          license_emoji: string | null
          license_emoji_size: number | null
          license_extra_buttons: Json | null
          license_placeholder: string | null
          license_title: string | null
          logo_rect_url: string | null
          logo_square_url: string | null
          manifest_description: string
          manifest_name: string
          popup_brand_badge: string | null
          popup_brand_kicker: string | null
          popup_brand_name: string | null
          popup_card_bg_color: string | null
          popup_card_border_color: string | null
          popup_card_border_hover_color: string | null
          popup_card_muted_text_color: string | null
          popup_card_text_color: string | null
          popup_color_bg: string | null
          popup_color_bg_elevated: string | null
          popup_color_bg_surface: string | null
          popup_color_primary: string | null
          popup_color_primary_hover: string | null
          popup_color_secondary: string | null
          popup_color_wave_azure: string | null
          popup_color_wave_blue: string | null
          popup_color_wave_cyan: string | null
          popup_color_wave_deep: string | null
          popup_color_wave_ice: string | null
          popup_color_wave_navy: string | null
          popup_currency_symbol: string | null
          popup_footer_text: string | null
          popup_greeting_badge_text: string | null
          popup_greeting_text: string | null
          popup_header_badge_text: string | null
          popup_history_enabled: boolean | null
          popup_logo_rect_url: string | null
          popup_logo_square_url: string | null
          popup_shortcuts: Json | null
          popup_show_greeting_badge: boolean | null
          popup_use_license_name: boolean | null
          popup_window_title: string | null
          reseller_id: string | null
          shortcuts: Json
          show_greeting_badge: boolean | null
          support_url: string
          updated_at: string
          use_license_name: boolean | null
          window_title: string
        }
        Insert: {
          banner_enabled?: boolean
          banner_link?: string | null
          banner_url?: string | null
          brand_badge?: string
          brand_kicker?: string
          brand_name?: string
          card_bg_color?: string | null
          card_border_color?: string | null
          card_border_hover_color?: string | null
          card_muted_text_color?: string | null
          card_text_color?: string | null
          color_bg?: string
          color_bg_elevated?: string
          color_bg_surface?: string
          color_primary?: string
          color_primary_hover?: string
          color_secondary?: string
          color_success?: string | null
          color_wave_azure?: string
          color_wave_blue?: string
          color_wave_cyan?: string
          color_wave_deep?: string
          color_wave_ice?: string
          color_wave_navy?: string
          created_at?: string
          currency_symbol?: string | null
          display_version?: string
          extension_id: string
          footer_text?: string | null
          greeting_badge_text?: string | null
          greeting_text?: string | null
          header_badge_text?: string | null
          history_enabled?: boolean
          icon_128_url?: string | null
          icon_16_url?: string | null
          icon_32_url?: string | null
          icon_48_url?: string | null
          id?: string
          is_template?: boolean
          license_button_text?: string | null
          license_buy_button_text?: string | null
          license_description?: string | null
          license_emoji?: string | null
          license_emoji_size?: number | null
          license_extra_buttons?: Json | null
          license_placeholder?: string | null
          license_title?: string | null
          logo_rect_url?: string | null
          logo_square_url?: string | null
          manifest_description?: string
          manifest_name?: string
          popup_brand_badge?: string | null
          popup_brand_kicker?: string | null
          popup_brand_name?: string | null
          popup_card_bg_color?: string | null
          popup_card_border_color?: string | null
          popup_card_border_hover_color?: string | null
          popup_card_muted_text_color?: string | null
          popup_card_text_color?: string | null
          popup_color_bg?: string | null
          popup_color_bg_elevated?: string | null
          popup_color_bg_surface?: string | null
          popup_color_primary?: string | null
          popup_color_primary_hover?: string | null
          popup_color_secondary?: string | null
          popup_color_wave_azure?: string | null
          popup_color_wave_blue?: string | null
          popup_color_wave_cyan?: string | null
          popup_color_wave_deep?: string | null
          popup_color_wave_ice?: string | null
          popup_color_wave_navy?: string | null
          popup_currency_symbol?: string | null
          popup_footer_text?: string | null
          popup_greeting_badge_text?: string | null
          popup_greeting_text?: string | null
          popup_header_badge_text?: string | null
          popup_history_enabled?: boolean | null
          popup_logo_rect_url?: string | null
          popup_logo_square_url?: string | null
          popup_shortcuts?: Json | null
          popup_show_greeting_badge?: boolean | null
          popup_use_license_name?: boolean | null
          popup_window_title?: string | null
          reseller_id?: string | null
          shortcuts?: Json
          show_greeting_badge?: boolean | null
          support_url?: string
          updated_at?: string
          use_license_name?: boolean | null
          window_title?: string
        }
        Update: {
          banner_enabled?: boolean
          banner_link?: string | null
          banner_url?: string | null
          brand_badge?: string
          brand_kicker?: string
          brand_name?: string
          card_bg_color?: string | null
          card_border_color?: string | null
          card_border_hover_color?: string | null
          card_muted_text_color?: string | null
          card_text_color?: string | null
          color_bg?: string
          color_bg_elevated?: string
          color_bg_surface?: string
          color_primary?: string
          color_primary_hover?: string
          color_secondary?: string
          color_success?: string | null
          color_wave_azure?: string
          color_wave_blue?: string
          color_wave_cyan?: string
          color_wave_deep?: string
          color_wave_ice?: string
          color_wave_navy?: string
          created_at?: string
          currency_symbol?: string | null
          display_version?: string
          extension_id?: string
          footer_text?: string | null
          greeting_badge_text?: string | null
          greeting_text?: string | null
          header_badge_text?: string | null
          history_enabled?: boolean
          icon_128_url?: string | null
          icon_16_url?: string | null
          icon_32_url?: string | null
          icon_48_url?: string | null
          id?: string
          is_template?: boolean
          license_button_text?: string | null
          license_buy_button_text?: string | null
          license_description?: string | null
          license_emoji?: string | null
          license_emoji_size?: number | null
          license_extra_buttons?: Json | null
          license_placeholder?: string | null
          license_title?: string | null
          logo_rect_url?: string | null
          logo_square_url?: string | null
          manifest_description?: string
          manifest_name?: string
          popup_brand_badge?: string | null
          popup_brand_kicker?: string | null
          popup_brand_name?: string | null
          popup_card_bg_color?: string | null
          popup_card_border_color?: string | null
          popup_card_border_hover_color?: string | null
          popup_card_muted_text_color?: string | null
          popup_card_text_color?: string | null
          popup_color_bg?: string | null
          popup_color_bg_elevated?: string | null
          popup_color_bg_surface?: string | null
          popup_color_primary?: string | null
          popup_color_primary_hover?: string | null
          popup_color_secondary?: string | null
          popup_color_wave_azure?: string | null
          popup_color_wave_blue?: string | null
          popup_color_wave_cyan?: string | null
          popup_color_wave_deep?: string | null
          popup_color_wave_ice?: string | null
          popup_color_wave_navy?: string | null
          popup_currency_symbol?: string | null
          popup_footer_text?: string | null
          popup_greeting_badge_text?: string | null
          popup_greeting_text?: string | null
          popup_header_badge_text?: string | null
          popup_history_enabled?: boolean | null
          popup_logo_rect_url?: string | null
          popup_logo_square_url?: string | null
          popup_shortcuts?: Json | null
          popup_show_greeting_badge?: boolean | null
          popup_use_license_name?: boolean | null
          popup_window_title?: string | null
          reseller_id?: string | null
          shortcuts?: Json
          show_greeting_badge?: boolean | null
          support_url?: string
          updated_at?: string
          use_license_name?: boolean | null
          window_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_customizations_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_customizations_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_versions: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          extension_id: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          extension_id: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          extension_id?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_versions_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      extensions: {
        Row: {
          changelog: string | null
          created_at: string
          description: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_active: boolean
          method: string | null
          name: string
          price_cents: number
          slug: string
          updated_at: string
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_active?: boolean
          method?: string | null
          name: string
          price_cents?: number
          slug: string
          updated_at?: string
          version?: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_active?: boolean
          method?: string | null
          name?: string
          price_cents?: number
          slug?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      global_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      hwid_reset_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          license_id: string | null
          license_key: string | null
          reseller_id: string | null
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          license_id?: string | null
          license_key?: string | null
          reseller_id?: string | null
          success?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          license_id?: string | null
          license_key?: string | null
          reseller_id?: string | null
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hwid_reset_logs_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      license_base_costs: {
        Row: {
          cost_cents: number
          duration_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_cents?: number
          duration_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_cents?: number
          duration_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      manual_financial_entries: {
        Row: {
          amount_cents: number
          category: string | null
          cost_cents: number
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          reference_kind: string | null
          reference_meta: Json | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          category?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          entry_type: string
          id?: string
          reference_kind?: string | null
          reference_meta?: Json | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          category?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          reference_kind?: string | null
          reference_meta?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      manual_recharge_metadata: {
        Row: {
          created_at: string
          id: string
          invite_status: string
          notes: string | null
          provider_pedido_id: string
          reseller_id: string
          updated_at: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invite_status?: string
          notes?: string | null
          provider_pedido_id: string
          reseller_id: string
          updated_at?: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invite_status?: string
          notes?: string | null
          provider_pedido_id?: string
          reseller_id?: string
          updated_at?: string
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_recharge_metadata_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          api_key_id: string | null
          balance_refunded_at: string | null
          cancellation_status: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          client_refund_endtoend_id: string | null
          client_refund_error: string | null
          client_refund_method: string | null
          client_refund_pix_key: string | null
          client_refunded_at: string | null
          created_at: string
          credit_amount: number | null
          customer_id: string | null
          error_message: string | null
          extension_id: string | null
          id: string
          is_legacy: boolean
          is_test: boolean
          key_revoke_error: string | null
          key_revoked_at: string | null
          license_key: string | null
          license_type: string
          notes: string | null
          price_cents: number
          product_type: string | null
          promotion_discount_cents: number
          promotion_id: string | null
          provider_response: Json | null
          reseller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key_id?: string | null
          balance_refunded_at?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          created_at?: string
          credit_amount?: number | null
          customer_id?: string | null
          error_message?: string | null
          extension_id?: string | null
          id?: string
          is_legacy?: boolean
          is_test?: boolean
          key_revoke_error?: string | null
          key_revoked_at?: string | null
          license_key?: string | null
          license_type: string
          notes?: string | null
          price_cents: number
          product_type?: string | null
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider_response?: Json | null
          reseller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key_id?: string | null
          balance_refunded_at?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          created_at?: string
          credit_amount?: number | null
          customer_id?: string | null
          error_message?: string | null
          extension_id?: string | null
          id?: string
          is_legacy?: boolean
          is_test?: boolean
          key_revoke_error?: string | null
          key_revoked_at?: string | null
          license_key?: string | null
          license_type?: string
          notes?: string | null
          price_cents?: number
          product_type?: string | null
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider_response?: Json | null
          reseller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "reseller_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reseller_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_price_history: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          kind: string
          new_price_cents: number | null
          note: string | null
          old_price_cents: number | null
          pack_key: string
          reseller_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          kind: string
          new_price_cents?: number | null
          note?: string | null
          old_price_cents?: number | null
          pack_key: string
          reseller_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          kind?: string
          new_price_cents?: number | null
          note?: string | null
          old_price_cents?: number | null
          pack_key?: string
          reseller_id?: string
        }
        Relationships: []
      }
      pending_storefront_charges: {
        Row: {
          attempted_at: string | null
          attempts: number
          cost_cents: number
          created_at: string
          id: string
          last_error: string | null
          order_id: string
          product_type: string
          released_at: string | null
          reseller_id: string
        }
        Insert: {
          attempted_at?: string | null
          attempts?: number
          cost_cents: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id: string
          product_type?: string
          released_at?: string | null
          reseller_id: string
        }
        Update: {
          attempted_at?: string | null
          attempts?: number
          cost_cents?: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id?: string
          product_type?: string
          released_at?: string | null
          reseller_id?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          cost_cents: number
          created_at: string
          customer_price_cents: number
          id: string
          is_active: boolean
          label: string
          license_type: string
          markup_percent: number
          min_price_cents: number
          price_cents: number
          pricing_mode: string
          updated_at: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          customer_price_cents?: number
          id?: string
          is_active?: boolean
          label: string
          license_type: string
          markup_percent?: number
          min_price_cents?: number
          price_cents?: number
          pricing_mode?: string
          updated_at?: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          customer_price_cents?: number
          id?: string
          is_active?: boolean
          label?: string
          license_type?: string
          markup_percent?: number
          min_price_cents?: number
          price_cents?: number
          pricing_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          affiliate_code_used: string | null
          approval_status: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_banned: boolean | null
          phone: string | null
          reseller_id: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          affiliate_code_used?: string | null
          approval_status?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_banned?: boolean | null
          phone?: string | null
          reseller_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          affiliate_code_used?: string | null
          approval_status?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_banned?: boolean | null
          phone?: string | null
          reseller_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json | null
          event: string
          id: string
          promotion_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          event: string
          id?: string
          promotion_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          event?: string
          id?: string
          promotion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_logs_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          credit_discount_pct: number | null
          deactivated_at: string | null
          description: string | null
          ends_at: string | null
          extension_discount_pct: number | null
          id: string
          name: string
          recharge_bonus_pct: number | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          credit_discount_pct?: number | null
          deactivated_at?: string | null
          description?: string | null
          ends_at?: string | null
          extension_discount_pct?: number | null
          id?: string
          name: string
          recharge_bonus_pct?: number | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          credit_discount_pct?: number | null
          deactivated_at?: string | null
          description?: string | null
          ends_at?: string | null
          extension_discount_pct?: number | null
          id?: string
          name?: string
          recharge_bonus_pct?: number | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_credit_orders: {
        Row: {
          created_at: string
          creditos: number
          creditos_enviados: number | null
          email_convite_bot: string | null
          etapa_processamento: number | null
          id: string
          pedido_id: string
          preco_cents: number | null
          provider_response: Json | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          creditos: number
          creditos_enviados?: number | null
          email_convite_bot?: string | null
          etapa_processamento?: number | null
          id?: string
          pedido_id: string
          preco_cents?: number | null
          provider_response?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          creditos?: number
          creditos_enviados?: number | null
          email_convite_bot?: string | null
          etapa_processamento?: number | null
          id?: string
          pedido_id?: string
          preco_cents?: number | null
          provider_response?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: []
      }
      provider_settings: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          updated_at: string
          updated_by: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key: string
          base_url?: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      ranking_prizes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          position: number
          prize_value: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          position: number
          prize_value?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          position?: number
          prize_value?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      recharge_intents: {
        Row: {
          amount_cents: number
          bonus_cents: number
          copy_paste: string | null
          created_at: string
          id: string
          paid_at: string | null
          payer_document: string | null
          payer_name: string | null
          promotion_id: string | null
          provider: string
          provider_transaction_id: string | null
          qr_code_base64: string | null
          raw_response: Json | null
          reseller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          bonus_cents?: number
          copy_paste?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payer_document?: string | null
          payer_name?: string | null
          promotion_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          bonus_cents?: number
          copy_paste?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payer_document?: string | null
          payer_name?: string | null
          promotion_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recharge_intents_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_schedule: {
        Row: {
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_result: string | null
          id: string
          maintenance_message: string | null
          note: string | null
          scheduled_at: string
          target_mode: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          executed_result?: string | null
          id?: string
          maintenance_message?: string | null
          note?: string | null
          scheduled_at: string
          target_mode: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          executed_result?: string | null
          id?: string
          maintenance_message?: string | null
          note?: string | null
          scheduled_at?: string
          target_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: string
          notes: string | null
          reference_id: string
          reseller_id: string
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          kind: string
          notes?: string | null
          reference_id: string
          reseller_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          reference_id?: string
          reseller_id?: string
          status?: string
        }
        Relationships: []
      }
      reseller_api_idempotency: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          expires_at: string
          id: string
          idempotency_key: string
          request_hash: string
          reseller_id: string
          response_body: Json
          response_status: number
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          expires_at?: string
          id?: string
          idempotency_key: string
          request_hash: string
          reseller_id: string
          response_body: Json
          response_status: number
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          request_hash?: string
          reseller_id?: string
          response_body?: Json
          response_status?: number
        }
        Relationships: []
      }
      reseller_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          rate_limit_per_minute: number
          reseller_id: string
          revoked_at: string | null
          scope: string
          updated_at: string
          webhook_events: string[]
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          rate_limit_per_minute?: number
          reseller_id: string
          revoked_at?: string | null
          scope?: string
          updated_at?: string
          webhook_events?: string[]
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          rate_limit_per_minute?: number
          reseller_id?: string
          revoked_at?: string | null
          scope?: string
          updated_at?: string
          webhook_events?: string[]
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_api_keys_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_api_usage: {
        Row: {
          api_key_id: string
          cost_cents: number
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip_address: string | null
          license_key: string | null
          license_type: string | null
          method: string
          reseller_id: string
          status_code: number
        }
        Insert: {
          api_key_id: string
          cost_cents?: number
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          license_key?: string | null
          license_type?: string | null
          method: string
          reseller_id: string
          status_code: number
        }
        Update: {
          api_key_id?: string
          cost_cents?: number
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          license_key?: string | null
          license_type?: string | null
          method?: string
          reseller_id?: string
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "reseller_api_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "reseller_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_api_usage_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_api_webhook_deliveries: {
        Row: {
          api_key_id: string
          attempt: number
          created_at: string
          delivered_at: string | null
          event: string
          id: string
          payload: Json
          reseller_id: string
          response_body: string | null
          response_status: number | null
          target_url: string
        }
        Insert: {
          api_key_id: string
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event: string
          id?: string
          payload: Json
          reseller_id: string
          response_body?: string | null
          response_status?: number | null
          target_url: string
        }
        Update: {
          api_key_id?: string
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event?: string
          id?: string
          payload?: Json
          reseller_id?: string
          response_body?: string | null
          response_status?: number | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_api_webhook_deliveries_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "reseller_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_api_webhook_deliveries_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_balances: {
        Row: {
          balance_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_balances_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_credit_cost_overrides: {
        Row: {
          created_at: string
          credits_amount: number
          id: string
          is_active: boolean
          price_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_amount: number
          id?: string
          is_active?: boolean
          price_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_amount?: number
          id?: string
          is_active?: boolean
          price_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_credit_cost_overrides_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_credit_prices: {
        Row: {
          created_at: string | null
          credits_amount: number
          id: string
          is_active: boolean | null
          price_cents: number
          reseller_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_amount: number
          id?: string
          is_active?: boolean | null
          price_cents: number
          reseller_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_amount?: number
          id?: string
          is_active?: boolean | null
          price_cents?: number
          reseller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_credit_prices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_credit_purchases: {
        Row: {
          alert_permissao_sent_at: string | null
          alert_stuck_configurando_sent_at: string | null
          api_key_id: string | null
          balance_refunded_at: string | null
          cancellation_status: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_refund_endtoend_id: string | null
          client_refund_error: string | null
          client_refund_method: string | null
          client_refund_pix_key: string | null
          client_refunded_at: string | null
          cost_cents: number | null
          created_at: string
          credits: number
          customer_name: string | null
          customer_whatsapp: string | null
          email_conta_lovable: string | null
          error_message: string | null
          id: string
          price_cents: number
          promotion_discount_cents: number
          promotion_id: string | null
          provider_pedido_id: string | null
          provider_response: Json | null
          reseller_id: string
          status: string
          storefront_order_id: string | null
          telegram_last_state: string | null
          telegram_message_id: number | null
          tipo_entrega: string | null
          updated_at: string
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          alert_permissao_sent_at?: string | null
          alert_stuck_configurando_sent_at?: string | null
          api_key_id?: string | null
          balance_refunded_at?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          cost_cents?: number | null
          created_at?: string
          credits: number
          customer_name?: string | null
          customer_whatsapp?: string | null
          email_conta_lovable?: string | null
          error_message?: string | null
          id?: string
          price_cents: number
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider_pedido_id?: string | null
          provider_response?: Json | null
          reseller_id: string
          status?: string
          storefront_order_id?: string | null
          telegram_last_state?: string | null
          telegram_message_id?: number | null
          tipo_entrega?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          alert_permissao_sent_at?: string | null
          alert_stuck_configurando_sent_at?: string | null
          api_key_id?: string | null
          balance_refunded_at?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          cost_cents?: number | null
          created_at?: string
          credits?: number
          customer_name?: string | null
          customer_whatsapp?: string | null
          email_conta_lovable?: string | null
          error_message?: string | null
          id?: string
          price_cents?: number
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider_pedido_id?: string | null
          provider_response?: Json | null
          reseller_id?: string
          status?: string
          storefront_order_id?: string | null
          telegram_last_state?: string | null
          telegram_message_id?: number | null
          tipo_entrega?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_credit_purchases_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "reseller_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_credit_purchases_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_credit_purchases_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_customers: {
        Row: {
          created_at: string
          display_name: string
          id: string
          reseller_id: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          reseller_id: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          reseller_id?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      reseller_extension_price_overrides: {
        Row: {
          created_at: string
          extension_id: string
          id: string
          is_active: boolean
          license_type: string
          price_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extension_id: string
          id?: string
          is_active?: boolean
          license_type: string
          price_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extension_id?: string
          id?: string
          is_active?: boolean
          license_type?: string
          price_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_extension_prices: {
        Row: {
          created_at: string
          extension_id: string | null
          id: string
          is_active: boolean
          license_type: string
          price_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extension_id?: string | null
          id?: string
          is_active?: boolean
          license_type: string
          price_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extension_id?: string | null
          id?: string
          is_active?: boolean
          license_type?: string
          price_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_extension_prices_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_extension_prices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_extensions: {
        Row: {
          created_at: string
          extension_id: string
          id: string
          reseller_id: string
        }
        Insert: {
          created_at?: string
          extension_id: string
          id?: string
          reseller_id: string
        }
        Update: {
          created_at?: string
          extension_id?: string
          id?: string
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_extensions_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_extensions_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_integrations: {
        Row: {
          connection_status: string
          created_at: string
          evolution_api_key: string | null
          evolution_base_url: string | null
          evolution_confirmation_template: string
          evolution_enabled: boolean
          evolution_instance: string | null
          evolution_message_template: string
          evolution_template_recharge: string | null
          evolution_template_storefront: string | null
          instance_name: string | null
          last_connected_at: string | null
          lovable_credits_api_key: string | null
          lovable_credits_enabled: boolean | null
          messages_sent_count: number
          misticpay_client_id: string | null
          misticpay_client_secret: string | null
          misticpay_enabled: boolean
          profile_name: string | null
          profile_number: string | null
          profile_picture_url: string | null
          reseller_id: string
          updated_at: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          evolution_confirmation_template?: string
          evolution_enabled?: boolean
          evolution_instance?: string | null
          evolution_message_template?: string
          evolution_template_recharge?: string | null
          evolution_template_storefront?: string | null
          instance_name?: string | null
          last_connected_at?: string | null
          lovable_credits_api_key?: string | null
          lovable_credits_enabled?: boolean | null
          messages_sent_count?: number
          misticpay_client_id?: string | null
          misticpay_client_secret?: string | null
          misticpay_enabled?: boolean
          profile_name?: string | null
          profile_number?: string | null
          profile_picture_url?: string | null
          reseller_id: string
          updated_at?: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          evolution_confirmation_template?: string
          evolution_enabled?: boolean
          evolution_instance?: string | null
          evolution_message_template?: string
          evolution_template_recharge?: string | null
          evolution_template_storefront?: string | null
          instance_name?: string | null
          last_connected_at?: string | null
          lovable_credits_api_key?: string | null
          lovable_credits_enabled?: boolean | null
          messages_sent_count?: number
          misticpay_client_id?: string | null
          misticpay_client_secret?: string | null
          misticpay_enabled?: boolean
          profile_name?: string | null
          profile_number?: string | null
          profile_picture_url?: string | null
          reseller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_license_cost_overrides: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pack_id: string
          price_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pack_id: string
          price_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pack_id?: string
          price_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_license_prices: {
        Row: {
          created_at: string
          id: string
          method: string
          pack_id: string
          price_cents: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          method: string
          pack_id: string
          price_cents?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          pack_id?: string
          price_cents?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_license_prices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_referrals: {
        Row: {
          affiliate_code: string
          created_at: string
          id: string
          referred_reseller_id: string
          referrer_reseller_id: string
          total_commission_cents: number
        }
        Insert: {
          affiliate_code: string
          created_at?: string
          id?: string
          referred_reseller_id: string
          referrer_reseller_id: string
          total_commission_cents?: number
        }
        Update: {
          affiliate_code?: string
          created_at?: string
          id?: string
          referred_reseller_id?: string
          referrer_reseller_id?: string
          total_commission_cents?: number
        }
        Relationships: []
      }
      reseller_storefronts: {
        Row: {
          access_extension_custom_url: string | null
          access_extension_enabled: boolean
          access_extension_mode: string
          background_color: string
          background_effect: string
          contact_whatsapp: string | null
          created_at: string
          custom_prices: Json
          extension_method: string
          is_enabled: boolean
          layout_mode: string
          logo_size: number
          logo_url: string | null
          primary_color: string
          product_emojis: Json
          reseller_id: string
          reset_device_enabled: boolean
          show_credits: boolean | null
          show_extensions: boolean | null
          show_free_trial: boolean | null
          show_products: boolean | null
          store_name: string
          support_channel: string | null
          support_discord_url: string | null
          support_enabled: boolean
          support_telegram_url: string | null
          support_value: string | null
          support_whatsapp: string | null
          tagline: string | null
          updated_at: string
          visible_extension_ids: string[]
          visual_effect: string
          welcome_message: string | null
        }
        Insert: {
          access_extension_custom_url?: string | null
          access_extension_enabled?: boolean
          access_extension_mode?: string
          background_color?: string
          background_effect?: string
          contact_whatsapp?: string | null
          created_at?: string
          custom_prices?: Json
          extension_method?: string
          is_enabled?: boolean
          layout_mode?: string
          logo_size?: number
          logo_url?: string | null
          primary_color?: string
          product_emojis?: Json
          reseller_id: string
          reset_device_enabled?: boolean
          show_credits?: boolean | null
          show_extensions?: boolean | null
          show_free_trial?: boolean | null
          show_products?: boolean | null
          store_name?: string
          support_channel?: string | null
          support_discord_url?: string | null
          support_enabled?: boolean
          support_telegram_url?: string | null
          support_value?: string | null
          support_whatsapp?: string | null
          tagline?: string | null
          updated_at?: string
          visible_extension_ids?: string[]
          visual_effect?: string
          welcome_message?: string | null
        }
        Update: {
          access_extension_custom_url?: string | null
          access_extension_enabled?: boolean
          access_extension_mode?: string
          background_color?: string
          background_effect?: string
          contact_whatsapp?: string | null
          created_at?: string
          custom_prices?: Json
          extension_method?: string
          is_enabled?: boolean
          layout_mode?: string
          logo_size?: number
          logo_url?: string | null
          primary_color?: string
          product_emojis?: Json
          reseller_id?: string
          reset_device_enabled?: boolean
          show_credits?: boolean | null
          show_extensions?: boolean | null
          show_free_trial?: boolean | null
          show_products?: boolean | null
          store_name?: string
          support_channel?: string | null
          support_discord_url?: string | null
          support_enabled?: boolean
          support_telegram_url?: string | null
          support_value?: string | null
          support_whatsapp?: string | null
          tagline?: string | null
          updated_at?: string
          visible_extension_ids?: string[]
          visual_effect?: string
          welcome_message?: string | null
        }
        Relationships: []
      }
      reseller_subscription_charges: {
        Row: {
          amount_cents: number
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          is_onboarding: boolean
          kind: string
          paid_at: string | null
          paid_method: string | null
          pix_payload: string | null
          pix_qr_base64: string | null
          provider: string
          provider_charge_id: string | null
          recurrence_id: string | null
          reseller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          is_onboarding?: boolean
          kind: string
          paid_at?: string | null
          paid_method?: string | null
          pix_payload?: string | null
          pix_qr_base64?: string | null
          provider?: string
          provider_charge_id?: string | null
          recurrence_id?: string | null
          reseller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          is_onboarding?: boolean
          kind?: string
          paid_at?: string | null
          paid_method?: string | null
          pix_payload?: string | null
          pix_qr_base64?: string | null
          provider?: string
          provider_charge_id?: string | null
          recurrence_id?: string | null
          reseller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_subscription_charges_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "reseller_subscription_recurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_subscription_charges_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_subscription_recurrences: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          day_of_month: number
          description: string | null
          id: string
          is_active: boolean
          next_generation_date: string | null
          reseller_id: string
          updated_at: string
          warning_days_before: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          day_of_month: number
          description?: string | null
          id?: string
          is_active?: boolean
          next_generation_date?: string | null
          reseller_id: string
          updated_at?: string
          warning_days_before?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          description?: string | null
          id?: string
          is_active?: boolean
          next_generation_date?: string | null
          reseller_id?: string
          updated_at?: string
          warning_days_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "reseller_subscription_recurrences_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_tier_state: {
        Row: {
          forced_tier_id: string | null
          reseller_id: string
          total_spent_cents: number
          updated_at: string
        }
        Insert: {
          forced_tier_id?: string | null
          reseller_id: string
          total_spent_cents?: number
          updated_at?: string
        }
        Update: {
          forced_tier_id?: string | null
          reseller_id?: string
          total_spent_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_tier_state_forced_tier_id_fkey"
            columns: ["forced_tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_tier_state_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_tiers: {
        Row: {
          color: string
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          is_hidden: boolean
          min_spent_cents: number
          name: string
          recharge_bonus_percent: number
          referral_commission_percent: number
          slug: string
          sort_order: number
          test_keys_per_day: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          is_hidden?: boolean
          min_spent_cents?: number
          name: string
          recharge_bonus_percent?: number
          referral_commission_percent?: number
          slug: string
          sort_order?: number
          test_keys_per_day?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          is_hidden?: boolean
          min_spent_cents?: number
          name?: string
          recharge_bonus_percent?: number
          referral_commission_percent?: number
          slug?: string
          sort_order?: number
          test_keys_per_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      resellers: {
        Row: {
          activation_status: string
          billing_mode: string
          bonus_min_tier_id: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_test_key_reset: string | null
          slug: string
          subscription_blocked: boolean
          subscription_blocked_at: string | null
          subscription_onboarding_completed: boolean
          test_keys_per_day_override: number | null
          test_keys_used_today: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activation_status?: string
          billing_mode?: string
          bonus_min_tier_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          last_test_key_reset?: string | null
          slug: string
          subscription_blocked?: boolean
          subscription_blocked_at?: string | null
          subscription_onboarding_completed?: boolean
          test_keys_per_day_override?: number | null
          test_keys_used_today?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activation_status?: string
          billing_mode?: string
          bonus_min_tier_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_test_key_reset?: string | null
          slug?: string
          subscription_blocked?: boolean
          subscription_blocked_at?: string | null
          subscription_onboarding_completed?: boolean
          test_keys_per_day_override?: number | null
          test_keys_used_today?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resellers_bonus_min_tier_id_fkey"
            columns: ["bonus_min_tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_orders: {
        Row: {
          balance_refunded_at: string | null
          buyer_name: string
          buyer_whatsapp: string
          cancellation_status: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_refund_endtoend_id: string | null
          client_refund_error: string | null
          client_refund_method: string | null
          client_refund_pix_key: string | null
          client_refunded_at: string | null
          copy_paste: string | null
          cost_cents: number | null
          created_at: string
          credit_amount: number | null
          delivery_type: string | null
          error_message: string | null
          expires_at: string | null
          extension_id: string | null
          id: string
          invite_link: string | null
          is_legacy: boolean
          key_revoke_error: string | null
          key_revoked_at: string | null
          license_key: string | null
          license_type: string
          paid_at: string | null
          price_cents: number
          product_type: string | null
          promotion_discount_cents: number
          promotion_id: string | null
          provider: string
          provider_transaction_id: string | null
          qr_code_base64: string | null
          raw_response: Json | null
          reseller_id: string
          short_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          balance_refunded_at?: string | null
          buyer_name: string
          buyer_whatsapp: string
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          copy_paste?: string | null
          cost_cents?: number | null
          created_at?: string
          credit_amount?: number | null
          delivery_type?: string | null
          error_message?: string | null
          expires_at?: string | null
          extension_id?: string | null
          id?: string
          invite_link?: string | null
          is_legacy?: boolean
          key_revoke_error?: string | null
          key_revoked_at?: string | null
          license_key?: string | null
          license_type: string
          paid_at?: string | null
          price_cents: number
          product_type?: string | null
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id: string
          short_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          balance_refunded_at?: string | null
          buyer_name?: string
          buyer_whatsapp?: string
          cancellation_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_refund_endtoend_id?: string | null
          client_refund_error?: string | null
          client_refund_method?: string | null
          client_refund_pix_key?: string | null
          client_refunded_at?: string | null
          copy_paste?: string | null
          cost_cents?: number | null
          created_at?: string
          credit_amount?: number | null
          delivery_type?: string | null
          error_message?: string | null
          expires_at?: string | null
          extension_id?: string | null
          id?: string
          invite_link?: string | null
          is_legacy?: boolean
          key_revoke_error?: string | null
          key_revoked_at?: string | null
          license_key?: string | null
          license_type?: string
          paid_at?: string | null
          price_cents?: number
          product_type?: string | null
          promotion_discount_cents?: number
          promotion_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          reseller_id?: string
          short_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_orders_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_contact: string | null
          reseller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_contact?: string | null
          reseller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_contact?: string | null
          reseller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      storefront_testimonials: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string | null
          customer_name: string
          id: string
          is_active: boolean | null
          rating: number
          reseller_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string | null
          customer_name: string
          id?: string
          is_active?: boolean | null
          rating: number
          reseller_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string | null
          customer_name?: string
          id?: string
          is_active?: boolean | null
          rating?: number
          reseller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_testimonials_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_notification_failures: {
        Row: {
          amount_cents: number | null
          balance_tx_id: string | null
          context: Json | null
          created_at: string
          id: string
          kind: string | null
          reason: string
          reseller_id: string | null
          sqlstate: string | null
        }
        Insert: {
          amount_cents?: number | null
          balance_tx_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          kind?: string | null
          reason: string
          reseller_id?: string | null
          sqlstate?: string | null
        }
        Update: {
          amount_cents?: number | null
          balance_tx_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          kind?: string | null
          reason?: string
          reseller_id?: string | null
          sqlstate?: string | null
        }
        Relationships: []
      }
      telegram_outbox: {
        Row: {
          attempts: number
          created_at: string
          edit_message_id: number | null
          id: string
          is_edit: boolean
          last_error: string | null
          message_id: number | null
          parse_mode: string | null
          reference_id: string | null
          reference_kind: string | null
          sent_at: string | null
          text: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          edit_message_id?: number | null
          id?: string
          is_edit?: boolean
          last_error?: string | null
          message_id?: number | null
          parse_mode?: string | null
          reference_id?: string | null
          reference_kind?: string | null
          sent_at?: string | null
          text: string
        }
        Update: {
          attempts?: number
          created_at?: string
          edit_message_id?: number | null
          id?: string
          is_edit?: boolean
          last_error?: string | null
          message_id?: number | null
          parse_mode?: string | null
          reference_id?: string | null
          reference_kind?: string | null
          sent_at?: string | null
          text?: string
        }
        Relationships: []
      }
      telegram_settings: {
        Row: {
          chat_id: number | null
          created_at: string
          id: number
          last_low_gateway_alert_at: string | null
          last_low_provider_alert_at: string | null
          last_low_provider_critical_alert_at: string | null
          low_balance_critical_threshold_cents: number
          low_balance_threshold_cents: number
          notify_delivery_progress: boolean
          notify_low_balance: boolean
          notify_recharges: boolean
          notify_refunds: boolean
          notify_reseller_activity: boolean
          notify_sales: boolean
          notify_signups: boolean
          paired_at: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          updated_at: string
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          id?: number
          last_low_gateway_alert_at?: string | null
          last_low_provider_alert_at?: string | null
          last_low_provider_critical_alert_at?: string | null
          low_balance_critical_threshold_cents?: number
          low_balance_threshold_cents?: number
          notify_delivery_progress?: boolean
          notify_low_balance?: boolean
          notify_recharges?: boolean
          notify_refunds?: boolean
          notify_reseller_activity?: boolean
          notify_sales?: boolean
          notify_signups?: boolean
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          id?: number
          last_low_gateway_alert_at?: string | null
          last_low_provider_alert_at?: string | null
          last_low_provider_critical_alert_at?: string | null
          low_balance_critical_threshold_cents?: number
          low_balance_threshold_cents?: number
          notify_delivery_progress?: boolean
          notify_low_balance?: boolean
          notify_recharges?: boolean
          notify_refunds?: boolean
          notify_reseller_activity?: boolean
          notify_sales?: boolean
          notify_signups?: boolean
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tier_credit_prices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          plan_id: string
          price_cents: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          plan_id: string
          price_cents?: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          plan_id?: string
          price_cents?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_credit_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "credit_pricing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_credit_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_extension_prices: {
        Row: {
          created_at: string
          extension_id: string
          id: string
          is_active: boolean
          license_type: string
          price_cents: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extension_id: string
          id?: string
          is_active?: boolean
          license_type: string
          price_cents?: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extension_id?: string
          id?: string
          is_active?: boolean
          license_type?: string
          price_cents?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_extension_prices_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_extension_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_license_prices: {
        Row: {
          created_at: string
          duration_code: string
          id: string
          is_active: boolean
          price_cents: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_code: string
          id?: string
          is_active?: boolean
          price_cents?: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_code?: string
          id?: string
          is_active?: boolean
          price_cents?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_license_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "reseller_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_registrations: {
        Row: {
          created_at: string
          id: string
          ip_address: string
          license_key: string | null
          name: string
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
          license_key?: string | null
          name: string
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
          license_key?: string | null
          name?: string
          phone?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _slugify_simple: { Args: { _s: string }; Returns: string }
      activate_reseller: {
        Args: { _actor_id?: string; _payment_id?: string; _reseller_id: string }
        Returns: undefined
      }
      add_referral_commission: {
        Args: { _amount_cents: number; _referral_id: string }
        Returns: undefined
      }
      add_reseller_spent: {
        Args: { _amount_cents: number; _reseller_id: string }
        Returns: undefined
      }
      approve_user: { Args: { _user_id: string }; Returns: undefined }
      build_storefront_credit_sale_text: {
        Args: { _order_id: string }
        Returns: string
      }
      cleanup_old_trial_registrations: {
        Args: { _days?: number }
        Returns: number
      }
      compute_promotion_discount: {
        Args: { _base_cents: number; _kind: string }
        Returns: {
          discount_cents: number
          final_cents: number
          promotion_id: string
        }[]
      }
      compute_recharge_bonus: {
        Args: { _amount_cents: number }
        Returns: {
          bonus_cents: number
          promotion_id: string
        }[]
      }
      credit_reseller_balance: {
        Args: {
          _amount_cents: number
          _description: string
          _kind: string
          _reference_id: string
          _reseller_id: string
        }
        Returns: undefined
      }
      credit_reseller_balance_promo: {
        Args: {
          _amount_cents: number
          _description: string
          _kind: string
          _promotion_id: string
          _reference_id: string
          _reseller_id: string
        }
        Returns: undefined
      }
      debit_reseller_balance: {
        Args: {
          _amount_cents: number
          _description: string
          _kind: string
          _reference_id: string
          _reseller_id: string
        }
        Returns: boolean
      }
      debit_reseller_balance_promo: {
        Args: {
          _amount_cents: number
          _description: string
          _kind: string
          _promotion_id: string
          _reference_id: string
          _reseller_id: string
        }
        Returns: boolean
      }
      enqueue_reseller_webhook: {
        Args: {
          _api_key_id: string
          _event: string
          _payload: Json
          _reseller_id: string
        }
        Returns: undefined
      }
      force_debit_reseller_balance: {
        Args: {
          _amount_cents: number
          _description: string
          _kind: string
          _reference_id: string
          _reseller_id: string
        }
        Returns: undefined
      }
      generate_reseller_referral_code: {
        Args: { _reseller_id: string }
        Returns: string
      }
      get_active_promotion: {
        Args: never
        Returns: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          credit_discount_pct: number | null
          deactivated_at: string | null
          description: string | null
          ends_at: string | null
          extension_discount_pct: number | null
          id: string
          name: string
          recharge_bonus_pct: number | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "promotions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_credit_pack_cost: {
        Args: { _plan_id: string; _reseller_id: string }
        Returns: number
      }
      get_license_pack_cost: {
        Args: { _duration_code: string; _reseller_id: string }
        Returns: number
      }
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_reseller_ranking_v2: {
        Args: { start_date: string }
        Returns: {
          display_name: string
          reseller_id: string
          total_spent_cents: number
        }[]
      }
      get_reseller_tier: {
        Args: { _reseller_id: string }
        Returns: {
          color: string
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          is_hidden: boolean
          min_spent_cents: number
          name: string
          recharge_bonus_percent: number
          referral_commission_percent: number
          slug: string
          sort_order: number
          test_keys_per_day: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reseller_tiers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_pending_storefront_orders: {
        Args: { _reseller_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_evolution_messages_sent: {
        Args: { _reseller_id: string }
        Returns: undefined
      }
      is_reseller_active: { Args: { _user_id: string }; Returns: boolean }
      lookup_affiliate_code: { Args: { _code: string }; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      notify_purchase_permission_alert: {
        Args: { _purchase_id: string }
        Returns: undefined
      }
      notify_purchase_stuck_alert: {
        Args: { _hours: number; _purchase_id: string }
        Returns: undefined
      }
      reject_user: { Args: { _user_id: string }; Returns: undefined }
      reset_daily_test_keys: { Args: never; Returns: undefined }
      scan_stuck_configurando_purchases: { Args: never; Returns: undefined }
      telegram_enqueue: { Args: { _text: string }; Returns: undefined }
      telegram_enqueue_edit: {
        Args: { _kind: string; _ref_id: string; _text: string }
        Returns: undefined
      }
      telegram_enqueue_ref: {
        Args: { _kind: string; _ref_id: string; _text: string }
        Returns: undefined
      }
      telegram_generate_pairing_code: { Args: never; Returns: string }
      telegram_unpair: { Args: never; Returns: undefined }
      try_release_pending_orders: {
        Args: { _reseller_id: string }
        Returns: string[]
      }
      unaccent_safe: { Args: { _s: string }; Returns: string }
    }
    Enums: {
      app_role: "gerente" | "revendedor" | "cliente"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["gerente", "revendedor", "cliente"],
    },
  },
} as const
