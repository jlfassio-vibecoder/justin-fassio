export function BuyerPortalComingSoon() {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgb(198_113_57_/_0.18),_transparent_55%),linear-gradient(180deg,#f5ead8,#ebddc5)]"
        aria-hidden
      />
      <a href="/" className="mb-8 inline-flex items-center gap-3 no-underline">
        <span className="bg-accent font-heading text-bg flex h-11 w-11 items-center justify-center rounded-full">
          JF
        </span>
        <span className="font-heading text-ink text-xl">Justin Fassio</span>
      </a>

      <h1 className="m-0 text-2xl">Buyer Portal</h1>
      <p className="text-ink/70 mt-2 mb-6 text-sm">Coming soon</p>
      <p className="text-ink/70 m-0 mb-8 text-sm">
        Retailer accounts will sign in here to browse lines and place wholesale orders. Check back
        soon, or reach out if you need help in the meantime.
      </p>

      <FieldPreview />

      <p className="text-ink/55 mt-10 text-center text-xs">
        <a
          href="/rep-login"
          className="text-ink/60 hover:text-ink no-underline underline-offset-2 hover:underline"
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
        <span className="text-ink/80 font-semibold">Email</span>
        <input
          type="email"
          disabled
          placeholder="you@shop.com"
          className="border-ink/15 bg-bg text-ink rounded-lg border px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled
        className="bg-accent/50 font-heading text-bg rounded-full px-4 py-2.5 text-sm"
      >
        Sign in (coming soon)
      </button>
    </div>
  );
}
