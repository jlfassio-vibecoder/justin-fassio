import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

type Props = {
  email?: string | null;
};

export function WrongPortalScreen({ email }: Props) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgb(198_113_57_/_0.18),_transparent_55%),linear-gradient(180deg,#f5ead8,#ebddc5)]"
        aria-hidden
      />
      <h1 className="m-0 text-2xl">Buyer account</h1>
      <p className="mt-3 mb-2 text-sm text-ink/70">
        This login is for the buyer portal, which is not available here. Use the
        buyer portal link below, or sign out if you need a different account.
      </p>
      {email && (
        <p className="m-0 mb-6 text-sm text-ink/80">
          Signed in as <span className="font-semibold">{email}</span>
        </p>
      )}
      <a
        href="/login"
        className="mb-4 font-heading text-accent-700 no-underline hover:text-accent-800"
      >
        Go to Buyer Portal
      </a>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          void supabase.auth.signOut().then(() => {
            window.location.href = '/';
          });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
