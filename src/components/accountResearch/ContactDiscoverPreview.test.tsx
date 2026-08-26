import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactDiscoverPreview } from '@/components/accountResearch/ContactDiscoverPreview';

const previewContactEnrichMock = vi.fn();
const applyContactEnrichMock = vi.fn();

vi.mock('@/lib/enrichContactPreview', () => ({
  previewContactEnrich: (...args: unknown[]) => previewContactEnrichMock(...args),
  applyContactEnrich: (...args: unknown[]) => applyContactEnrichMock(...args),
}));

vi.mock('@/lib/staffAiClientContext', () => ({
  staffAiPostFields: async () => ({}),
}));

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => ({
    multiLineAi: false,
    salesLineId: null,
    name: 'OGR',
    multiLineUi: false,
    lineSlug: 'ogr',
    lineReady: true,
  }),
}));

describe('ContactDiscoverPreview', () => {
  it('renders proposed fields after preview', async () => {
    previewContactEnrichMock.mockResolvedValue({
      ok: true,
      preview: {
        accountId: 674,
        companyName: 'Sassy Seagull',
        researchBrief: 'Owner Jane Doe runs purchasing.',
        yelpListingUrl: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
        proposed: {
          fullName: 'Jane Doe',
          title: 'Owner',
          phone: '541-777-7147',
          email: null,
          role: 'owner',
          isPrimary: true,
        },
        duplicate: null,
      },
    });

    render(<ContactDiscoverPreview accountId={674} resolvedWebsite="https://sassyseagull.com" />);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Optional')).toHaveValue('Owner');
    expect(screen.getByRole('combobox')).toHaveValue('owner');
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeEnabled();
  });

  it('disables apply on email duplicate until acknowledged', async () => {
    previewContactEnrichMock.mockResolvedValue({
      ok: true,
      preview: {
        accountId: 674,
        companyName: 'Sassy Seagull',
        researchBrief: 'Brief',
        yelpListingUrl: null,
        proposed: {
          fullName: 'Jane Doe',
          title: 'Owner',
          phone: null,
          email: 'jane@example.com',
          role: 'owner',
          isPrimary: false,
        },
        duplicate: {
          kind: 'email',
          contact: {
            id: 'existing',
            accountId: 674,
            fullName: 'Jane D.',
            email: 'jane@example.com',
            phone: null,
            title: null,
            role: 'buyer',
            isPrimary: true,
            notes: null,
            createdAt: '',
            updatedAt: '',
          },
        },
      },
    });

    render(<ContactDiscoverPreview accountId={674} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add contact' })).toBeDisabled();
    });

    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeEnabled();
  });
});
