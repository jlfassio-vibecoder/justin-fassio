import { useCallback, useSyncExternalStore } from 'react';
import {
  getWholesaleOrderDraftServerSnapshot,
  getWholesaleOrderDraftSnapshot,
  resetWholesaleOrderDraft,
  subscribeWholesaleOrderDraft,
  writeWholesaleOrderDraft,
  type WholesaleOrderDraft,
  type WholesaleOrderLine,
  upsertOrderLine,
} from '@/lib/wholesaleOrderDraft';

export function useWholesaleOrderDraft() {
  const draft = useSyncExternalStore(
    subscribeWholesaleOrderDraft,
    getWholesaleOrderDraftSnapshot,
    getWholesaleOrderDraftServerSnapshot,
  );

  const setDraft = useCallback(
    (updater: WholesaleOrderDraft | ((prev: WholesaleOrderDraft) => WholesaleOrderDraft)) => {
      const prev = getWholesaleOrderDraftSnapshot();
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeWholesaleOrderDraft(next);
    },
    [],
  );

  const mergeLines = useCallback(
    (lines: WholesaleOrderLine[]) => {
      setDraft((prev) => {
        let next = prev;
        for (const line of lines) {
          const existing = next.lines.find(
            (l) => l.productId === line.productId && l.size === line.size,
          );
          next = upsertOrderLine(next, {
            ...line,
            quantity: (existing?.quantity ?? 0) + line.quantity,
          });
        }
        return next;
      });
    },
    [setDraft],
  );

  const clearDraft = useCallback(() => {
    resetWholesaleOrderDraft();
  }, []);

  return { draft, setDraft, mergeLines, clearDraft };
}
