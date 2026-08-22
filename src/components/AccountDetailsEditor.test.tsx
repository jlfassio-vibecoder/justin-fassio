import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDetailsEditor } from '@/components/AccountDetailsEditor';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

const updateProspectAccountDetailsMock = vi.hoisted(() => vi.fn());
const fetchOperationalLineAccountMock = vi.hoisted(() => vi.fn());
const fetchStoreTerritoriesMock = vi.hoisted(() => vi.fn());
const fetchOperationalTerritoriesMock = vi.hoisted(() => vi.fn());
const suggestOpsMock = vi.hoisted(() => vi.fn());

const STORE_TERRITORIES = [
  {
    id: '00000000-0000-4000-8000-0000000000bc',
    code: 'bc',
    name: 'British Columbia',
    countryCode: 'CA',
    sortOrder: 10,
    active: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000ab',
    code: 'ab',
    name: 'Alberta',
    countryCode: 'CA',
    sortOrder: 20,
    active: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000ca',
    code: 'ca',
    name: 'California',
    countryCode: 'US',
    sortOrder: 30,
    active: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000or',
    code: 'or',
    name: 'Oregon',
    countryCode: 'US',
    sortOrder: 40,
    active: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000wa',
    code: 'wa',
    name: 'Washington',
    countryCode: 'US',
    sortOrder: 50,
    active: true,
  },
];

vi.mock('@/lib/updateProspectAccountDetails', async () => {
  const actual = await vi.importActual<typeof import('@/lib/updateProspectAccountDetails')>(
    '@/lib/updateProspectAccountDetails',
  );
  return {
    ...actual,
    updateProspectAccountDetails: (...args: unknown[]) => updateProspectAccountDetailsMock(...args),
  };
});

vi.mock('@/lib/retailerLineAccounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerLineAccounts')>(
    '@/lib/retailerLineAccounts',
  );
  return {
    ...actual,
    fetchOperationalLineAccount: (...args: unknown[]) => fetchOperationalLineAccountMock(...args),
  };
});

vi.mock('@/lib/territories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/territories')>('@/lib/territories');
  return {
    ...actual,
    fetchStoreTerritories: (...args: unknown[]) => fetchStoreTerritoriesMock(...args),
  };
});

vi.mock('@/lib/operationalTerritories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/operationalTerritories')>(
    '@/lib/operationalTerritories',
  );
  return {
    ...actual,
    fetchOperationalTerritories: (...args: unknown[]) => fetchOperationalTerritoriesMock(...args),
    suggestOperationalTerritoryForAccount: (...args: unknown[]) => suggestOpsMock(...args),
  };
});

const OPS_TERRITORIES = [
  { id: 'ops-pnw-west', code: 'pnw-west' as const, name: 'PNW West' },
  { id: 'ops-pnw-east', code: 'pnw-east' as const, name: 'PNW East' },
  { id: 'ops-norcal-coastal', code: 'norcal-coastal' as const, name: 'NorCal Coastal' },
];

function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 7,
    name: 'Test Shop',
    category: 'golf_retail',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1 Main',
    phone: '250-555-0100',
    fit: 'Fit note',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
    ...overrides,
  };
}

