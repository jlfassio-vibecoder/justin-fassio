import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowActionsMenu, type RowActionSection } from '@/components/ui/RowActionsMenu';

const SECTIONS: RowActionSection[] = [
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'open', label: 'Open details', onSelect: vi.fn() },
      { id: 'log-call', label: 'Log call', onSelect: vi.fn() },
    ],
  },
  {
    id: 'ai',
    label: 'AI tools',
    items: [{ id: 'verify', label: 'Verify & Update', onSelect: vi.fn() }],
  },
];

describe('RowActionsMenu', () => {
  it('opens a portal menu, runs item callback, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const sections: RowActionSection[] = [
      {
        id: 'account',
        label: 'Account',
        items: [{ id: 'open', label: 'Open details', onSelect: onOpen }],
      },
    ];

    const { container } = render(
      <div className="overflow-auto" data-testid="scroll-parent">
        <RowActionsMenu label="Actions for Test Store" sections={sections} />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Test Store' }));

    const menu = screen.getByRole('menu', { name: 'Actions for Test Store' });
    expect(menu).toBeTruthy();
    expect(container.querySelector('[data-testid="scroll-parent"]')?.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);

    await user.click(within(menu).getByRole('menuitem', { name: 'Open details' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Actions for Test Store' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Test Store' })).toHaveFocus();
  });

  it('renders section headings and disables items with a reason', async () => {
    const user = userEvent.setup();
    const onDisabled = vi.fn();
    const sections: RowActionSection[] = [
      {
        id: 'ai',
        label: 'AI tools',
        items: [
          {
            id: 'brief',
            label: 'Generate Account Brief',
            onSelect: onDisabled,
            disabled: true,
            disabledReason: 'Needs a website',
          },
          ...SECTIONS[1].items,
        ],
      },
    ];

    render(<RowActionsMenu label="Actions for Disabled" sections={sections} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Disabled' }));

    expect(screen.getByText('AI tools')).toBeTruthy();
    const disabled = screen.getByRole('menuitem', { name: 'Generate Account Brief' });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('title', 'Needs a website');
    await user.click(disabled);
    expect(onDisabled).not.toHaveBeenCalled();
  });
});
