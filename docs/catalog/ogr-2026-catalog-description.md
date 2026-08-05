## Existing product fields

The current table contains:

- Catalog page
- SKU
- Product name
- Category
- Color
- Tagline
- Wholesale USD
- Landed CAD
- MSRP CAD
- Retailer margin percentage

Example:

```json
{
  "catalogPage": 4,
  "sku": "OG2147",
  "productName": "Made in the USA",
  "category": "Short Sleeve Tees",
  "color": "Stone Blue",
  "tagline": "Established Back In The Day",
  "wholesaleUsd": 13.0,
  "landedCad": 21.16,
  "msrpCad": 39.99,
  "marginPercent": 47.1
}
```

This existing structure is incomplete because wholesale pricing can change by size or variant.

## Normalized data model

### Product

```ts
type Product = {
  id: string;
  brand: 'Old Guys Rule';
  catalogYear: 2026;

  sku: string;
  normalizedSku: string;
  catalogPage: number | null;

  productName: string;
  tagline: string | null;
  description: string | null;

  department: 'Apparel' | 'Headwear' | 'Accessories' | 'Drinkware' | 'Displays' | 'Metal Signs';

  category: string;
  productType: string;
  collection: string | null;

  primaryColor: string | null;
  secondaryColor: string | null;
  colorDescription: string | null;

  status: 'active' | 'inactive' | 'discontinued' | 'unknown';
  isNew: boolean;
  isBestSeller: boolean;
  isNameDropEligible: boolean;

  unitOfMeasure: 'each' | 'pack' | 'set' | 'display';

  minimumQuantity: number | null;
  orderMultiple: number | null;
  packQuantity: number | null;

  baseWholesaleUsd: number | null;

  madeInUsaClaim: boolean | null;
  countryOfBlankManufacture: string | null;
  countryOfDecoration: string | null;
  countryOfOrigin: string | null;

  primaryImageUrl: string | null;
  sourceImageUrl: string | null;

  catalogVerified: boolean;
  verificationNotes: string | null;

  createdAt: string;
  updatedAt: string;
};
```

### Product variant

Use variants for sizes, colors, garment forms and package configurations.

```ts
type ProductVariant = {
  id: string;
  productId: string;

  variantSku: string | null;
  size: string | null;
  sizeGroup: string | null;
  color: string | null;
  style: string | null;

  wholesaleUsd: number;
  packQuantity: number;
  unitOfMeasure: 'each' | 'pack' | 'set';

  unitEquivalentWholesaleUsd: number;
  available: boolean;
  notes: string | null;
  displayOrder: number;
};
```

Example for OG2147:

```json
{
  "sku": "OG2147",
  "productName": "Made in the USA",
  "category": "Short Sleeve Tees",
  "productType": "Short Sleeve T-Shirt",
  "primaryColor": "Stone Blue",
  "tagline": "Established Back In The Day",
  "variants": [
    {
      "sizeGroup": "M-XL",
      "wholesaleUsd": 13.0,
      "packQuantity": 1
    },
    {
      "sizeGroup": "2X",
      "wholesaleUsd": 14.0,
      "packQuantity": 1
    },
    {
      "sizeGroup": "3X",
      "wholesaleUsd": 15.0,
      "packQuantity": 1
    }
  ]
}
```

### Product attributes

Different product categories require different specifications. Do not add dozens of nullable category-specific columns to the main product table.

Use a typed attribute structure:

```ts
type ProductAttribute = {
  id: string;
  productId: string;
  attributeKey: string;
  label: string;
  value: string | number | boolean | null;
  valueType: 'text' | 'number' | 'boolean' | 'dimension';
  unit: string | null;
  attributeGroup:
    'construction' | 'decoration' | 'dimensions' | 'packaging' | 'display' | 'origin' | 'other';
  displayOrder: number;
};
```

Examples include:

