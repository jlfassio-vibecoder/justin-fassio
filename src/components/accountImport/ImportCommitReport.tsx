import type { PreviewCounts } from '@/lib/accountImport/types';
import type { CommitReport, CommittedImportRow } from '@/lib/accountImport/commit';
import { commitReportToPreviewCounts } from '@/lib/accountImport/commitReportView';

export function ImportCountChips({ counts }: { counts: PreviewCounts }) {
  const chips = [
    ['Uploaded', counts.uploadedRows],
    ['Unique', counts.uniqueBusinesses],
    ['Duplicates', counts.duplicateSpreadsheetRows],
    ['Linked', counts.existingRecordsLinked],
    ['New retailers', counts.newRetailersProposed],
    ['Line accounts', counts.lineAccountsProposed],
    ['Contacts', counts.contactsProposed],
    ['Review', counts.rowsRequiringReview],
    ['Blocked', counts.blockedRows],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, value]) => (
        <span key={label} className="bg-ink/[0.06] rounded-full px-2 py-1 text-xs">
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

export function ImportCommitReport({
  report,
  rows,
}: {
  report: CommitReport;
  rows: CommittedImportRow[];
}) {
  return (
    <>
      <ImportCountChips counts={commitReportToPreviewCounts(report)} />
      <ul className="m-0 max-h-[40vh] list-none overflow-auto p-0">
        {rows
          .filter((row) => row.retailerId)
          .map((row) => (
            <li key={row.rowNumber} className="py-1 text-sm">
              <a className="text-accent" href={`/app?tab=accounts&prospectId=${row.retailerId}`}>
                {row.name} #{row.retailerId}
              </a>
              <span className="text-ink/60"> {row.status}</span>
            </li>
          ))}
      </ul>
    </>
  );
}
