import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUpdateResearchModal } from '@/components/AiUpdateResearchModal';
import { EMPTY_PROSPECT_PLANNING, type Prospect } from '@/lib/prospects';

const previewMock = vi.fn();
const applyMock = vi.fn();

vi.mock('@/lib/updateProspectResearchClient', () => ({
  previewProspectResearchUpdate: (...args: unknown[]) => previewMock(...args),
  applyProspectResearchUpdate: (...args: unknown[]) => applyMock(...args),
}));

const baseProspect: Prospect = {
  id: 7,
  name: 'Old Marina',
  category: 'Marina',
  region: 'Vancouver Island',
  city: 'Nanaimo',
  address: '1 Dock',
  phone: '250-000-0000',
  fit: '6/10 — Quiet.',
  accountStatus: 'prospect',
  convertedAt: null,
  initialOrderDate: null,
  notes: null,
  ...EMPTY_PROSPECT_PLANNING,
};

const fields = {
  name: 'New Marina',
  category: 'Marina' as const,
  region: 'Vancouver Island' as const,
  city: 'Nanaimo',
  fitScore: 9,
  notes: 'Busy summer traffic.',
  address: '2 Dock',
  phone: '250-111-1111',
};

describe('AiUpdateResearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows diffs after preview and confirms apply', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    const onClose = vi.fn();

    previewMock.mockResolvedValue({
      ok: true,
      preview: {
        current: baseProspect,
        proposed: {
          ...baseProspect,
          name: 'New Marina',
          address: '2 Dock',
          phone: '250-111-1111',
          fit: '9/10 — Busy summer traffic.',
        },
        fields,
        researchBrief: 'brief',
        mode: 'update',
      },
    });
    applyMock.mockResolvedValue({
      ok: true,
      prospect: {
        ...baseProspect,
        name: 'New Marina',
        address: '2 Dock',
        phone: '250-111-1111',
        fit: '9/10 — Busy summer traffic.',
      },
    });

    render(
      <AiUpdateResearchModal
        open
        prospect={baseProspect}
        onClose={onClose}
        onApplied={onApplied}
      />,
    );

    expect(screen.getByText(/Searching the web and enriching/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('New Marina')).toBeInTheDocument();
    });
    expect(previewMock).toHaveBeenCalledWith({
      prospectId: 7,
      websiteUrl: undefined,
      mode: 'update',
    });

    await user.click(screen.getByRole('button', { name: 'Confirm update' }));

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith({ prospectId: 7, fields, mode: 'update' });
      expect(onApplied).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('fill-blanks mode requests fill-blanks and confirms fills', async () => {
    const user = userEvent.setup();
    const blankProspect: Prospect = {
      ...baseProspect,
      address: '',
      phone: '',
      website: null,
    };
    previewMock.mockResolvedValue({
      ok: true,
      preview: {
        current: blankProspect,
        proposed: { ...blankProspect, address: '2 Dock', phone: '250-111-1111' },
        fields: {
          name: null,
          category: null,
          region: null,
          city: null,
          address: '2 Dock',
          phone: '250-111-1111',
          fitScore: null,
          fit: null,
          website: null,
          subterritory: null,
          primaryDistrict: null,
          retailCategory: null,
          apparelCapability: null,
          verificationStatus: null,
          idealOpeningUnits: null,
          priority: null,
          provisionalGrade: null,
          nextAction: null,
        },
        researchBrief: 'brief',
        mode: 'fill-blanks',
      },
    });
    applyMock.mockResolvedValue({
      ok: true,
      prospect: { ...blankProspect, address: '2 Dock', phone: '250-111-1111' },
    });

    render(
      <AiUpdateResearchModal
        open
        mode="fill-blanks"
        prospect={blankProspect}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Fill Blank Fields')).toBeInTheDocument();
      expect(screen.getByText('2 Dock')).toBeInTheDocument();
    });
    expect(previewMock).toHaveBeenCalledWith({
      prospectId: 7,
      websiteUrl: undefined,
      mode: 'fill-blanks',
    });

    await user.click(screen.getByRole('button', { name: 'Confirm fills' }));
    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith(
        expect.objectContaining({ prospectId: 7, mode: 'fill-blanks' }),
      );
    });
  });

  it('fill-blanks empty state explains researched blanks when nothing fills', async () => {
    const blankProspect: Prospect = {
      ...baseProspect,
      address: '',
      phone: '',
      website: null,
      apparelCapability: 'Unknown',
      fitScore: 8,
      priority: 'Tier 2',
      provisionalGrade: 'B (provisional)',
      idealOpeningUnits: 48,
    };
    previewMock.mockResolvedValue({
      ok: true,
      preview: {
        current: blankProspect,
        proposed: blankProspect,
        fields: {
          name: null,
          category: null,
          region: null,
          city: null,
          address: null,
          phone: null,
          fitScore: 8,
          fit: null,
          website: null,
          subterritory: null,
          primaryDistrict: null,
          retailCategory: null,
          apparelCapability: null,
          verificationStatus: null,
          idealOpeningUnits: 48,
          priority: 'Tier 2',
          provisionalGrade: 'B (provisional)',
          nextAction: null,
        },
        researchBrief: 'brief',
        mode: 'fill-blanks',
      },
    });

    render(
      <AiUpdateResearchModal
        open
        mode="fill-blanks"
        prospect={blankProspect}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Only address, phone, website, or apparel were blank/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Confirm fills' })).toBeDisabled();
  });

  it('does not write when cancel is clicked', async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      ok: true,
      preview: {
        current: baseProspect,
        proposed: { ...baseProspect, name: 'Changed' },
        fields: { ...fields, name: 'Changed' },
        researchBrief: null,
        mode: 'update',
      },
    });

    render(
      <AiUpdateResearchModal open prospect={baseProspect} onClose={vi.fn()} onApplied={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm update' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(applyMock).not.toHaveBeenCalled();
  });
});
