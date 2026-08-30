import { useEffect, useRef } from 'react';
import { PRESENCE_VISIT_QUERY_PARAM } from '@/lib/presenceConstants';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_MS = 30_000;

async function claimVisitToken(vt: string): Promise<boolean> {
  try {
    const res = await fetch('/api/presence/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ vt }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendHeartbeat(path: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Anonymous / no session — cookie claim only.
  }
  try {
    await fetch('/api/presence/heartbeat', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({ path }),
    });
  } catch {
    // Best-effort; ignore network errors.
  }
}

function stripVtFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PRESENCE_VISIT_QUERY_PARAM)) return;
    url.searchParams.delete(PRESENCE_VISIT_QUERY_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  } catch {
    // ignore
  }
}

/**
 * Public-site presence: claim outreach `vt`, then heartbeat while the tab is visible.
 * Mount only on non-staff Layout surfaces.
 */
export function PresenceHeartbeat() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const vt = params.get(PRESENCE_VISIT_QUERY_PARAM)?.trim();
      if (vt) {
        const ok = await claimVisitToken(vt);
        if (ok) stripVtFromUrl();
      }
      if (cancelled) return;
      await sendHeartbeat(window.location.pathname);
    }

    void boot();

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void sendHeartbeat(window.location.pathname);
    };

    timerRef.current = window.setInterval(tick, HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const onHide = () => {
      void sendHeartbeat(window.location.pathname);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);

    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
