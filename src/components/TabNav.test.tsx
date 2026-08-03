import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabNav } from '@/components/TabNav';

describe('TabNav', () => {
  it('renders sku, prospect, active account, and contact counts', () => {
    render(
      <TabNav
        activeTab="catalog"
        onChange={() => {}}
        totalSkuCount={190}
        prospectTotalCount={240}
        accountTotalCount={9}
        contactTotalCount={14}
      />,
    );

    expect(screen.getByText('190')).toBeInTheDocument();
    expect(screen.getByText('240')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active Accounts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contacts/i })).toBeInTheDocument();
  });

  it('notifies parent when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TabNav
        activeTab="catalog"
        onChange={onChange}
        totalSkuCount={190}
        prospectTotalCount={240}
        accountTotalCount={9}
        contactTotalCount={14}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'PMF Dashboard' }));
    expect(onChange).toHaveBeenCalledWith('dashboard');

    await user.click(screen.getByRole('button', { name: /Active Accounts/i }));
    expect(onChange).toHaveBeenCalledWith('accounts');

    await user.click(screen.getByRole('button', { name: /Contacts/i }));
    expect(onChange).toHaveBeenCalledWith('contacts');
  });
});