- Material
- Sleeve type
- UPF rating
- Fit
- Front print
- Back print
- Left-chest print
- Right-sleeve print
- Closure type
- Mesh type
- Magnet shape
- Width
- Height
- Diameter
- Package contents
- Display footprint
- Display height
- Shipping weight
- Assembly required
- Heavy-gauge steel
- Made-in-USA claim

### Pricing model

```ts
type ProductPricing = {
  productId: string;
  variantId: string | null;

  wholesaleUsd: number;
  exchangeRateUsdCad: number;

  customsValueCad: number | null;
  dutyRate: number;
  dutyCad: number;
  surtaxCad: number;
  freightCad: number;
  brokerageCad: number;
  otherImportCostsCad: number;
  importGstCad: number;

  landedCadExcludingRecoverableGst: number;
  cashCostCadIncludingGst: number;

  suggestedMsrpCad: number;
  actualMsrpCad: number;

  marginCad: number;
  marginPercent: number;

  isLandedCostOverride: boolean;
  isMsrpOverride: boolean;
  calculationVersion: string;
  calculatedAt: string;
};
```

Calculate:

```ts
marginCad = actualMsrpCad - landedCadExcludingRecoverableGst;

marginPercent = ((actualMsrpCad - landedCadExcludingRecoverableGst) / actualMsrpCad) * 100;
```

Do not include recoverable import GST as a permanent landed cost unless the CRM configuration explicitly marks it as non-recoverable.

### Field provenance

Every important field must support provenance and overwrite protection.

```ts
type FieldProvenance = {
  entityType: 'product' | 'variant' | 'attribute' | 'pricing';
  entityId: string;
  fieldName: string;

  source: 'catalog' | 'user' | 'ai' | 'import' | 'calculated' | 'unknown';

  confidence: number | null;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;

  previousValue: unknown;
  proposedValue: unknown;
  conflictStatus: 'none' | 'review_required' | 'resolved';
};
```

Value precedence must be:

1. Verified user value
2. Verified catalog value
3. Existing imported value
4. AI-generated suggestion
5. Blank

AI actions may fill blank values but must not silently overwrite verified catalog values or user edits.

## Catalog product structures

### Short-sleeve T-shirts

Catalog pricing:

- M–XL: US$13.00
- 2X: US$14.00
- 3X: US$15.00

Typical fields:

- SKU
- Product name
- Garment color
- Tagline
- Collection
- Size group
- Size-specific wholesale price
- Front or back design
- New badge
- Name-drop eligibility

### Long-sleeve UPF50 shirts

Catalog pricing:

- M–XL: US$18.50
- 2X–3X: US$19.50

Additional fields:

- UPF50
- Long sleeve
- Garment color
- Print locations
- Size-specific pricing

### Standard long-sleeve T-shirts

Catalog pricing:

- M–XL: US$17.95
- 2X: US$18.95
- 3X: US$19.95

### Tanks

Catalog pricing:

- M–XL: US$14.95
- 2X: US$15.95
- 3X: US$16.95

### Zip hoodies

Catalog pricing:

- M–XL: US$24.95
- 2X: US$25.95
- 3X: US$26.95

### Vintage trucker hats

Catalog pricing:

- US$13.50 each

Attributes:

- Twill/mesh construction
- Snapback closure
- Front color
- Mesh color
- Patch or embroidery design
- Back tagline where applicable

### Sanded/brushed cotton twill caps

Catalog pricing:

- US$12.50 each

Attributes:

- Sanded/brushed cotton twill
- Flip N’ Grip closure
- Cap color
- Back tagline
- Embroidery or patch description

### Beanies

Catalog pricing:

- US$12.00 each

Attributes:

- Knit construction
- Color
- Front design

### Flex magnets

Catalog pricing:

- US$2.95 each

Attributes:

- Shape
- Width
- Height
- Diameter
- Design
- Tagline

### Stickers

Catalog pricing:

- US$25.00 per pack of 25

Attributes:

- Sticker width
- Color variants
- Pack quantity
- Assorted or single-design pack
- Unit-equivalent wholesale price

### Ceramic mugs

Catalog pricing:

- US$8.95 each

Attributes:

- Color
- Design
- Drinkware type

