import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogCallFormModal } from '@/components/LogCallFormModal';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => ({
    multiLineUi: false,
    salesLineId: null,
    lineSlug: null,
  }),
}));

vi.mock('@/hooks/useAiAssist', () => ({
  useAiAssist: () => ({ openAssist: vi.fn() }),
}));

vi.mock('@/lib/contactActivityHistory', () => ({
  fetchContactActivityHistory: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

const fetchContactsForAccountMock = vi.fn();
vi.mock('@/lib/accountContacts', () => ({
  fetchContactsForAccount: (...args: unknown[]) => fetchContactsForAccountMock(...args),
}));

const fetchLogCallSocialLinksMock = vi.fn();
vi.mock('@/lib/logCallStoreContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logCallStoreContext')>();
  return {
    ...actual,
    fetchLogCallSocialLinks: (...args: unknown[]) => fetchLogCallSocialLinksMock(...args),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert']) {
        chain[key] = self;
      }
      chain.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled);
      return chain;
    }),
  },
}));

const baseProspect: Prospect = {
  id: 1,
  name: 'Coast Shop',
  category: 'golf_retail',
  region: 'Oregon Coast',
  city: 'Newport',
  address: '',
  phone: '',
  fit: '',
  accountStatus: 'prospect',
  convertedAt: null,
  initialOrderDate: null,
  notes: null,
  ...EMPTY_PROSPECT_PLANNING,
  ...EMPTY_PROSPECT_TAXONOMY,
  ...BC_PROSPECT_TERRITORY,
};

describe('LogCallFormModal briefing callout', () => {
  beforeEach(() => {
    fetchContactsForAccountMock.mockResolvedValue({ data: [], error: null });
    fetchLogCallSocialLinksMock.mockResolvedValue({ data: [], error: null });
  });

  it('shows talk track and last product name when provided', () => {
    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[baseProspect]}
        storeId={1}
        briefingContext={{
          talkTrackHint: 'Hot intent — lead with what they viewed online.',
          lastProductName: 'American Revival',
        }}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    const callout = screen.getByTestId('briefing-log-call-callout');
    expect(callout).toHaveTextContent('Hot intent — lead with what they viewed online.');
    expect(callout).toHaveTextContent('Last product: American Revival');
  });

  it('omits last product line when blank', () => {
    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[baseProspect]}
        storeId={1}
        briefingContext={{
          talkTrackHint: 'Follow-up scheduled.',
          lastProductName: null,
        }}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    const callout = screen.getByTestId('briefing-log-call-callout');
    expect(callout).toHaveTextContent('Follow-up scheduled.');
    expect(callout).not.toHaveTextContent('Last product:');
  });
});

describe('LogCallFormModal store dial context', () => {
  beforeEach(() => {
    fetchContactsForAccountMock.mockResolvedValue({ data: [], error: null });
    fetchLogCallSocialLinksMock.mockResolvedValue({ data: [], error: null });
  });

  it('shows dialable phone, website, and account notes', () => {
    const prospect: Prospect = {
      ...baseProspect,
      phone: '(541) 555-1212',
      address: '123 Harbor St',
      website: 'coastshop.example',
      notes: 'Ask for Jordan at the desk.',
    };
    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[prospect]}
        storeId={1}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('log-call-store-info')).toBeInTheDocument();
    const phone = screen.getByTestId('log-call-store-phone');
    expect(phone).toHaveTextContent('(541) 555-1212');
    expect(phone).toHaveAttribute('href', 'tel:5415551212');
    expect(screen.getByTestId('log-call-store-website')).toHaveAttribute(
      'href',
      'https://coastshop.example',
    );
    expect(screen.getByTestId('log-call-account-notes')).toHaveTextContent(
      'Ask for Jordan at the desk.',
    );
    expect(screen.getByText('123 Harbor St')).toBeInTheDocument();
  });

  it('shows empty store phone when missing', () => {
    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[baseProspect]}
        storeId={1}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('log-call-store-phone-empty')).toHaveTextContent('No store phone');
  });

  it('renders locked social links from fetch', async () => {
    fetchLogCallSocialLinksMock.mockResolvedValue({
      data: [
        {
          sourceType: 'instagram',
          url: 'https://instagram.com/coast',
          label: 'Instagram',
        },
        {
          sourceType: 'facebook',
          url: 'https://facebook.com/coast',
          label: 'Facebook',
        },
      ],
      error: null,
    });

    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[baseProspect]}
        storeId={1}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('log-call-social-instagram')).toHaveAttribute(
        'href',
        'https://instagram.com/coast',
      );
    });
    expect(screen.getByTestId('log-call-social-facebook')).toHaveAttribute(
      'href',
      'https://facebook.com/coast',
    );
  });

  it('shows contact phone and notes when a contact is selected', async () => {
    fetchContactsForAccountMock.mockResolvedValue({
      data: [
        {
          id: 'c1',
          accountId: 1,
          role: 'buyer',
          fullName: 'Jordan Lee',
          title: 'Buyer',
          phone: '541-555-9999',
          email: 'jordan@coast.example',
          isPrimary: true,
          notes: 'Prefers morning calls.',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        },
      ],
      error: null,
    });

    render(
      <LogCallFormModal
        open
        mode="prospect"
        prospects={[baseProspect]}
        storeId={1}
        onClose={vi.fn()}
        onStoreChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('log-call-contact-dial')).toBeInTheDocument();
    });
    expect(screen.getByTestId('log-call-contact-phone')).toHaveAttribute('href', 'tel:5415559999');
    expect(screen.getByTestId('log-call-contact-email')).toHaveTextContent('jordan@coast.example');
    expect(screen.getByTestId('log-call-contact-notes')).toHaveTextContent(
      'Prefers morning calls.',
    );
  });
});
