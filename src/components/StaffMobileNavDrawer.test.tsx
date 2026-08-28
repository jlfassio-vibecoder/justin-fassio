import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffMobileNavDrawer } from '@/components/StaffMobileNavDrawer';
import type { LinePortfolio } from '@/lib/lines';
import { STAFF_TABS } from '@/lib/staffTabs';

const lines: LinePortfolio[] = [
  {
    id: 'line-ogr',
    code: 'ogr',
    name: 'Old Guys Rule',
    status: 'active',
    active: true,
    sortOrder: 10,
    tagline: null,
    description: null,
    heroImagePath: null,
    heroImageUrl: null,
    publicShowroomPath: null,
    defaultCurrency: 'USD',
  },
  {
    id: 'line-lis',
    code: 'living-in-sunshine',
    name: 'Living In Sunshine',
    status: 'onboarding',
    active: false,
    sortOrder: 20,
    tagline: null,
    description: null,
    heroImagePath: null,
    heroImageUrl: null,
    publicShowroomPath: null,
    defaultCurrency: 'USD',
  },
];

describe('StaffMobileNavDrawer', () => {
  it('renders lines and shared staff tabs when open', () => {
    render(
      <StaffMobileNavDrawer
        open
        onClose={vi.fn()}
        activeLine="living-in-sunshine"
        multiLineUi
        representedLines={lines}
        onSelectLine={vi.fn()}
        activeTab="briefing"
        onChangeTab={vi.fn()}
        totalSkuCount={1}
        prospectTotalCount={384}
        accountTotalCount={0}
        contactTotalCount={58}
        messagesNeedsMappingCount={5}
        onOpenMessages={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Living In Sunshine/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Old Guys Rule/i })).toBeInTheDocument();
    for (const tab of STAFF_TABS) {
      expect(
        screen.getByRole('button', {
          name: (_accessibleName, element) =>
            element.getAttribute('data-screen-label') === `mobile-tab-${tab.key}`,
        }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText('384')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('selecting a tab notifies parent and closes', async () => {
    const user = userEvent.setup();
    const onChangeTab = vi.fn();
    const onClose = vi.fn();

    render(
      <StaffMobileNavDrawer
        open
        onClose={onClose}
        activeLine="ogr"
        multiLineUi
        representedLines={lines}
        onSelectLine={vi.fn()}
        activeTab="briefing"
        onChangeTab={onChangeTab}
        totalSkuCount={0}
        prospectTotalCount={0}
        accountTotalCount={0}
        contactTotalCount={0}
        onOpenMessages={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Prospect Directory/i }));
    expect(onChangeTab).toHaveBeenCalledWith('prospects');
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting a line notifies parent and closes', async () => {
    const user = userEvent.setup();
    const onSelectLine = vi.fn();
    const onClose = vi.fn();

    render(
      <StaffMobileNavDrawer
        open
        onClose={onClose}
        activeLine="ogr"
        multiLineUi
        representedLines={lines}
        onSelectLine={onSelectLine}
        activeTab="briefing"
        onChangeTab={vi.fn()}
        totalSkuCount={0}
        prospectTotalCount={0}
        accountTotalCount={0}
        contactTotalCount={0}
        onOpenMessages={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Living In Sunshine/i }));
    expect(onSelectLine).toHaveBeenCalledWith('living-in-sunshine');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <StaffMobileNavDrawer
        open={false}
        onClose={vi.fn()}
        activeLine="ogr"
        activeTab="briefing"
        onChangeTab={vi.fn()}
        totalSkuCount={0}
        prospectTotalCount={0}
        accountTotalCount={0}
        contactTotalCount={0}
        onOpenMessages={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
