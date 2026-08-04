import { isRemoteSubterritory } from '@/lib/prospectEnrichment/bcTerritory';

export type ProspectPriority = 'Tier 1' | 'Tier 2' | 'Tier 3';
export type ProvisionalGrade = 'A (provisional)' | 'B (provisional)' | 'C (provisional)';

export type PriorityGradeInput = {
  fitScore: number;
  subterritory: string | null | undefined;
  /** Okanagan primary district / any Okanagan subterritory, or validated strategic reference. */
  inOkanagan?: boolean;
  strategicReference?: boolean;
};

/**
 * Assign provisional priority from fit score + remote rules (doc §6).
 * Remote accounts never become Tier 1 from score alone.
 */
export function assignProspectPriority(input: PriorityGradeInput): ProspectPriority {
  const score = input.fitScore;
  const remote = isRemoteSubterritory(input.subterritory);

  if (remote) {
    if (score >= 8) return 'Tier 2';
    return 'Tier 3';
  }

  if (score >= 9 && (input.inOkanagan || input.strategicReference)) {
    return 'Tier 1';
  }
  if (score >= 7) return 'Tier 2';
  return 'Tier 3';
}

export function assignProvisionalGrade(priority: ProspectPriority): ProvisionalGrade {
  if (priority === 'Tier 1') return 'A (provisional)';
  if (priority === 'Tier 2') return 'B (provisional)';
  return 'C (provisional)';
}

export function isOkanaganSubterritory(subterritory: string | null | undefined): boolean {
  if (!subterritory) return false;
  return /okanagan/i.test(subterritory);
}
