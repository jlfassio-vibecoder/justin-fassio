/**
 * Dialing context for Log Call: tel links and locked social URLs.
 * Client-side only (browser supabase + RLS).
 */

import { supabase } from '@/lib/supabase';

export const LOG_CALL_SOCIAL_SOURCE_TYPES = [
  'instagram',
  'facebook',
  'tiktok',
  'pinterest',
] as const;

export type LogCallSocialSourceType = (typeof LOG_CALL_SOCIAL_SOURCE_TYPES)[number];

export type LogCallSocialLink = {
  sourceType: LogCallSocialSourceType;
  url: string;
  label: string;
};

const SOCIAL_LABELS: Record<LogCallSocialSourceType, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
};

function isLogCallSocialSourceType(value: string): value is LogCallSocialSourceType {
  return (LOG_CALL_SOCIAL_SOURCE_TYPES as readonly string[]).includes(value);
}

/** Digits (and leading +) for a tel: href; empty when nothing dialable. */
export function formatTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits || digits === '+') return null;
  return `tel:${digits}`;
}

export function normalizeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function fetchLogCallSocialLinks(
  retailerId: number,
): Promise<{ data: LogCallSocialLink[]; error: string | null }> {
  const { data, error } = await supabase
    .from('account_research_source_locks')
    .select('source_type, locked_url')
    .eq('retailer_id', retailerId);

  if (error) {
    return { data: [], error: error.message };
  }

  const links: LogCallSocialLink[] = [];
  for (const row of data ?? []) {
    if (!isLogCallSocialSourceType(row.source_type)) continue;
    const url = normalizeExternalUrl(row.locked_url);
    if (!url) continue;
    links.push({
      sourceType: row.source_type,
      url,
      label: SOCIAL_LABELS[row.source_type],
    });
  }

  links.sort((a, b) => a.label.localeCompare(b.label));
  return { data: links, error: null };
}
