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
export type ConversionSource = 'outreach' | 'call' | 'wholesale' | 'manual';
export type AttributionModel = 'staff_confirmed' | 'last_touch_inferred' | 'none';
export type SellingDayMode = 'weekdays';

/** Phase 1A multi-line CRM enums */
export type LineStatus =
  'prospective' | 'confirmed' | 'onboarding' | 'active' | 'paused' | 'declined' | 'terminated';
export type AcquisitionStage =
  | 'identified'
  | 'researching'
  | 'contact_requested'
  | 'conversation'
  | 'evaluating'
  | 'negotiating'
  | 'decision_pending';
export type TerritoryLevel = 'country' | 'province_state' | 'region' | 'county';
export type TerritoryRowStatus = 'active' | 'proposed';
export type SalesLineTerritoryRightsType =
  'exclusive' | 'limited_exclusive' | 'non_exclusive' | 'unconfirmed';
export type SalesLineTerritoryStatus = 'proposed' | 'active' | 'expired' | 'disputed';
export type RelationshipStatus = 'prospect' | 'qualified' | 'opened' | 'inactive' | 'terminated';
export type RetailerLineTargetStatus = 'watching' | 'shortlist' | 'dropped';
export type RetailerFieldChangeSource = 'user' | 'ai' | 'import' | 'calculated' | 'unknown';
export type RetailerFieldChangeStatus = 'pending' | 'applied' | 'rejected' | 'superseded';
export type ActivityStatus = 'never_ordered' | 'active' | 'dormant';
export type ProductivityClass = 'productive' | 'developing' | 'low_value' | 'unclassified';
export type LineAccountMarker =
  | 'historical_purchaser'
  | 'reactivation_candidate'
  | 'reactivation_unresponsive'
  | 'outreach_eligible'
  | 'lookalike_prospect';
export type LookalikeJobStatus = 'queued' | 'running' | 'proposed' | 'failed' | 'cancelled';
export type LookalikeCandidateStatus = 'proposed' | 'already_in_crm' | 'approved' | 'rejected';
export type AccountImportSourceType =
  'historical_customer' | 'faire_customer' | 'zoominfo_lead' | 'research_prospect' | 'other';
export type AccountImportBatchStatus =
  'previewed' | 'committed' | 'enriching' | 'enrichment_partial' | 'completed' | 'cancelled';
export type AccountImportMatchDecision =
  | 'create_retailer'
  | 'link_existing'
  | 'update_rla'
  | 'in_file_duplicate'
  | 'prior_import_skip'
  | 'needs_review'
  | 'blocked';
export type AccountImportRowStatus =
  'previewed' | 'queued' | 'imported' | 'linked' | 'updated' | 'skipped' | 'failed' | 'cancelled';
export type AccountEnrichmentMode = 'fill-blanks' | 'update';
export type AccountEnrichmentJobStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Account Research PR1 */
export type AccountResearchRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'needs_identity_review'
  | 'cancelled';
export type AccountResearchTrigger = 'manual' | 'prep' | 'api';
export type AccountResearchRequestedScope =
  | 'all'
  | 'website'
  | 'shopify'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'pinterest'
  | 'linkedin'
  | 'youtube'
  | 'x'
  | 'other';
export type AccountResearchIdentityConfidence = 'high' | 'medium' | 'low' | 'unresolved';
export type AccountResearchIdentityReviewStatus =
  'pending' | 'auto_accepted' | 'staff_confirmed' | 'rejected' | 'not_required';
export type AccountResearchSourceType =
  | 'website'
  | 'shopify'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'pinterest'
  | 'linkedin'
  | 'youtube'
  | 'x'
  | 'other';
export type AccountResearchSearchMode = 'identity' | 'recent_activity' | 'storefront';
export type AccountResearchSourceSearchStatus =
  'pending' | 'running' | 'succeeded' | 'none_indexed' | 'blocked' | 'failed' | 'cancelled';
export type AccountResearchCitationPlatform = AccountResearchSourceType | 'directory';
export type AccountResearchConfidence = 'high' | 'medium' | 'low';
export type AccountResearchAcceptanceStatus = 'pending' | 'accepted' | 'rejected';
export type AccountResearchAcceptanceBasis = 'identity_gate' | 'staff' | 'confirmed_profile';
export type AccountResearchSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';
export type AccountProductMatchRunStatus =
  'pending' | 'running' | 'succeeded' | 'empty' | 'failed' | 'stale_research' | 'cancelled';
export type AccountProductMatchEmptyReason =
  'all_recently_emailed' | 'no_eligible_products' | 'no_accepted_evidence' | 'identity_unresolved';
export type AccountProductMatchProductFit = 'channel_intersect' | 'global_fallback';

