import { LOOKALIKE_PROSPECT_DEFAULTS } from '@/lib/lookalike/classification';
import { lookalikeSeedNote, lookalikeSourceNote } from '@/lib/lookalike/notes';
import {
  regionLabelFromStateCode,
  territoryCodeFromImportState,
} from '@/lib/accountImport/territory';
import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import type { Database } from '@/types/database';

type ProspectInsert = Database['public']['Tables']['prospects']['Insert'];
type RlaInsert = Database['public']['Tables']['retailer_line_accounts']['Insert'];

export type LookalikeInsertFields = {
  prospect: Omit<ProspectInsert, 'id'>;
  rla: Omit<RlaInsert, 'retailer_id' | 'sales_line_id'>;
};

export function buildLookalikeInsertFields(input: {
  jobId: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  territoryId: string;
  salesLineTerritoryId: string | null;
  category?: PrimaryRetailChannel;
}): LookalikeInsertFields {
  const defaults = LOOKALIKE_PROSPECT_DEFAULTS;
  const stateCode = territoryCodeFromImportState(input.state);
  const city = input.city?.trim() || '';
  const seed = lookalikeSeedNote(input.jobId);
  const sourceNote = lookalikeSourceNote(input.jobId);
  return {
    prospect: {
      name: input.name.trim(),
      category: input.category ?? 'other',
      region: regionLabelFromStateCode(stateCode) ?? city,
      city,
      address: '',
      phone: '',
      fit: '',
      account_status: defaults.accountStatus,
      converted_at: defaults.convertedAt,
      initial_order_date: defaults.initialOrderDate,
      import_protected: defaults.importProtected,
      existing_ogr: defaults.existingOgr,
      qualification_status: defaults.qualificationStatus,
      website: input.website?.trim() || null,
      source_note: sourceNote,
      notes: seed,
      territory_id: input.territoryId,
      primary_district: null,
      subterritory: null,
    },
    rla: {
      relationship_status: defaults.relationshipStatus,
      line_account_markers: [...defaults.markers],
      existing_ogr: defaults.existingOgr,
      qualification_status: defaults.qualificationStatus,
      source_note: sourceNote,
      notes: seed,
      sales_line_territory_id: input.salesLineTerritoryId,
      converted_at: defaults.convertedAt,
      initial_order_date: defaults.initialOrderDate,
    },
  };
}
