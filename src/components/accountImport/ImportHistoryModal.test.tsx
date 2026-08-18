import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportHistoryModal } from '@/components/accountImport/ImportHistoryModal';

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

vi.mock('@/lib/accountImport/client', () => ({
  listAccountImportBatchesClient: () => Promise.resolve({ ok: true, batches: [] }),
  getAccountImportBatchClient: () => Promise.resolve({ ok: false, error: 'unused' }),
}));

describe('ImportHistoryModal', () => {
  it('opens as owner history and does not invent resume-by-batchId', () => {
    render(<ImportHistoryModal open onClose={vi.fn()} />);
    expect(screen.getByText('Import history')).toBeInTheDocument();
    expect(screen.queryByText(/resume by batch/i)).not.toBeInTheDocument();
  });
});
