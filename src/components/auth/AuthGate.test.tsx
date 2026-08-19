import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '@/hooks/useAuth';
import type { Profile } from '@/types/database';

const replaceMock = vi.fn();
const signOutMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/RepCommandCenter', () => ({
  RepCommandCenter: () => <div>Rep Command Center</div>,
}));

vi.mock('@/components/ProspectiveLinesWorkspace', () => ({
  ProspectiveLinesWorkspace: () => <div>Prospective Lines Workspace</div>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: () => signOutMock(),
      getSession: () =>
        Promise.resolve({
          data: { session: { access_token: 'tok' } },
          error: null,
        }),
    },
    from: () => ({
      select: () => ({
        neq: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/staffAccount', () => ({
  createStaffAvatarSignedUrl: vi.fn().mockResolvedValue(null),
  staffAccountInitials: () => 'JF',
}));

vi.mock('@/components/staff/StaffAccountPage', () => ({
  StaffAccountPage: () => <div>Staff Account</div>,
}));

import { useAuth } from '@/hooks/useAuth';
import { AuthGate } from '@/components/auth/AuthGate';

const mockedUseAuth = vi.mocked(useAuth);

function baseProfile(partial: Partial<Profile>): Profile {
  return {
    id: 'u1',
    email: 'user@example.com',
    display_name: 'User',
    role: 'rep',
    status: 'pending',
    prospect_id: null,
    wholesale_pricing_unlocked: false,
    avatar_path: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

function stubAuth(partial: Partial<AuthState>) {
  mockedUseAuth.mockReturnValue({
    loading: false,
    session: null,
    user: null,
    profile: null,
    configured: true,
    reloadProfile: vi.fn(async () => {}),
    ...partial,
  });
}

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          features: {
            FEATURE_MULTI_LINE_UI: false,
            FEATURE_MULTI_LINE_WRITES: false,
            FEATURE_MULTI_LINE_AI: false,
            FEATURE_LINE_TERRITORY_ADMIN: false,
            FEATURE_EAGLE_PEAK_SELLING: false,
            FEATURE_EAGLE_PEAK_OUTREACH: false,
            FEATURE_BIG_FISH_SELLING: false,
            FEATURE_BIG_FISH_OUTREACH: false,
            FEATURE_PROSPECTIVE_LINES: false,
          },
        }),
      }),
    );
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/app',
        search: '',
        replace: replaceMock,
        href: '',
      },
    });
  });

  it('redirects unauthenticated users to /rep-login', async () => {
    stubAuth({ loading: false, session: null, configured: true });
    render(<AuthGate />);
    expect(screen.getByText('Redirecting to sign in…')).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/rep-login');
    });
  });

  it('shows pending approval for unapproved reps', () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'rep@example.com' } as AuthState['user'],
      profile: baseProfile({
        email: 'rep@example.com',
        role: 'rep',
        status: 'pending',
      }),
    });
    render(<AuthGate />);
    expect(screen.getByText('Account pending review')).toBeInTheDocument();
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
  });

  it('shows access denied for rejected accounts', () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'rep@example.com' } as AuthState['user'],
      profile: baseProfile({ role: 'rep', status: 'rejected' }),
    });
    render(<AuthGate />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
  });

  it('sends buyer sessions to the wrong-portal screen', () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'buyer@example.com' } as AuthState['user'],
      profile: baseProfile({
        email: 'buyer@example.com',
        role: 'buyer',
        status: 'approved',
      }),
    });
    render(<AuthGate />);
    expect(screen.getByText('Buyer account')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to retailer account' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
  });

  it('renders the app for an approved rep', async () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'justin@example.com' } as AuthState['user'],
      profile: baseProfile({
        email: 'justin@example.com',
        display_name: 'Justin',
        role: 'rep',
        status: 'approved',
      }),
    });
    render(<AuthGate />);
    expect(await screen.findByText('Rep Command Center')).toBeInTheDocument();
    expect(screen.getByText('justin@example.com')).toBeInTheDocument();
    expect(screen.getByText('rep')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wholesale buyers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pending reps' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/app/account');
  });

  it('renders the account page without the command center', async () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'justin@example.com' } as AuthState['user'],
      profile: baseProfile({
        email: 'justin@example.com',
        display_name: 'Justin',
        role: 'rep',
        status: 'approved',
      }),
    });
    render(<AuthGate page="account" />);
    expect(await screen.findByText('Staff Account')).toBeInTheDocument();
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Command Center' })).toHaveAttribute('href', '/app');
  });

  it('renders the app for an approved owner', async () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'office@example.com' } as AuthState['user'],
      profile: baseProfile({
        email: 'office@example.com',
        role: 'owner',
        status: 'approved',
      }),
    });
    render(<AuthGate />);
    expect(await screen.findByText('Rep Command Center')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending reps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wholesale buyers' })).toBeInTheDocument();
  });

  it('signs out and returns home from the approved app shell', async () => {
    const user = userEvent.setup();
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'justin@example.com' } as AuthState['user'],
      profile: baseProfile({ role: 'owner', status: 'approved' }),
    });
    render(<AuthGate />);
    expect(await screen.findByText('Rep Command Center')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
      expect(window.location.href).toBe('/');
    });
  });

  it('redirects prospective URLs to /app when the snapshot is off', async () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'office@example.com' } as AuthState['user'],
      profile: baseProfile({ role: 'owner', status: 'approved' }),
    });
    render(<AuthGate page="prospective" />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
    expect(screen.queryByText('Prospective Lines Workspace')).not.toBeInTheDocument();
  });

  it('forbids non-owners on prospective URLs when the snapshot is on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          features: {
            FEATURE_MULTI_LINE_UI: true,
            FEATURE_MULTI_LINE_WRITES: false,
            FEATURE_MULTI_LINE_AI: false,
            FEATURE_LINE_TERRITORY_ADMIN: false,
            FEATURE_EAGLE_PEAK_SELLING: false,
            FEATURE_EAGLE_PEAK_OUTREACH: false,
            FEATURE_BIG_FISH_SELLING: false,
            FEATURE_BIG_FISH_OUTREACH: false,
            FEATURE_PROSPECTIVE_LINES: true,
          },
        }),
      }),
    );
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'rep@example.com' } as AuthState['user'],
      profile: baseProfile({ role: 'rep', status: 'approved' }),
    });
    render(<AuthGate page="prospective" />);
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    expect(screen.queryByText('Prospective Lines Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
  });

  it('renders the prospective workspace for an owner when the snapshot is on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          features: {
            FEATURE_MULTI_LINE_UI: true,
            FEATURE_MULTI_LINE_WRITES: false,
            FEATURE_MULTI_LINE_AI: false,
            FEATURE_LINE_TERRITORY_ADMIN: false,
            FEATURE_EAGLE_PEAK_SELLING: false,
            FEATURE_EAGLE_PEAK_OUTREACH: false,
            FEATURE_BIG_FISH_SELLING: false,
            FEATURE_BIG_FISH_OUTREACH: false,
            FEATURE_PROSPECTIVE_LINES: true,
          },
        }),
      }),
    );
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'office@example.com' } as AuthState['user'],
      profile: baseProfile({ role: 'owner', status: 'approved' }),
    });
    render(<AuthGate page="prospective" />);
    expect(await screen.findByText('Prospective Lines Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Rep Command Center')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prospective Lines' })).toHaveAttribute(
      'href',
      '/app/prospective-lines',
    );
  });
});
