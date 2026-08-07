import { describe, expect, it } from 'vitest';
import { CATEGORY_MAPPING_GUIDANCE, hostnameFromUrl } from '@/lib/enrichGuidance';

describe('hostnameFromUrl', () => {
  it('parses host and strips www', () => {
    expect(hostnameFromUrl('https://www.acsportsltd.ca/')).toBe('acsportsltd.ca');
    expect(hostnameFromUrl('https://acsportsltd.ca/fishing/')).toBe('acsportsltd.ca');
  });

  it('returns null for invalid urls', () => {
    expect(hostnameFromUrl('not-a-url')).toBeNull();
    expect(hostnameFromUrl('')).toBeNull();
  });
});

describe('CATEGORY_MAPPING_GUIDANCE', () => {
  it('steers hunting/fishing specialty away from golf_retail', () => {
    expect(CATEGORY_MAPPING_GUIDANCE).toMatch(/hunting\/fishing\/shooting/i);
    expect(CATEGORY_MAPPING_GUIDANCE).toMatch(/Never map hunting/i);
    expect(CATEGORY_MAPPING_GUIDANCE).toMatch(/golf_retail/);
    expect(CATEGORY_MAPPING_GUIDANCE).toMatch(/hardware_farm_rural/);
  });
});
