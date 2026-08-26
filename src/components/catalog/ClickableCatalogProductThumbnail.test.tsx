import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClickableCatalogProductThumbnail } from '@/components/catalog/ClickableCatalogProductThumbnail';

describe('ClickableCatalogProductThumbnail', () => {
  it('stops row click propagation and opens preview', async () => {
    const user = userEvent.setup();
    const rowClick = vi.fn();
    render(
      <div role="button" tabIndex={0} onClick={rowClick}>
        <ClickableCatalogProductThumbnail
          src="https://cdn.example.com/og2511.jpg"
          sku="OG2511"
          name="AMERICAN DREAM"
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'View larger image of AMERICAN DREAM' }));
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'OG2511 — AMERICAN DREAM' })).toBeInTheDocument();
  });
});
