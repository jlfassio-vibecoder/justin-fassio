/* eslint-disable react-refresh/only-export-components -- LineProvider + context hooks */
/**
 * Phase 2 staff line context provider + hooks.
 * Helpers live in lineContextStorage.ts to keep non-component exports separate.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchRepresentedLines, type LinePortfolio } from '@/lib/lines';
import { persistLastLineSlug, readLastLineSlug } from '@/lib/lineContextStorage';
import type { LineKey } from '@/types';
import type { LineStatus } from '@/types/database';

export type LineContextValue = {
  multiLineUi: boolean;
  /** Staff snapshot of FEATURE_MULTI_LINE_WRITES (not readable from PUBLIC_ env). */
  multiLineWrites: boolean;
  /** Staff snapshot of FEATURE_MULTI_LINE_AI (not readable from PUBLIC_ env). */
  multiLineAi: boolean;
  /** Staff snapshot of FEATURE_LINE_TERRITORY_ADMIN (not readable from PUBLIC_ env). */
  multiLineTerritoryAdmin: boolean;
  /** Staff snapshot of FEATURE_EAGLE_PEAK_SELLING (selling && UI && writes). */
  eaglePeakSelling: boolean;
  /** Staff snapshot of FEATURE_EAGLE_PEAK_OUTREACH (outreach && UI). */
  eaglePeakOutreach: boolean;
  /** Staff snapshot of FEATURE_BIG_FISH_SELLING (selling && UI && writes). */
  bigFishSelling: boolean;
  /** Staff snapshot of FEATURE_BIG_FISH_OUTREACH (outreach && UI). */
  bigFishOutreach: boolean;
  salesLineId: string | null;
  lineSlug: LineKey | null;
  status: LineStatus | null;
  defaultCurrency: string | null;
  name: string | null;
  loading: boolean;
  error: string | null;
  unknownLine: boolean;
  representedLines: LinePortfolio[];
  /** Navigate / persist a represented line slug (caller should update URL). */
  selectLineSlug: (slug: LineKey) => void;
};

const LineContext = createContext<LineContextValue | null>(null);

function initialSlug(multiLineUi: boolean, urlLineSlug: string | null): LineKey | null {
  if (!multiLineUi) return null;
  if (urlLineSlug?.trim()) return urlLineSlug.trim().toLowerCase();
  return readLastLineSlug() ?? 'ogr';
}

type LineProviderProps = {
  multiLineUi: boolean;
  multiLineWrites?: boolean;
  multiLineAi?: boolean;
  multiLineTerritoryAdmin?: boolean;
  eaglePeakSelling?: boolean;
  eaglePeakOutreach?: boolean;
  bigFishSelling?: boolean;
  bigFishOutreach?: boolean;
  /** URL slug when on /app/lines/:lineSlug; null on /app (resolved to last or ogr). */
  urlLineSlug?: string | null;
  children: ReactNode;
};

export function LineProvider({
  multiLineUi,
  multiLineWrites = false,
  multiLineAi = false,
  multiLineTerritoryAdmin = false,
  eaglePeakSelling = false,
  eaglePeakOutreach = false,
  bigFishSelling = false,
  bigFishOutreach = false,
  urlLineSlug = null,
  children,
}: LineProviderProps) {
  const [representedLines, setRepresentedLines] = useState<LinePortfolio[]>([]);
  const [linesLoading, setLinesLoading] = useState(multiLineUi);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<LineKey | null>(() =>
    initialSlug(multiLineUi, urlLineSlug),
  );

  // URL slug is source of truth.
  // Copilot suggestion ignored: syncing via useEffect trips react-hooks/set-state-in-effect; render-time prop sync matches RepCommandCenter deep-link pattern.
  const urlNormalized = urlLineSlug?.trim().toLowerCase() ?? null;
  if (multiLineUi && urlNormalized && selectedSlug !== urlNormalized) {
    const known = representedLines.some((line) => line.code === urlNormalized);
    if (known) {
      setSelectedSlug(urlNormalized);
      persistLastLineSlug(urlNormalized);
    }
  }

  useEffect(() => {
    if (!multiLineUi) return;
    let active = true;
    void fetchRepresentedLines().then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setRepresentedLines([]);
      } else {
        setError(null);
        setRepresentedLines(result.data);
      }
      setLinesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [multiLineUi]);

  const unknownLine = Boolean(
    multiLineUi &&
    urlNormalized &&
    !linesLoading &&
    !representedLines.some((line) => line.code === urlNormalized),
  );

  const current = useMemo(() => {
    if (!selectedSlug) return null;
    return representedLines.find((l) => l.code === selectedSlug) ?? null;
  }, [representedLines, selectedSlug]);

  const selectLineSlug = useCallback((slug: LineKey) => {
    setSelectedSlug(slug);
    persistLastLineSlug(slug);
  }, []);

  const loading = multiLineUi ? linesLoading : false;

  const value = useMemo<LineContextValue>(
    () => ({
      multiLineUi,
      multiLineWrites,
      multiLineAi,
      multiLineTerritoryAdmin,
      eaglePeakSelling,
      eaglePeakOutreach,
      bigFishSelling,
      bigFishOutreach,
      salesLineId: current?.id ?? null,
      lineSlug: unknownLine ? null : selectedSlug,
      status: current?.status ?? null,
      defaultCurrency: current?.defaultCurrency ?? null,
      name: current?.name ?? null,
      loading,
      error,
      unknownLine,
      representedLines,
      selectLineSlug,
    }),
    [
      multiLineUi,
      multiLineWrites,
      multiLineAi,
      multiLineTerritoryAdmin,
      eaglePeakSelling,
      eaglePeakOutreach,
      bigFishSelling,
      bigFishOutreach,
      current,
      selectedSlug,
      loading,
      error,
      unknownLine,
      representedLines,
      selectLineSlug,
    ],
  );

  return <LineContext.Provider value={value}>{children}</LineContext.Provider>;
}

export function useLineContext(): LineContextValue {
  const ctx = useContext(LineContext);
  if (!ctx) {
    throw new Error('useLineContext must be used within LineProvider');
  }
  return ctx;
}

/** Safe for tabs that may render under flag-off shell without a provider. */
export function useOptionalLineContext(): LineContextValue {
  const ctx = useContext(LineContext);
  return (
    ctx ?? {
      multiLineUi: false,
      multiLineWrites: false,
      multiLineAi: false,
      multiLineTerritoryAdmin: false,
      eaglePeakSelling: false,
      eaglePeakOutreach: false,
      bigFishSelling: false,
      bigFishOutreach: false,
      salesLineId: null,
      lineSlug: null,
      status: null,
      defaultCurrency: null,
      name: null,
      loading: false,
      error: null,
      unknownLine: false,
      representedLines: [],
      selectLineSlug: () => {},
    }
  );
}
