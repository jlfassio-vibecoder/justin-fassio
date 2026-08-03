import { supabase } from '@/lib/supabase';

export type PendingProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type ProfileStatusAction = 'approved' | 'rejected';

export type OwnerApprovalsResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listPendingProfiles(): Promise<OwnerApprovalsResult<PendingProfile[]>> {
  const { data, error } = await supabase.rpc('list_pending_profiles');
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: (data ?? []) as PendingProfile[] };
}

export async function setProfileStatus(
  targetId: string,
  newStatus: ProfileStatusAction,
): Promise<OwnerApprovalsResult<null>> {
  if (!targetId.trim()) {
    return { ok: false, error: 'targetId is required' };
  }
  const { error } = await supabase.rpc('set_profile_status', {
    target_id: targetId,
    new_status: newStatus,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: null };
}
