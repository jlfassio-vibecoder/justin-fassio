export function BuyerPortalComingSoon() {
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

      <h1 className="m-0 text-2xl">Buyer Portal</h1>
      <p className="mt-2 mb-6 text-sm text-ink/70">Coming soon</p>
      <p className="m-0 mb-8 text-sm text-ink/70">
        Retailer accounts will sign in here to browse lines and place wholesale
        orders. Check back soon, or reach out if you need help in the meantime.
      </p>

      <FieldPreview />

      <p className="mt-10 text-center text-xs text-ink/55">
        <a
          href="/rep-login"
          className="text-ink/60 no-underline underline-offset-2 hover:text-ink hover:underline"
        >
          Rep / Owner Portal Login
        </a>
      </p>
    </div>
  );
}

function FieldPreview() {
  return (
    <div className="flex flex-col gap-3.5 opacity-60" aria-hidden>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-ink/80">Email</span>
        <input
          type="email"
          disabled
          placeholder="you@shop.com"
          className="rounded-lg border border-ink/15 bg-bg px-3 py-2 text-ink"
        />
      </label>
      <button
        type="button"
        disabled
        className="rounded-full bg-accent/50 px-4 py-2.5 font-heading text-sm text-bg"
      >
        Sign in (coming soon)
      </button>
    </div>
  );
}
