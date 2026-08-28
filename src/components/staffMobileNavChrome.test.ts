import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staff mobile nav chrome', () => {
  const rcc = readFileSync(resolve(process.cwd(), 'src/components/RepCommandCenter.tsx'), 'utf8');
  const tabNav = readFileSync(resolve(process.cwd(), 'src/components/TabNav.tsx'), 'utf8');
  const staffTabs = readFileSync(resolve(process.cwd(), 'src/lib/staffTabs.ts'), 'utf8');

  it('keeps desktop Header and TabNav behind md breakpoint', () => {
    expect(rcc).toContain('StaffMobileNavDrawer');
    expect(rcc).toContain('md:hidden');
    expect(rcc).toContain('hidden md:block');
    expect(rcc).toContain('<Header');
    expect(rcc).toContain('<TabNav');
    expect(rcc).toContain('Open navigation');
  });

  it('shares STAFF_TABS between TabNav and drawer', () => {
    expect(staffTabs).toContain('export const STAFF_TABS');
    expect(tabNav).toContain("from '@/lib/staffTabs'");
    expect(tabNav).toContain('STAFF_TABS.map');
  });
});
