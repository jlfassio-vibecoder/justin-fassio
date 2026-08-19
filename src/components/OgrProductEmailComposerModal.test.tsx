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

vi.mock('@/lib/sendOgrProductEmailClient', () => ({
  sendOgrProductEmail: (...args: unknown[]) => sendOgrProductEmailMock(...args),
}));

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CARD_HTML = '<table data-ogr-card="1"><tr><td>American Revival</td></tr></table>';

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
});
