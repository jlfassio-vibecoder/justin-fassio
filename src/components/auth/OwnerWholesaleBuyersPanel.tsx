import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import {
  listPendingWholesaleBuyers,
  setBuyerWholesalePricing,
  type PendingWholesaleBuyer,
} from '@/lib/wholesaleBuyerApprovals';

function accountLabel(row: PendingWholesaleBuyer): string {
  return row.prospectName || row.businessName || 'Unknown account';
}

function contactLabel(row: PendingWholesaleBuyer): string {
  return row.buyerName || row.displayName || 'Unknown contact';
}

export function OwnerWholesaleBuyersPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PendingWholesaleBuyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await listPendingWholesaleBuyers();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setRows([]);
      return;
    }
    setRows(result.data);
  }

  async function handleUnlock(id: string) {
    setActionId(id);
    setError(null);
    const result = await setBuyerWholesalePricing(id, true);
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
        Wholesale buyers
      </Button>

      <DialogBackdrop open={open} onClose={() => setOpen(false)}>
        <div className="bg-surface p-4.1 flex max-w-[560px] flex-col gap-3 rounded-xl shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Wholesale buyers</DialogTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </div>

          <p className="text-ink/60 m-0 text-xs">
            Unlock wholesale pricing after verifying the retailer. Approving also marks the buyer
            profile approved.
          </p>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-ink/60 text-sm">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-ink/60 text-sm">
              No pending wholesale buyers. Real requests appear here after a retailer submits the
              wholesale form (linked to a prospect account).
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="border-ink/10 flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold">{accountLabel(row)}</p>
                    <p className="text-ink/80 m-0 mt-0.5 truncate text-xs">
                      Contact: {contactLabel(row)}
                    </p>
                    {row.email ? (
                      <p className="text-ink/60 m-0 truncate text-xs">{row.email}</p>
                    ) : null}
                    <p className="text-ink/50 m-0 truncate text-xs">
                      {[row.prospectCity, row.phone, row.status].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      disabled={actionId === row.id}
                      onClick={() => void handleUnlock(row.id)}
                    >
                      Unlock pricing
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
