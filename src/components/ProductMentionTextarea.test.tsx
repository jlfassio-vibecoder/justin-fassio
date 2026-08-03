import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ProductMentionTextarea } from '@/components/ProductMentionTextarea';
import type { CatalogItem } from '@/lib/catalog';
import { useState } from 'react';

const ITEMS: CatalogItem[] = [
  {
    page: 1,
    cat: 'Tees',
    sku: 'OG2511',
    name: 'Old Guys Rule Classic Tee',
    color: 'Navy',
    tagline: '',
    priceUsd: 12.5,
    msrpCad: 42,
    isNew: false,
    isNameDrop: true,
  },
  {
    page: 2,
    cat: 'Tees',
    sku: 'OG2599',
    name: 'Harbor Graphic Tee',
    color: 'White',
    tagline: '',
    priceUsd: 14,
    msrpCad: 48,
    isNew: true,
    isNameDrop: false,
  },
];

function Harness() {
  const [value, setValue] = useState('');
  return (
    <ProductMentionTextarea aria-label="Notes" value={value} onChange={setValue} items={ITEMS} />
  );
}

describe('ProductMentionTextarea', () => {
  it('inserts formatted product on Enter after #query', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Notes');
    await user.type(field, '#Classic');
    expect(await screen.findByRole('option', { name: /OG2511/i })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(field).toHaveValue('Old Guys Rule Classic Tee (SKU: OG2511) ');
  });
});
