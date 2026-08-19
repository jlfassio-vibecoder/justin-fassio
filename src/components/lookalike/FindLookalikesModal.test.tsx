import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FindLookalikesModal } from '@/components/lookalike/FindLookalikesModal';

vi.mock('@/lib/lines', async () => {
  const actual = await vi.importActual<typeof import('@/lib/lines')>('@/lib/lines');
  return {
    ...actual,
    fetchRepresentedLines: () =>
      Promise.resolve({
        data: [
          {
            id: 'line-ogr',
            code: 'ogr',
            name: 'Old Guys Rule',
            active: true,
            status: 'active',
            tagline: null,
            description: null,
            heroImagePath: null,
            heroImageUrl: null,
            sortOrder: 1,
            publicShowroomPath: null,
            defaultCurrency: 'CAD',
          },
        ],
        error: null,
      }),
  };
});

vi.mock('@/lib/lookalike/client', () => ({
  listLookalikeSeedsClient: () => Promise.resolve({ ok: true, seeds: [] }),
  startLookalikeJobClient: vi.fn(),
  processLookalikeJobClient: vi.fn(),
  getLookalikeJobClient: vi.fn(),
  cancelLookalikeJobClient: vi.fn(),
  reviewLookalikeCandidateClient: vi.fn(),
}));

describe('FindLookalikesModal', () => {
  it('opens on seed selection without importing search or job engines', () => {
    render(<FindLookalikesModal open onClose={vi.fn()} />);
    expect(screen.getByText('Find lookalikes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run lookalikes/i })).toBeInTheDocument();
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/lookalike/FindLookalikesModal.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/from '@\/lib\/lookalike\/search'/);
    expect(src).not.toMatch(/from '@\/lib\/lookalike\/jobs'/);
    expect(src).not.toMatch(/AI_GATEWAY_API_KEY/);
  });
});
