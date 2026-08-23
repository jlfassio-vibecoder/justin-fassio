import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountResearchPanel } from '@/components/accountResearch/AccountResearchPanel';
import { prospectFixture } from '@/lib/prospectFixture';

const fetchLatestMock = vi.fn();
const startResearchMock = vi.fn();
const listSuggestionsMock = vi.fn();
const loadMatchMock = vi.fn();

vi.mock('@/lib/accountResearchClient', () => ({
  fetchLatestAccountResearch: (...args: unknown[]) => fetchLatestMock(...args),
  startAccountResearch: (...args: unknown[]) => startResearchMock(...args),
  runAccountResearchUntilDone: vi.fn(),
  listAccountResearchSuggestions: (...args: unknown[]) => listSuggestionsMock(...args),
  loadLatestProductMatch: (...args: unknown[]) => loadMatchMock(...args),
  generateAccountResearchSuggestions: vi.fn(),
  applyAccountResearchSuggestion: vi.fn(),
  rejectAccountResearchSuggestion: vi.fn(),
  createAccountProductMatchClient: vi.fn(),
}));

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => ({
    salesLineId: 'line-uuid',
    lineSlug: 'ogr',
    eaglePeakOutreach: true,
    bigFishOutreach: true,
  }),
}));

const prospect = prospectFixture({
  id: 7,
  name: 'Test Shop',
  category: 'golf_retail',
});

describe('AccountResearchPanel', () => {
  beforeEach(() => {
    fetchLatestMock.mockReset();
    startResearchMock.mockReset();
    listSuggestionsMock.mockResolvedValue({ ok: true, suggestions: [] });
    loadMatchMock.mockResolvedValue(null);
    fetchLatestMock.mockResolvedValue({ ok: true, outcome: 'none', run: null });
  });

  it('renders empty state and starts research from Run Search All', async () => {
    const user = userEvent.setup();
    startResearchMock.mockResolvedValue({
      ok: true,
      outcome: 'started',
      run: {
        id: 'run-1',
        status: 'succeeded',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [],
      citationsBySourceId: {},
      sourceFreshness: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/No run yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Run Search All/i }));
    await waitFor(() => expect(startResearchMock).toHaveBeenCalled());
  });

  it('shows identity warning when confidence is not high', async () => {
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-2',
        status: 'succeeded',
        identity_confidence: 'medium',
        completed_at: new Date().toISOString(),
      },
      sources: [],
      citationsBySourceId: {},
      sourceFreshness: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/Identity must be high confidence/i)).toBeInTheDocument();
  });
});
