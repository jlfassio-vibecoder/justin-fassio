import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabNav } from '@/components/TabNav';

describe('TabNav', () => {
  it('renders sku and prospect counts', () => {
    render(
      <TabNav
        activeTab="catalog"
        onChange={() => {}}
        totalSkuCount={190}
        prospectTotalCount={249}
      />,
    );

    expect(screen.getByText('190')).toBeInTheDocument();
    expect(screen.getByText('249')).toBeInTheDocument();
  });

  it('notifies parent when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TabNav
        activeTab="catalog"
        onChange={onChange}
        totalSkuCount={190}
        prospectTotalCount={249}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'PMF Dashboard' }));
    expect(onChange).toHaveBeenCalledWith('dashboard');
  });
});