describe('AccountDetailsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProspectAccountDetailsMock.mockResolvedValue({
      ok: true,
      data: makeProspect({ name: 'Saved Shop' }),
      auditWarning: null,
    });
    fetchOperationalLineAccountMock.mockResolvedValue({ data: null, error: null });
    fetchStoreTerritoriesMock.mockResolvedValue({ data: STORE_TERRITORIES, error: null });
    fetchOperationalTerritoriesMock.mockResolvedValue({ data: OPS_TERRITORIES, error: null });
    suggestOpsMock.mockReturnValue({ ok: false, reason: 'missing_zip_or_county' });
    window.confirm = vi.fn(() => true);
  });

  it('shows operational territory separately from store territory', () => {
    render(
      <AccountDetailsEditor
        prospect={makeProspect({
          operationalTerritoryId: 'ops-pnw-west',
          operationalTerritoryName: 'PNW West',
        })}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Store territory')).toBeInTheDocument();
    expect(screen.getByText('Operational territory')).toBeInTheDocument();
    expect(screen.getByText('PNW West')).toBeInTheDocument();
  });

  it('labels Region and Store territory; excludes Northern California', async () => {
    const user = userEvent.setup();
    render(<AccountDetailsEditor prospect={makeProspect()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByLabelText('Store territory')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchStoreTerritoriesMock).toHaveBeenCalled();
    });
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['British Columbia', 'Alberta', 'California', 'Oregon', 'Washington']);
    expect(options).not.toContain('Northern California');
  });

  it('labels the region field Region and saves identity changes', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<AccountDetailsEditor prospect={makeProspect()} onSaved={onSaved} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Region')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Test Shop');
    await user.clear(nameInput);
    await user.type(nameInput, 'Saved Shop');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateProspectAccountDetailsMock).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Saved Shop' }));
    });
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('applies region store-territory suggestion only after explicit confirm click', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <AccountDetailsEditor
        prospect={makeProspect({ region: 'Okanagan', territoryCode: 'bc' })}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(fetchStoreTerritoriesMock).toHaveBeenCalled());

    const regionInput = screen.getByDisplayValue('Okanagan');
    fireEvent.change(regionInput, { target: { value: 'Oregon' } });

    expect(
      await screen.findByRole('button', { name: 'Apply suggested store territory' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateProspectAccountDetailsMock).toHaveBeenCalled());
    const firstDraft = updateProspectAccountDetailsMock.mock.calls[0]?.[1] as {
      territoryId: string;
    };
    expect(firstDraft.territoryId).toBe(BC_PROSPECT_TERRITORY.territoryId);

    updateProspectAccountDetailsMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(fetchStoreTerritoriesMock).toHaveBeenCalled());
    fireEvent.change(screen.getByDisplayValue('Okanagan'), { target: { value: 'Oregon' } });
    await user.click(screen.getByRole('button', { name: 'Apply suggested store territory' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateProspectAccountDetailsMock).toHaveBeenCalled());
    const appliedDraft = updateProspectAccountDetailsMock.mock.calls[0]?.[1] as {
      territoryId: string;
      region: string;
      city: string;
    };
    expect(appliedDraft.territoryId).toBe('00000000-0000-4000-8000-0000000000or');
    expect(appliedDraft.region).toBe('Oregon');
    expect(appliedDraft.city).toBe('Kelowna');
  });

  it('does not confirm for fit-only edits on a protected account', async () => {
    const user = userEvent.setup();
    render(
      <AccountDetailsEditor prospect={makeProspect({ importProtected: true })} onSaved={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const fitInput = screen.getByDisplayValue('Fit note');
    await user.clear(fitInput);
    await user.type(fitInput, 'Only fit');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateProspectAccountDetailsMock).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('confirms when a protected identity field changes', async () => {
    const user = userEvent.setup();
    render(
      <AccountDetailsEditor
        prospect={makeProspect({ verificationStatus: 'verified' })}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByDisplayValue('Test Shop');
    await user.clear(nameInput);
    await user.type(nameInput, 'Protected Rename');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await waitFor(() => expect(updateProspectAccountDetailsMock).toHaveBeenCalled());
  });

  it('surfaces auditWarning without treating save as failure', async () => {
    const user = userEvent.setup();
    updateProspectAccountDetailsMock.mockResolvedValue({
      ok: true,
      data: makeProspect({ name: 'Warned Shop' }),
      auditWarning: 'Account saved, but the change log could not be written: boom',
    });

    render(<AccountDetailsEditor prospect={makeProspect()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByDisplayValue('Test Shop');
    fireEvent.change(nameInput, { target: { value: 'Warned Shop' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/change log could not be written/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides ops assign/suggest on BC and allows clear of existing assignment', async () => {
    const user = userEvent.setup();
    render(
      <AccountDetailsEditor
        prospect={makeProspect({
          operationalTerritoryId: 'ops-pnw-west',
          operationalTerritoryCode: 'pnw-west',
          operationalTerritoryName: 'PNW West',
        })}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(fetchOperationalTerritoriesMock).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Apply suggested operational territory' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear operational territory' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Operational territory')).not.toBeInstanceOf(HTMLSelectElement);
  });

  it('applies ops suggestion to draft only until Save', async () => {
    const user = userEvent.setup();
    suggestOpsMock.mockReturnValue({
      ok: true,
      territoryCode: 'pnw-west',
      matchedBy: 'zip',
    });
    render(
      <AccountDetailsEditor
        prospect={makeProspect({
          territoryId: '00000000-0000-4000-8000-0000000000wa',
          territoryCode: 'wa',
          territoryName: 'Washington',
          postalCode: '98101',
        })}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(fetchOperationalTerritoriesMock).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Apply suggested operational territory' }),
    ).toBeInTheDocument();
    expect(updateProspectAccountDetailsMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply suggested operational territory' }));
    expect(updateProspectAccountDetailsMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateProspectAccountDetailsMock).toHaveBeenCalled());
    const draft = updateProspectAccountDetailsMock.mock.calls[0]?.[1] as {
      operationalTerritoryId: string | null;
    };
    expect(draft.operationalTerritoryId).toBe('ops-pnw-west');
  });
});
