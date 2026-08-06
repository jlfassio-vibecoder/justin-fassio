import { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '@/components/auth/auth-context';
import type { Profile } from '@/types/database';

const { getSessionMock, onAuthStateChangeMock, maybeSingleMock, fromMock, unsubscribeMock } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      getSessionMock: vi.fn(),
      onAuthStateChangeMock: vi.fn(),
      maybeSingleMock,
      fromMock,
      unsubscribeMock: vi.fn(),
    };
  });

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
    from: fromMock,
  },
}));

import { AuthProvider } from '@/components/auth/AuthProvider';

function AuthProbe() {
  const auth = useContext(AuthContext);
  if (!auth) return <div>missing</div>;
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="configured">{String(auth.configured)}</span>
      <span data-testid="email">{auth.user?.email ?? ''}</span>
      <span data-testid="role">{auth.profile?.role ?? ''}</span>
      <span data-testid="status">{auth.profile?.status ?? ''}</span>
    </div>
  );
}

const PROFILE: Profile = {
  id: 'u1',
  email: 'owner@example.com',
  display_name: 'Owner',
  role: 'owner',
  status: 'approved',
  prospect_id: null,
  wholesale_pricing_unlocked: false,
  created_at: '',
  updated_at: '',
};

function sessionFor(email: string): Session {
  return {
    access_token: 'tok',
    refresh_token: 'ref',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u1', email } as Session['user'],
  } as Session;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    });
  });

  it('loads session and profile then clears loading', async () => {
    getSessionMock.mockResolvedValue({ data: { session: sessionFor('owner@example.com') } });
    maybeSingleMock.mockResolvedValue({ data: PROFILE, error: null });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('configured').textContent).toBe('true');
    expect(screen.getByTestId('email').textContent).toBe('owner@example.com');
    expect(screen.getByTestId('role').textContent).toBe('owner');
    expect(screen.getByTestId('status').textContent).toBe('approved');
  });

  it('TOKEN_REFRESHED updates session without hanging', async () => {
    let authListener: ((event: string, session: Session | null) => void) | undefined;
    getSessionMock.mockResolvedValue({ data: { session: sessionFor('a@example.com') } });
    maybeSingleMock.mockResolvedValue({ data: PROFILE, error: null });
    onAuthStateChangeMock.mockImplementation(
      (cb: (event: string, session: Session | null) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } };
      },
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    authListener?.('TOKEN_REFRESHED', sessionFor('refreshed@example.com'));

    await waitFor(() => {
      expect(screen.getByTestId('email').textContent).toBe('refreshed@example.com');
    });
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('unsubscribes on unmount', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});

describe('AuthProvider unconfigured', () => {
  it('exposes configured false without hanging on loading', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: {
        auth: {
          getSession: vi.fn(),
          onAuthStateChange: vi.fn(() => ({
            data: { subscription: { unsubscribe: vi.fn() } },
          })),
        },
        from: vi.fn(),
      },
    }));

    const { AuthProvider: UnconfiguredProvider } = await import('@/components/auth/AuthProvider');
    const { AuthContext: Ctx } = await import('@/components/auth/auth-context');

    function Probe() {
      const auth = useContext(Ctx);
      return (
        <div>
          <span data-testid="loading">{String(auth?.loading)}</span>
          <span data-testid="configured">{String(auth?.configured)}</span>
        </div>
      );
    }

    render(
      <UnconfiguredProvider>
        <Probe />
      </UnconfiguredProvider>,
    );

    expect(screen.getByTestId('configured').textContent).toBe('false');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
});
