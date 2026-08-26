import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductImagePreviewOverlay } from '@/components/ui/ProductImagePreviewOverlay';

describe('ProductImagePreviewOverlay', () => {
  it('renders enlarged image and title when open', () => {
    render(
      <ProductImagePreviewOverlay
        open
        src="https://cdn.example.com/shirt.jpg"
        title="OG2431 — THE BEAR"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'OG2431 — THE BEAR' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'OG2431 — THE BEAR' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/shirt.jpg',
    );
  });

  it('closes on Escape and backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ProductImagePreviewOverlay
        open
        src="https://cdn.example.com/shirt.jpg"
        title="OG2431 — THE BEAR"
        onClose={onClose}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    const { container } = render(
      <ProductImagePreviewOverlay
        open
        src="https://cdn.example.com/shirt.jpg"
        title="OG2431 — THE BEAR"
        onClose={onClose}
      />,
    );
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