### Whiskey glasses

Catalog pricing:

- US$10.00 each

Attributes:

- Design
- Packaging or box-set information when applicable

### Neoprene can coolers

Catalog pricing:

- Pack of six: US$29.94
- Unit equivalent: US$4.99 each

Attributes:

- Material
- Color
- Design
- Pack quantity

### Flat-fold can coolers

Catalog pricing:

- Two-pack: US$4.50

Attributes:

- Package colors
- Pack quantity
- Flat-fold construction

### Wall-mounted bottle opener

Catalog pricing:

- US$8.75 each

Attributes:

- Mounting type
- Color
- Design

### Floor and rotating displays

Attributes:

- Display SKU
- Display type
- Wholesale price
- Free-with-order threshold
- Shipping excluded from promotion
- Width
- Depth
- Height
- Shipping weight
- Box count
- Included signs
- Wheels included
- Assembly required

Display qualification belongs in a promotion record, not in the base product price.

### Vintage metal signs

Catalog construction:

- Made in the USA
- Heavy-gauge steel

Catalog pricing:

- 12 × 12 square: US$13.50
- 12 × 18 rectangle: US$15.50
- 14 × 14 round: US$15.50

Attributes:

- Shape
- Width
- Height
- Material
- Design
- Tagline
- Made-in-USA claim

## Catalog-wide supplier terms

Store these in a supplier or catalog-terms record rather than copying them into every product:

```ts
type SupplierTerms = {
  supplier: 'Old Guys Rule';
  catalogYear: 2026;
  minimumOrderPieces: 24;
  minimumPiecesPerDesign: 6;
  defaultShippingMethod: 'UPS Ground';
  pricesSubjectToChange: true;
  backorderPolicy: string | null;
  orderProcessingPolicy: string | null;
  claimsPolicy: string | null;
  returnsPolicy: string | null;
};
```

## Product-detail interface

Prefer a right-side drawer unless the existing architecture strongly supports a dedicated product route.

### Header

- Product image
- Product name
- SKU
- Category
- Catalog page
- Active/New/Bestseller badges
- Previous and Next product
- Edit, Save and Cancel

### Catalog information

- Name
- SKU
- Product type
- Collection
- Colors
- Tagline
- Design placement
- Product attributes
- Catalog verification state

### Variants and wholesale pricing

Use an editable table:

- Size/style
- Color
- Pack quantity
- Wholesale USD
- Unit-equivalent wholesale
- Availability
- Add/remove variant

### Canadian pricing

- Exchange rate
- Duty
- Freight
- Brokerage
- Other costs
- Landed CAD
- MSRP CAD
- Margin dollars
- Margin percentage
- Manual-override indicators

### CRM merchandising

- Lifestyle themes
- Recommended retailer channels
- Seasonality
- Sales priority
- Sample status
- Buyer feedback
- Internal notes

### Source and history

- Catalog source badge
- Verification state
- Field provenance
- Conflicting suggestions
- Audit history
- Reset-to-catalog action

## Interaction requirements

- Clicking the row opens the product.
- Clicking another row control must not trigger the drawer.
- Support Enter and Space.
- Warn before discarding unsaved changes.
- Keep Save and Cancel visible while scrolling.
- Show validation errors beside the affected field.
- Save related product, variant and attribute edits atomically.
- Use optimistic UI only if failed saves restore the previous state.
- Every calculation must be deterministic and tested.
- Every user override must be visibly identified and reversible.

## Planning response required

Return:

1. Existing architecture findings.
2. Recommended drawer/modal/route pattern.
3. Database changes.
4. Migration strategy.
5. Component hierarchy.
6. Editable-field architecture.
7. Variant-price implementation.
8. Product-attribute implementation.
9. Provenance and AI overwrite rules.
10. Exact files expected to change.
11. Implementation phases.
12. Acceptance tests.
13. Risks or questions requiring approval.

Do not parse or request the PDF. Do not invent individual SKU data. The normalized SKU records will be supplied separately as JSON or CSV.
