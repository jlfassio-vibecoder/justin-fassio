import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const signInWithOtpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      signUp: (...args: unknown[]) => signUpMock(...args),
    },
  },
}));

import { LoginForm } from '@/components/auth/LoginForm';

function emailInput() {
  return document.querySelector('input[type="email"]') as HTMLInputElement;
}

function passwordInput() {
  return document.querySelector('input[type="password"]') as HTMLInputElement;
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: null } });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'http://localhost:4321',
        replace: replaceMock,
        href: '',
        search: '',
      },
    });
  });

  it('shows magic-link success message on login', async () => {
    const user = userEvent.setup();
    signInWithOtpMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    await user.type(emailInput(), 'rep@example.com');
    await user.click(screen.getByRole('button', { name: 'Send login link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email for a sign-in link.')).toBeInTheDocument();
    });
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'rep@example.com',
      options: {
        emailRedirectTo: 'http://localhost:4321/app',
        shouldCreateUser: false,
      },
    });
  });

  it('surfaces magic-link auth errors', async () => {
    const user = userEvent.setup();
    signInWithOtpMock.mockResolvedValue({ error: { message: 'Rate limit' } });
    render(<LoginForm />);

    await user.type(emailInput(), 'rep@example.com');
    await user.click(screen.getByRole('button', { name: 'Send login link' }));

    await waitFor(() => {
      expect(screen.getByText('Rate limit')).toBeInTheDocument();
    });
  });

  it('redirects to /app after password sign-in', async () => {
    const user = userEvent.setup();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Password' }));
    await user.type(emailInput(), 'rep@example.com');
    await user.type(passwordInput(), 'secret12');
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
  });

  it('shows pending-approval message after register without session', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(emailInput(), 'new@example.com');
    await user.type(passwordInput(), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Account created. Confirm your email if required — access stays pending until Justin approves you./,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe('LoginForm unconfigured', () => {
  it('renders configuration guidance without throwing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: {
        auth: {
          getSession: vi.fn(),
        },
      },
    }));
    const { LoginForm: UnconfiguredLoginForm } = await import('@/components/auth/LoginForm');
    render(<UnconfiguredLoginForm />);
    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});
