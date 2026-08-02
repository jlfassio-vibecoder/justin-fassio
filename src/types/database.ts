/**
 * Hand-written mirror of supabase/schema.sql, in the shape the
 * @supabase/supabase-js `Database` generic expects (Row/Insert/Update per
 * table). Keep in sync with the SQL file — if this project ever adopts the
 * Supabase CLI against a live project, `supabase gen types typescript` can
 * regenerate this from the real schema instead.
 */

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
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: 'rep' | 'buyer';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          role?: 'rep' | 'buyer';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          role?: 'rep' | 'buyer';
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Line = Database['public']['Tables']['lines']['Row'];
export type CatalogItemRow = Database['public']['Tables']['catalog_items']['Row'];
export type ProspectUpdate = Database['public']['Tables']['prospect_updates']['Row'];
export type Call = Database['public']['Tables']['calls']['Row'];
export type CallInsert = Database['public']['Tables']['calls']['Insert'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
