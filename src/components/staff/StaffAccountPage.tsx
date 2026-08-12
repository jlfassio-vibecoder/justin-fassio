// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardKicker, CardTitle } from '@/components/ui/Card';
import { Field, FieldLabel, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  createStaffAvatarSignedUrl,
  pendingAuthEmail,
  removeStaffAvatar,
  requestStaffEmailChange,
  staffAccountInitials,
  updateStaffDisplayName,
  updateStaffPassword,
  uploadStaffAvatar,
  validateStaffAvatarFile,
} from '@/lib/staffAccount';

type SectionState = { busy: boolean; error: string | null; success: string | null };

const idle: SectionState = { busy: false, error: null, success: null };

function StaffAvatarPreview({ src, initials }: { src: string | null; initials: string }) {
  return (
    <div
      className="bg-accent font-heading text-bg flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full text-lg"
      aria-hidden={src ? true : undefined}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function StaffAccountPage() {
  const { user, profile, reloadProfile } = useAuth();
  const emails = [user?.email, profile?.email];
  const profileName = profile?.display_name ?? '';
  const [displayName, setDisplayName] = useState(profileName);
  const [syncedName, setSyncedName] = useState(profileName);
  const [nextEmail, setNextEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<SectionState>(idle);
  const [emailState, setEmailState] = useState<SectionState>(idle);
  const [passwordState, setPasswordState] = useState<SectionState>(idle);
  const [avatarState, setAvatarState] = useState<SectionState>(idle);

  // Copilot suggestion ignored: React 19 syncs derived state during render; an effect here trips react-hooks/set-state-in-effect.
  if (profileName !== syncedName) {
    setSyncedName(profileName);
    setDisplayName(profileName);
  }

  useEffect(() => {
    let active = true;
    void createStaffAvatarSignedUrl(profile?.avatar_path).then((url) => {
      if (active) setAvatarSrc(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_path]);

  const initials = staffAccountInitials(profile?.display_name, emails);
  const pending = pendingAuthEmail(user);

  async function onSaveName(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileState({ busy: true, error: null, success: null });
    const result = await updateStaffDisplayName(displayName, emails);
    if (!result.ok) {
      setProfileState({ busy: false, error: result.error, success: null });
      return;
    }
    await reloadProfile();
    setProfileState({ busy: false, error: null, success: 'Display name saved' });
  }

  async function onChangeEmail(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailState({ busy: true, error: null, success: null });
    const result = await requestStaffEmailChange(nextEmail);
    if (!result.ok) {
      setEmailState({ busy: false, error: result.error, success: null });
      return;
    }
    setNextEmail('');
    await reloadProfile();
    setEmailState({
      busy: false,
      error: null,
      success: 'Confirmation sent. Current login stays the same until you confirm.',
    });
  }

  async function onChangePassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordState({ busy: true, error: null, success: null });
    const result = await updateStaffPassword(password, confirm);
    if (!result.ok) {
      setPasswordState({ busy: false, error: result.error, success: null });
      return;
    }
    setPassword('');
    setConfirm('');
    setPasswordState({ busy: false, error: null, success: 'Password updated' });
  }

  async function onAvatarSelected(file: File | undefined) {
    if (!file) return;
    const checked = validateStaffAvatarFile(file);
    if (!checked.ok) {
      setAvatarState({ busy: false, error: checked.error, success: null });
      return;
    }
    setAvatarState({ busy: true, error: null, success: null });
    const result = await uploadStaffAvatar(file);
    if (!result.ok) {
      setAvatarState({ busy: false, error: result.error, success: null });
      return;
    }
    await reloadProfile();
    setAvatarState({ busy: false, error: null, success: 'Photo updated' });
  }

  async function onRemoveAvatar() {
    setAvatarState({ busy: true, error: null, success: null });
    const result = await removeStaffAvatar();
    if (!result.ok) {
      setAvatarState({ busy: false, error: result.error, success: null });
      return;
    }
    setAvatarSrc(null);
    await reloadProfile();
    setAvatarState({ busy: false, error: null, success: 'Photo removed' });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-7 py-8">
      <div>
        <p className="text-accent text-[10px] tracking-[0.1em] uppercase">Staff</p>
        <h1 className="font-heading m-0 text-2xl">Account</h1>
        <p className="text-ink/70 mt-1 mb-0 text-sm">
          Your display name is used on Product Emails you send.
        </p>
      </div>

      <Card>
        <CardKicker>Profile</CardKicker>
        <CardTitle>Photo and display name</CardTitle>
        <div className="mt-3 flex items-center gap-3">
          <StaffAvatarPreview src={avatarSrc} initials={initials} />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarState.busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void onAvatarSelected(file);
                }}
              />
              <span className="bg-accent text-bg font-heading inline-flex min-h-9 cursor-pointer items-center rounded-full px-3.5 text-sm">
                {avatarState.busy
                  ? 'Saving…'
                  : profile?.avatar_path
                    ? 'Replace photo'
                    : 'Upload photo'}
              </span>
            </label>
            {profile?.avatar_path ? (
              <Button
                type="button"
                variant="ghost"
                disabled={avatarState.busy}
                onClick={() => {
                  void onRemoveAvatar();
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {avatarState.error ? (
          <p className="text-accent-800 m-0 text-sm">{avatarState.error}</p>
        ) : null}
        {avatarState.success ? (
          <p className="text-sage-800 m-0 text-sm">{avatarState.success}</p>
        ) : null}

        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void onSaveName(event)}>
          <Field>
            <FieldLabel>Display name</FieldLabel>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={80}
            />
          </Field>
          {profileState.error ? (
            <p className="text-accent-800 m-0 text-sm">{profileState.error}</p>
          ) : null}
          {profileState.success ? (
            <p className="text-sage-800 m-0 text-sm">{profileState.success}</p>
          ) : null}
          <Button type="submit" variant="primary" disabled={profileState.busy}>
            {profileState.busy ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardKicker>Login</CardKicker>
        <CardTitle>Email</CardTitle>
        <CardBody>Current login: {user?.email ?? '—'}</CardBody>
        {pending ? (
          <p className="text-ink/70 m-0 text-sm">
            Confirmation sent to {pending}. Current login stays {user?.email} until confirmed.
          </p>
        ) : null}
        <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void onChangeEmail(event)}>
          <Field>
            <FieldLabel>New email</FieldLabel>
            <Input
              type="email"
              value={nextEmail}
              onChange={(event) => setNextEmail(event.target.value)}
              autoComplete="email"
            />
          </Field>
          {emailState.error ? (
            <p className="text-accent-800 m-0 text-sm">{emailState.error}</p>
          ) : null}
          {emailState.success ? (
            <p className="text-sage-800 m-0 text-sm">{emailState.success}</p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={emailState.busy}>
            {emailState.busy ? 'Sending…' : 'Update email'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardKicker>Security</CardKicker>
        <CardTitle>Password</CardTitle>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => void onChangePassword(event)}
        >
          <Field>
            <FieldLabel>New password</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field>
            <FieldLabel>Confirm password</FieldLabel>
            <Input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {passwordState.error ? (
            <p className="text-accent-800 m-0 text-sm">{passwordState.error}</p>
          ) : null}
          {passwordState.success ? (
            <p className="text-sage-800 m-0 text-sm">{passwordState.success}</p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={passwordState.busy}>
            {passwordState.busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
