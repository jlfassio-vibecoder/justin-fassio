import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '@/hooks/useAuth';
import type { Profile } from '@/types/database';
import type { User } from '@supabase/supabase-js';

const reloadProfile = vi.fn(async () => {});
const updateStaffDisplayNameMock = vi.fn();
const requestStaffEmailChangeMock = vi.fn();
const updateStaffPasswordMock = vi.fn();
const uploadStaffAvatarMock = vi.fn();
const removeStaffAvatarMock = vi.fn();
const createStaffAvatarSignedUrlMock = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/staffAccount', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staffAccount')>('@/lib/staffAccount');
  return {
    ...actual,
    createStaffAvatarSignedUrl: (...args: unknown[]) => createStaffAvatarSignedUrlMock(...args),
    updateStaffDisplayName: (...args: unknown[]) => updateStaffDisplayNameMock(...args),
    requestStaffEmailChange: (...args: unknown[]) => requestStaffEmailChangeMock(...args),
    updateStaffPassword: (...args: unknown[]) => updateStaffPasswordMock(...args),
    uploadStaffAvatar: (...args: unknown[]) => uploadStaffAvatarMock(...args),
    removeStaffAvatar: (...args: unknown[]) => removeStaffAvatarMock(...args),
  };
});

import { useAuth } from '@/hooks/useAuth';
import { StaffAccountPage } from '@/components/staff/StaffAccountPage';

const mockedUseAuth = vi.mocked(useAuth);

function profile(partial: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    email: 'alex@example.com',
    display_name: 'Alex Rivera',
    avatar_path: null,
    role: 'rep',
    status: 'approved',
    prospect_id: null,
    wholesale_pricing_unlocked: false,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

function stubAuth(partial: Partial<AuthState> = {}) {
  mockedUseAuth.mockReturnValue({
    loading: false,
    session: { access_token: 'tok' } as AuthState['session'],
    user: { id: 'u1', email: 'alex@example.com' } as User,
    profile: profile(),
    configured: true,
    reloadProfile,
    ...partial,
  });
}

describe('StaffAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStaffAvatarSignedUrlMock.mockResolvedValue(null);
    stubAuth();
  });

  it('saves a display name and reloads the profile', async () => {
    const user = userEvent.setup();
    updateStaffDisplayNameMock.mockResolvedValue({ ok: true });
    render(<StaffAccountPage />);

    const nameInput = screen.getByDisplayValue('Alex Rivera');
    await user.clear(nameInput);
    await user.type(nameInput, 'Sam Lee');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(updateStaffDisplayNameMock).toHaveBeenCalledWith(
        'Sam Lee',
        expect.arrayContaining(['alex@example.com']),
      );
      expect(reloadProfile).toHaveBeenCalled();
    });
    expect(screen.getByText('Display name saved')).toBeInTheDocument();
  });

  it('shows a pending email confirmation without treating it as current login', () => {
    stubAuth({
      user: {
        id: 'u1',
        email: 'alex@example.com',
        new_email: 'next@example.com',
      } as User,
    });
    render(<StaffAccountPage />);
    expect(screen.getByText(/Current login: alex@example.com/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Confirmation sent to next@example.com. Current login stays alex@example.com until confirmed.',
      ),
    ).toBeInTheDocument();
  });

  it('requests an email change then reloads', async () => {
    const user = userEvent.setup();
    requestStaffEmailChangeMock.mockResolvedValue({ ok: true });
    render(<StaffAccountPage />);
    await user.type(
      document.querySelector('input[type="email"]') as HTMLInputElement,
      'next@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Update email' }));
    await waitFor(() => {
      expect(requestStaffEmailChangeMock).toHaveBeenCalledWith('next@example.com');
      expect(reloadProfile).toHaveBeenCalled();
    });
  });

  it('updates password after matching confirm', async () => {
    const user = userEvent.setup();
    updateStaffPasswordMock.mockResolvedValue({ ok: true });
    render(<StaffAccountPage />);
    const [password, confirm] = document.querySelectorAll('input[type="password"]');
    await user.type(password as HTMLInputElement, 'longenough');
    await user.type(confirm as HTMLInputElement, 'longenough');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(updateStaffPasswordMock).toHaveBeenCalledWith('longenough', 'longenough');
    });
    expect(screen.getByText('Password updated')).toBeInTheDocument();
  });

  it('uses initials when there is no signed avatar URL', async () => {
    render(<StaffAccountPage />);
    await waitFor(() => {
      expect(createStaffAvatarSignedUrlMock).toHaveBeenCalledWith(null);
    });
    expect(screen.getByText('AR')).toBeInTheDocument();
  });

  it('removes an existing avatar and reloads', async () => {
    const user = userEvent.setup();
    stubAuth({ profile: profile({ avatar_path: 'u1/avatar.png' }) });
    createStaffAvatarSignedUrlMock.mockResolvedValue('https://example.com/signed');
    removeStaffAvatarMock.mockResolvedValue({ ok: true });
    render(<StaffAccountPage />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(removeStaffAvatarMock).toHaveBeenCalled();
      expect(reloadProfile).toHaveBeenCalled();
    });
  });
});
