import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel } from '@/components/ui/Input';
import {
  LIFESTYLE_THEMES,
  MAX_SECONDARY_CHANNELS,
  PRIMARY_RETAIL_CHANNELS,
  RETAIL_CAPABILITIES,
  VENUE_CONTEXTS,
  clampSecondaryChannels,
  normalizeLifestyleThemes,
  normalizeRetailCapabilities,
  normalizeSubchannels,
  normalizeVenueContexts,
  primaryRetailChannelLabel,
  subchannelOptionsFor,
  type LifestyleTheme,
  type PrimaryRetailChannel,
  type RetailCapability,
  type VenueContext,
} from '@/lib/crmRetailTaxonomy';
import type { ProspectTaxonomyPatch } from '@/lib/prospects';

type Props = {
  category: PrimaryRetailChannel;
  secondaryChannels: PrimaryRetailChannel[];
  retailSubchannels: string[];
  venueContexts: VenueContext[];
  lifestyleThemes: LifestyleTheme[];
  retailCapabilities: RetailCapability[];
  busy?: boolean;
  onSave: (patch: ProspectTaxonomyPatch) => Promise<void>;
  /** When true, wrap fields in a toggle section (default closed). */
  collapsible?: boolean;
  defaultOpen?: boolean;
};

function CheckboxGroup<T extends string>({
  options,
  values,
  disabled,
  onToggle,
}: {
  options: { value: T; label: string }[];
  values: readonly T[];
  disabled?: boolean;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="gap-2.1 flex flex-wrap">
      {options.map((opt) => {
        const checked = values.includes(opt.value);
        return (
          <label
            key={opt.value}
            className="border-divider text-ink inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function ProspectTaxonomyEditor({
  category,
  secondaryChannels,
  retailSubchannels,
  venueContexts,
  lifestyleThemes,
  retailCapabilities,
  busy = false,
  onSave,
  collapsible = false,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const [primary, setPrimary] = useState(category);
  const [secondary, setSecondary] = useState(secondaryChannels);
  const [subs, setSubs] = useState(retailSubchannels);
  const [venues, setVenues] = useState(venueContexts);
  const [themes, setThemes] = useState(lifestyleThemes);
  const [caps, setCaps] = useState(retailCapabilities);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subOpts = useMemo(() => subchannelOptionsFor(primary, secondary), [primary, secondary]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const nextSecondary = clampSecondaryChannels(primary, secondary);
      await onSave({
        category: primary,
        secondaryChannels: nextSecondary,
        retailSubchannels: normalizeSubchannels(subs, subOpts),
        venueContexts: normalizeVenueContexts(venues),
        lifestyleThemes: normalizeLifestyleThemes(themes),
        retailCapabilities: normalizeRetailCapabilities(caps),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const editor = (
    <div className="gap-3.1 flex flex-col">
      <Field>
        <FieldLabel>Primary Channel</FieldLabel>
        <select
          className="border-divider bg-bg focus:border-accent-700 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          value={primary}
          disabled={busy || saving}
          onChange={(e) => {
            const next = e.target.value as PrimaryRetailChannel;
            setPrimary(next);
            setSecondary((prev) => clampSecondaryChannels(next, prev));
            setSubs([]);
          }}
        >
          {PRIMARY_RETAIL_CHANNELS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field>
        <FieldLabel>Secondary Channels (up to {MAX_SECONDARY_CHANNELS})</FieldLabel>
        <CheckboxGroup
          options={PRIMARY_RETAIL_CHANNELS.filter((o) => o.value !== primary)}
          values={secondary}
          disabled={busy || saving}
          onToggle={(value) => {
            setSecondary((prev) => {
              if (prev.includes(value)) return prev.filter((v) => v !== value);
              if (prev.length >= MAX_SECONDARY_CHANNELS) return prev;
              return clampSecondaryChannels(primary, [...prev, value]);
            });
          }}
        />
      </Field>

      {subOpts.length > 0 ? (
        <Field>
          <FieldLabel>Retail Subchannels</FieldLabel>
          <CheckboxGroup
            options={subOpts}
            values={subs}
            disabled={busy || saving}
            onToggle={(value) => {
              setSubs((prev) =>
                prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
              );
            }}
          />
        </Field>
      ) : null}

      <Field>
        <FieldLabel>Venue Context</FieldLabel>
        <CheckboxGroup
          options={VENUE_CONTEXTS}
          values={venues}
          disabled={busy || saving}
          onToggle={(value) => {
            setVenues((prev) =>
              prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
            );
          }}
        />
      </Field>

      <Field>
        <FieldLabel>Lifestyle Themes</FieldLabel>
        <CheckboxGroup
          options={LIFESTYLE_THEMES}
          values={themes}
          disabled={busy || saving}
          onToggle={(value) => {
            setThemes((prev) =>
              prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
            );
          }}
        />
      </Field>

      <Field>
        <FieldLabel>Apparel Capabilities</FieldLabel>
        <CheckboxGroup
          options={RETAIL_CAPABILITIES}
          values={caps}
          disabled={busy || saving}
          onToggle={(value) => {
            setCaps((prev) =>
              prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
            );
          }}
        />
      </Field>

      {error ? <p className="text-danger m-0 text-sm">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" disabled={busy || saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save taxonomy'}
        </Button>
        <p className="text-ink/55 m-0 text-xs">Primary: {primaryRetailChannelLabel(primary)}</p>
      </div>
    </div>
  );

  if (!collapsible) {
    return editor;
  }

  return (
    <section className="border-ink/10 rounded-md border">
      <button
        type="button"
        className="font-heading flex w-full items-center justify-between px-3 py-2 text-left text-base"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        CRM Retail Taxonomy
        <span className="text-ink/50 text-xs">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div id={panelId} className="border-ink/10 border-t px-3 py-3">
          {editor}
        </div>
      ) : null}
    </section>
  );
}
