import { useEffect, useState } from 'react';
import { CalendarAgenda } from '@/components/calendar/CalendarAgenda';
import {
  CalendarEventForm,
  type CalendarEventFormSubmit,
} from '@/components/calendar/CalendarEventForm';
import { CalendarEventLinkForm } from '@/components/calendar/CalendarEventLinkForm';
import { ConnectGoogleWorkspaceCard } from '@/components/google/ConnectGoogleWorkspaceCard';
import { Button } from '@/components/ui/Button';
import {
  cancelCalendarEventClient,
  createCalendarEventClient,
  getCalendarEventClient,
  listCalendarEventsClient,
  updateCalendarEventClient,
} from '@/lib/calendarClientBrowser';
import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import type { CalendarEventDetail, CalendarEventSummary } from '@/lib/google/calendarTypes';
import { fetchGoogleConnection } from '@/lib/googleConnectionClient';
import { useOptionalLineContext } from '@/lib/lineContext';

export function CalendarTab() {
  const line = useOptionalLineContext();
  const [connection, setConnection] = useState<GoogleConnectionPublic | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEventSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null);
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      setConnectionLoading(true);
      const result = await fetchGoogleConnection();
      if (!active) return;
      if (!result.ok) {
        setConnection(null);
        setConnectionLoading(false);
        return;
      }
      setConnection(result.connection);
      setConnectionLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const canLoadEvents = Boolean(connection?.connected && connection.hasCalendarEvents);

  useEffect(() => {
    if (!canLoadEvents) return;

    let active = true;
    void (async () => {
      setListLoading(true);
      setListError(null);
      const result = await listCalendarEventsClient({ maxResults: 25 });
      if (!active) return;
      if (!result.ok) {
        setEvents([]);
        setListError(result.error);
        setListLoading(false);
        if (result.needsCalendarEvents || result.needsConnect || result.needsReconnect) {
          setReloadToken((n) => n + 1);
        }
        return;
      }
      setEvents(result.events);
      setListLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [canLoadEvents, reloadToken]);

  const visibleEvents = canLoadEvents ? events : [];

  async function openEvent(event: CalendarEventSummary) {
    setSelectedId(event.id);
    setFormError(null);
    setFormMode('edit');
    const result = await getCalendarEventClient(event.id);
    if (!result.ok) {
      setFormError(result.error);
      setDetail(null);
      return;
    }
    setDetail(result.event);
  }

  async function handleCreate(input: CalendarEventFormSubmit) {
    setFormBusy(true);
    setFormError(null);
    const result = await createCalendarEventClient({
      ...input,
      salesLineId: line.multiLineWrites ? line.salesLineId : null,
    });
    setFormBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.linkError) {
      setFormError(`Event created, but CRM link failed: ${result.linkError}`);
      setSelectedId(result.event.id);
      setReloadToken((n) => n + 1);
      return;
    }
    setFormMode('closed');
    setDetail(null);
    setSelectedId(result.event.id);
    setReloadToken((n) => n + 1);
  }

  async function handleUpdate(input: CalendarEventFormSubmit) {
    if (!selectedId) return;
    setFormBusy(true);
    setFormError(null);
    const result = await updateCalendarEventClient(selectedId, {
      ...input,
      salesLineId: line.multiLineWrites ? line.salesLineId : null,
    });
    setFormBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setDetail(result.event);
    if (result.linkError) {
      setFormError(`Event updated, but CRM link failed: ${result.linkError}`);
    }
    setReloadToken((n) => n + 1);
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm('Cancel this event on Google Calendar? Invitees will be notified.')) {
      return;
    }
    setFormBusy(true);
    setFormError(null);
    const result = await cancelCalendarEventClient(selectedId);
    setFormBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormMode('closed');
    setDetail(null);
    setSelectedId(null);
    setReloadToken((n) => n + 1);
  }

  if (connectionLoading) {
    return <p className="text-ink/60 m-0 text-sm">Checking Google connection…</p>;
  }

  if (!connection?.connected || !connection.hasCalendarEvents) {
    return <ConnectGoogleWorkspaceCard purpose="calendar" returnTab="calendar" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading m-0 text-xl">Calendar</h2>
          <p className="text-ink/60 m-0 mt-1 text-sm">
            Upcoming events from {connection.googleEmail ?? 'Google Calendar'} (primary calendar).
            Google remains the source of truth.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
            setFormError(null);
            setFormMode('create');
          }}
        >
          New event
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="border-ink/10 bg-surface rounded-md border p-4">
          <h3 className="font-heading text-ink/70 m-0 mb-3 text-xs tracking-wide uppercase">
            Upcoming
          </h3>
          <CalendarAgenda
            events={visibleEvents}
            loading={listLoading}
            error={listError}
            selectedId={selectedId}
            onSelect={(event) => void openEvent(event)}
          />
        </section>

        <section className="border-ink/10 bg-surface rounded-md border p-4">
          {formMode === 'closed' ? (
            <p className="text-ink/55 m-0 text-sm">
              Select an event to edit, or create a new one. Optionally link events to CRM
              prospects/accounts when creating or from the edit panel.
            </p>
          ) : null}
          {formMode === 'create' ? (
            <CalendarEventForm
              mode="create"
              busy={formBusy}
              error={formError}
              showCrmAssociation
              onSubmit={(input) => void handleCreate(input)}
              onCancel={() => {
                setFormMode('closed');
                setFormError(null);
              }}
            />
          ) : null}
          {formMode === 'edit' ? (
            detail ? (
              <div className="flex flex-col gap-4">
                <CalendarEventForm
                  key={detail.id}
                  mode="edit"
                  initial={detail}
                  busy={formBusy}
                  error={formError}
                  onSubmit={(input) => void handleUpdate(input)}
                  onCancel={() => {
                    setFormMode('closed');
                    setFormError(null);
                  }}
                  onDelete={() => void handleDelete()}
                />
                <CalendarEventLinkForm eventId={detail.id} />
              </div>
            ) : (
              <p className="text-ink/60 m-0 text-sm">{formError ?? 'Loading event…'}</p>
            )
          ) : null}
        </section>
      </div>
    </div>
  );
}
