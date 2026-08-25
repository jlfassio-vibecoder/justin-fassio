import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountEmailProductPickerModal } from '@/components/AccountEmailProductPickerModal';
import type { AccountContact } from '@/lib/accountContacts';
import { catalogFetchOptionsForAccountEmail, catalogItemStub } from '@/lib/catalog';
import { NO_SAVED_RECIPIENT_EMAIL_HINT } from '@/lib/accountProductEmailRecipient';

const fetchCatalogItemsMock = vi.fn();
const fetchContactsForAccountMock = vi.fn();

vi.mock('@/lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/catalog')>('@/lib/catalog');
  return {
    ...actual,
    fetchCatalogItems: (...args: unknown[]) => fetchCatalogItemsMock(...args),
  };
});

vi.mock('@/lib/accountContacts', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/accountContacts')>('@/lib/accountContacts');
  return {
    ...actual,
    fetchContactsForAccount: (...args: unknown[]) => fetchContactsForAccountMock(...args),
  };
});

const LINE_ID = '11111111-1111-4111-8111-111111111111';

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 7,
    role: 'buyer',
    title: null,
    phone: null,
    email: null,
    isPrimary: false,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('catalogFetchOptionsForAccountEmail', () => {
  it('uses lineId when multi-line has an id', () => {
    expect(catalogFetchOptionsForAccountEmail(LINE_ID, 'eagle-peak')).toEqual({ lineId: LINE_ID });
  });

  it('falls back to lineCode including ogr default', () => {
    expect(catalogFetchOptionsForAccountEmail(null, 'eagle-peak')).toEqual({
      lineCode: 'eagle-peak',
    });
    expect(catalogFetchOptionsForAccountEmail(null, null)).toEqual({ lineCode: 'ogr' });
  });
});

describe('AccountEmailProductPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCatalogItemsMock.mockResolvedValue({
      data: [
        catalogItemStub({
          id: 'pub-1',
          sku: 'OG2511',
          name: 'AMERICAN DREAM',
          color: 'Stone Blue',
          isPubliclyPublished: true,
          publicSlug: 'american-dream',
          primaryImageUrl: 'https://cdn.example.com/og2511.jpg',
        }),
        catalogItemStub({
          id: 'draft-1',
          sku: 'OG9999',
          name: 'UNPUBLISHED',
          color: 'Black',
          isPubliclyPublished: false,
          publicSlug: 'unpublished',
        }),
        catalogItemStub({
          id: 'noslug-1',
          sku: 'OG8888',
          name: 'NO SLUG',
          color: 'White',
          isPubliclyPublished: true,
          publicSlug: null,
        }),
      ],
      error: null,
    });
    fetchContactsForAccountMock.mockResolvedValue({
      data: [
        contact({ id: 'c1', fullName: 'Sam Buyer', email: 'sam@store.com', isPrimary: true }),
        contact({ id: 'c2', fullName: 'Pat Manager', email: 'pat@store.com' }),
      ],
      error: null,
    });
  });

  it('loads line-scoped published SKUs with slug only and compact columns', async () => {
    const onClose = vi.fn();
    const onPick = vi.fn();
    render(
      <AccountEmailProductPickerModal
        open
        accountId={7}
        salesLineId={LINE_ID}
        lineSlug="ogr"
        onClose={onClose}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchCatalogItemsMock).toHaveBeenCalledWith({ lineId: LINE_ID });
    });
    expect(await screen.findByText('OG2511')).toBeInTheDocument();
    expect(screen.getByText('AMERICAN DREAM')).toBeInTheDocument();
    expect(screen.getByText('Stone Blue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email this' })).toBeInTheDocument();
    expect(screen.queryByText('OG9999')).not.toBeInTheDocument();
    expect(screen.queryByText('OG8888')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'SKU' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Color' })).toBeInTheDocument();
  });

  it('cancels back without picking', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AccountEmailProductPickerModal
        open
        accountId={7}
        salesLineId={null}
        lineSlug="ogr"
        onClose={onClose}
        onPick={vi.fn()}
      />,
    );
    await screen.findByText('OG2511');
    expect(fetchCatalogItemsMock).toHaveBeenCalledWith({ lineCode: 'ogr' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('passes the selected recipient on Email this', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <AccountEmailProductPickerModal
        open
        accountId={7}
        salesLineId={LINE_ID}
        lineSlug="ogr"
        onClose={vi.fn()}
        onPick={onPick}
      />,
    );
    await screen.findByText('OG2511');
    expect(screen.getByLabelText('Recipient')).toHaveValue('c1');
    await user.selectOptions(screen.getByLabelText('Recipient'), 'c2');
    await user.click(screen.getByRole('button', { name: 'Email this' }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        accountContactId: 'c2',
        to: 'pat@store.com',
        recipientName: 'Pat Manager',
        recipientHint: null,
      }),
    );
  });

  it('shows the no-saved-email hint when contacts lack email', async () => {
    fetchContactsForAccountMock.mockResolvedValue({
      data: [contact({ id: 'c1', fullName: 'No Email', isPrimary: true })],
      error: null,
    });
    render(
      <AccountEmailProductPickerModal
        open
        accountId={7}
        salesLineId={LINE_ID}
        lineSlug="ogr"
        onClose={vi.fn()}
        onPick={vi.fn()}
      />,
    );
    expect(await screen.findByText(NO_SAVED_RECIPIENT_EMAIL_HINT)).toBeInTheDocument();
    expect(screen.queryByLabelText('Recipient')).not.toBeInTheDocument();
  });

  it('replaceProduct mode skips recipients and uses Use this', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <AccountEmailProductPickerModal
        open
        intent="replaceProduct"
        accountId={7}
        salesLineId={LINE_ID}
        lineSlug="ogr"
        onClose={vi.fn()}
        onPick={onPick}
      />,
    );

    expect(await screen.findByText('Replace product')).toBeInTheDocument();
    expect(fetchContactsForAccountMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Recipient')).not.toBeInTheDocument();
    expect(screen.queryByText(NO_SAVED_RECIPIENT_EMAIL_HINT)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: 'pub-1', sku: 'OG2511' }),
        accountContactId: null,
        to: '',
      }),
    );
  });
});

describe('CatalogTab Line Sheet contract', () => {
  it('still mounts ProductDetailDrawer', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/tabs/CatalogTab.tsx'), 'utf8');
    expect(src).toContain("from '@/components/ProductDetailDrawer'");
    expect(src).toContain('<ProductDetailDrawer');
    expect(src).toContain('CATALOG_CATEGORY_FILTER_OPTIONS');
  });
});
