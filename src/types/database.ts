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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
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
          color: string | null;
          style: string | null;
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
          color?: string | null;
          style?: string | null;
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
          color?: string | null;
          style?: string | null;
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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: UserRole;
          status: UserStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          created_at?: string;
          updated_at?: string;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Line = Database['public']['Tables']['lines']['Row'];
export type CatalogItemRow = Database['public']['Tables']['catalog_items']['Row'];
export type CatalogVariantRow = Database['public']['Tables']['catalog_variants']['Row'];
export type CatalogSettingsRow = Database['public']['Tables']['catalog_settings']['Row'];
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
export type Profile = Database['public']['Tables']['profiles']['Row'];
