import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUpdateResearchModal } from '@/components/AiUpdateResearchModal';
import type { Prospect } from '@/lib/prospects';

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
    expect(previewMock).toHaveBeenCalledWith({ prospectId: 7 });

    await user.click(screen.getByRole('button', { name: 'Confirm update' }));

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith({ prospectId: 7, fields });
      expect(onApplied).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
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
