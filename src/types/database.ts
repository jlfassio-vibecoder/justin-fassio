/**
 * Hand-written mirror of supabase/schema.sql, in the shape the
 * @supabase/supabase-js `Database` generic expects (Row/Insert/Update per
 * table). Keep in sync with the SQL file — if this project ever adopts the
 * Supabase CLI against a live project, `supabase gen types typescript` can
 * regenerate this from the real schema instead.
 */

export type UserRole = 'owner' | 'rep' | 'buyer';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export type AccountStatus = 'prospect' | 'active_account' | 'inactive';
export type OrderType = 'initial' | 'reorder' | 'preorder';
export type ApparelSeason =
  'spring_summer' | 'fathers_day' | 'fall_winter' | 'holiday_christmas' | 'ats_in_season';
export type OrderStatus = 'draft' | 'submitted' | 'fulfilled';
export type AccountContactRole = 'buyer' | 'manager' | 'owner';

export interface Database {
  public: {
    Tables: {
      lines: {
        Row: {
          id: string;
          code: string;
          name: string;
          active: boolean;
          tagline: string | null;
          description: string | null;
          hero_image_path: string | null;
          hero_image_url: string | null;
          sort_order: number;
          public_showroom_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          active?: boolean;
          tagline?: string | null;
          description?: string | null;
          hero_image_path?: string | null;
          hero_image_url?: string | null;
          sort_order?: number;
          public_showroom_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          active?: boolean;
          tagline?: string | null;
          description?: string | null;
          hero_image_path?: string | null;
          hero_image_url?: string | null;
          sort_order?: number;
          public_showroom_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      territories: {
        Row: {
          id: string;
          code: string;
          name: string;
          country_code: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          country_code: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          country_code?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_items: {
        Row: {
          id: string;
          line_id: string;
          page: number | null;
          cat: string;
          sku: string;
          name: string;
          color: string | null;
          tagline: string | null;
          price_usd: number;
          msrp_cad: number;
          catalog_price_usd: number;
          price_usd_override: number | null;
          catalog_msrp_cad: number;
          msrp_cad_override: number | null;
          landed_cad_override: number | null;
          field_meta: Record<string, unknown>;
          status: string;
          is_new: boolean;
          is_name_drop: boolean;
          is_bestseller: boolean;
          pdf_page: number | null;
          catalog_year: number | null;
          brand: string | null;
          product_family: string | null;
          collection: string | null;
          product_type: string | null;
          accent_color: string | null;
          sales_description: string | null;
          material: string | null;
          special_notes: string | null;
          sales_priority: string | null;
          sales_notes: string | null;
          primary_image_path: string | null;
          department: string | null;
          normalized_sku: string | null;
          unit_of_measure: string;
          minimum_quantity: number | null;
          order_multiple: number | null;
          pack_quantity: number | null;
          made_in_usa_claim: boolean | null;
          country_of_blank_manufacture: string | null;
          country_of_decoration: string | null;
          country_of_origin: string | null;
          primary_image_url: string | null;
          source_image_url: string | null;
          catalog_verified: boolean;
          verification_notes: string | null;
          lifestyle_themes: unknown;
          recommended_channels: unknown;
          seasonality: string | null;
          sample_status: string | null;
          buyer_feedback: string | null;
          is_publicly_published: boolean;
          featured: boolean;
          public_sort_order: number;
          public_slug: string | null;
          live_sku: string | null;
          live_sku_note: string | null;
          alternate_image_urls: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_id: string;
          page?: number | null;
          cat: string;
          sku: string;
          name: string;
          color?: string | null;
          tagline?: string | null;
          price_usd?: number;
          msrp_cad?: number;
          catalog_price_usd?: number;
          price_usd_override?: number | null;
          catalog_msrp_cad?: number;
          msrp_cad_override?: number | null;
          landed_cad_override?: number | null;
          field_meta?: Record<string, unknown>;
          status?: string;
          is_new?: boolean;
          is_name_drop?: boolean;
          is_bestseller?: boolean;
          pdf_page?: number | null;
          catalog_year?: number | null;
          brand?: string | null;
          product_family?: string | null;
          collection?: string | null;
          product_type?: string | null;
          accent_color?: string | null;
          sales_description?: string | null;
          material?: string | null;
          special_notes?: string | null;
          sales_priority?: string | null;
          sales_notes?: string | null;
          primary_image_path?: string | null;
          department?: string | null;
          normalized_sku?: string | null;
          unit_of_measure?: string;
          minimum_quantity?: number | null;
          order_multiple?: number | null;
          pack_quantity?: number | null;
          made_in_usa_claim?: boolean | null;
          country_of_blank_manufacture?: string | null;
          country_of_decoration?: string | null;
          country_of_origin?: string | null;
          primary_image_url?: string | null;
          source_image_url?: string | null;
          catalog_verified?: boolean;
          verification_notes?: string | null;
          lifestyle_themes?: unknown;
          recommended_channels?: unknown;
          seasonality?: string | null;
          sample_status?: string | null;
          buyer_feedback?: string | null;
          is_publicly_published?: boolean;
          featured?: boolean;
          public_sort_order?: number;
          public_slug?: string | null;
          live_sku?: string | null;
          live_sku_note?: string | null;
          alternate_image_urls?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          line_id?: string;
          page?: number | null;
          cat?: string;
          sku?: string;
          name?: string;
          color?: string | null;
          tagline?: string | null;
          price_usd?: number;
          msrp_cad?: number;
          catalog_price_usd?: number;
          price_usd_override?: number | null;
          catalog_msrp_cad?: number;
          msrp_cad_override?: number | null;
          landed_cad_override?: number | null;
          field_meta?: Record<string, unknown>;
          status?: string;
          is_new?: boolean;
          is_name_drop?: boolean;
          is_bestseller?: boolean;
          pdf_page?: number | null;
          catalog_year?: number | null;
          brand?: string | null;
          product_family?: string | null;
          collection?: string | null;
          product_type?: string | null;
          accent_color?: string | null;
          sales_description?: string | null;
          material?: string | null;
          special_notes?: string | null;
          sales_priority?: string | null;
          sales_notes?: string | null;
          primary_image_path?: string | null;
          department?: string | null;
          normalized_sku?: string | null;
          unit_of_measure?: string;
          minimum_quantity?: number | null;
          order_multiple?: number | null;
          pack_quantity?: number | null;
          made_in_usa_claim?: boolean | null;
          country_of_blank_manufacture?: string | null;
          country_of_decoration?: string | null;
          country_of_origin?: string | null;
          primary_image_url?: string | null;
          source_image_url?: string | null;
          catalog_verified?: boolean;
          verification_notes?: string | null;
          lifestyle_themes?: unknown;
          recommended_channels?: unknown;
          seasonality?: string | null;
          sample_status?: string | null;
          buyer_feedback?: string | null;
          is_publicly_published?: boolean;
          featured?: boolean;
          public_sort_order?: number;
          public_slug?: string | null;
          live_sku?: string | null;
          live_sku_note?: string | null;
          alternate_image_urls?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_variants: {
        Row: {
          id: string;
          catalog_item_id: string;
          size: string | null;
          size_group: string | null;
          color: string | null;
          style: string | null;
          variant_sku: string | null;
          wholesale_usd: number;
          wholesale_usd_override: number | null;
          unit_of_measure: string;
          pack_quantity: number | null;
          pack_price_usd: number | null;
          availability: string;
          sort_order: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          catalog_item_id: string;
          size?: string | null;
          size_group?: string | null;
          color?: string | null;
          style?: string | null;
          variant_sku?: string | null;
          wholesale_usd?: number;
          wholesale_usd_override?: number | null;
          unit_of_measure?: string;
          pack_quantity?: number | null;
          pack_price_usd?: number | null;
          availability?: string;
          sort_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          catalog_item_id?: string;
          size?: string | null;
          size_group?: string | null;
          color?: string | null;
          style?: string | null;
          variant_sku?: string | null;
          wholesale_usd?: number;
          wholesale_usd_override?: number | null;
          unit_of_measure?: string;
          pack_quantity?: number | null;
          pack_price_usd?: number | null;
          availability?: string;
          sort_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_settings: {
        Row: {
          id: string;
          line_id: string;
          catalog_year: number;
          min_order_pieces: number;
          min_pieces_per_design: number;
          shipping_origin: string | null;
          pricing_assumption_version: string;
          duty_rate: number;
          surtax_rate: number;
          brokerage_allocation_cad: number;
          freight_allocation_cad: number;
          import_gst_recoverable: boolean;
          terms_verified: boolean;
          terms_note: string | null;
          default_shipping_method: string | null;
          prices_subject_to_change: boolean;
          backorder_policy: string | null;
          order_processing_policy: string | null;
          claims_policy: string | null;
          returns_policy: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_id: string;
          catalog_year?: number;
          min_order_pieces?: number;
          min_pieces_per_design?: number;
          shipping_origin?: string | null;
          pricing_assumption_version?: string;
          duty_rate?: number;
          surtax_rate?: number;
          brokerage_allocation_cad?: number;
          freight_allocation_cad?: number;
          import_gst_recoverable?: boolean;
          terms_verified?: boolean;
          terms_note?: string | null;
          default_shipping_method?: string | null;
          prices_subject_to_change?: boolean;
          backorder_policy?: string | null;
          order_processing_policy?: string | null;
          claims_policy?: string | null;
          returns_policy?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          line_id?: string;
          catalog_year?: number;
          min_order_pieces?: number;
          min_pieces_per_design?: number;
          shipping_origin?: string | null;
          pricing_assumption_version?: string;
          duty_rate?: number;
          surtax_rate?: number;
          brokerage_allocation_cad?: number;
          freight_allocation_cad?: number;
          import_gst_recoverable?: boolean;
          terms_verified?: boolean;
          terms_note?: string | null;
          default_shipping_method?: string | null;
          prices_subject_to_change?: boolean;
          backorder_policy?: string | null;
          order_processing_policy?: string | null;
          claims_policy?: string | null;
          returns_policy?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_product_attributes: {
        Row: {
          id: string;
          catalog_item_id: string;
          attribute_key: string;
          label: string;
          value: string | null;
          value_type: string;
          unit: string | null;
          attribute_group: string;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          catalog_item_id: string;
          attribute_key: string;
          label: string;
          value?: string | null;
          value_type?: string;
          unit?: string | null;
          attribute_group?: string;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          catalog_item_id?: string;
          attribute_key?: string;
          label?: string;
          value?: string | null;
          value_type?: string;
          unit?: string | null;
          attribute_group?: string;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_field_changes: {
        Row: {
          id: string;
          catalog_item_id: string;
          field_path: string;
          old_value: unknown;
          new_value: unknown;
          source: string;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          catalog_item_id: string;
          field_path: string;
          old_value?: unknown;
          new_value?: unknown;
          source?: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          catalog_item_id?: string;
          field_path?: string;
          old_value?: unknown;
          new_value?: unknown;
          source?: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_assets: {
        Row: {
          id: string;
          catalog_item_id: string | null;
          line_id: string;
          asset_kind: string;
          storage_path: string;
          content_hash: string | null;
          pdf_page: number | null;
          crop: unknown;
          source_document: string | null;
          extraction_method: string | null;
          confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          catalog_item_id?: string | null;
          line_id: string;
          asset_kind: string;
          storage_path: string;
          content_hash?: string | null;
          pdf_page?: number | null;
          crop?: unknown;
          source_document?: string | null;
          extraction_method?: string | null;
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          catalog_item_id?: string | null;
          line_id?: string;
          asset_kind?: string;
          storage_path?: string;
          content_hash?: string | null;
          pdf_page?: number | null;
          crop?: unknown;
          source_document?: string | null;
          extraction_method?: string | null;
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_import_runs: {
        Row: {
          id: string;
          line_id: string;
          source_document: string;
          status: string;
          report: Record<string, unknown>;
          started_at: string;
          completed_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          line_id: string;
          source_document: string;
          status?: string;
          report?: Record<string, unknown>;
          started_at?: string;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          line_id?: string;
          source_document?: string;
          status?: string;
          report?: Record<string, unknown>;
          started_at?: string;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      catalog_import_conflicts: {
        Row: {
          id: string;
          import_run_id: string;
          catalog_item_id: string | null;
          sku: string | null;
          field_path: string;
          current_value: unknown;
          proposed_value: unknown;
          current_source: string | null;
          proposed_source: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_run_id: string;
          catalog_item_id?: string | null;
          sku?: string | null;
          field_path: string;
          current_value?: unknown;
          proposed_value?: unknown;
          current_source?: string | null;
          proposed_source?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_run_id?: string;
          catalog_item_id?: string | null;
          sku?: string | null;
          field_path?: string;
          current_value?: unknown;
          proposed_value?: unknown;
          current_source?: string | null;
          proposed_source?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      prospects: {
        Row: {
          id: number;
          name: string;
          category: string;
          region: string;
          city: string;
          address: string;
          phone: string;
          fit: string;
          account_status: AccountStatus;
          converted_at: string | null;
          initial_order_date: string | null;
          notes: string | null;
          territory_id: string;
          external_id: string | null;
          subterritory: string | null;
          primary_district: string | null;
          retail_category: string | null;
          website: string | null;
          fit_score: number | null;
          ideal_opening_units: number | null;
          priority: string | null;
          provisional_grade: string | null;
          verification_status: string | null;
          buyer_verified: boolean;
          apparel_capability: string | null;
          existing_ogr: string | null;
          qualification_status: string | null;
          next_action: string | null;
          source_note: string | null;
          secondary_channels: unknown;
          retail_subchannels: unknown;
          venue_contexts: unknown;
          lifestyle_themes: unknown;
          retail_capabilities: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: number;
          name: string;
          category: string;
          region: string;
          city: string;
          address?: string;
          phone?: string;
          fit?: string;
          account_status?: AccountStatus;
          converted_at?: string | null;
          initial_order_date?: string | null;
          notes?: string | null;
          territory_id: string;
          external_id?: string | null;
          subterritory?: string | null;
          primary_district?: string | null;
          retail_category?: string | null;
          website?: string | null;
          fit_score?: number | null;
          ideal_opening_units?: number | null;
          priority?: string | null;
          provisional_grade?: string | null;
          verification_status?: string | null;
          buyer_verified?: boolean;
          apparel_capability?: string | null;
          existing_ogr?: string | null;
          qualification_status?: string | null;
          next_action?: string | null;
          source_note?: string | null;
          secondary_channels?: unknown;
          retail_subchannels?: unknown;
          venue_contexts?: unknown;
          lifestyle_themes?: unknown;
          retail_capabilities?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          category?: string;
          region?: string;
          city?: string;
          address?: string;
          phone?: string;
          fit?: string;
          account_status?: AccountStatus;
          converted_at?: string | null;
          initial_order_date?: string | null;
          notes?: string | null;
          territory_id?: string;
          external_id?: string | null;
          subterritory?: string | null;
          primary_district?: string | null;
          retail_category?: string | null;
          website?: string | null;
          fit_score?: number | null;
          ideal_opening_units?: number | null;
          priority?: string | null;
          provisional_grade?: string | null;
          verification_status?: string | null;
          buyer_verified?: boolean;
          apparel_capability?: string | null;
          existing_ogr?: string | null;
          qualification_status?: string | null;
          next_action?: string | null;
          source_note?: string | null;
          secondary_channels?: unknown;
          retail_subchannels?: unknown;
          venue_contexts?: unknown;
          lifestyle_themes?: unknown;
          retail_capabilities?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prospects_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      prospect_updates: {
        Row: {
          id: string;
          prospect_id: number;
          status: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: number;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: number;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          prospect_id: number;
          line_id: string | null;
          contact_name: string | null;
          call_date: string;
          outcome: string;
          pmf_score: number | null;
          order_value_cad: number | null;
          objection_tags: string[];
          notes: string | null;
          follow_up_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: number;
          line_id?: string | null;
          contact_name?: string | null;
          call_date?: string;
          outcome: string;
          pmf_score?: number | null;
          order_value_cad?: number | null;
          objection_tags?: string[];
          notes?: string | null;
          follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: number;
          line_id?: string | null;
          contact_name?: string | null;
          call_date?: string;
          outcome?: string;
          pmf_score?: number | null;
          order_value_cad?: number | null;
          objection_tags?: string[];
          notes?: string | null;
          follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          account_id: number;
          line_id: string | null;
          order_type: OrderType;
          season: ApparelSeason;
          order_date: string;
          total_amount_cad: number;
          status: OrderStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: number;
          line_id?: string | null;
          order_type: OrderType;
          season: ApparelSeason;
          order_date?: string;
          total_amount_cad?: number;
          status?: OrderStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: number;
          line_id?: string | null;
          order_type?: OrderType;
          season?: ApparelSeason;
          order_date?: string;
          total_amount_cad?: number;
          status?: OrderStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_reorder_settings: {
        Row: {
          account_id: number;
          last_order_date: string | null;
          next_suggested_contact_date: string | null;
          seasonal_cadence_tags: string[];
          ai_reorder_notes: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: number;
          last_order_date?: string | null;
          next_suggested_contact_date?: string | null;
          seasonal_cadence_tags?: string[];
          ai_reorder_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: number;
          last_order_date?: string | null;
          next_suggested_contact_date?: string | null;
          seasonal_cadence_tags?: string[];
          ai_reorder_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_contacts: {
        Row: {
          id: string;
          account_id: number;
          role: AccountContactRole;
          full_name: string;
          title: string | null;
          phone: string | null;
          email: string | null;
          is_primary: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: number;
          role: AccountContactRole;
          full_name: string;
          title?: string | null;
          phone?: string | null;
          email?: string | null;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: number;
          role?: AccountContactRole;
          full_name?: string;
          title?: string | null;
          phone?: string | null;
          email?: string | null;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wholesale_order_requests: {
        Row: {
          id: string;
          request_number: string;
          business_name: string;
          buyer_name: string;
          email: string;
          phone: string;
          city: string;
          province: string;
          postal_code: string;
          retail_channel: string;
          is_existing_customer: boolean;
          website: string | null;
          gst_hst_number: string | null;
          po_number: string | null;
          notes: string | null;
          preferred_contact_method: string | null;
          source: string;
          status: string;
          request_type: string;
          prospect_id: number | null;
          idempotency_key: string | null;
          merchandise_subtotal_usd: number;
          total_units: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_number?: string;
          business_name: string;
          buyer_name: string;
          email: string;
          phone: string;
          city: string;
          province: string;
          postal_code: string;
          retail_channel: string;
          is_existing_customer?: boolean;
          website?: string | null;
          gst_hst_number?: string | null;
          po_number?: string | null;
          notes?: string | null;
          preferred_contact_method?: string | null;
          source?: string;
          status?: string;
          request_type?: string;
          prospect_id?: number | null;
          idempotency_key?: string | null;
          merchandise_subtotal_usd?: number;
          total_units?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_number?: string;
          business_name?: string;
          buyer_name?: string;
          email?: string;
          phone?: string;
          city?: string;
          province?: string;
          postal_code?: string;
          retail_channel?: string;
          is_existing_customer?: boolean;
          website?: string | null;
          gst_hst_number?: string | null;
          po_number?: string | null;
          notes?: string | null;
          preferred_contact_method?: string | null;
          source?: string;
          status?: string;
          request_type?: string;
          prospect_id?: number | null;
          idempotency_key?: string | null;
          merchandise_subtotal_usd?: number;
          total_units?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wholesale_order_request_items: {
        Row: {
          id: string;
          order_request_id: string;
          catalog_item_id: string | null;
          sku: string;
          name: string;
          size: string | null;
          wholesale_usd: number;
          quantity: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_request_id: string;
          catalog_item_id?: string | null;
          sku: string;
          name: string;
          size?: string | null;
          wholesale_usd: number;
          quantity: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_request_id?: string;
          catalog_item_id?: string | null;
          sku?: string;
          name?: string;
          size?: string | null;
          wholesale_usd?: number;
          quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      message_threads: {
        Row: {
          id: string;
          prospect_id: number | null;
          mapping_status: string;
          identity_fingerprint: string;
          confirmed_fingerprint: string | null;
          source: string;
          subject: string;
          channel: string;
          chat_state: string | null;
          visitor_user_id: string | null;
          visitor_name: string | null;
          visitor_email: string | null;
          awaiting_reply_since: string | null;
          last_message_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prospect_id?: number | null;
          mapping_status?: string;
          identity_fingerprint: string;
          confirmed_fingerprint?: string | null;
          source?: string;
          subject?: string;
          channel?: string;
          chat_state?: string | null;
          visitor_user_id?: string | null;
          visitor_name?: string | null;
          visitor_email?: string | null;
          awaiting_reply_since?: string | null;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: number | null;
          mapping_status?: string;
          identity_fingerprint?: string;
          confirmed_fingerprint?: string | null;
          source?: string;
          subject?: string;
          channel?: string;
          chat_state?: string | null;
          visitor_user_id?: string | null;
          visitor_name?: string | null;
          visitor_email?: string | null;
          awaiting_reply_since?: string | null;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          thread_id: string;
          kind: string;
          wholesale_order_request_id: string | null;
          body: string;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          kind?: string;
          wholesale_order_request_id?: string | null;
          body?: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          kind?: string;
          wholesale_order_request_id?: string | null;
          body?: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: UserRole;
          status: UserStatus;
          prospect_id: number | null;
          wholesale_pricing_unlocked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          prospect_id?: number | null;
          wholesale_pricing_unlocked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          prospect_id?: number | null;
          wholesale_pricing_unlocked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_account_connections: {
        Row: {
          id: string;
          profile_id: string;
          google_sub: string;
          google_email: string;
          refresh_token_ciphertext: string;
          scopes: string[];
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          google_sub: string;
          google_email: string;
          refresh_token_ciphertext: string;
          scopes?: string[];
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          google_sub?: string;
          google_email?: string;
          refresh_token_ciphertext?: string;
          scopes?: string[];
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'google_account_connections_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      gmail_thread_links: {
        Row: {
          id: string;
          google_connection_id: string;
          gmail_thread_id: string;
          prospect_id: number | null;
          account_contact_id: string | null;
          link_status: string;
          subject: string | null;
          snippet: string | null;
          participants: unknown;
          unread: boolean;
          last_message_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_connection_id: string;
          gmail_thread_id: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          link_status?: string;
          subject?: string | null;
          snippet?: string | null;
          participants?: unknown;
          unread?: boolean;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          google_connection_id?: string;
          gmail_thread_id?: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          link_status?: string;
          subject?: string | null;
          snippet?: string | null;
          participants?: unknown;
          unread?: boolean;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'gmail_thread_links_google_connection_id_fkey';
            columns: ['google_connection_id'];
            isOneToOne: false;
            referencedRelation: 'google_account_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gmail_thread_links_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gmail_thread_links_account_contact_id_fkey';
            columns: ['account_contact_id'];
            isOneToOne: false;
            referencedRelation: 'account_contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_event_links: {
        Row: {
          id: string;
          google_connection_id: string;
          calendar_id: string;
          google_event_id: string;
          prospect_id: number | null;
          account_contact_id: string | null;
          link_status: string;
          title: string | null;
          start_at: string | null;
          end_at: string | null;
          meet_url: string | null;
          attendees: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_connection_id: string;
          calendar_id?: string;
          google_event_id: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          link_status?: string;
          title?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          meet_url?: string | null;
          attendees?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          google_connection_id?: string;
          calendar_id?: string;
          google_event_id?: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          link_status?: string;
          title?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          meet_url?: string | null;
          attendees?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_event_links_google_connection_id_fkey';
            columns: ['google_connection_id'];
            isOneToOne: false;
            referencedRelation: 'google_account_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_links_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_links_account_contact_id_fkey';
            columns: ['account_contact_id'];
            isOneToOne: false;
            referencedRelation: 'account_contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      system_messages: {
        Row: {
          id: string;
          message_type: string;
          origin: string;
          status: string;
          catalog_item_id: string | null;
          resend_email_id: string | null;
          to_email: string;
          to_name: string | null;
          subject: string;
          prospect_id: number | null;
          account_contact_id: string | null;
          sent_by: string | null;
          queued_at: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          last_opened_at: string | null;
          last_clicked_at: string | null;
          last_engagement_received_at: string | null;
          bounced_at: string | null;
          failed_at: string | null;
          complained_at: string | null;
          open_count: number;
          click_count: number;
          last_event_at: string | null;
          failure_reason: string | null;
          payload: unknown;
          scheduled_for: string | null;
          automation_run_id: string | null;
          sequence_id: string | null;
          sequence_step: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          message_type: string;
          origin: string;
          status: string;
          catalog_item_id?: string | null;
          resend_email_id?: string | null;
          to_email: string;
          to_name?: string | null;
          subject?: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          sent_by?: string | null;
          queued_at?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          last_opened_at?: string | null;
          last_clicked_at?: string | null;
          last_engagement_received_at?: string | null;
          bounced_at?: string | null;
          failed_at?: string | null;
          complained_at?: string | null;
          open_count?: number;
          click_count?: number;
          last_event_at?: string | null;
          failure_reason?: string | null;
          payload?: unknown;
          scheduled_for?: string | null;
          automation_run_id?: string | null;
          sequence_id?: string | null;
          sequence_step?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          message_type?: string;
          origin?: string;
          status?: string;
          catalog_item_id?: string | null;
          resend_email_id?: string | null;
          to_email?: string;
          to_name?: string | null;
          subject?: string;
          prospect_id?: number | null;
          account_contact_id?: string | null;
          sent_by?: string | null;
          queued_at?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          last_opened_at?: string | null;
          last_clicked_at?: string | null;
          last_engagement_received_at?: string | null;
          bounced_at?: string | null;
          failed_at?: string | null;
          complained_at?: string | null;
          open_count?: number;
          click_count?: number;
          last_event_at?: string | null;
          failure_reason?: string | null;
          payload?: unknown;
          scheduled_for?: string | null;
          automation_run_id?: string | null;
          sequence_id?: string | null;
          sequence_step?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'system_messages_catalog_item_id_fkey';
            columns: ['catalog_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'system_messages_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'system_messages_account_contact_id_fkey';
            columns: ['account_contact_id'];
            isOneToOne: false;
            referencedRelation: 'account_contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      system_message_events: {
        Row: {
          id: string;
          system_message_id: string;
          resend_email_id: string | null;
          resend_event_id: string;
          event_type: string;
          occurred_at: string;
          payload: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          system_message_id: string;
          resend_email_id?: string | null;
          resend_event_id: string;
          event_type: string;
          occurred_at: string;
          payload?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          system_message_id?: string;
          resend_email_id?: string | null;
          resend_event_id?: string;
          event_type?: string;
          occurred_at?: string;
          payload?: unknown;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'system_message_events_system_message_id_fkey';
            columns: ['system_message_id'];
            isOneToOne: false;
            referencedRelation: 'system_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      product_outreach_engagement_seen: {
        Row: {
          catalog_item_id: string;
          seen_at: string;
        };
        Insert: {
          catalog_item_id: string;
          seen_at?: string;
        };
        Update: {
          catalog_item_id?: string;
          seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_outreach_engagement_seen_catalog_item_id_fkey';
            columns: ['catalog_item_id'];
            isOneToOne: true;
            referencedRelation: 'catalog_items';
            referencedColumns: ['id'];
          },
        ];
      };
      buyer_cart_items: {
        Row: {
          id: string;
          user_id: string;
          catalog_item_id: string;
          sku: string;
          name: string;
          size: string;
          quantity: number;
          wholesale_usd: number | null;
          primary_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          catalog_item_id: string;
          sku: string;
          name: string;
          size?: string;
          quantity: number;
          wholesale_usd?: number | null;
          primary_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          catalog_item_id?: string;
          sku?: string;
          name?: string;
          size?: string;
          quantity?: number;
          wholesale_usd?: number | null;
          primary_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      buyer_product_likes: {
        Row: {
          id: string;
          user_id: string;
          catalog_item_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          catalog_item_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          catalog_item_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_approved_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_approved_owner: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      buyer_has_wholesale_pricing: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      buyer_owns_message_thread: {
        Args: { p_thread_id: string };
        Returns: boolean;
      };
      list_pending_profiles: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: string;
          status: string;
          created_at: string;
        }[];
      };
      set_profile_status: {
        Args: {
          target_id: string;
          new_status: string;
        };
        Returns: undefined;
      };
      list_pending_wholesale_buyers: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          email: string | null;
          display_name: string | null;
          prospect_id: number | null;
          prospect_name: string | null;
          prospect_city: string | null;
          business_name: string | null;
          buyer_name: string | null;
          phone: string | null;
          wholesale_pricing_unlocked: boolean;
          status: string;
          created_at: string;
        }[];
      };
      set_buyer_wholesale_pricing: {
        Args: {
          target_id: string;
          unlocked: boolean;
          approve_profile?: boolean;
        };
        Returns: undefined;
      };
      get_public_ogr_products: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          sku: string;
          public_slug: string;
          name: string;
          cat: string;
          color: string | null;
          tagline: string | null;
          description: string | null;
          page: number | null;
          catalog_year: number | null;
          collection: string | null;
          wholesale_usd: number | null;
          msrp_cad: number;
          is_new: boolean;
          featured: boolean;
          public_sort_order: number;
          primary_image_url: string | null;
          alternate_image_urls: unknown;
          unit_of_measure: string;
          minimum_quantity: number | null;
          order_multiple: number | null;
          pack_quantity: number | null;
          lifestyle_themes: unknown;
          live_sku: string | null;
          available_sizes: string[];
        }[];
      };
      get_public_ogr_product_by_slug: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          sku: string;
          public_slug: string;
          name: string;
          cat: string;
          color: string | null;
          tagline: string | null;
          description: string | null;
          page: number | null;
          catalog_year: number | null;
          collection: string | null;
          wholesale_usd: number | null;
          msrp_cad: number;
          is_new: boolean;
          featured: boolean;
          public_sort_order: number;
          primary_image_url: string | null;
          alternate_image_urls: unknown;
          unit_of_measure: string;
          minimum_quantity: number | null;
          order_multiple: number | null;
          pack_quantity: number | null;
          lifestyle_themes: unknown;
          live_sku: string | null;
          available_sizes: string[];
        }[];
      };
      get_public_ogr_supplier_terms: {
        Args: Record<string, never>;
        Returns: {
          min_order_pieces: number;
          min_pieces_per_design: number;
          default_shipping_method: string | null;
          prices_subject_to_change: boolean;
        }[];
      };
      get_public_active_lines: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          code: string;
          name: string;
          tagline: string | null;
          description: string | null;
          hero_image_url: string | null;
          sort_order: number;
          public_showroom_path: string | null;
        }[];
      };
      apply_resend_system_message_event: {
        Args: {
          p_resend_email_id: string;
          p_resend_event_id: string;
          p_event_type: string;
          p_occurred_at: string;
          p_payload?: unknown;
          p_failure_reason?: string | null;
        };
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Line = Database['public']['Tables']['lines']['Row'];
export type CatalogItemRow = Database['public']['Tables']['catalog_items']['Row'];
export type CatalogVariantRow = Database['public']['Tables']['catalog_variants']['Row'];
export type CatalogSettingsRow = Database['public']['Tables']['catalog_settings']['Row'];
export type CatalogProductAttributeRow =
  Database['public']['Tables']['catalog_product_attributes']['Row'];
export type CatalogFieldChangeRow = Database['public']['Tables']['catalog_field_changes']['Row'];
export type ProspectRow = Database['public']['Tables']['prospects']['Row'];
export type ProspectUpdate = Database['public']['Tables']['prospect_updates']['Row'];
export type Call = Database['public']['Tables']['calls']['Row'];
export type CallInsert = Database['public']['Tables']['calls']['Insert'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderInsert = Database['public']['Tables']['orders']['Insert'];
export type AccountReorderSettings =
  Database['public']['Tables']['account_reorder_settings']['Row'];
export type AccountReorderSettingsInsert =
  Database['public']['Tables']['account_reorder_settings']['Insert'];
export type AccountContact = Database['public']['Tables']['account_contacts']['Row'];
export type AccountContactInsert = Database['public']['Tables']['account_contacts']['Insert'];
export type AccountContactUpdate = Database['public']['Tables']['account_contacts']['Update'];
export type SystemMessage = Database['public']['Tables']['system_messages']['Row'];
export type SystemMessageInsert = Database['public']['Tables']['system_messages']['Insert'];
export type SystemMessageUpdate = Database['public']['Tables']['system_messages']['Update'];
export type SystemMessageEvent = Database['public']['Tables']['system_message_events']['Row'];
export type SystemMessageEventInsert =
  Database['public']['Tables']['system_message_events']['Insert'];
export type SystemMessageEventUpdate =
  Database['public']['Tables']['system_message_events']['Update'];
export type ProductOutreachEngagementSeen =
  Database['public']['Tables']['product_outreach_engagement_seen']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
