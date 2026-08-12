import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_AVATAR_MAX_BYTES } from '@/lib/staffAccount';

const requireApprovedStaffClientMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

import { DELETE, POST } from '@/pages/api/staff/account/avatar';

function ctx(request: Request) {
  return { request } as unknown as Parameters<typeof POST>[0];
}

function imageFile(type = 'image/png', size = 12, name = 'avatar.png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function staffClient(input: { userId?: string; currentPath?: string | null } = {}) {
  const userId = input.userId ?? 'user-1';
  const calls: string[] = [];
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { avatar_path: input.currentPath ?? null },
    error: null,
  });
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn((payload: Record<string, unknown>) => {
    calls.push(`update:${JSON.stringify(payload)}`);
    return { eq: updateEq };
  });
  const remove = vi.fn(async (paths: string[]) => {
    calls.push(`remove:${paths.join(',')}`);
    return { error: null };
  });
  const upload = vi.fn(async (path: string) => {
    calls.push(`upload:${path}`);
    return { error: null };
  });

  return {
    userId,
    calls,
    update,
    updateEq,
    remove,
    upload,
    supabase: {
      from: vi.fn(() => ({ select, update })),
      storage: { from: vi.fn(() => ({ remove, upload })) },
    },
  };
}

describe('staff account avatar API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies unauthenticated uploads', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });
    const form = new FormData();
    form.set('file', imageFile());
    const res = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: form,
        }),
      ),
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing, unsupported, and oversized files', async () => {
    const staff = staffClient();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: staff.userId,
      supabase: staff.supabase,
    });

    const missing = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: new FormData(),
        }),
      ),
    );
    expect(missing.status).toBe(400);

    const gif = new FormData();
    gif.set('file', imageFile('image/gif', 12, 'avatar.gif'));
    const badType = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: gif,
        }),
      ),
    );
    expect(badType.status).toBe(400);

    const huge = new FormData();
    huge.set('file', imageFile('image/jpeg', STAFF_AVATAR_MAX_BYTES + 1, 'big.jpg'));
    const tooBig = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: huge,
        }),
      ),
    );
    expect(tooBig.status).toBe(400);
    expect(staff.upload).not.toHaveBeenCalled();
  });

  it('deletes the previous object before uploading a replacement under the caller uid', async () => {
    const staff = staffClient({ currentPath: 'user-1/avatar.jpg' });
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: staff.userId,
      supabase: staff.supabase,
    });

    const form = new FormData();
    form.set('file', imageFile('image/png', 16, 'next.png'));
    const res = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: form,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, avatarPath: 'user-1/avatar.png' });
    expect(staff.calls).toEqual([
      'remove:user-1/avatar.jpg',
      'upload:user-1/avatar.png',
      'update:{"avatar_path":"user-1/avatar.png"}',
    ]);
    expect(staff.updateEq).toHaveBeenCalledWith('id', 'user-1');
    expect(staff.upload.mock.calls[0]?.[0]).toBe('user-1/avatar.png');
  });

  it('skips storage remove when there is no previous avatar', async () => {
    const staff = staffClient({ currentPath: null });
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: staff.userId,
      supabase: staff.supabase,
    });
    const form = new FormData();
    form.set('file', imageFile());
    const res = await POST(
      ctx(
        new Request('http://localhost/api/staff/account/avatar', {
          method: 'POST',
          body: form,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(staff.remove).not.toHaveBeenCalled();
    expect(staff.calls[0]).toBe('upload:user-1/avatar.png');
  });

  it('removes the object and nulls avatar_path', async () => {
    const staff = staffClient({ currentPath: 'user-1/avatar.webp' });
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: staff.userId,
      supabase: staff.supabase,
    });
    const res = await DELETE(
      ctx(new Request('http://localhost/api/staff/account/avatar', { method: 'DELETE' })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(staff.calls).toEqual(['remove:user-1/avatar.webp', 'update:{"avatar_path":null}']);
    expect(staff.updateEq).toHaveBeenCalledWith('id', 'user-1');
  });
});
