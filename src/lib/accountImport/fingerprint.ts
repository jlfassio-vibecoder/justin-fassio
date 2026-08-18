import { normalizeProspectName } from '@/lib/prospectListImport';

export function importFingerprint(input: {
  name: string;
  stateCode: string | null;
  postal5: string | null;
}): string | null {
  const name = normalizeProspectName(input.name);
  if (!name) return null;
  const state = (input.stateCode ?? '').trim().toLowerCase();
  const zip = (input.postal5 ?? '').replace(/\D/g, '').slice(0, 5);
  if (!state && !zip) return null;
  return `${name}|${state}|${zip}`;
}
