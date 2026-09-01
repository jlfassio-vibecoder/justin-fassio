import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OgrProductEmailComposerModal,
  type OgrProductEmailComposerModalProps,
} from '@/components/OgrProductEmailComposerModal';
import {
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import { NO_SAVED_RECIPIENT_EMAIL_HINT } from '@/lib/accountProductEmailRecipient';

const sendOgrProductEmailMock = vi.fn();
const updateAgentProductOutreachDraftClientMock = vi.fn();
const sendAgentProductOutreachDraftMock = vi.fn();
const cancelAgentProductOutreachDraftClientMock = vi.fn();
const generateAgentProductOutreachDraftMock = vi.fn();

vi.mock('@/lib/sendOgrProductEmailClient', () => ({
  sendOgrProductEmail: (...args: unknown[]) => sendOgrProductEmailMock(...args),
}));

vi.mock('@/lib/agentProductOutreachDraftClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agentProductOutreachDraftClient')>();
  return {
    ...actual,
    updateAgentProductOutreachDraftClient: (...args: unknown[]) =>
      updateAgentProductOutreachDraftClientMock(...args),
    sendAgentProductOutreachDraft: (...args: unknown[]) =>
      sendAgentProductOutreachDraftMock(...args),
    cancelAgentProductOutreachDraftClient: (...args: unknown[]) =>
      cancelAgentProductOutreachDraftClientMock(...args),
    generateAgentProductOutreachDraft: (...args: unknown[]) =>
      generateAgentProductOutreachDraftMock(...args),
  };
});

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const DRAFT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CARD_HTML = '<table data-ogr-card="1"><tr><td>American Revival</td></tr></table>';

const REVIEW_DRAFT = {
  id: DRAFT_ID,
  to: 'buyer@example.com',
  toName: 'Tony',
  subject: 'Old Guys Rule — American Revival',
  introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
  closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  prospectId: 42,
  accountContactId: CONTACT_ID,
  catalogItemId: PRODUCT_ID,
  prospectName: 'Paddington Station',
};

function renderModal(overrides: Partial<OgrProductEmailComposerModalProps> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <OgrProductEmailComposerModal
      open
      onClose={onClose}
      onSent={onSent}
      productId={PRODUCT_ID}
      productName="American Revival"
      cardHtml={CARD_HTML}
      {...overrides}
    />,
  );
  return { onClose, onSent };
}

