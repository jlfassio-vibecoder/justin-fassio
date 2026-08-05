import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage OGR View Line CTA', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf8');

  it('imports OGR_WHOLESALE_PATH and wires View Line without target=_blank', () => {
    expect(source).toContain('OGR_WHOLESALE_PATH');
    expect(source).toMatch(/href=\{OGR_WHOLESALE_PATH\}/);

    const viewLineIdx = source.indexOf('View Line');
    expect(viewLineIdx).toBeGreaterThan(-1);
    const block = source.slice(Math.max(0, viewLineIdx - 500), viewLineIdx + 40);
    expect(block).toContain('href={OGR_WHOLESALE_PATH}');
    expect(block).not.toContain('target="_blank"');
    expect(block).not.toContain('OGR_MARKETPLACE_URL');
  });
});
