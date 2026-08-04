import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AccountContactsSection } from '@/components/AccountContactsSection';
import { AccountNotesEditor } from '@/components/AccountNotesEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import {
  accountContactRoleLabel,
  searchContactsByName,
  type AccountContactSearchHit,
} from '@/lib/accountContacts';
import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import type { AccountReorderSettingsRow } from '@/lib/accountReorderSettings';
import { demoteToProspect } from '@/lib/convertToActiveAccount';
import type { Prospect } from '@/lib/prospects';
import type { ApparelSeason } from '@/types/database';

export interface AccountDetailSummary {
  tlvCad: number;
  lastOrderDate: string | null;
  latestSeason: ApparelSeason | null;
}

interface AccountDetailDrawerProps {
  account: Prospect | null;
  summary?: AccountDetailSummary | null;
  reorderSettings?: AccountReorderSettingsRow | null;
  onClose: () => void;
  onLogCall: (account: Prospect) => void;
  onLogOrder: (account: Prospect) => void;
  onNotesSaved?: (notes: string | null) => void;
  onDemoted?: (prospect: Prospect) => void;
}

function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function ContactNameSearch({ currentAccountId }: { currentAccountId: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<AccountContactSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  const q = searchQuery.trim();
  const showResults = q.length >= 2;

  useEffect(() => {
    if (!showResults) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void searchContactsByName(q).then((result) => {
        if (!active) return;
        setSearchBusy(false);
        if (result.error) {
          setSearchHits([]);
          setSearchError(result.error);
          return;
        }
        setSearchError(null);
        setSearchHits(result.data);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [q, showResults]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-ink/70 text-xs" htmlFor="account-contact-search">
        Find contact by name
      </label>
      <Input
        id="account-contact-search"
        placeholder="Search buyers, managers, owners…"
        value={searchQuery}
        onChange={(e) => {
          const next = e.target.value;
          setSearchQuery(next);
          if (next.trim().length < 2) {
            setSearchHits([]);
            setSearchError(null);
            setSearchBusy(false);
          } else {
            setSearchBusy(true);
          }
        }}
      />
      {showResults && searchBusy ? <p className="text-ink/60 m-0 text-xs">Searching…</p> : null}
      {showResults && searchError ? (
        <p className="text-accent-800 m-0 text-xs" role="alert">
          {searchError}
        </p>
      ) : null}
      {showResults && !searchBusy && searchHits.length > 0 ? (
        <ul className="border-ink/10 m-0 list-none rounded-md border p-0 text-xs">
          {searchHits.map((hit) => (
            <li key={hit.id} className="border-ink/10 border-b px-3 py-2 last:border-b-0">
              <span className="font-semibold">{hit.fullName}</span>
              {' · '}
              {accountContactRoleLabel(hit.role)}
              <div className="text-ink/65 mt-0.5">
                {hit.accountName} ({hit.accountCity})
                {hit.accountId !== currentAccountId ? ' — other account' : ''}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {showResults && !searchBusy && !searchError && searchHits.length === 0 ? (
        <p className="text-ink/60 m-0 text-xs">No contacts match.</p>
      ) : null}
    </div>
  );
}

export function AccountDetailDrawer({
  account,
  summary = null,
  reorderSettings = null,
  onClose,
  onLogCall,
  onLogOrder,
  onNotesSaved,
  onDemoted,
}: AccountDetailDrawerProps) {
  const [demoteBusy, setDemoteBusy] = useState(false);
  const [demoteError, setDemoteError] = useState<string | null>(null);

  if (!account) return null;

  async function handleDemote() {
    const confirmed = window.confirm(
      `Move ${account!.name} back to Prospects?\n\nOrder history and contacts stay on this account (ID ${account!.id}). It will leave Active Accounts.`,
    );
    if (!confirmed) return;

    setDemoteBusy(true);
    setDemoteError(null);
    const result = await demoteToProspect({
      accountId: account!.id,
      currentStatus: account!.accountStatus,
    });
    setDemoteBusy(false);

    if (!result.ok) {
      setDemoteError(result.error);
      return;
    }

    onDemoted?.({
      ...account!,
      accountStatus: 'prospect',
      convertedAt: null,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-detail-title"
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p id="account-detail-title" className="font-heading text-xl leading-tight">
              {account.name}
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              ID {account.id} · Active account
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag variant="accent-2">{account.category}</Tag>
            <span className="text-ink/70 text-sm">
              {account.city} ({account.region})
            </span>
          </div>

          <dl className="m-0 grid gap-3 text-sm">
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Store phone</dt>
              <dd className="m-0 mt-0.5">{account.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Address</dt>
              <dd className="m-0 mt-0.5">{account.address || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Converted</dt>
              <dd className="m-0 mt-0.5">{formatTimestamp(account.convertedAt)}</dd>
            </div>
            <div>
              <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                Initial order date
              </dt>
              <dd className="m-0 mt-0.5">{formatTimestamp(account.initialOrderDate)}</dd>
            </div>
            {summary ? (
              <>
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">TLV</dt>
                  <dd className="m-0 mt-0.5">{formatCad(summary.tlvCad)}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    Last order
                  </dt>
                  <dd className="m-0 mt-0.5">{summary.lastOrderDate || '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Season</dt>
                  <dd className="m-0 mt-0.5">
                    {summary.latestSeason ? apparelSeasonLabel(summary.latestSeason) : '—'}
                  </dd>
                </div>
              </>
            ) : null}
            {reorderSettings?.next_suggested_contact_date ? (
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  Next suggested contact
                </dt>
                <dd className="m-0 mt-0.5">{reorderSettings.next_suggested_contact_date}</dd>
              </div>
            ) : null}
            {reorderSettings?.ai_reorder_notes ? (
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  AI reorder notes
                </dt>
                <dd className="text-ink/80 m-0 mt-0.5 leading-relaxed">
                  {reorderSettings.ai_reorder_notes}
                </dd>
              </div>
            ) : null}
          </dl>

          <AccountNotesEditor
            key={account.id}
            accountId={account.id}
            initialNotes={account.notes}
            onSaved={onNotesSaved}
          />

          <ContactNameSearch key={account.id} currentAccountId={account.id} />

          <AccountContactsSection key={account.id} accountId={account.id} />
        </div>

        <div className="border-ink/10 flex flex-col gap-2 border-t px-5 py-4">
          {demoteError ? (
            <p className="text-accent-800 m-0 text-xs" role="alert">
              {demoteError}
            </p>
          ) : null}
          <Button
            variant="primary"
            onClick={() => {
              onLogOrder(account);
              onClose();
            }}
          >
            + Log Order / Reorder
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onLogCall(account);
              onClose();
            }}
          >
            Log Call
          </Button>
          <Button variant="secondary" disabled={demoteBusy} onClick={() => void handleDemote()}>
            {demoteBusy ? 'Moving…' : 'Move to Prospects'}
          </Button>
        </div>
      </aside>
    </>
  );
}
