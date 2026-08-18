import type { CommitReport } from '@/lib/accountImport/commit';
import type { PreviewCounts } from '@/lib/accountImport/types';

export function commitReportToPreviewCounts(report: CommitReport): PreviewCounts {
  return {
    uploadedRows: report.uploadedRows,
    uniqueBusinesses: report.uniqueBusinesses,
    duplicateSpreadsheetRows: report.duplicateSpreadsheetRows,
    existingRecordsLinked: report.existingRecordsLinked,
    newRetailersProposed: report.newRetailersCreated,
    lineAccountsProposed: report.lineAccountsCreatedOrUpdated,
    contactsProposed: report.contactsCreated,
    rowsRequiringReview: report.rowsRequiringReview,
    blockedRows: report.blockedRows,
  };
}
