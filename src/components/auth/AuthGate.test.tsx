import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '@/hooks/useAuth';

const replaceMock = vi.fn();
const signOutMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/RepCommandCenter', () => ({
  RepCommandCenter: () => <div>Rep Command Center</div>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: () => signOutMock(),
    },
  },
}));

import { useAuth } from '@/hooks/useAuth';
import { AuthGate } from '@/components/auth/AuthGate';

const mockedUseAuth = vi.mocked(useAuth);

function stubAuth(partial: Partial<AuthState>) {
  mockedUseAuth.mockReturnValue({
    loading: false,
    session: null,
    user: null,
    profile: null,
    configured: true,
    ...partial,
  });
}

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, replace: replaceMock, href: '' },
    });
  });

  it('redirects unauthenticated users to /login', async () => {
    stubAuth({ loading: false, session: null, configured: true });
    render(<AuthGate />);
    expect(screen.getByText('Redirecting to sign in…')).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('renders the app when a session exists', () => {
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'justin@example.com' } as AuthState['user'],
      profile: {
        id: 'u1',
        email: 'justin@example.com',
        display_name: 'Justin',
        role: 'rep',
        created_at: '',
        updated_at: '',
      },
    });
    render(<AuthGate />);
    expect(screen.getByText('Rep Command Center')).toBeInTheDocument();
    expect(screen.getByText('justin@example.com')).toBeInTheDocument();
    expect(screen.getByText('rep')).toBeInTheDocument();
  });

  it('signs out and returns home', async () => {
    const user = userEvent.setup();
    stubAuth({
      session: { access_token: 'tok' } as AuthState['session'],
      user: { email: 'buyer@example.com' } as AuthState['user'],
      profile: null,
    });
    render(<AuthGate />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
      expect(window.location.href).toBe('/');
    });
  });
});
