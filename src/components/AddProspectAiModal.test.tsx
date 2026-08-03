import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddProspectAiModal } from '@/components/AddProspectAiModal';

const enrichProspectMock = vi.fn();

vi.mock('@/lib/enrichProspect', () => ({
  enrichProspect: (...args: unknown[]) => enrichProspectMock(...args),
}));

describe('AddProspectAiModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders company and website fields', () => {
    render(<AddProspectAiModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Coastal Outfitters/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add via AI' })).toBeDisabled();
  });

  it('submits enrich request when name is present', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    enrichProspectMock.mockResolvedValue({
      ok: true,
      prospect: {
        id: 250,
        name: 'Coastal Outfitters',
        category: 'Marina',
        region: 'Vancouver Island',
        city: 'Nanaimo',
        address: '',
        phone: '',
        fit: '8/10 — Waterfront gift traffic.',
      },
    });

    render(<AddProspectAiModal open onClose={onClose} onCreated={onCreated} />);
    await user.type(screen.getByPlaceholderText(/Coastal Outfitters/i), 'Coastal Outfitters');
    expect(screen.getByRole('button', { name: 'Add via AI' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Add via AI' }));

    await screen.findByRole('button', { name: 'Add via AI' });
    expect(enrichProspectMock).toHaveBeenCalledWith({
      companyName: 'Coastal Outfitters',
      websiteUrl: undefined,
    });
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 250, name: 'Coastal Outfitters' }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
