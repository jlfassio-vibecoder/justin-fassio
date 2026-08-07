import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

/** Test helper — fills planning + taxonomy defaults. */
export function prospectFixture(
  overrides: Partial<Prospect> & Pick<Prospect, 'id' | 'name'>,
): Prospect {
  return {
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    region: 'Okanagan',
    city: 'Kelowna',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    category: 'hardware_farm_rural',
    territoryId: BC_PROSPECT_TERRITORY.territoryId,
    territoryCode: BC_PROSPECT_TERRITORY.territoryCode,
    territoryName: BC_PROSPECT_TERRITORY.territoryName,
    ...overrides,
  };
}
