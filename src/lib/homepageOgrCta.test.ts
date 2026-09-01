import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage public line cards', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf8');
  const landing = readFileSync(resolve(process.cwd(), 'src/data/landing.ts'), 'utf8');
  const productUrls = readFileSync(resolve(process.cwd(), 'src/lib/productUrls.ts'), 'utf8');
  const epPage = readFileSync(
    resolve(process.cwd(), 'src/pages/eagle-peak-wholesale/index.astro'),
    'utf8',
  );
  const lisPage = readFileSync(
    resolve(process.cwd(), 'src/pages/living-in-sunshine-wholesale/index.astro'),
    'utf8',
  );
  const bfPage = readFileSync(
    resolve(process.cwd(), 'src/pages/big-fish-wholesale/index.astro'),
    'utf8',
  );
  const emptyShowroom = readFileSync(
    resolve(process.cwd(), 'src/components/wholesale/PublicLineEmptyShowroom.astro'),
    'utf8',
  );

  it('drives View Line from public line showroom paths without target=_blank', () => {
    expect(source).toContain('fetchPublicLineCards');
    expect(source).toContain('mergePublicLineCards');
    expect(source).toMatch(/href=\{brand\.publicShowroomPath\}/);
    expect(source).toContain('{brand.tagline}');
    expect(source).toContain('object-contain');

    const viewLineIdx = source.indexOf('View Line');
    expect(viewLineIdx).toBeGreaterThan(-1);
    const block = source.slice(Math.max(0, viewLineIdx - 500), viewLineIdx + 40);
    expect(block).toContain('href={brand.publicShowroomPath}');
    expect(block).not.toContain('target="_blank"');
    expect(block).not.toContain('OGR_MARKETPLACE_URL');
  });

  it('keeps non-OGR View Line destinations off productUrls', () => {
    expect(landing).toContain(
      "LIVING_IN_SUNSHINE_WHOLESALE_PATH = '/living-in-sunshine-wholesale'",
    );
    expect(landing).toContain("EAGLE_PEAK_WHOLESALE_PATH = '/eagle-peak-wholesale'");
    expect(landing).toContain("BIG_FISH_WHOLESALE_PATH = '/big-fish-wholesale'");
    expect(productUrls).not.toMatch(/living-in-sunshine/);
    expect(productUrls).not.toMatch(/eagle-peak/);
    expect(productUrls).not.toMatch(/big-fish/);
  });

  it('renders empty collection pages without the OGR order pipeline', () => {
    expect(lisPage).toContain('PublicLinePublishedShowroom');
    expect(lisPage).toContain('fetchPublicLivingInSunshineProducts');
    expect(lisPage).toContain("row.code === 'living-in-sunshine'");
    expect(epPage).toContain('PublicLineEmptyShowroom');
    expect(epPage).toContain("row.code === 'eagle-peak'");
    expect(bfPage).toContain('comingSoon');
    expect(bfPage).toContain("row.code === 'big-fish'");
    expect(emptyShowroom).toContain('No products published yet.');
    expect(emptyShowroom).toContain('This line is coming soon.');
    expect(lisPage).not.toContain('WholesaleShowroom');
    expect(epPage).not.toContain('WholesaleShowroom');
    expect(bfPage).not.toContain('WholesaleShowroom');
    expect(lisPage).not.toContain('fetchPublicOgrProducts');
    expect(epPage).not.toContain('fetchPublicOgrProducts');
    expect(bfPage).not.toContain('fetchPublicOgrProducts');
  });
});
