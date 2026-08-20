import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WholesaleBuyerForm } from '@/components/wholesale/WholesaleBuyerForm';

const draft = { lines: [], updatedAt: '2026-08-19T00:00:00.000Z' };

describe('WholesaleBuyerForm', () => {
  it('keeps Canadian province and GST/HST copy on the unprefixed route', () => {
    render(<WholesaleBuyerForm draft={draft} onSuccess={() => undefined} publicMarket="ca" />);
    expect(screen.getByText(/Province/)).toBeInTheDocument();
    expect(screen.getByText(/Postal code/)).toBeInTheDocument();
    expect(screen.getByText(/GST\/HST number/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BC' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Oregon' })).toBeNull();
  });

  it('offers Oregon and Washington without Canadian tax or province copy on the U.S. route', () => {
    const { container } = render(
      <WholesaleBuyerForm draft={draft} onSuccess={() => undefined} publicMarket="us" />,
    );
    expect(screen.getByText(/^State/)).toBeInTheDocument();
    expect(screen.getByText(/ZIP code/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Oregon' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Washington' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'BC' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'AB' })).toBeNull();
    expect(screen.queryByText(/GST\/HST/)).toBeNull();
    expect(screen.queryByText(/Province/)).toBeNull();
    expect(screen.queryByText(/Postal code/)).toBeNull();
    expect(container.textContent).not.toMatch(/Typical Canadian retail/);
    expect(container.textContent).not.toMatch(/C\$/);
    expect(container.textContent).not.toMatch(/GST\/PST/);
  });
});
