import { useState } from 'react';
import {
  CalendarEventForm,
  type CalendarEventFormSubmit,
} from '@/components/calendar/CalendarEventForm';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { createCalendarEventClient } from '@/lib/calendarClientBrowser';

export type ScheduleMeetingModalProps = {
  open: boolean;
  prospectId: number;
  prospectName: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function ScheduleMeetingModal({
  open,
  prospectId,
  prospectName,
  onClose,
  onCreated,
}: ScheduleMeetingModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(input: CalendarEventFormSubmit) {
    setBusy(true);
    setError(null);
    const result = await createCalendarEventClient({
      ...input,
      prospectId,
      accountContactId: input.accountContactId ?? null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.linkError) {
      setError(`Event created, but CRM link failed: ${result.linkError}`);
      onCreated?.();
      return;
    }
    onCreated?.();
    onClose();
  }

  return (
    <DialogBackdrop
      open={open}
      onClose={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
    >
      <div className="bg-surface border-ink/10 max-h-[90vh] overflow-y-auto rounded-md border p-5 shadow-lg">
        <DialogTitle>Schedule meeting</DialogTitle>
        <p className="text-ink/60 m-0 mt-1 mb-4 text-sm">
          Creates an event on your primary Google Calendar and links it to {prospectName}.
        </p>
        <CalendarEventForm
          key={prospectId}
          mode="create"
          busy={busy}
          error={error}
          showCrmAssociation
          lockedProspectId={prospectId}
          lockedProspectName={prospectName}
          defaultCreateMeet
          onSubmit={(input) => void handleSubmit(input)}
          onCancel={() => {
            if (busy) return;
            setError(null);
            onClose();
          }}
        />
      </div>
    </DialogBackdrop>
  );
}
