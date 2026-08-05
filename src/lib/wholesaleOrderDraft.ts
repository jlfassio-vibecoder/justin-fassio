export type WholesaleOrderLine = {
  productId: string;
  sku: string;
  name: string;
  size: string;
  wholesaleUsd: number;
  quantity: number;
  primaryImageUrl: string | null;
};

export type WholesaleOrderDraft = {
  lines: WholesaleOrderLine[];
  updatedAt: string;
};

export const WHOLESALE_ORDER_STORAGE_KEY = 'ogr-wholesale-order-v1';

export function emptyWholesaleOrderDraft(): WholesaleOrderDraft {
  return { lines: [], updatedAt: new Date().toISOString() };
}

export function loadWholesaleOrderDraft(): WholesaleOrderDraft {
  if (typeof window === 'undefined') return emptyWholesaleOrderDraft();
  try {
    const raw = window.localStorage.getItem(WHOLESALE_ORDER_STORAGE_KEY);
    if (!raw) return emptyWholesaleOrderDraft();
    const parsed = JSON.parse(raw) as WholesaleOrderDraft;
    if (!parsed || !Array.isArray(parsed.lines)) return emptyWholesaleOrderDraft();
    return parsed;
  } catch {
    return emptyWholesaleOrderDraft();
  }
}

export function saveWholesaleOrderDraft(draft: WholesaleOrderDraft): void {
  if (typeof window === 'undefined') return;
  const next = { ...draft, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(WHOLESALE_ORDER_STORAGE_KEY, JSON.stringify(next));
}

export function clearWholesaleOrderDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WHOLESALE_ORDER_STORAGE_KEY);
}

/** In-memory + localStorage store for React useSyncExternalStore. */
let draftMemory: WholesaleOrderDraft | null = null;
const draftListeners = new Set<() => void>();

function emitDraftChange(): void {
  for (const listener of draftListeners) listener();
}

export function subscribeWholesaleOrderDraft(onStoreChange: () => void): () => void {
  draftListeners.add(onStoreChange);
  return () => {
    draftListeners.delete(onStoreChange);
  };
}

export function getWholesaleOrderDraftSnapshot(): WholesaleOrderDraft {
  if (draftMemory) return draftMemory;
  draftMemory = loadWholesaleOrderDraft();
  return draftMemory;
}

export function getWholesaleOrderDraftServerSnapshot(): WholesaleOrderDraft {
  return emptyWholesaleOrderDraft();
}

export function writeWholesaleOrderDraft(draft: WholesaleOrderDraft): void {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  draftMemory = next;
  saveWholesaleOrderDraft(next);
  emitDraftChange();
}

export function resetWholesaleOrderDraft(): void {
  draftMemory = emptyWholesaleOrderDraft();
  clearWholesaleOrderDraft();
  emitDraftChange();
}

export function upsertOrderLine(
  draft: WholesaleOrderDraft,
  line: WholesaleOrderLine,
): WholesaleOrderDraft {
  const key = `${line.productId}::${line.size}`;
  const lines = draft.lines.filter((l) => `${l.productId}::${l.size}` !== key);
  if (line.quantity > 0) lines.push(line);
  return { lines, updatedAt: new Date().toISOString() };
}

export function orderTotals(draft: WholesaleOrderDraft): {
  totalUnits: number;
  merchandiseSubtotalUsd: number;
  styleCount: number;
} {
  const totalUnits = draft.lines.reduce((sum, l) => sum + l.quantity, 0);
  const merchandiseSubtotalUsd = draft.lines.reduce(
    (sum, l) => sum + l.quantity * l.wholesaleUsd,
    0,
  );
  const styleCount = new Set(draft.lines.map((l) => l.productId)).size;
  return { totalUnits, merchandiseSubtotalUsd, styleCount };
}

export function unitsPerStyle(draft: WholesaleOrderDraft, productId: string): number {
  return draft.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity, 0);
}

export function meetsMoq(
  draft: WholesaleOrderDraft,
  minOrderPieces: number,
  minPiecesPerDesign: number,
): { ok: boolean; totalOk: boolean; stylesOk: boolean } {
  const { totalUnits } = orderTotals(draft);
  const byStyle = new Map<string, number>();
  for (const line of draft.lines) {
    byStyle.set(line.productId, (byStyle.get(line.productId) ?? 0) + line.quantity);
  }
  const stylesOk =
    byStyle.size === 0 || [...byStyle.values()].every((n) => n >= minPiecesPerDesign);
  const totalOk = totalUnits >= minOrderPieces;
  return { ok: totalOk && stylesOk && totalUnits > 0, totalOk, stylesOk };
}