describe('OgrProductEmailComposerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens with default subject, intro, and closing', () => {
    renderModal();
    expect(screen.getByDisplayValue('Old Guys Rule — American Revival')).toBeInTheDocument();
    expect(screen.getByDisplayValue(OGR_PRODUCT_EMAIL_DEFAULT_INTRO)).toBeInTheDocument();
    expect(screen.getByDisplayValue(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING)).toBeInTheDocument();
    expect(screen.getByTitle('Product card preview')).toBeInTheDocument();
  });

  it('blocks send when to is empty', async () => {
    const user = userEvent.setup();
    const { onClose, onSent } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendOgrProductEmailMock).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/recipient email/i);
  });

  it('blocks send when to is invalid', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByPlaceholderText('buyer@store.com'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendOgrProductEmailMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/recipient email/i);
  });

  it('blocks send when to contains whitespace', async () => {
    const user = userEvent.setup();
    renderModal();
    const input = screen.getByPlaceholderText('buyer@store.com');
    await user.click(input);
    await user.paste('buyer @example.com');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendOgrProductEmailMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/recipient email/i);
  });

  it('shows Sending… and disables submit while pending', async () => {
    const user = userEvent.setup();
    let resolveSend: (value: { ok: true }) => void = () => undefined;
    sendOgrProductEmailMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    renderModal();
    await user.type(screen.getByPlaceholderText('buyer@store.com'), 'buyer@example.com');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(sendOgrProductEmailMock).toHaveBeenCalledOnce();

    resolveSend({ ok: true });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sending…' })).not.toBeInTheDocument();
    });
  });

  it('POSTs only supported fields and closes on success', async () => {
    const user = userEvent.setup();
    sendOgrProductEmailMock.mockResolvedValue({ ok: true });
    const { onClose, onSent } = renderModal();

    await user.type(screen.getByPlaceholderText('buyer@store.com'), 'buyer@example.com');
    await user.type(screen.getByPlaceholderText('Sam'), 'Sam');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(onSent).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });

    expect(sendOgrProductEmailMock).toHaveBeenCalledOnce();
    const payload = sendOgrProductEmailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toEqual({
      productId: PRODUCT_ID,
      to: 'buyer@example.com',
      recipientName: 'Sam',
      subject: 'Old Guys Rule — American Revival',
      introText: OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
      closingText: OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
    });
    expect(payload).not.toHaveProperty('html');
    expect(payload).not.toHaveProperty('from');
    expect(payload).not.toHaveProperty('signatureName');
    expect(payload).not.toHaveProperty('productHref');
    expect(JSON.stringify(payload)).not.toContain(CARD_HTML);
  });

  it('sends the Line Sheet market for accountless U.S. mail', async () => {
    const user = userEvent.setup();
    sendOgrProductEmailMock.mockResolvedValue({ ok: true });
    renderModal({
      defaultTo: 'buyer@example.com',
      defaultRecipientName: 'Sam',
      publicMarket: 'us',
    });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendOgrProductEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        market: 'us',
      }),
    );
  });

  it('account path sends prospectId and saved contact id', async () => {
    const user = userEvent.setup();
    sendOgrProductEmailMock.mockResolvedValue({ ok: true });
    renderModal({
      defaultTo: 'buyer@example.com',
      defaultRecipientName: 'Sam',
      prospectId: 42,
      accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      salesLineId: '11111111-1111-4111-8111-111111111111',
      retailerLineAccountId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      recipientOptions: [
        {
          id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          email: 'buyer@example.com',
          name: 'Sam',
        },
        { id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', email: 'pat@example.com', name: 'Pat' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(sendOgrProductEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        recipientName: 'Sam',
        prospectId: 42,
        accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        salesLineId: '11111111-1111-4111-8111-111111111111',
        retailerLineAccountId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      }),
    );
  });

  it('account path keeps prospectId and drops contact when the To address is typed', async () => {
    const user = userEvent.setup();
    sendOgrProductEmailMock.mockResolvedValue({ ok: true });
    renderModal({
      defaultTo: 'buyer@example.com',
      defaultRecipientName: 'Sam',
      prospectId: 42,
      accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      recipientOptions: [
        {
          id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          email: 'buyer@example.com',
          name: 'Sam',
        },
        { id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', email: 'pat@example.com', name: 'Pat' },
      ],
    });

    const to = screen.getByPlaceholderText('buyer@store.com');
    await user.clear(to);
    await user.type(to, 'adhoc@example.com');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const payload = sendOgrProductEmailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.prospectId).toBe(42);
    expect(payload).not.toHaveProperty('accountContactId');
    expect(payload.to).toBe('adhoc@example.com');
  });

  it('shows the no-saved-email hint', () => {
    renderModal({ recipientHint: NO_SAVED_RECIPIENT_EMAIL_HINT });
    expect(screen.getByText(NO_SAVED_RECIPIENT_EMAIL_HINT)).toBeInTheDocument();
  });

  it('shows server error and keeps modal open on failure', async () => {
    const user = userEvent.setup();
    sendOgrProductEmailMock.mockResolvedValue({
      ok: false,
      error: 'Email is not configured',
    });
    const { onClose, onSent } = renderModal();

    await user.type(screen.getByPlaceholderText('buyer@store.com'), 'buyer@example.com');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email is not configured');
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Email Product')).toBeInTheDocument();
  });

  it('shows Change product only for draft review with onProductReplaced', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Change product' })).not.toBeInTheDocument();

    renderModal({
      draft: REVIEW_DRAFT,
      onProductReplaced: vi.fn(),
      accountId: 42,
    });
    expect(screen.getByText('Review Product Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change product' })).toBeInTheDocument();
  });

  it('shows Save draft in draft review mode', () => {
    renderModal({ draft: REVIEW_DRAFT });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('does not show Save draft outside draft review', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });

  it('saves draft fields without sending and keeps modal open', async () => {
    const user = userEvent.setup();
    const onDraftSaved = vi.fn();
    const onClose = vi.fn();
    const onSent = vi.fn();
    updateAgentProductOutreachDraftClientMock.mockResolvedValue({
      ok: true,
      draft: {
        id: DRAFT_ID,
        toEmail: 'buyer@example.com',
        toName: 'Tony',
        subject: 'Old Guys Rule — Beach Cruiser',
        introText: 'Custom intro for Tony.',
        closingText: 'Custom closing.',
        prospectId: 42,
        accountContactId: CONTACT_ID,
        catalogItemId: PRODUCT_ID,
        payload: { sku: 'OG1', name: 'American Revival', slug: 'american-revival' },
      },
    });

    render(
      <OgrProductEmailComposerModal
        open
        onClose={onClose}
        onSent={onSent}
        onDraftSaved={onDraftSaved}
        productId={PRODUCT_ID}
        productName="American Revival"
        cardHtml={CARD_HTML}
        draft={REVIEW_DRAFT}
      />,
    );

    const intro = document.getElementById('ogr-email-intro') as HTMLTextAreaElement;
    await user.clear(intro);
    await user.type(intro, 'Custom intro for Tony.');
    const closing = document.getElementById('ogr-email-closing') as HTMLTextAreaElement;
    await user.clear(closing);
    await user.type(closing, 'Custom closing.');
    const subject = document.getElementById('ogr-email-subject') as HTMLInputElement;
    await user.clear(subject);
    await user.type(subject, 'Old Guys Rule — Beach Cruiser');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(updateAgentProductOutreachDraftClientMock).toHaveBeenCalledOnce();
    });
    expect(updateAgentProductOutreachDraftClientMock).toHaveBeenCalledWith(DRAFT_ID, {
      to: 'buyer@example.com',
      toName: 'Tony',
      subject: 'Old Guys Rule — Beach Cruiser',
      introText: 'Custom intro for Tony.',
      closingText: 'Custom closing.',
    });
    expect(sendAgentProductOutreachDraftMock).not.toHaveBeenCalled();
    expect(sendOgrProductEmailMock).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDraftSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: DRAFT_ID,
        introText: 'Custom intro for Tony.',
        closingText: 'Custom closing.',
        subject: 'Old Guys Rule — Beach Cruiser',
      }),
    );
    expect(screen.getByText('Review Product Email')).toBeInTheDocument();
  });

  it('blocks save draft when recipient email is invalid', async () => {
    const user = userEvent.setup();
    const onDraftSaved = vi.fn();
    renderModal({ draft: REVIEW_DRAFT, onDraftSaved });

    const to = screen.getByPlaceholderText('buyer@store.com');
    await user.clear(to);
    await user.type(to, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(updateAgentProductOutreachDraftClientMock).not.toHaveBeenCalled();
    expect(onDraftSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/recipient email/i);
  });
});
