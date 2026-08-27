// Copilot suggestion ignored: React 19 types export SubmitEvent; FormEvent is deprecated for form onSubmit.
import { useEffect, useState, type MouseEvent, type SubmitEvent } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input } from '@/components/ui/Input';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ThemeProvider } from '@/lib/ThemeProvider';

type Mode = 'magic' | 'password';
type AuthView = 'login' | 'register';

export type LoginFormProps = {
  initialView?: AuthView;
  initialMode?: Mode;
};

const toggleBase =
  'font-heading flex-1 cursor-pointer rounded-full px-3 py-1.5 text-center text-sm no-underline';
const toggleActive = 'bg-accent text-on-accent';
const toggleIdle = 'text-ink/70 hover:text-ink';

function loginHref(view: AuthView, mode: Mode): string {
  const params = new URLSearchParams();
  if (view === 'register') {
    params.set('view', 'register');
    params.set('mode', 'password');
  } else if (mode === 'password') {
    params.set('mode', 'password');
  }
  const q = params.toString();
  return q ? `/rep-login?${q}` : '/rep-login';
}

export function LoginForm(props: LoginFormProps) {
  return (
    <ThemeProvider>
      <LoginFormInner {...props} />
    </ThemeProvider>
  );
}

function LoginFormInner({ initialView = 'login', initialMode = 'magic' }: LoginFormProps) {
  const [view, setView] = useState<AuthView>(initialView);
  const [mode, setMode] = useState<Mode>(initialView === 'register' ? 'password' : initialMode);
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

  function selectView(next: AuthView, e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setView(next);
    if (next === 'register') setMode('password');
    setError(null);
    setMessage(null);
  }

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
    <div className="bg-bg relative z-0 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <a href="/" className="mb-8 inline-flex items-center gap-3 no-underline">
        <span className="bg-accent font-heading text-on-accent flex h-11 w-11 items-center justify-center rounded-full">
          JF
        </span>
        <span className="font-heading text-ink text-xl">Justin Fassio</span>
      </a>

      <h1 className="m-0 text-2xl">
        {view === 'register' ? 'Request access' : 'Rep / Owner sign in'}
      </h1>
      <p className="text-ink/70 mt-2 mb-6 text-sm">
        {view === 'register'
          ? 'Create an account for Rep Command Center. Justin must approve you before tools unlock.'
          : 'For Justin and authorized sales reps.'}
      </p>

      <div
        className="bg-surface relative z-10 mb-5 flex gap-2 rounded-full p-1"
        role="group"
        aria-label="Account mode"
      >
        <a
          href={loginHref('login', mode === 'password' ? 'password' : 'magic')}
          onClick={(e) => selectView('login', e)}
          aria-current={view === 'login' ? 'page' : undefined}
          className={`${toggleBase} ${view === 'login' ? toggleActive : toggleIdle}`}
        >
          Sign in
        </a>
        <a
          href={loginHref('register', 'password')}
          onClick={(e) => selectView('register', e)}
          aria-current={view === 'register' ? 'page' : undefined}
          className={`${toggleBase} ${view === 'register' ? toggleActive : toggleIdle}`}
        >
          Register
        </a>
      </div>

      {view === 'login' && (
        <div
          className="bg-surface relative z-10 mb-5 flex gap-2 rounded-full p-1"
          role="group"
          aria-label="Sign-in method"
        >
          <a
            href={loginHref('login', 'magic')}
            onClick={(e) => selectMode('magic', e)}
            aria-current={mode === 'magic' ? 'page' : undefined}
            className={`${toggleBase} ${mode === 'magic' ? toggleActive : toggleIdle}`}
          >
            Email link
          </a>
          <a
            href={loginHref('login', 'password')}
            onClick={(e) => selectMode('password', e)}
            aria-current={mode === 'password' ? 'page' : undefined}
            className={`${toggleBase} ${mode === 'password' ? toggleActive : toggleIdle}`}
          >
            Password
          </a>
        </div>
      )}

      <form
        onSubmit={view === 'register' || mode === 'password' ? handlePassword : handleMagicLink}
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

        {error && <p className="text-accent-800 m-0 text-sm">{error}</p>}
        {message && <p className="text-sage-800 m-0 text-sm">{message}</p>}

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

      <p className="text-ink/55 relative z-10 mt-8 text-center text-xs">
        <a href="/login" className="text-ink/60 no-underline hover:underline">
          Buyer Portal
        </a>
      </p>
    </div>
  );
}
