import { useEffect, useState, type MouseEvent, type SubmitEvent } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { OGR_WHOLESALE_PATH } from '@/lib/productUrls';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input } from '@/components/ui/Input';

type Mode = 'magic' | 'password';

const toggleBase =
  'font-heading flex-1 cursor-pointer rounded-full px-3 py-1.5 text-center text-sm no-underline';
const toggleActive = 'bg-accent text-bg';
const toggleIdle = 'text-ink/70 hover:text-ink';

export function BuyerLoginForm() {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/account');
    });
  }, []);

  function selectMode(next: Mode, e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function handleMagicLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const redirectTo = `${window.location.origin}/account`;
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage('Check your email for a sign-in link.');
  }

  async function handlePassword(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.replace('/account');
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <p className="text-ink/70 m-0 text-sm">
          Supabase is not configured. Add <code>PUBLIC_SUPABASE_URL</code> and{' '}
          <code>PUBLIC_SUPABASE_ANON_KEY</code> to your environment to enable sign-in.
        </p>
        <a href="/" className="font-heading text-accent-700 mt-4 no-underline">
          Back to home
        </a>
      </div>
    );
  }

  return (
    <div className="relative z-0 mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-[radial-gradient(ellipse_at_top,_rgb(198_113_57_/_0.18),_transparent_55%),linear-gradient(180deg,#f5ead8,#ebddc5)] px-6 py-12">
      <a href="/" className="mb-8 inline-flex items-center gap-3 no-underline">
        <span className="bg-accent font-heading text-bg flex h-11 w-11 items-center justify-center rounded-full">
          JF
        </span>
        <span className="font-heading text-ink text-xl">Justin Fassio</span>
      </a>

      <h1 className="m-0 text-2xl">Retailer sign in</h1>
      <p className="text-ink/70 mt-2 mb-6 text-sm">
        Sign in after requesting wholesale access. Justin unlocks pricing once your shop is
        verified.
      </p>

      <div
        className="bg-surface relative z-10 mb-5 flex gap-2 rounded-full p-1"
        role="group"
        aria-label="Sign-in method"
      >
        <a
          href="/login"
          onClick={(e) => selectMode('magic', e)}
          aria-current={mode === 'magic' ? 'page' : undefined}
          className={`${toggleBase} ${mode === 'magic' ? toggleActive : toggleIdle}`}
        >
          Email link
        </a>
        <a
          href="/login?mode=password"
          onClick={(e) => selectMode('password', e)}
          aria-current={mode === 'password' ? 'page' : undefined}
          className={`${toggleBase} ${mode === 'password' ? toggleActive : toggleIdle}`}
        >
          Password
        </a>
      </div>

      <form
        onSubmit={mode === 'password' ? handlePassword : handleMagicLink}
        className="relative z-10 flex flex-col gap-3.5"
      >
        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
          />
        </Field>

        {mode === 'password' ? (
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </Field>
        ) : null}

        {error ? <p className="text-accent-800 m-0 text-sm">{error}</p> : null}
        {message ? <p className="text-sage-800 m-0 text-sm">{message}</p> : null}

        <Button type="submit" variant="primary" disabled={busy} className="mt-1">
          {busy ? 'Working…' : mode === 'magic' ? 'Send login link' : 'Sign in'}
        </Button>
      </form>

      <p className="text-ink/55 relative z-10 mt-6 text-center text-sm">
        Need access?{' '}
        <a
          href={`${OGR_WHOLESALE_PATH}#buyer-form`}
          className="text-accent-700 no-underline hover:underline"
        >
          Request wholesale pricing
        </a>
      </p>

      <p className="text-ink/55 relative z-10 mt-8 text-center text-xs">
        <a href="/rep-login" className="text-ink/60 no-underline hover:underline">
          Rep / Owner Portal
        </a>
      </p>
    </div>
  );
}
