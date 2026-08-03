import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

type Props = {
  email?: string | null;
  variant?: 'pending' | 'rejected';
};

export function PendingApprovalScreen({ email, variant = 'pending' }: Props) {
  const isRejected = variant === 'rejected';

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgb(198_113_57_/_0.18),_transparent_55%),linear-gradient(180deg,#f5ead8,#ebddc5)]"
        aria-hidden
      />
      <h1 className="m-0 text-2xl">{isRejected ? 'Access denied' : 'Account pending review'}</h1>
      <p className="text-ink/70 mt-3 mb-2 text-sm">
        {isRejected
          ? 'This account has not been approved for Rep Command Center access. Contact Justin if you believe this is a mistake.'
          : 'An administrator must approve your account before you can use rep tools, prospect data, or pipeline metrics.'}
      </p>
      {email && (
        <p className="text-ink/80 m-0 mb-6 text-sm">
          Signed in as <span className="font-semibold">{email}</span>
        </p>
      )}
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
