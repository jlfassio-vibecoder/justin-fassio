import { describe, expect, it } from 'vitest';
import { blockingConflicts, familyKeyFromName, parseWyldPriceList } from '@/lib/wyldCatalogImport';

const SAMPLE = `Hard Coolers - Made in USA,,Color,UPC,SKU,Wholesale,Retail
,25Q Cooler - Made in USA,White,810031806058,USHC25-W, $ 155.00 , $ 230.00
Soft Coolers,,,,,,
,,Wyld Daze 30 Can ,810031805891,WDZ-30, $ 154.99 , $ 249.99
CUSTOM UV COLOR PRINTING ON SOFT COOLERS ,,,,, $ 30.00 ,
Drinkware - Minimum Order 6 Units Per Color/Size,,,,,,
,Mag Flask 24 Oz,Overland,810031808939,24-MAG-OL, $ 17.00 , $ 33.99
,Mag Flask 34 Oz,Overland,810031808939,34-MAG-OL, $ 19.50 , $ 38.99
,Cooler Aerator,,851514008477,AEK-17, $ 12.50 , $ 24.99
,Wyld Cup Straw Lid 24oz & 30oz WT,,810031807222,WSL-24-30, $ 5.00 , $ 9.99
,Cup Customization Engraved/Color,Per Cup,,,, $ 5.00
`;

describe('wyld catalog import', () => {
  it('builds stable family keys and keeps manufacturer SKUs as rows', () => {
    expect(familyKeyFromName('Mag Flask 34 Oz')).toBe('mag-flask-34-oz');
    const parsed = parseWyldPriceList(SAMPLE);
    const skus = parsed.rows.map((row) => row.sku);
    expect(skus).toEqual(['USHC25-W', 'WDZ-30', '24-MAG-OL', '34-MAG-OL', 'AEK-17', 'WSL-24-30']);
    expect(parsed.rows.find((row) => row.sku === 'USHC25-W')?.category).toBe('Hard Coolers');
    expect(parsed.rows.find((row) => row.sku === 'USHC25-W')?.madeInUsa).toBe(true);
    expect(parsed.rows.find((row) => row.sku === 'AEK-17')?.category).toBe('Accessories');
    expect(parsed.rows.find((row) => row.sku === 'WSL-24-30')?.category).toBe('Accessories');
    expect(parsed.rows.find((row) => row.sku === 'WSL-24-30')?.familyKey).toBe(
      'wyld-cup-straw-lid-24oz-and-30oz-wt',
    );
    expect(parsed.rows.find((row) => row.sku === 'WDZ-30')?.color).toBeNull();
  });

  it('accepts the known duplicate UPC without rewriting it', () => {
    const parsed = parseWyldPriceList(SAMPLE);
    const upcConflicts = parsed.conflicts.filter((conflict) => conflict.fieldPath === 'upc');
    expect(upcConflicts).toHaveLength(2);
    expect(upcConflicts.every((conflict) => conflict.status === 'accepted_source_exception')).toBe(
      true,
    );
    expect(upcConflicts.every((conflict) => conflict.proposedValue === '810031808939')).toBe(true);
    expect(blockingConflicts(parsed.conflicts)).toHaveLength(0);
    const overland = parsed.rows.filter((row) => row.upc === '810031808939');
    expect(overland.map((row) => row.sku).sort()).toEqual(['24-MAG-OL', '34-MAG-OL']);
  });

  it('leaves an unknown duplicate UPC blocking', () => {
    const parsed = parseWyldPriceList(
      `Drinkware,,,,,,\n,Cup,Black,111,CUP-A, $ 1.00 , $ 2.00\n,Jug,Red,111,JUG-A, $ 3.00 , $ 4.00\n`,
    );
    expect(
      blockingConflicts(parsed.conflicts)
        .map((conflict) => conflict.sku)
        .sort(),
    ).toEqual(['CUP-A', 'JUG-A']);
  });
});
