import { useEffect, useState, type SubmitEvent } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input } from '@/components/ui/Input';

type Mode = 'magic' | 'password';
type AuthView = 'login' | 'register';

function readMode(): Mode {
  if (typeof window === 'undefined') return 'magic';
  return new URLSearchParams(window.location.search).get('mode') === 'password'
    ? 'password'
    : 'magic';
}

export function LoginForm() {
  const [view, setView] = useState<AuthView>('login');
  const [mode, setMode] = useState<Mode>(() => readMode());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/app');
    });
  }, []);

  async function handleMagicLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const redirectTo = `${window.location.origin}/app`;
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: view === 'register',
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(
      view === 'register'
        ? 'Check your email to confirm your account. Access stays pending until Justin approves you.'
        : 'Check your email for a sign-in link.',
    );
  }

  async function handlePassword(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    if (view === 'register') {
      const redirectTo = `${window.location.origin}/app`;
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo },
      });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      if (data.session) {
        window.location.replace('/app');
        return;
      }
      setMessage(
        'Account created. Confirm your email if required — access stays pending until Justin approves you.',
      );
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.replace('/app');
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <p className="m-0 text-sm text-ink/70">
          Supabase is not configured. Add <code>PUBLIC_SUPABASE_URL</code> and{' '}
          <code>PUBLIC_SUPABASE_ANON_KEY</code> to your environment to enable sign-in.
        </p>
        <a href="/" className="mt-4 font-heading text-accent-700 no-underline">
          Back to home
        </a>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgb(198_113_57_/_0.18),_transparent_55%),linear-gradient(180deg,#f5ead8,#ebddc5)]"
        aria-hidden
      />
      <a href="/" className="mb-8 inline-flex items-center gap-3 no-underline">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent font-heading text-bg">
          JF
        </span>
        <span className="font-heading text-xl text-ink">Justin Fassio</span>
      </a>

      <h1 className="m-0 text-2xl">
        {view === 'register' ? 'Request access' : 'Rep / Owner sign in'}
      </h1>
      <p className="mt-2 mb-6 text-sm text-ink/70">
        {view === 'register'
          ? 'Create an account for Rep Command Center. Justin must approve you before tools unlock.'
          : 'For Justin and authorized sales reps.'}
      </p>

      <div className="mb-5 flex gap-2 rounded-full bg-surface p-1">
        <button
          type="button"
          onClick={() => {
            setView('login');
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-full px-3 py-1.5 font-heading text-sm ${
            view === 'login' ? 'bg-accent text-bg' : 'text-ink/70'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setView('register');
            setMode('password');
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-full px-3 py-1.5 font-heading text-sm ${
            view === 'register' ? 'bg-accent text-bg' : 'text-ink/70'
          }`}
        >
          Register
        </button>
      </div>

      {view === 'login' && (
        <div className="mb-5 flex gap-2 rounded-full bg-surface p-1">
          <button
            type="button"
            onClick={() => setMode('magic')}
            className={`flex-1 rounded-full px-3 py-1.5 font-heading text-sm ${
              mode === 'magic' ? 'bg-accent text-bg' : 'text-ink/70'
            }`}
          >
            Email link
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 rounded-full px-3 py-1.5 font-heading text-sm ${
              mode === 'password' ? 'bg-accent text-bg' : 'text-ink/70'
            }`}
          >
            Password
          </button>
        </div>
      )}

      <form
        onSubmit={
          view === 'register' || mode === 'password' ? handlePassword : handleMagicLink
        }
        className="flex flex-col gap-3.5"
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

        {(view === 'register' || mode === 'password') && (
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              autoComplete={view === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </Field>
        )}

        {error && <p className="m-0 text-sm text-accent-800">{error}</p>}
        {message && <p className="m-0 text-sm text-sage-800">{message}</p>}

        <Button type="submit" variant="primary" disabled={busy} className="mt-1">
          {busy
            ? 'Working…'
            : view === 'register'
              ? 'Create account'
              : mode === 'magic'
                ? 'Send login link'
                : 'Sign in'}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-ink/55">
        <a href="/login" className="text-ink/60 no-underline hover:underline">
          Buyer Portal
        </a>
      </p>
    </div>
  );
}
