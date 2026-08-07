/**
 * Product/showroom helpers for lifestyle themes + recommended retailer channels.
 * CRM prospect taxonomy lives in crmRetailTaxonomy.ts.
 */
export {
  BEST_SELLER_BADGE_MAX_RANK,
  LIFESTYLE_THEMES as RETAIL_CHANNEL_OPTIONS,
  LIFESTYLE_THEMES,
  type LifestyleTheme as RetailChannel,
  type LifestyleTheme,
  isLifestyleTheme as isRetailChannel,
  isLifestyleTheme,
  normalizeLifestyleThemes as normalizeRetailChannels,
  normalizeLifestyleThemes,
  lifestyleThemeLabel as retailChannelLabel,
  lifestyleThemeLabel,
  effectiveLifestyleThemes as effectiveRetailChannels,
  effectiveLifestyleThemes,
  inferLifestyleThemesFromCopy as inferRetailChannelsFromCopy,
  inferLifestyleThemesFromCopy,
  PRIMARY_RETAIL_CHANNELS,
  normalizePrimaryChannels,
  primaryRetailChannelLabel,
  MAX_RECOMMENDED_CHANNELS,
  type PrimaryRetailChannel,
} from '@/lib/crmRetailTaxonomy';

import { LIFESTYLE_THEMES, type LifestyleTheme, isLifestyleTheme } from '@/lib/crmRetailTaxonomy';

/** Resolve filter values that may be codes or display labels. */
export function resolveRetailChannelFilter(theme: string): LifestyleTheme | null {
  const t = theme.trim();
  if (!t) return null;
  if (isLifestyleTheme(t)) return t;
  const byLabel = LIFESTYLE_THEMES.find((o) => o.label === t);
  return byLabel?.value ?? null;
}
