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
          is_new: boolean;
          is_name_drop: boolean;
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
          is_new?: boolean;
          is_name_drop?: boolean;
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
          is_new?: boolean;
          is_name_drop?: boolean;
          created_at?: string;
          updated_at?: string;
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
