import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountResearchPanel } from '@/components/accountResearch/AccountResearchPanel';
import { prospectFixture } from '@/lib/prospectFixture';

const fetchLatestMock = vi.fn();
const startResearchMock = vi.fn();
const runUntilDoneMock = vi.fn();
const listSuggestionsMock = vi.fn();
const loadMatchMock = vi.fn();
const lockResearchMock = vi.fn();
const unlockResearchMock = vi.fn();
const generateSuggestionsMock = vi.fn();

vi.mock('@/lib/accountResearchClient', () => ({
  fetchLatestAccountResearch: (...args: unknown[]) => fetchLatestMock(...args),
  startAccountResearch: (...args: unknown[]) => startResearchMock(...args),
  runAccountResearchUntilDone: (...args: unknown[]) => runUntilDoneMock(...args),
  listAccountResearchSuggestions: (...args: unknown[]) => listSuggestionsMock(...args),
  loadLatestProductMatch: (...args: unknown[]) => loadMatchMock(...args),
  generateAccountResearchSuggestions: (...args: unknown[]) => generateSuggestionsMock(...args),
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
    runUntilDoneMock.mockReset();
    lockResearchMock.mockReset();
    unlockResearchMock.mockReset();
    generateSuggestionsMock.mockReset();
    listSuggestionsMock.mockResolvedValue({ ok: true, suggestions: [] });
    loadMatchMock.mockResolvedValue(null);
    fetchLatestMock.mockResolvedValue({ ok: true, outcome: 'none', run: null });
    runUntilDoneMock.mockImplementation(async (runId: string) => ({
      ok: true,
      processed: true,
      sourceId: null,
      done: true,
      run: {
        id: runId,
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'none_indexed',
          resolved_public_url: null,
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    }));
  });

  it('disables Run Search All until the website is locked', async () => {
    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/No run yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Search All/i })).toBeDisabled();
    expect(await screen.findByText(/Lock the official website first/i)).toBeInTheDocument();
  });

  it('enables and starts Run Search All once the website is locked (found via the website-scope fallback fetch)', async () => {
    const user = userEvent.setup();
    fetchLatestMock.mockImplementation((_retailerId: number, scope: string) => {
      if (scope === 'website') {
        return Promise.resolve({
          ok: true,
          outcome: 'found',
          run: {
            id: 'run-website',
            status: 'succeeded',
            requested_scope: 'website',
            identity_confidence: 'high',
            completed_at: new Date().toISOString(),
          },
          sources: [],
          citationsBySourceId: {},
          sourceFreshness: {},
          locksBySourceType: {
            website: {
              retailer_id: 7,
              source_type: 'website',
              locked_url: 'https://trailoutfitters.com',
              locked_url_normalized: 'https://trailoutfitters.com',
              locked_by: null,
              locked_at: new Date().toISOString(),
            },
          },
        });
      }
      return Promise.resolve({ ok: true, outcome: 'none', run: null });
    });
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
    expect(screen.queryByText(/Identity must be high confidence/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Run Search All/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /Run Search All/i }));
    await waitFor(() => expect(startResearchMock).toHaveBeenCalled());
    expect(startResearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'all', forceRefresh: false }),
    );
  });

  it('keeps Run Search All disabled when an all-scope snapshot has no website lock', async () => {
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-all',
        status: 'succeeded',
        requested_scope: 'all',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [],
      citationsBySourceId: {},
      sourceFreshness: {},
      locksBySourceType: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Run Search All/i })).toBeDisabled(),
    );
    expect(screen.getByText(/Lock the official website first/i)).toBeInTheDocument();
  });

  it('starts a website-only run from Run Website Search', async () => {
    const user = userEvent.setup();
    startResearchMock.mockResolvedValue({
      ok: true,
      outcome: 'started',
      run: {
        id: 'run-website',
        status: 'succeeded',
        requested_scope: 'website',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [],
      citationsBySourceId: {},
      sourceFreshness: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/No run yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Run Website Search/i }));
    await waitFor(() => expect(startResearchMock).toHaveBeenCalled());
    expect(startResearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'website', forceRefresh: false }),
    );
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

  it('shows manual URL lock when website search has no candidates', async () => {
    const user = userEvent.setup();
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-empty-web',
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'none_indexed',
          resolved_public_url: null,
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    });
    lockResearchMock.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-empty-web',
        status: 'succeeded',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: 'https://bradburysguns.com',
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {
        website: {
          retailer_id: 7,
          source_type: 'website',
          locked_url: 'https://bradburysguns.com',
          locked_url_normalized: 'https://bradburysguns.com',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
      },
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/No recent public indexed activity found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No website\? Paste their Facebook or Instagram page URL/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const urlInput = screen.getByRole('textbox', { name: /Official website URL/i });
    expect(screen.getByRole('button', { name: /Lock in/i })).toBeDisabled();

    await user.type(urlInput, 'https://bradburysguns.com');
    await user.click(screen.getByRole('button', { name: /Lock in/i }));

    await waitFor(() => expect(lockResearchMock).toHaveBeenCalled());
    expect(lockResearchMock).toHaveBeenCalledWith({
      retailerId: 7,
      sourceType: 'website',
      url: 'https://bradburysguns.com',
    });
    expect(await screen.findByText(/^Locked$/i)).toBeInTheDocument();
  });

  it('does not show manual URL input when website candidates exist', async () => {
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-web-cands',
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: null,
          provider_metadata: {
            candidates: [
              {
                rank: 1,
                url: 'https://trailoutfitters.com',
                title: 'Trail Outfitters',
                snippet: 'Official site',
              },
            ],
          },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/Awaiting staff URL/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Trail Outfitters/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /Official website URL/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter the official website URL to lock/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No website\? Paste their Facebook or Instagram page URL/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No match/i })).toBeInTheDocument();
  });

  it('No match dismisses website candidates and shows manual URL entry', async () => {
    const user = userEvent.setup();
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-web-nomatch',
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: null,
          provider_metadata: {
            candidates: [
              {
                rank: 1,
                url: 'https://toy-room.com/',
                title: 'Toy Room Club',
                snippet: 'Wrong match',
              },
              {
                rank: 2,
                url: 'https://thesteamroom.com/',
                title: 'The STEAM Room',
                snippet: 'Also wrong',
              },
            ],
          },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByRole('radio', { name: /Toy Room Club/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /No match/i }));

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No website\? Paste their Facebook or Instagram page URL/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Official website URL/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show search results/i }));
    expect(screen.getByRole('radio', { name: /Toy Room Club/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /Official website URL/i }),
    ).not.toBeInTheDocument();
  });

  it('shows manual URL lock when facebook search has no candidates', async () => {
    const user = userEvent.setup();
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-empty-fb',
        status: 'succeeded',
        requested_scope: 'all',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: 'https://example.com',
          provider_metadata: {},
        },
        {
          id: 'src-fb',
          source_type: 'facebook',
          status: 'none_indexed',
          resolved_public_url: null,
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [], 'src-fb': [] },
      sourceFreshness: { 'src-web': true, 'src-fb': true },
      locksBySourceType: {
        website: {
          retailer_id: 7,
          source_type: 'website',
          locked_url: 'https://example.com',
          locked_url_normalized: 'https://example.com',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
      },
    });
    lockResearchMock.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-empty-fb',
        status: 'succeeded',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: 'https://example.com',
          provider_metadata: {},
        },
        {
          id: 'src-fb',
          source_type: 'facebook',
          status: 'succeeded',
          resolved_public_url: 'https://facebook.com/BradburysGunNTackle',
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [], 'src-fb': [] },
      sourceFreshness: { 'src-web': true, 'src-fb': true },
      locksBySourceType: {
        website: {
          retailer_id: 7,
          source_type: 'website',
          locked_url: 'https://example.com',
          locked_url_normalized: 'https://example.com',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
        facebook: {
          retailer_id: 7,
          source_type: 'facebook',
          locked_url: 'https://facebook.com/BradburysGunNTackle',
          locked_url_normalized: 'https://facebook.com/BradburysGunNTackle',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
      },
    });

    render(<AccountResearchPanel prospect={prospect} />);

    expect(await screen.findByText(/Enter the official Facebook page URL/i)).toBeInTheDocument();
    const urlInput = screen.getByRole('textbox', { name: /Official Facebook page URL/i });
    await user.type(urlInput, 'https://facebook.com/BradburysGunNTackle');
    await user.click(screen.getByRole('button', { name: /Lock in/i }));

    await waitFor(() => expect(lockResearchMock).toHaveBeenCalled());
    expect(lockResearchMock).toHaveBeenCalledWith({
      retailerId: 7,
      sourceType: 'facebook',
      url: 'https://facebook.com/BradburysGunNTackle',
    });
  });

  it('locks a Facebook URL as website when website search is empty', async () => {
    const user = userEvent.setup();
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-fb-primary',
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'none_indexed',
          resolved_public_url: null,
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    });
    lockResearchMock.mockResolvedValue({
      ok: true,
      run: {
        id: 'run-fb-primary',
        status: 'succeeded',
        identity_confidence: 'high',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'succeeded',
          resolved_public_url: 'https://facebook.com/BradburysGunNTackle',
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {
        website: {
          retailer_id: 7,
          source_type: 'website',
          locked_url: 'https://facebook.com/BradburysGunNTackle',
          locked_url_normalized: 'https://facebook.com/BradburysGunNTackle',
          locked_by: null,
          locked_at: new Date().toISOString(),
        },
      },
    });

    render(<AccountResearchPanel prospect={prospect} />);

    const urlInput = await screen.findByRole('textbox', { name: /Official website URL/i });
    await user.type(urlInput, 'https://facebook.com/BradburysGunNTackle');
    await user.click(screen.getByRole('button', { name: /Lock in/i }));

    await waitFor(() => expect(lockResearchMock).toHaveBeenCalled());
    expect(lockResearchMock).toHaveBeenCalledWith({
      retailerId: 7,
      sourceType: 'website',
      url: 'https://facebook.com/BradburysGunNTackle',
    });
  });

  it('ignores a second Run Website Search click while the first is in flight', async () => {
    const user = userEvent.setup();
    let resolveStart: (value: unknown) => void = () => {};
    startResearchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(<AccountResearchPanel prospect={prospect} />);
    expect(await screen.findByText(/No run yet/i)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Run Website Search/i });
    await user.click(button);
    await waitFor(() => expect(startResearchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /Running…/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Running…/i }));
    expect(startResearchMock).toHaveBeenCalledTimes(1);

    resolveStart({
      ok: true,
      outcome: 'started',
      run: {
        id: 'run-1',
        status: 'running',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: null,
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'pending',
          resolved_public_url: null,
          provider_metadata: {},
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: {},
      locksBySourceType: {},
    });

    await waitFor(() => expect(runUntilDoneMock).toHaveBeenCalled());
    expect(
      await screen.findByText(/No website\? Paste their Facebook or Instagram page URL/i),
    ).toBeInTheDocument();
  });

  it('auto-resumes an in-flight run loaded on hydrate and shows progress', async () => {
    fetchLatestMock.mockResolvedValue({
      ok: true,
      outcome: 'found',
      run: {
        id: 'run-orphan',
        status: 'running',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: null,
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'pending',
          resolved_public_url: null,
          provider_metadata: {},
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: {},
      locksBySourceType: {},
    });

    let resolveDone: (value: unknown) => void = () => {};
    runUntilDoneMock.mockImplementation(
      (_runId: string, options?: { onProgress?: (snap: unknown) => void }) => {
        options?.onProgress?.({
          run: {
            id: 'run-orphan',
            status: 'running',
            requested_scope: 'website',
            identity_confidence: 'unresolved',
            completed_at: null,
          },
          sources: [
            {
              id: 'src-web',
              source_type: 'website',
              status: 'running',
              resolved_public_url: null,
              provider_metadata: {},
            },
          ],
          citationsBySourceId: { 'src-web': [] },
          sourceFreshness: {},
          locksBySourceType: {},
        });
        return new Promise((resolve) => {
          resolveDone = resolve;
        });
      },
    );

    render(<AccountResearchPanel prospect={prospect} />);

    await waitFor(() =>
      expect(runUntilDoneMock).toHaveBeenCalledWith('run-orphan', expect.any(Object)),
    );
    expect(await screen.findByText(/This can take a minute/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Running…/i })).toBeDisabled();

    resolveDone({
      ok: true,
      processed: true,
      sourceId: 'src-web',
      done: true,
      run: {
        id: 'run-orphan',
        status: 'needs_identity_review',
        requested_scope: 'website',
        identity_confidence: 'unresolved',
        completed_at: new Date().toISOString(),
      },
      sources: [
        {
          id: 'src-web',
          source_type: 'website',
          status: 'none_indexed',
          resolved_public_url: null,
          provider_metadata: { candidates: [] },
        },
      ],
      citationsBySourceId: { 'src-web': [] },
      sourceFreshness: { 'src-web': true },
      locksBySourceType: {},
    });

    expect(
      await screen.findByText(/No website\? Paste their Facebook or Instagram page URL/i),
    ).toBeInTheDocument();
  });
});
