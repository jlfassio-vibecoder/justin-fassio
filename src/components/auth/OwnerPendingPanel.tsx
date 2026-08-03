import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import {
  listPendingProfiles,
  setProfileStatus,
  type PendingProfile,
} from '@/lib/ownerApprovals';

export function OwnerPendingPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PendingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await listPendingProfiles();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setRows([]);
      return;
    }
    setRows(result.data);
  }

  async function handleStatus(id: string, status: 'approved' | 'rejected') {
    setActionId(id);
    setError(null);
    const result = await setProfileStatus(id, status);
    setActionId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-xs"
        onClick={() => {
          void openPanel();
        }}
      >
        Pending reps
      </Button>

      <DialogBackdrop open={open} onClose={() => setOpen(false)}>
        <div className="flex max-w-[560px] flex-col gap-3 rounded-xl bg-surface p-4.1 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Pending reps</DialogTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </div>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink/60">No pending registrations.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-semibold">
                      {row.display_name || row.email || row.id}
                    </p>
                    {row.email ? <p className="m-0 truncate text-xs text-ink/60">{row.email}</p> : null}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      disabled={actionId === row.id}
                      onClick={() => void handleStatus(row.id, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-3 py-1 text-xs"
                      disabled={actionId === row.id}
                      onClick={() => void handleStatus(row.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogBackdrop>
    </>
  );
}
