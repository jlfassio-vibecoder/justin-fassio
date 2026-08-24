import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountResearchPanel } from '@/components/accountResearch/AccountResearchPanel';
import { prospectFixture } from '@/lib/prospectFixture';

const fetchLatestMock = vi.fn();
const startResearchMock = vi.fn();
const listSuggestionsMock = vi.fn();
const loadMatchMock = vi.fn();
const lockResearchMock = vi.fn();
const unlockResearchMock = vi.fn();

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
  lockAccountResearchSource: (...args: unknown[]) => lockResearchMock(...args),
  unlockAccountResearchSource: (...args: unknown[]) => unlockResearchMock(...args),
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
    lockResearchMock.mockReset();
    unlockResearchMock.mockReset();
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

  it('shows candidate radios and Awaiting staff URL until a lock exists', async () => {
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-3',
        status: 'needs_identity_review',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-fb',
          source_type: 'facebook',
          status: 'succeeded',
          resolved_public_url: null,
          provider_metadata: {
            candidates: [
              {
                rank: 1,
                url: 'https://www.facebook.com/TheCountryClubID',
                title: 'The Country Club',
                snippet: 'Idaho',
              },
              {
                rank: 2,
                url: 'https://www.facebook.com/SpallGolf',
                title: 'Spallumcheen Golf',
                snippet: 'Vernon',
              },
            ],
          },
        },
      ],
      citationsBySourceId: { 'src-fb': [] },
      sourceFreshness: { 'src-fb': true },
      locksBySourceType: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/Awaiting staff URL/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /The Country Club/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Spallumcheen Golf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lock in/i })).toBeDisabled();
    expect(screen.queryByText(/Confirmed profile/i)).not.toBeInTheDocument();
  });

  it('shows a Locked URL with Unlock and restores radios after unlock', async () => {
    const user = userEvent.setup();
    const candidates = [
      {
        rank: 1,
        url: 'https://www.facebook.com/TheCountryClubID',
        title: 'The Country Club',
        snippet: 'Idaho',
      },
      {
        rank: 2,
        url: 'https://www.facebook.com/SpallGolf',
        title: 'Spallumcheen Golf',
        snippet: 'Vernon',
      },
    ];
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-4',
        status: 'succeeded',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-fb',
          source_type: 'facebook',
          status: 'succeeded',
          resolved_public_url: 'https://www.facebook.com/SpallGolf',
          provider_metadata: { candidates },
        },
      ],
      citationsBySourceId: { 'src-fb': [] },
      sourceFreshness: { 'src-fb': true },
      locksBySourceType: {
        facebook: {
          retailer_id: 7,
          source_type: 'facebook',
          locked_url: 'https://www.facebook.com/SpallGolf',
          locked_url_normalized: 'https://facebook.com/SpallGolf',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
      },
    });
    unlockResearchMock.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-4',
        status: 'needs_identity_review',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-fb',
          source_type: 'facebook',
          status: 'succeeded',
          resolved_public_url: null,
          provider_metadata: { candidates },
        },
      ],
      citationsBySourceId: { 'src-fb': [] },
      sourceFreshness: { 'src-fb': true },
      locksBySourceType: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/^Locked$/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Unlock/i }));
    expect(unlockResearchMock).toHaveBeenCalled();
    expect(await screen.findByText(/Awaiting staff URL/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Spallumcheen Golf/i })).toBeInTheDocument();
  });
});
