import type {
  AccountImportMatchDecision,
  LookalikeCandidateStatus,
  LookalikeJobStatus,
} from '@/types/database';

export type LookalikeSeedListItem = {
  retailerId: number;
  name: string;
  city: string;
  territoryCode: string | null;
};

export type LookalikeCandidateView = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  evidence: string | null;
  matchDecision: AccountImportMatchDecision | null;
  status: LookalikeCandidateStatus;
  retailerId: number | null;
};

export type LookalikeJobSnapshot = {
  jobId: string;
  salesLineId: string;
  status: LookalikeJobStatus;
  traitBrief: string | null;
  error: string | null;
  candidates: LookalikeCandidateView[];
};
