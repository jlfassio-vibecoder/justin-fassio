export type AttributeGroup =
  'construction' | 'decoration' | 'dimensions' | 'packaging' | 'display' | 'origin' | 'other';

export type AttributeValueType = 'text' | 'number' | 'boolean' | 'dimension';

export type CatalogAttribute = {
  id: string;
  catalogItemId: string;
  attributeKey: string;
  label: string;
  value: string;
  valueType: AttributeValueType;
  unit: string;
  attributeGroup: AttributeGroup;
  displayOrder: number;
};

export type AttributeRegistryEntry = {
  attributeKey: string;
  label: string;
  valueType: AttributeValueType;
  unit?: string;
  attributeGroup: AttributeGroup;
};

/** Shared attribute keys from ogr-2026-catalog-description.md (not tee-only). */
export const ATTRIBUTE_REGISTRY: AttributeRegistryEntry[] = [
  {
    attributeKey: 'material',
    label: 'Material',
    valueType: 'text',
    attributeGroup: 'construction',
  },
  {
    attributeKey: 'sleeve_type',
    label: 'Sleeve type',
    valueType: 'text',
    attributeGroup: 'construction',
  },
  {
    attributeKey: 'upf_rating',
    label: 'UPF rating',
    valueType: 'text',
    attributeGroup: 'construction',
  },
  { attributeKey: 'fit', label: 'Fit', valueType: 'text', attributeGroup: 'construction' },
  {
    attributeKey: 'closure_type',
    label: 'Closure type',
    valueType: 'text',
    attributeGroup: 'construction',
  },
  {
    attributeKey: 'mesh_type',
    label: 'Mesh type',
    valueType: 'text',
    attributeGroup: 'construction',
  },
  {
    attributeKey: 'front_print',
    label: 'Front print',
    valueType: 'boolean',
    attributeGroup: 'decoration',
  },
  {
    attributeKey: 'back_print',
    label: 'Back print',
    valueType: 'boolean',
    attributeGroup: 'decoration',
  },
  {
    attributeKey: 'left_chest_print',
    label: 'Left-chest print',
    valueType: 'boolean',
    attributeGroup: 'decoration',
  },
  {
    attributeKey: 'right_sleeve_print',
    label: 'Right-sleeve print',
    valueType: 'boolean',
    attributeGroup: 'decoration',
  },
  {
    attributeKey: 'width',
    label: 'Width',
    valueType: 'dimension',
    unit: 'in',
    attributeGroup: 'dimensions',
  },
  {
    attributeKey: 'height',
    label: 'Height',
    valueType: 'dimension',
    unit: 'in',
    attributeGroup: 'dimensions',
  },
  {
    attributeKey: 'diameter',
    label: 'Diameter',
    valueType: 'dimension',
    unit: 'in',
    attributeGroup: 'dimensions',
  },
  {
    attributeKey: 'package_contents',
    label: 'Package contents',
    valueType: 'text',
    attributeGroup: 'packaging',
  },
  {
    attributeKey: 'shipping_weight',
    label: 'Shipping weight',
    valueType: 'number',
    unit: 'lb',
    attributeGroup: 'packaging',
  },
  {
    attributeKey: 'display_footprint',
    label: 'Display footprint',
    valueType: 'text',
    attributeGroup: 'display',
  },
  {
    attributeKey: 'display_height',
    label: 'Display height',
    valueType: 'dimension',
    unit: 'in',
    attributeGroup: 'display',
  },
  {
    attributeKey: 'assembly_required',
    label: 'Assembly required',
    valueType: 'boolean',
    attributeGroup: 'display',
  },
  {
    attributeKey: 'heavy_gauge_steel',
    label: 'Heavy-gauge steel',
    valueType: 'boolean',
    attributeGroup: 'construction',
  },
  {
    attributeKey: 'magnet_shape',
    label: 'Magnet shape',
    valueType: 'text',
    attributeGroup: 'other',
  },
  {
    attributeKey: 'made_in_usa_claim',
    label: 'Made-in-USA claim',
    valueType: 'boolean',
    attributeGroup: 'origin',
  },
];

export function mapAttributeRow(row: {
  id: string;
  catalog_item_id: string;
  attribute_key: string;
  label: string;
  value: string | null;
  value_type: string;
  unit: string | null;
  attribute_group: string;
  display_order: number;
}): CatalogAttribute {
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    attributeKey: row.attribute_key,
    label: row.label,
    value: row.value ?? '',
    valueType: row.value_type as AttributeValueType,
    unit: row.unit ?? '',
    attributeGroup: row.attribute_group as AttributeGroup,
    displayOrder: row.display_order,
  };
}
