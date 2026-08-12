import { useEffect, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardKicker, CardTitle } from '@/components/ui/Card';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { backfillRecentConversionAttribution } from '@/lib/outreachAttribution';
import {
  getOutreachGoalSettings,
  updateOutreachGoalSettings,
  type OutreachGoalSettings,
} from '@/lib/outreachGoals';

const TIMEZONES = [
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Toronto',
  'America/Halifax',
  'UTC',
] as const;

type SectionState = { busy: boolean; error: string | null; success: string | null };
const idle: SectionState = { busy: false, error: null, success: null };

export function OutreachGoalsSettingsCard() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<OutreachGoalSettings | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState('5');
  const [planningPct, setPlanningPct] = useState('1.5');
  const [timezone, setTimezone] = useState('America/Vancouver');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SectionState>(idle);
  const [backfillState, setBackfillState] = useState<SectionState>(idle);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getOutreachGoalSettings();
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setSettings(result.settings);
      setMonthlyTarget(String(result.settings.monthlyTarget));
      setPlanningPct(String(result.settings.planningConversionRate * 100));
      setTimezone(result.settings.businessTimezone);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState({ busy: true, error: null, success: null });
    const target = Number(monthlyTarget);
    const pct = Number(planningPct);
    if (!Number.isFinite(target) || target < 0) {
      setSaveState({
        busy: false,
        error: 'Monthly target must be a non-negative number',
        success: null,
      });
      return;
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setSaveState({
        busy: false,
        error: 'Planning conversion % must be between 0 and 100 (exclusive of 0)',
        success: null,
      });
      return;
    }

    const result = await updateOutreachGoalSettings({
      monthlyTarget: target,
      planningConversionRate: pct / 100,
      businessTimezone: timezone,
      updatedBy: user?.id ?? null,
    });
    if (!result.ok) {
      setSaveState({ busy: false, error: result.error, success: null });
      return;
    }
    setSettings(result.settings);
    setSaveState({ busy: false, error: null, success: 'Goals saved' });
  }

  async function onBackfill() {
    setBackfillState({ busy: true, error: null, success: null });
    const result = await backfillRecentConversionAttribution({ lookbackDays: 90 });
    if (!result.ok) {
      setBackfillState({ busy: false, error: result.error, success: null });
      return;
    }
    setBackfillState({
      busy: false,
      error: null,
      success: `Backfill complete: ${result.inserted} inserted, ${result.skipped} skipped`,
    });
  }

  return (
    <Card>
      <CardKicker>Outreach</CardKicker>
      <CardTitle>Active account goals</CardTitle>
      <CardBody className="flex flex-col gap-3">
        <p className="text-ink/70 m-0 text-sm">
          Primary success metric is Prospect → Active Account. Opens, clicks, Warm/Hot, and calls
          are leading indicators only. Planning conversion is used until enough attributed
          conversions exist ({settings?.minAttributedConversions ?? 8}).
        </p>
        {loadError ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {loadError}
          </p>
        ) : null}
        <form className="flex flex-col gap-3" onSubmit={onSave}>
          <Field>
            <FieldLabel>Monthly Active Account target</FieldLabel>
            <Input
              type="number"
              min="0"
              step="1"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
              disabled={saveState.busy}
            />
          </Field>
          <Field>
            <FieldLabel>Planning conversion rate (%)</FieldLabel>
            <Input
              type="number"
              min="0.01"
              max="100"
              step="0.1"
              value={planningPct}
              onChange={(e) => setPlanningPct(e.target.value)}
              disabled={saveState.busy}
            />
            <p className="text-ink/55 m-0 mt-1 text-xs">
              Default 1.5%. Visible planning assumption — not hidden magic.
            </p>
          </Field>
          <Field>
            <FieldLabel>Business timezone</FieldLabel>
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={saveState.busy}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              {TIMEZONES.includes(timezone as (typeof TIMEZONES)[number]) ? null : (
                <option value={timezone}>{timezone}</option>
              )}
            </Select>
          </Field>
          {saveState.error ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {saveState.error}
            </p>
          ) : null}
          {saveState.success ? (
            <p className="text-ink/70 m-0 text-sm">{saveState.success}</p>
          ) : null}
          <div>
            <Button type="submit" variant="primary" disabled={saveState.busy || !settings}>
              {saveState.busy ? 'Saving…' : 'Save goals'}
            </Button>
          </div>
        </form>

        <div className="border-ink/10 flex flex-col gap-2 border-t pt-3">
          <p className="text-ink/70 m-0 text-sm">
            Optional: backfill last-touch attribution for recent converts missing a record. Never
            overwrites staff-confirmed links.
          </p>
          {backfillState.error ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {backfillState.error}
            </p>
          ) : null}
          {backfillState.success ? (
            <p className="text-ink/70 m-0 text-sm">{backfillState.success}</p>
          ) : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={backfillState.busy}
              onClick={() => void onBackfill()}
            >
              {backfillState.busy ? 'Backfilling…' : 'Backfill last 90 days'}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