export interface Database {
  public: {
    Tables: {
      principals: {
        Row: {
          id: string;
          legal_name: string | null;
          dba_name: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legal_name?: string | null;
          dba_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          legal_name?: string | null;
          dba_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
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
          principal_id: string | null;
          status: LineStatus;
          acquisition_stage: AcquisitionStage | null;
          default_currency: string | null;
          commission_rate: number | null;
          effective_date: string | null;
          termination_date: string | null;
          productivity_thresholds: Record<string, unknown> | null;
          ai_profile: Record<string, unknown> | null;
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
          principal_id?: string | null;
          status?: LineStatus;
          acquisition_stage?: AcquisitionStage | null;
          default_currency?: string | null;
          commission_rate?: number | null;
          effective_date?: string | null;
          termination_date?: string | null;
          productivity_thresholds?: Record<string, unknown> | null;
          ai_profile?: Record<string, unknown> | null;
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
          principal_id?: string | null;
          status?: LineStatus;
          acquisition_stage?: AcquisitionStage | null;
          default_currency?: string | null;
          commission_rate?: number | null;
          effective_date?: string | null;
          termination_date?: string | null;
          productivity_thresholds?: Record<string, unknown> | null;
          ai_profile?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lines_principal_id_fkey';
            columns: ['principal_id'];
            isOneToOne: false;
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
      territories: {
        Row: {
          id: string;
          code: string;
          name: string;
          country_code: string;
          sort_order: number;
          active: boolean;
          level: TerritoryLevel;
          parent_territory_id: string | null;
          status: TerritoryRowStatus;
          metadata: Record<string, unknown>;
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
          level?: TerritoryLevel;
          parent_territory_id?: string | null;
          status?: TerritoryRowStatus;
          metadata?: Record<string, unknown>;
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
          level?: TerritoryLevel;
          parent_territory_id?: string | null;
          status?: TerritoryRowStatus;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'territories_parent_territory_id_fkey';
            columns: ['parent_territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_territories: {
        Row: {
          territory_id: string;
          created_at: string;
        };
        Insert: {
          territory_id: string;
          created_at?: string;
        };
        Update: {
          territory_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_territories_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: true;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      territory_geography_seed_batches: {
        Row: {
          id: string;
          source: string;
          effective_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          effective_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: string;
          effective_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      territory_geography_memberships: {
        Row: {
          id: string;
          territory_id: string;
          kind: 'county' | 'zip';
          state_code: 'WA' | 'OR' | 'CA';
          county_fips: string | null;
          zip: string | null;
          note: string | null;
          seed_batch_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          territory_id: string;
          kind: 'county' | 'zip';
          state_code: 'WA' | 'OR' | 'CA';
          county_fips?: string | null;
          zip?: string | null;
          note?: string | null;
          seed_batch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          territory_id?: string;
          kind?: 'county' | 'zip';
          state_code?: 'WA' | 'OR' | 'CA';
          county_fips?: string | null;
          zip?: string | null;
          note?: string | null;
          seed_batch_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'territory_geography_memberships_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'operational_territories';
            referencedColumns: ['territory_id'];
          },
          {
            foreignKeyName: 'territory_geography_memberships_seed_batch_id_fkey';
            columns: ['seed_batch_id'];
            isOneToOne: false;
            referencedRelation: 'territory_geography_seed_batches';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_territory_review_queue: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          reason: string;
          payload: Record<string, unknown>;
          resolved_at: string | null;
          resolution: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          reason: string;
          payload?: Record<string, unknown>;
          resolved_at?: string | null;
          resolution?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          reason?: string;
          payload?: Record<string, unknown>;
          resolved_at?: string | null;
          resolution?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_line_territories: {
        Row: {
          id: string;
          sales_line_id: string;
          territory_id: string;
          rights_type: SalesLineTerritoryRightsType;
          status: SalesLineTerritoryStatus;
          effective_date: string | null;
          expiration_date: string | null;
          contract_source: string | null;
          restrictions: Record<string, unknown>;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sales_line_id: string;
          territory_id: string;
          rights_type: SalesLineTerritoryRightsType;
          status: SalesLineTerritoryStatus;
          effective_date?: string | null;
          expiration_date?: string | null;
          contract_source?: string | null;
          restrictions?: Record<string, unknown>;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sales_line_id?: string;
          territory_id?: string;
          rights_type?: SalesLineTerritoryRightsType;
          status?: SalesLineTerritoryStatus;
          effective_date?: string | null;
          expiration_date?: string | null;
          contract_source?: string | null;
          restrictions?: Record<string, unknown>;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      retailer_line_accounts: {
        Row: {
          id: string;
          retailer_id: number;
          sales_line_id: string;
          sales_line_territory_id: string | null;
          relationship_status: RelationshipStatus;
          converted_at: string | null;
          initial_order_date: string | null;
          notes: string | null;
          fit: string | null;
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
          region: string | null;
          primary_district: string | null;
          subterritory: string | null;
          secondary_channels: unknown;
          retail_subchannels: unknown;
          venue_contexts: unknown;
          lifestyle_themes: unknown;
          retail_capabilities: unknown;
          backfill_review_reason: string | null;
          line_account_markers: LineAccountMarker[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          retailer_id: number;
          sales_line_id: string;
          sales_line_territory_id?: string | null;
          relationship_status: RelationshipStatus;
          converted_at?: string | null;
          initial_order_date?: string | null;
          notes?: string | null;
          fit?: string | null;
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
          region?: string | null;
          primary_district?: string | null;
          subterritory?: string | null;
          secondary_channels?: unknown;
          retail_subchannels?: unknown;
          venue_contexts?: unknown;
          lifestyle_themes?: unknown;
          retail_capabilities?: unknown;
          backfill_review_reason?: string | null;
          line_account_markers?: LineAccountMarker[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          retailer_id?: number;
          sales_line_id?: string;
          sales_line_territory_id?: string | null;
          relationship_status?: RelationshipStatus;
          converted_at?: string | null;
          initial_order_date?: string | null;
          notes?: string | null;
          fit?: string | null;
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
          region?: string | null;
          primary_district?: string | null;
          subterritory?: string | null;
          secondary_channels?: unknown;
          retail_subchannels?: unknown;
          venue_contexts?: unknown;
          lifestyle_themes?: unknown;
          retail_capabilities?: unknown;
          backfill_review_reason?: string | null;
          line_account_markers?: LineAccountMarker[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      retailer_line_contacts: {
        Row: {
          id: string;
          retailer_line_account_id: string;
          account_contact_id: string;
          role: AccountContactRole;
          is_primary: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          retailer_line_account_id: string;
          account_contact_id: string;
          role: AccountContactRole;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          retailer_line_account_id?: string;
          account_contact_id?: string;
          role?: AccountContactRole;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      retailer_field_changes: {
        Row: {
          id: string;
          retailer_id: number;
          field_path: string;
          old_value: unknown;
          new_value: unknown;
          source: RetailerFieldChangeSource;
          actor_id: string | null;
          sales_line_id: string | null;
          retailer_line_account_id: string | null;
          status: RetailerFieldChangeStatus;
          confidence: string | null;
          provider: string | null;
          source_urls: unknown;
          enrichment_job_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          retailer_id: number;
          field_path: string;
          old_value?: unknown;
          new_value?: unknown;
          source?: RetailerFieldChangeSource;
          actor_id?: string | null;
          sales_line_id?: string | null;
          retailer_line_account_id?: string | null;
          status?: RetailerFieldChangeStatus;
          confidence?: string | null;
          provider?: string | null;
          source_urls?: unknown;
          enrichment_job_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          retailer_id?: number;
          field_path?: string;
          old_value?: unknown;
          new_value?: unknown;
          source?: RetailerFieldChangeSource;
          actor_id?: string | null;
          sales_line_id?: string | null;
          retailer_line_account_id?: string | null;
          status?: RetailerFieldChangeStatus;
          confidence?: string | null;
          provider?: string | null;
          source_urls?: unknown;
          enrichment_job_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      account_import_batches: {
        Row: {
          id: string;
          sales_line_id: string;
          source_type: AccountImportSourceType;
          source_filename: string;
          content_sha256: string | null;
          status: AccountImportBatchStatus;
          classification_snapshot: unknown;
          report: unknown;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sales_line_id: string;
          source_type: AccountImportSourceType;
          source_filename: string;
          content_sha256?: string | null;
          status?: AccountImportBatchStatus;
          classification_snapshot?: unknown;
          report?: unknown;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sales_line_id?: string;
          source_type?: AccountImportSourceType;
          source_filename?: string;
          content_sha256?: string | null;
          status?: AccountImportBatchStatus;
          classification_snapshot?: unknown;
          report?: unknown;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_import_rows: {
        Row: {
          id: string;
          batch_id: string;
          sales_line_id: string;
          row_number: number;
          raw_payload: unknown;
          normalized_payload: unknown;
          fingerprint: string | null;
          match_decision: AccountImportMatchDecision;
          status: AccountImportRowStatus;
          retailer_id: number | null;
          retailer_line_account_id: string | null;
          account_contact_id: string | null;
          error: string | null;
          former_rep_code: string | null;
          raw_address_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          sales_line_id: string;
          row_number: number;
          raw_payload: unknown;
          normalized_payload?: unknown;
          fingerprint?: string | null;
          match_decision?: AccountImportMatchDecision;
          status?: AccountImportRowStatus;
          retailer_id?: number | null;
          retailer_line_account_id?: string | null;
          account_contact_id?: string | null;
          error?: string | null;
          former_rep_code?: string | null;
          raw_address_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          sales_line_id?: string;
          row_number?: number;
          raw_payload?: unknown;
          normalized_payload?: unknown;
          fingerprint?: string | null;
          match_decision?: AccountImportMatchDecision;
          status?: AccountImportRowStatus;
          retailer_id?: number | null;
          retailer_line_account_id?: string | null;
          account_contact_id?: string | null;
          error?: string | null;
          former_rep_code?: string | null;
          raw_address_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_enrichment_jobs: {
        Row: {
          id: string;
          batch_id: string;
          retailer_id: number;
          retailer_line_account_id: string | null;
          mode: AccountEnrichmentMode;
          status: AccountEnrichmentJobStatus;
          research_brief: string | null;
          evidence: unknown;
          provider: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          retailer_id: number;
          retailer_line_account_id?: string | null;
          mode: AccountEnrichmentMode;
          status?: AccountEnrichmentJobStatus;
          research_brief?: string | null;
          evidence?: unknown;
          provider?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          retailer_id?: number;
          retailer_line_account_id?: string | null;
          mode?: AccountEnrichmentMode;
          status?: AccountEnrichmentJobStatus;
          research_brief?: string | null;
          evidence?: unknown;
          provider?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lookalike_jobs: {
        Row: {
          id: string;
          sales_line_id: string;
          created_by: string;
          seed_retailer_ids: number[];
          status: LookalikeJobStatus;
          trait_brief: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sales_line_id: string;
          created_by: string;
          seed_retailer_ids: number[];
          status?: LookalikeJobStatus;
          trait_brief?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sales_line_id?: string;
          created_by?: string;
          seed_retailer_ids?: number[];
          status?: LookalikeJobStatus;
          trait_brief?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lookalike_candidates: {
        Row: {
          id: string;
          job_id: string;
          name: string;
          city: string | null;
          state: string | null;
          website: string | null;
          evidence: string | null;
          match_decision: AccountImportMatchDecision | null;
          status: LookalikeCandidateStatus;
          retailer_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          name: string;
          city?: string | null;
          state?: string | null;
          website?: string | null;
          evidence?: string | null;
          match_decision?: AccountImportMatchDecision | null;
          status?: LookalikeCandidateStatus;
          retailer_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          name?: string;
          city?: string | null;
          state?: string | null;
          website?: string | null;
          evidence?: string | null;
          match_decision?: AccountImportMatchDecision | null;
          status?: LookalikeCandidateStatus;
          retailer_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      retailer_line_targets: {
        Row: {
          id: string;
          retailer_id: number;
          sales_line_id: string;
          interest: string | null;
          fit_notes: string | null;
          suggested_geo: string | null;
          status: RetailerLineTargetStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          retailer_id: number;
          sales_line_id: string;
          interest?: string | null;
          fit_notes?: string | null;
          suggested_geo?: string | null;
          status?: RetailerLineTargetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          retailer_id?: number;
          sales_line_id?: string;
          interest?: string | null;
          fit_notes?: string | null;
          suggested_geo?: string | null;
          status?: RetailerLineTargetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      migration_review_queue: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          reason: string;
          payload: Record<string, unknown>;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          reason: string;
          payload?: Record<string, unknown>;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          reason?: string;
          payload?: Record<string, unknown>;
          resolved_at?: string | null;
          created_at?: string;
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
          operational_territory_id: string | null;
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
          import_protected: boolean;
          apparel_capability: string | null;
          existing_ogr: string | null;
          qualification_status: string | null;
          next_action: string | null;
          source_note: string | null;
          postal_code: string | null;
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
          operational_territory_id?: string | null;
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
          import_protected?: boolean;
          apparel_capability?: string | null;
          existing_ogr?: string | null;
          qualification_status?: string | null;
          next_action?: string | null;
          source_note?: string | null;
          postal_code?: string | null;
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
          operational_territory_id?: string | null;
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
          import_protected?: boolean;
          apparel_capability?: string | null;
          existing_ogr?: string | null;
          qualification_status?: string | null;
          next_action?: string | null;
          source_note?: string | null;
          postal_code?: string | null;
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
          {
            foreignKeyName: 'prospects_operational_territory_id_fkey';
            columns: ['operational_territory_id'];
            isOneToOne: false;
            referencedRelation: 'operational_territories';
            referencedColumns: ['territory_id'];
          },
        ];
      };
      prospect_updates: {
        Row: {
          id: string;
          prospect_id: number;
          status: string | null;
          note: string | null;
          retailer_line_account_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: number;
          status?: string | null;
          note?: string | null;
          retailer_line_account_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: number;
          status?: string | null;
          note?: string | null;
          retailer_line_account_id?: string | null;
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
          order_value_original_amount: number | null;
          order_value_original_currency: string | null;
          order_value_exchange_rate: number | null;
          order_value_exchange_rate_date: string | null;
          order_value_converted_amount: number | null;
          order_value_converted_currency: string | null;
          order_value_conversion_source: string | null;
          retailer_line_account_id: string | null;
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
          order_value_original_amount?: number | null;
          order_value_original_currency?: string | null;
          order_value_exchange_rate?: number | null;
          order_value_exchange_rate_date?: string | null;
          order_value_converted_amount?: number | null;
          order_value_converted_currency?: string | null;
          order_value_conversion_source?: string | null;
          retailer_line_account_id?: string | null;
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
          order_value_original_amount?: number | null;
          order_value_original_currency?: string | null;
          order_value_exchange_rate?: number | null;
          order_value_exchange_rate_date?: string | null;
          order_value_converted_amount?: number | null;
          order_value_converted_currency?: string | null;
          order_value_conversion_source?: string | null;
          retailer_line_account_id?: string | null;
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
          original_amount: number | null;
          original_currency: string | null;
          exchange_rate: number | null;
          exchange_rate_date: string | null;
          converted_amount: number | null;
          converted_currency: string | null;
          conversion_source: string | null;
          retailer_line_account_id: string | null;
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
          original_amount?: number | null;
          original_currency?: string | null;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          converted_amount?: number | null;
          converted_currency?: string | null;
          conversion_source?: string | null;
          retailer_line_account_id?: string | null;
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
          original_amount?: number | null;
          original_currency?: string | null;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          converted_amount?: number | null;
          converted_currency?: string | null;
          conversion_source?: string | null;
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: number;
          last_order_date?: string | null;
          next_suggested_contact_date?: string | null;
          seasonal_cadence_tags?: string[];
          ai_reorder_notes?: string | null;
          retailer_line_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: number;
          last_order_date?: string | null;
          next_suggested_contact_date?: string | null;
          seasonal_cadence_tags?: string[];
          ai_reorder_notes?: string | null;
          retailer_line_account_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      outreach_goal_settings: {
        Row: {
          id: string;
          sales_line_id: string;
          monthly_target: number;
          planning_conversion_rate: number;
          min_attributed_conversions: number;
          lookback_days: number;
          last_touch_window_days: number;
          smoothing_alpha: number;
          measured_rate_floor: number;
          measured_rate_cap: number;
          pace_floor: number;
          pace_cap: number;
          business_timezone: string;
          selling_day_mode: SellingDayMode;
          lead_rules: unknown | null;
          lead_rules_source: string | null;
          lead_rules_meta: unknown | null;
          lead_rules_computed_at: string | null;
          adaptive_weights_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          sales_line_id: string;
          monthly_target?: number;
          planning_conversion_rate?: number;
          min_attributed_conversions?: number;
          lookback_days?: number;
          last_touch_window_days?: number;
          smoothing_alpha?: number;
          measured_rate_floor?: number;
          measured_rate_cap?: number;
          pace_floor?: number;
          pace_cap?: number;
          business_timezone?: string;
          selling_day_mode?: SellingDayMode;
          lead_rules?: unknown | null;
          lead_rules_source?: string | null;
          lead_rules_meta?: unknown | null;
          lead_rules_computed_at?: string | null;
          adaptive_weights_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          sales_line_id?: string;
          monthly_target?: number;
          planning_conversion_rate?: number;
          min_attributed_conversions?: number;
          lookback_days?: number;
          last_touch_window_days?: number;
          smoothing_alpha?: number;
          measured_rate_floor?: number;
          measured_rate_cap?: number;
          pace_floor?: number;
          pace_cap?: number;
          business_timezone?: string;
          selling_day_mode?: SellingDayMode;
          lead_rules?: unknown | null;
          lead_rules_source?: string | null;
          lead_rules_meta?: unknown | null;
          lead_rules_computed_at?: string | null;
          adaptive_weights_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      outreach_automation_runs: {
        Row: {
          id: string;
          run_date: string;
          kind: 'nightly_prep' | 'manual_regional_prep';
          status: 'running' | 'succeeded' | 'partial' | 'empty_pool' | 'failed';
          trigger: 'cron' | 'manual';
          capacity: number;
          pending_before: number;
          net_capacity: number;
          selected_count: number;
          produced_count: number;
          skipped_count: number;
          failed_count: number;
          shortfall: number;
          channel_allocation: unknown;
          error: string | null;
          target_errors: unknown;
          reason: string | null;
          operational_territory_id: string | null;
          store_territory_code: string | null;
          crm_region: string | null;
          prep_city: string | null;
          started_at: string;
          finished_at: string | null;
          triggered_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          run_date: string;
          kind?: 'nightly_prep' | 'manual_regional_prep';
          status: 'running' | 'succeeded' | 'partial' | 'empty_pool' | 'failed';
          trigger: 'cron' | 'manual';
          capacity?: number;
          pending_before?: number;
          net_capacity?: number;
          selected_count?: number;
          produced_count?: number;
          skipped_count?: number;
          failed_count?: number;
          shortfall?: number;
          channel_allocation?: unknown;
          error?: string | null;
          target_errors?: unknown;
          reason?: string | null;
          operational_territory_id?: string | null;
          store_territory_code?: string | null;
          crm_region?: string | null;
          prep_city?: string | null;
          started_at?: string;
          finished_at?: string | null;
          triggered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          run_date?: string;
          kind?: 'nightly_prep' | 'manual_regional_prep';
          status?: 'running' | 'succeeded' | 'partial' | 'empty_pool' | 'failed';
          trigger?: 'cron' | 'manual';
          capacity?: number;
          pending_before?: number;
          net_capacity?: number;
          selected_count?: number;
          produced_count?: number;
          skipped_count?: number;
          failed_count?: number;
          shortfall?: number;
          channel_allocation?: unknown;
          error?: string | null;
          target_errors?: unknown;
          reason?: string | null;
          operational_territory_id?: string | null;
          store_territory_code?: string | null;
          crm_region?: string | null;
          prep_city?: string | null;
          started_at?: string;
          finished_at?: string | null;
          triggered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outreach_follow_up_snoozes: {
        Row: {
          prospect_id: number;
          snoozed_until: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          prospect_id: number;
          snoozed_until: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          prospect_id?: number;
          snoozed_until?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'outreach_follow_up_snoozes_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: true;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      account_conversion_attribution: {
        Row: {
          id: string;
          prospect_id: number;
          retailer_line_account_id: string | null;
          converted_at: string;
          converted_by: string | null;
          conversion_source: ConversionSource;
          attribution_model: AttributionModel;
          attributed_system_message_id: string | null;
          contributing_system_message_ids: string[];
          catalog_item_id: string | null;
          message_origin: string | null;
          primary_channel: string | null;
          priority: string | null;
          fit_score: number | null;
          product_fit: string | null;
          channel_match: boolean | null;
          lead_state: 'cold' | 'warm' | 'hot' | null;
          lead_score: number | null;
          rules_version: string | null;
          snapshot: unknown;
          attributed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: number;
          retailer_line_account_id?: string | null;
          converted_at: string;
          converted_by?: string | null;
          conversion_source: ConversionSource;
          attribution_model: AttributionModel;
          attributed_system_message_id?: string | null;
          contributing_system_message_ids?: string[];
          catalog_item_id?: string | null;
          message_origin?: string | null;
          primary_channel?: string | null;
          priority?: string | null;
          fit_score?: number | null;
          product_fit?: string | null;
          channel_match?: boolean | null;
          lead_state?: 'cold' | 'warm' | 'hot' | null;
          lead_score?: number | null;
          rules_version?: string | null;
          snapshot?: unknown;
          attributed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: number;
          retailer_line_account_id?: string | null;
          converted_at?: string;
          converted_by?: string | null;
          conversion_source?: ConversionSource;
          attribution_model?: AttributionModel;
          attributed_system_message_id?: string | null;
          contributing_system_message_ids?: string[];
          catalog_item_id?: string | null;
          message_origin?: string | null;
          primary_channel?: string | null;
          priority?: string | null;
          fit_score?: number | null;
          product_fit?: string | null;
          channel_match?: boolean | null;
          lead_state?: 'cold' | 'warm' | 'hot' | null;
          lead_score?: number | null;
          rules_version?: string | null;
          snapshot?: unknown;
          attributed_at?: string;
          created_at?: string;
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
          retailer_line_account_id: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id?: string | null;
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
          avatar_path: string | null;
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
          avatar_path?: string | null;
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
          avatar_path?: string | null;
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
          retailer_line_account_id: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id: string | null;
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
          retailer_line_account_id?: string | null;
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
          retailer_line_account_id?: string | null;
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
          intro_text: string | null;
          closing_text: string | null;
          prospect_id: number | null;
          retailer_line_account_id: string | null;
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
          intro_text?: string | null;
          closing_text?: string | null;
          prospect_id?: number | null;
          retailer_line_account_id?: string | null;
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
          intro_text?: string | null;
          closing_text?: string | null;
          prospect_id?: number | null;
          retailer_line_account_id?: string | null;
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
      resend_unmatched_events: {
        Row: {
          id: string;
          resend_email_id: string;
          resend_event_id: string;
          event_type: string;
          occurred_at: string;
          payload: unknown;
          failure_reason: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          resend_email_id: string;
          resend_event_id: string;
          event_type: string;
          occurred_at: string;
          payload?: unknown;
          failure_reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          resend_email_id?: string;
          resend_event_id?: string;
          event_type?: string;
          occurred_at?: string;
          payload?: unknown;
          failure_reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
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
      account_research_runs: {
        Row: {
          id: string;
          retailer_id: number;
          status: AccountResearchRunStatus;
          trigger: AccountResearchTrigger;
          requested_scope: AccountResearchRequestedScope;
          identity_confidence: AccountResearchIdentityConfidence;
          identity_review_status: AccountResearchIdentityReviewStatus;
          identity_reviewed_by: string | null;
          identity_reviewed_at: string | null;
          identity_resolution: string | null;
          resolved_website: string | null;
          research_brief: string | null;
          provider: string | null;
          provider_metadata: Record<string, unknown>;
          error: string | null;
          requested_by: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          supersedes_run_id: string | null;
        };
        Insert: {
          id?: string;
          retailer_id: number;
          status?: AccountResearchRunStatus;
          trigger?: AccountResearchTrigger;
          requested_scope: AccountResearchRequestedScope;
          identity_confidence?: AccountResearchIdentityConfidence;
          identity_review_status?: AccountResearchIdentityReviewStatus;
          identity_reviewed_by?: string | null;
          identity_reviewed_at?: string | null;
          identity_resolution?: string | null;
          resolved_website?: string | null;
          research_brief?: string | null;
          provider?: string | null;
          provider_metadata?: Record<string, unknown>;
          error?: string | null;
          requested_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          supersedes_run_id?: string | null;
        };
        Update: {
          id?: string;
          retailer_id?: number;
          status?: AccountResearchRunStatus;
          trigger?: AccountResearchTrigger;
          requested_scope?: AccountResearchRequestedScope;
          identity_confidence?: AccountResearchIdentityConfidence;
          identity_review_status?: AccountResearchIdentityReviewStatus;
          identity_reviewed_by?: string | null;
          identity_reviewed_at?: string | null;
          identity_resolution?: string | null;
          resolved_website?: string | null;
          research_brief?: string | null;
          provider?: string | null;
          provider_metadata?: Record<string, unknown>;
          error?: string | null;
          requested_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          supersedes_run_id?: string | null;
        };
        Relationships: [];
      };
      account_research_source_searches: {
        Row: {
          id: string;
          research_run_id: string;
          source_type: AccountResearchSourceType;
          search_mode: AccountResearchSearchMode;
          status: AccountResearchSourceSearchStatus;
          resolved_public_url: string | null;
          query_text: string | null;
          provider: string | null;
          result_count: number;
          error: string | null;
          requested_by: string | null;
          provider_metadata: Record<string, unknown>;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_run_id: string;
          source_type: AccountResearchSourceType;
          search_mode: AccountResearchSearchMode;
          status?: AccountResearchSourceSearchStatus;
          resolved_public_url?: string | null;
          query_text?: string | null;
          provider?: string | null;
          result_count?: number;
          error?: string | null;
          requested_by?: string | null;
          provider_metadata?: Record<string, unknown>;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          research_run_id?: string;
          source_type?: AccountResearchSourceType;
          search_mode?: AccountResearchSearchMode;
          status?: AccountResearchSourceSearchStatus;
          resolved_public_url?: string | null;
          query_text?: string | null;
          provider?: string | null;
          result_count?: number;
          error?: string | null;
          requested_by?: string | null;
          provider_metadata?: Record<string, unknown>;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      account_research_source_locks: {
        Row: {
          retailer_id: number;
          source_type: AccountResearchSourceType;
          locked_url: string;
          locked_url_normalized: string;
          locked_by: string | null;
          locked_at: string;
        };
        Insert: {
          retailer_id: number;
          source_type: AccountResearchSourceType;
          locked_url: string;
          locked_url_normalized: string;
          locked_by?: string | null;
          locked_at?: string;
        };
        Update: {
          retailer_id?: number;
          source_type?: AccountResearchSourceType;
          locked_url?: string;
          locked_url_normalized?: string;
          locked_by?: string | null;
          locked_at?: string;
        };
        Relationships: [];
      };
      account_research_citations: {
        Row: {
          id: string;
          source_search_id: string;
          research_run_id: string;
          retailer_id: number;
          source_url: string;
          source_url_normalized: string;
          title: string | null;
          platform: AccountResearchCitationPlatform;
          published_at: string | null;
          observed_at: string;
          excerpt: string | null;
          confidence: AccountResearchConfidence;
          identity_confidence: AccountResearchIdentityConfidence;
          acceptance_status: AccountResearchAcceptanceStatus;
          acceptance_basis: AccountResearchAcceptanceBasis | null;
          accepted_or_rejected_by: string | null;
          accepted_or_rejected_at: string | null;
          provider_metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_search_id: string;
          research_run_id?: string;
          retailer_id?: number;
          source_url: string;
          source_url_normalized: string;
          title?: string | null;
          platform: AccountResearchCitationPlatform;
          published_at?: string | null;
          observed_at: string;
          excerpt?: string | null;
          confidence: AccountResearchConfidence;
          identity_confidence: AccountResearchIdentityConfidence;
          acceptance_status?: AccountResearchAcceptanceStatus;
          acceptance_basis?: AccountResearchAcceptanceBasis | null;
          accepted_or_rejected_by?: string | null;
          accepted_or_rejected_at?: string | null;
          provider_metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_search_id?: string;
          research_run_id?: string;
          retailer_id?: number;
          source_url?: string;
          source_url_normalized?: string;
          title?: string | null;
          platform?: AccountResearchCitationPlatform;
          published_at?: string | null;
          observed_at?: string;
          excerpt?: string | null;
          confidence?: AccountResearchConfidence;
          identity_confidence?: AccountResearchIdentityConfidence;
          acceptance_status?: AccountResearchAcceptanceStatus;
          acceptance_basis?: AccountResearchAcceptanceBasis | null;
          accepted_or_rejected_by?: string | null;
          accepted_or_rejected_at?: string | null;
          provider_metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
      account_research_profile_suggestions: {
        Row: {
          id: string;
          research_run_id: string;
          retailer_id: number;
          field_path: string;
          suggested_value: unknown;
          rationale: string | null;
          confidence: AccountResearchConfidence;
          status: AccountResearchSuggestionStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          baseline_value: unknown | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_run_id: string;
          retailer_id?: number;
          field_path: string;
          suggested_value: unknown;
          rationale?: string | null;
          confidence: AccountResearchConfidence;
          status?: AccountResearchSuggestionStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          baseline_value?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          research_run_id?: string;
          retailer_id?: number;
          field_path?: string;
          suggested_value?: unknown;
          rationale?: string | null;
          confidence?: AccountResearchConfidence;
          status?: AccountResearchSuggestionStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          baseline_value?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      account_research_suggestion_citations: {
        Row: {
          suggestion_id: string;
          citation_id: string;
          research_run_id: string;
          created_at: string;
        };
        Insert: {
          suggestion_id: string;
          citation_id: string;
          research_run_id?: string;
          created_at?: string;
        };
        Update: {
          suggestion_id?: string;
          citation_id?: string;
          research_run_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      account_product_match_runs: {
        Row: {
          id: string;
          retailer_id: number;
          sales_line_id: string;
          research_run_id: string;
          status: AccountProductMatchRunStatus;
          empty_reason: AccountProductMatchEmptyReason | null;
          requested_by: string | null;
          provider_metadata: Record<string, unknown>;
          error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          retailer_id: number;
          sales_line_id: string;
          research_run_id: string;
          status?: AccountProductMatchRunStatus;
          empty_reason?: AccountProductMatchEmptyReason | null;
          requested_by?: string | null;
          provider_metadata?: Record<string, unknown>;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          retailer_id?: number;
          sales_line_id?: string;
          research_run_id?: string;
          status?: AccountProductMatchRunStatus;
          empty_reason?: AccountProductMatchEmptyReason | null;
          requested_by?: string | null;
          provider_metadata?: Record<string, unknown>;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      account_product_match_items: {
        Row: {
          id: string;
          match_run_id: string;
          catalog_item_id: string;
          rank: number;
          rationale: string;
          product_fit: AccountProductMatchProductFit;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_run_id: string;
          catalog_item_id: string;
          rank: number;
          rationale: string;
          product_fit: AccountProductMatchProductFit;
          created_at?: string;
        };
        Update: {
          id?: string;
          match_run_id?: string;
          catalog_item_id?: string;
          rank?: number;
          rationale?: string;
          product_fit?: AccountProductMatchProductFit;
          created_at?: string;
        };
        Relationships: [];
      };
      account_product_match_item_citations: {
        Row: {
          match_item_id: string;
          citation_id: string;
          research_run_id: string;
          created_at: string;
        };
        Insert: {
          match_item_id: string;
          citation_id: string;
          research_run_id?: string;
          created_at?: string;
        };
        Update: {
          match_item_id?: string;
          citation_id?: string;
          research_run_id?: string;
          created_at?: string;
        };
        Relationships: [];
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
      upsert_operational_territory_review: {
        Args: {
          p_entity_id: string;
          p_reason: string;
          p_payload: Record<string, unknown>;
        };
        Returns: string;
      };
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
      get_public_living_in_sunshine_products: {
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
      get_public_living_in_sunshine_product_by_slug: {
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
      get_public_line_cards: {
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
      commit_account_import_row: {
        Args: { p_import_row_id: string; p_payload: unknown };
        Returns: unknown;
      };
      start_account_research_run: {
        Args: {
          p_retailer_id: number;
          p_scope: string;
          p_trigger: string;
          p_supersedes_run_id?: string | null;
        };
        Returns: unknown;
      };
      claim_account_research_source_search: {
        Args: { p_run_id: string };
        Returns: unknown;
      };
      lock_account_research_source: {
        Args: { p_retailer_id: number; p_source_type: string; p_url: string };
        Returns: unknown;
      };
      unlock_account_research_source: {
        Args: { p_retailer_id: number; p_source_type: string };
        Returns: unknown;
      };
      complete_account_research_source_search: {
        Args: {
          p_source_search_id: string;
          p_status: string;
          p_query_text?: string | null;
          p_resolved_public_url?: string | null;
          p_error?: string | null;
          p_provider?: string | null;
          p_provider_metadata?: Record<string, unknown>;
          p_citations?: unknown;
          p_research_brief?: string | null;
        };
        Returns: unknown;
      };
      persist_account_research_profile_suggestions: {
        Args: {
          p_run_id: string;
          p_force_regenerate?: boolean;
          p_suggestions?: unknown;
        };
        Returns: unknown;
      };
      apply_account_research_profile_suggestion: {
        Args: {
          p_suggestion_id: string;
          p_confirm_verified_overwrite?: boolean;
        };
        Returns: unknown;
      };
      reject_account_research_profile_suggestion: {
        Args: { p_suggestion_id: string };
        Returns: unknown;
      };
      persist_account_product_match_run: {
        Args: {
          p_retailer_id: number;
          p_sales_line_id: string;
          p_research_run_id: string;
          p_status: string;
          p_empty_reason?: string | null;
          p_items?: unknown;
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
export type OutreachGoalSettingsRow = Database['public']['Tables']['outreach_goal_settings']['Row'];
export type OutreachGoalSettingsUpdate =
  Database['public']['Tables']['outreach_goal_settings']['Update'];
export type AccountConversionAttributionRow =
  Database['public']['Tables']['account_conversion_attribution']['Row'];
export type AccountConversionAttributionInsert =
  Database['public']['Tables']['account_conversion_attribution']['Insert'];
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
export type ResendUnmatchedEvent = Database['public']['Tables']['resend_unmatched_events']['Row'];
export type ResendUnmatchedEventInsert =
  Database['public']['Tables']['resend_unmatched_events']['Insert'];
export type ProductOutreachEngagementSeen =
  Database['public']['Tables']['product_outreach_engagement_seen']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Principal = Database['public']['Tables']['principals']['Row'];
export type SalesLineTerritory = Database['public']['Tables']['sales_line_territories']['Row'];
export type RetailerLineAccount = Database['public']['Tables']['retailer_line_accounts']['Row'];
export type RetailerLineContact = Database['public']['Tables']['retailer_line_contacts']['Row'];
export type RetailerLineTarget = Database['public']['Tables']['retailer_line_targets']['Row'];
export type RetailerFieldChange = Database['public']['Tables']['retailer_field_changes']['Row'];
export type AccountImportBatch = Database['public']['Tables']['account_import_batches']['Row'];
export type AccountImportRow = Database['public']['Tables']['account_import_rows']['Row'];
export type AccountEnrichmentJob = Database['public']['Tables']['account_enrichment_jobs']['Row'];
export type AccountResearchRun = Database['public']['Tables']['account_research_runs']['Row'];
export type AccountResearchSourceSearch =
  Database['public']['Tables']['account_research_source_searches']['Row'];
export type AccountResearchSourceLock =
  Database['public']['Tables']['account_research_source_locks']['Row'];
export type AccountResearchCitation =
  Database['public']['Tables']['account_research_citations']['Row'];
export type AccountResearchProfileSuggestion =
  Database['public']['Tables']['account_research_profile_suggestions']['Row'];
export type AccountResearchSuggestionCitation =
  Database['public']['Tables']['account_research_suggestion_citations']['Row'];
export type AccountProductMatchRun =
  Database['public']['Tables']['account_product_match_runs']['Row'];
export type AccountProductMatchItem =
  Database['public']['Tables']['account_product_match_items']['Row'];
export type AccountProductMatchItemCitation =
  Database['public']['Tables']['account_product_match_item_citations']['Row'];
export type MigrationReviewQueueRow = Database['public']['Tables']['migration_review_queue']['Row'];
export type OperationalTerritoryReviewQueueRow =
  Database['public']['Tables']['operational_territory_review_queue']['Row'];

export type OperationalTerritoryReviewResolution =
  'assigned' | 'left_unassigned' | 'no_longer_applicable' | 'legacy_resolved';
