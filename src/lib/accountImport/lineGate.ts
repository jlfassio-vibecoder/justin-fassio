import {
  isZoominfoLeadSource,
  ZOOMINFO_IMPORT_LINE_CODE,
} from '@/lib/accountImport/classification';
import { isRepresentedLineStatus } from '@/lib/lines';
import { STAFF_AI_ERRORS } from '@/lib/aiLineContext';
import { isUuid } from '@/lib/resolveSalesLineQuery';
import type { AccountImportSourceType } from '@/types/database';

export function parseRequiredSalesLineId(
  raw: unknown,
): { ok: true; salesLineId: string } | { ok: false; error: string; status: 400 } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: STAFF_AI_ERRORS.missingLine, status: 400 };
  }
  if (!isUuid(raw.trim())) {
    return { ok: false, error: STAFF_AI_ERRORS.invalidLine, status: 400 };
  }
  return { ok: true, salesLineId: raw.trim() };
}

export function assertImportLineAllowed(line: {
  code: string;
  status: string;
}): { ok: true } | { ok: false; error: string; status: 400 } {
  if (!isRepresentedLineStatus(line.status, line.code)) {
    return { ok: false, error: STAFF_AI_ERRORS.lineNotAllowed, status: 400 };
  }
  return { ok: true };
}

export function assertImportSourceLinePairing(
  sourceType: AccountImportSourceType,
  line: { code: string },
): { ok: true } | { ok: false; error: string; status: 400 } {
  if (isZoominfoLeadSource(sourceType) && line.code !== ZOOMINFO_IMPORT_LINE_CODE) {
    return {
      ok: false,
      error: 'ZoomInfo import is only available for Eagle Peak',
      status: 400,
    };
  }
  return { ok: true };
}
