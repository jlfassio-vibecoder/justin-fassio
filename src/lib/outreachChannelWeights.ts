/**
 * Derive nightly channel allocation weights from Phase 4 performance slices.
 * Mirrors pace conservatism: global gate, then smoothed per-channel rates.
 */

import { PRIMARY_RETAIL_CHANNELS, type PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import type { OutreachGoalSettings } from '@/lib/outreachGoals';
import { MIN_CHANNEL_SENDS } from '@/lib/outreachSelectionConstants';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';

export type ChannelWeightSource = 'uniform' | 'measured';

export type ChannelAllocationWeightsResult = {
  weights: Partial<Record<PrimaryRetailChannel, number>> | undefined;
  source: ChannelWeightSource;
};

function sliceByChannel(
  report: OutreachPerformanceReport,
): Map<string, { sends: number; conversions: number }> {
  const map = new Map<string, { sends: number; conversions: number }>();
  for (const row of report.byChannel) {
    map.set(row.key, { sends: row.sends, conversions: row.attributedConversions });
  }
  return map;
}

/**
 * Compute channel weights for allocateChannelsForDay.
 * Returns undefined weights when data is insufficient (caller uses round-robin).
 */
export function computeChannelAllocationWeights(input: {
  report: OutreachPerformanceReport | null;
  settings: OutreachGoalSettings;
}): ChannelAllocationWeightsResult {
  const report = input.report;
  if (!report || !input.settings.adaptiveWeightsEnabled) {
    return { weights: undefined, source: 'uniform' };
  }

  const totalAttributed = report.byChannel.reduce((sum, row) => sum + row.attributedConversions, 0);
  if (totalAttributed < input.settings.minAttributedConversions) {
    return { weights: undefined, source: 'uniform' };
  }

  const byChannel = sliceByChannel(report);
  let totalSends = 0;
  let totalConversions = 0;
  for (const row of report.byChannel) {
    if (row.sends > 0) {
      totalSends += row.sends;
      totalConversions += row.attributedConversions;
    }
  }

  if (totalSends <= 0) {
    return { weights: undefined, source: 'uniform' };
  }

  const globalRate = totalConversions / totalSends;
  const alpha = input.settings.smoothingAlpha;
  const floor = input.settings.measuredRateFloor;
  const weights: Partial<Record<PrimaryRetailChannel, number>> = {};

  for (const { value: channel } of PRIMARY_RETAIL_CHANNELS) {
    const slice = byChannel.get(channel);
    const sends = slice?.sends ?? 0;
    const conversions = slice?.conversions ?? 0;

    let blendedRate: number;
    if (sends < MIN_CHANNEL_SENDS) {
      blendedRate = globalRate;
    } else {
      const rawRate = conversions / sends;
      blendedRate = alpha * rawRate + (1 - alpha) * globalRate;
    }

    weights[channel] = Math.max(blendedRate, floor);
  }

  return { weights, source: 'measured' };
}
