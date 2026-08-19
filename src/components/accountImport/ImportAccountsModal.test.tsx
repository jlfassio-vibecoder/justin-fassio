import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportAccountsModal } from '@/components/accountImport/ImportAccountsModal';
import { shouldAcceptImportCommit } from '@/lib/accountImport/confirmGuard';

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

describe('ImportAccountsModal', () => {
  it('starts on select without showing the confirm AI checkbox yet', () => {
    render(<ImportAccountsModal open onClose={vi.fn()} />);
    expect(screen.getByText('Import accounts')).toBeInTheDocument();
    expect(screen.getByText(/Select a represented line/i)).toBeInTheDocument();
    expect(screen.queryByText(/run AI fill-blanks after import/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enriching/i)).not.toBeInTheDocument();
  });

  it('rejects a second Confirm Import while a commit is already in flight', () => {
    expect(shouldAcceptImportCommit({ inFlight: false, step: 'confirm' })).toBe(true);
    expect(shouldAcceptImportCommit({ inFlight: true, step: 'confirm' })).toBe(false);
    expect(shouldAcceptImportCommit({ inFlight: false, step: 'importing' })).toBe(false);
    expect(shouldAcceptImportCommit({ inFlight: true, step: 'importing' })).toBe(false);
    expect(shouldAcceptImportCommit({ inFlight: false, step: 'imported' })).toBe(false);
    expect(shouldAcceptImportCommit({ inFlight: false, step: 'preview' })).toBe(false);
  });

  it('ships confirm checkbox and enriching progress copy', () => {
    const modal = readFileSync(
      resolve(process.cwd(), 'src/components/accountImport/ImportAccountsModal.tsx'),
      'utf8',
    );
    expect(modal).toMatch(/Run AI fill-blanks after import/);
    expect(modal).toMatch(/Per-row AI fill-blanks/);
    expect(modal).toMatch(/Enrich all/);
    expect(modal).toMatch(/Enrich selected/);
    expect(modal).not.toMatch(/AI enrichment is not part of this import/);
    const progress = readFileSync(
      resolve(process.cwd(), 'src/components/accountImport/EnrichmentProgress.tsx'),
      'utf8',
    );
    expect(progress).toMatch(/Retry failed/);
    expect(progress).toMatch(/Cancel remaining/);
  });
});
