import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

const { getUserMock, getSessionMock, updateUserMock, fromMock, createSignedUrlMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    getSessionMock: vi.fn(),
    updateUserMock: vi.fn(),
    fromMock: vi.fn(),
    createSignedUrlMock: vi.fn(),
  }),
);

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      getSession: getSessionMock,
      updateUser: updateUserMock,
    },
    from: fromMock,
    storage: {
      from: () => ({ createSignedUrl: createSignedUrlMock }),
    },
  },
}));

import {
  STAFF_AVATAR_MAX_BYTES,
  createStaffAvatarSignedUrl,
  isUsableStaffDisplayName,
  pendingAuthEmail,
  removeStaffAvatar,
  requestStaffEmailChange,
  staffAccountInitials,
  staffAvatarObjectPath,
  syncProfileEmailWithAuthUser,
  updateStaffDisplayName,
  updateStaffPassword,
  uploadStaffAvatar,
  validateStaffAvatarFile,
  validateStaffDisplayName,
  validateStaffPassword,
} from '@/lib/staffAccount';

function makeFile(type: string, size = 16, name = 'avatar.jpg'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('validateStaffDisplayName', () => {
  it('accepts a real name', () => {
    expect(validateStaffDisplayName('  Alex   Rivera  ')).toEqual({
      ok: true,
      displayName: 'Alex Rivera',
    });
  });

  it('rejects blank, emails, and mailbox local-parts', () => {
    expect(validateStaffDisplayName('   ').ok).toBe(false);
    expect(validateStaffDisplayName('alex@example.com').ok).toBe(false);
    expect(validateStaffDisplayName('office', ['office@justinfassio.com']).ok).toBe(false);
    expect(validateStaffDisplayName('Office').ok).toBe(false);
    expect(isUsableStaffDisplayName('office')).toBe(false);
    expect(isUsableStaffDisplayName('Alex Rivera')).toBe(true);
  });
});

describe('validateStaffPassword', () => {
  it('requires 8 characters and a matching confirm', () => {
    expect(validateStaffPassword('short', 'short').ok).toBe(false);
    expect(validateStaffPassword('longenough', 'different').ok).toBe(false);
    expect(validateStaffPassword('longenough', 'longenough')).toEqual({
      ok: true,
      password: 'longenough',
    });
  });
});

describe('pendingAuthEmail / initials', () => {
  it('reads user.new_email and skips unusable initials', () => {
    expect(pendingAuthEmail({ new_email: 'next@example.com' } as User)).toBe('next@example.com');
    expect(pendingAuthEmail({ email: 'a@example.com' } as User)).toBeNull();
    expect(staffAccountInitials('Alex Rivera')).toBe('AR');
    expect(staffAccountInitials('office', ['office@justinfassio.com'])).toBe('?');
    expect(staffAccountInitials('justinfassio@example.com')).toBe('?');
  });
});

describe('staffAvatarObjectPath / validateStaffAvatarFile', () => {
  it('keeps objects under the caller uid', () => {
    expect(staffAvatarObjectPath('user-1', 'image/png')).toBe('user-1/avatar.png');
    expect(staffAvatarObjectPath('user-1', 'image/webp')).toBe('user-1/avatar.webp');
    expect(staffAvatarObjectPath('user-1', 'image/jpeg')).toBe('user-1/avatar.jpg');
    expect(staffAvatarObjectPath('user-1', 'image/png')).not.toContain('user-2');
  });

  it('rejects unsupported types and oversized files', () => {
    expect(validateStaffAvatarFile(makeFile('image/gif')).ok).toBe(false);
    expect(validateStaffAvatarFile(makeFile('image/jpeg', STAFF_AVATAR_MAX_BYTES + 1)).ok).toBe(
      false,
    );
    expect(validateStaffAvatarFile(makeFile('image/png')).ok).toBe(true);
  });
});

describe('syncProfileEmailWithAuthUser', () => {
  it('does not write a pending or matching address', async () => {
    const update = vi.fn();
    const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient<Database>;
    await expect(
      syncProfileEmailWithAuthUser(client, {
        userId: 'u1',
        authEmail: 'same@example.com',
        profileEmail: 'same@example.com',
      }),
    ).resolves.toEqual({ ok: true, email: 'same@example.com' });
    expect(update).not.toHaveBeenCalled();
  });

  it('copies the confirmed Auth email onto the profile', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient<Database>;
    await expect(
      syncProfileEmailWithAuthUser(client, {
        userId: 'u1',
        authEmail: 'confirmed@example.com',
        profileEmail: 'old@example.com',
      }),
    ).resolves.toEqual({ ok: true, email: 'confirmed@example.com' });
    expect(update).toHaveBeenCalledWith({ email: 'confirmed@example.com' });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });
});

describe('staff account mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, origin: 'http://localhost:4321' },
    });
  });

  it('patches display_name after validation', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'alex@example.com' } },
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ update });

    await expect(updateStaffDisplayName('  Alex Rivera  ')).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ display_name: 'Alex Rivera' });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('rejects office local-part display names before writing', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'office@justinfassio.com' } },
    });
    const result = await updateStaffDisplayName('office');
    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('requests an Auth email change with account redirect', async () => {
    updateUserMock.mockResolvedValue({ error: null });
    await expect(requestStaffEmailChange('next@example.com')).resolves.toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith(
      { email: 'next@example.com' },
      { emailRedirectTo: 'http://localhost:4321/app/account' },
    );
  });

  it('updates password via Auth', async () => {
    updateUserMock.mockResolvedValue({ error: null });
    await expect(updateStaffPassword('longenough', 'longenough')).resolves.toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'longenough' });
  });

  it('surfaces Auth password errors', async () => {
    updateUserMock.mockResolvedValue({ error: { message: 'Auth session missing' } });
    await expect(updateStaffPassword('longenough', 'longenough')).resolves.toEqual({
      ok: false,
      error: 'Auth session missing',
    });
  });

  it('creates a signed URL without writing profiles', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    });
    await expect(createStaffAvatarSignedUrl('u1/avatar.png')).resolves.toBe(
      'https://example.com/signed',
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(createSignedUrlMock).toHaveBeenCalledWith('u1/avatar.png', 60 * 60);
  });

  it('uploads avatar files through the staff API', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, avatarPath: 'u1/avatar.png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = makeFile('image/png');
    await expect(uploadStaffAvatar(file)).resolves.toEqual({
      ok: true,
      avatarPath: 'u1/avatar.png',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/staff/account/avatar',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    vi.unstubAllGlobals();
  });

  it('removes avatars through the staff API', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(removeStaffAvatar()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/staff/account/avatar',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    vi.unstubAllGlobals();
  });
});
