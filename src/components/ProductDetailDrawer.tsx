import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import type { CatalogItem } from '@/lib/catalog';
import { hasManualOverride } from '@/lib/catalogProvenance';
import { landedCadBeforeRecoverableGst, marginPct, type LandedCostFactors } from '@/lib/landedCost';
import { patchCatalogItem } from '@/lib/updateCatalogItemClient';
import type { CatalogItemPatch } from '@/lib/updateCatalogItem';

type DraftVariant = {
  id?: string;
  size: string;
  color: string;
  style: string;
  wholesaleUsd: string;
  sortOrder: number;
  _delete?: boolean;
};

type Draft = {
  page: string;
  cat: string;
  name: string;
  color: string;
  tagline: string;
  status: string;
  isNew: boolean;
  isNameDrop: boolean;
  isBestseller: boolean;
  collection: string;
  productType: string;
  accentColor: string;
  salesDescription: string;
  material: string;
  specialNotes: string;
  salesPriority: string;
  salesNotes: string;
  priceUsd: string;
  msrpCad: string;
  landedCadOverride: string;
  variants: DraftVariant[];
};

function itemToDraft(item: CatalogItem): Draft {
  return {
    page: String(item.page || ''),
    cat: item.cat,
    name: item.name,
    color: item.color,
    tagline: item.tagline,
    status: item.status,
    isNew: item.isNew,
    isNameDrop: item.isNameDrop,
    isBestseller: item.isBestseller,
    collection: item.collection,
    productType: item.productType,
    accentColor: item.accentColor,
    salesDescription: item.salesDescription,
    material: item.material,
    specialNotes: item.specialNotes,
    salesPriority: item.salesPriority,
    salesNotes: item.salesNotes,
    priceUsd: String(item.priceUsdOverride ?? item.catalogPriceUsd),
    msrpCad: String(item.msrpCadOverride ?? item.catalogMsrpCad),
    landedCadOverride: item.landedCadOverride == null ? '' : String(item.landedCadOverride),
    variants: item.variants.map((v, i) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      style: v.style,
      wholesaleUsd: String(v.wholesaleUsdOverride ?? v.catalogWholesaleUsd),
      sortOrder: v.sortOrder ?? i,
    })),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface ProductDetailDrawerProps {
  item: CatalogItem | null;
  items: CatalogItem[];
  factors: LandedCostFactors;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  onNavigate: (sku: string) => void;
}

export function ProductDetailDrawer({
  item,
  items,
  factors,
  onClose,
  onSaved,
  onNavigate,
}: ProductDetailDrawerProps) {
  if (!item) return null;
  return (
    <ProductDetailDrawerInner
      key={item.id}
      item={item}
      items={items}
      factors={factors}
      onClose={onClose}
      onSaved={onSaved}
      onNavigate={onNavigate}
    />
  );
}

function ProductDetailDrawerInner({
  item,
  items,
  factors,
  onClose,
  onSaved,
  onNavigate,
}: {
  item: CatalogItem;
  items: CatalogItem[];
  factors: LandedCostFactors;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  onNavigate: (sku: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => itemToDraft(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    merchandising: true,
    variants: true,
    pricing: true,
    specs: false,
    ordering: false,
    crm: false,
    source: false,
  });

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(itemToDraft(item));
  }, [draft, item]);

  const index = items.findIndex((i) => i.sku === item.sku);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  const displayWholesale = parseOptionalNumber(draft.priceUsd) ?? item.catalogPriceUsd;
  const displayMsrp = parseOptionalNumber(draft.msrpCad) ?? item.catalogMsrpCad;
  const landedOverride = parseOptionalNumber(draft.landedCadOverride);
  const calculatedLanded = landedCadBeforeRecoverableGst(displayWholesale, factors);
  const margin = marginPct(displayWholesale, displayMsrp, factors, {
    landedOverrideCad: landedOverride,
  });

  function requestClose() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }

  function navigateTo(target: CatalogItem | null | undefined) {
    if (!target) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onNavigate(target.sku);
  }

  function toggleSection(key: string) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function resetToCatalog() {
    setDraft({
      ...itemToDraft(item),
      priceUsd: String(item.catalogPriceUsd),
      msrpCad: String(item.catalogMsrpCad),
      landedCadOverride: '',
      variants: item.variants.map((v, i) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        style: v.style,
        wholesaleUsd: String(v.catalogWholesaleUsd),
        sortOrder: v.sortOrder ?? i,
      })),
    });
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    const priceNum = parseOptionalNumber(draft.priceUsd);
    const msrpNum = parseOptionalNumber(draft.msrpCad);
    const patch: CatalogItemPatch = {
      page: parseOptionalNumber(draft.page),
      cat: draft.cat.trim(),
      name: draft.name.trim(),
      color: draft.color.trim() || null,
      tagline: draft.tagline.trim() || null,
      status: draft.status,
      isNew: draft.isNew,
      isNameDrop: draft.isNameDrop,
      isBestseller: draft.isBestseller,
      collection: draft.collection.trim() || null,
      productType: draft.productType.trim() || null,
      accentColor: draft.accentColor.trim() || null,
      salesDescription: draft.salesDescription.trim() || null,
      material: draft.material.trim() || null,
      specialNotes: draft.specialNotes.trim() || null,
      salesPriority: draft.salesPriority.trim() || null,
      salesNotes: draft.salesNotes.trim() || null,
    };

    if (priceNum != null && priceNum !== item.catalogPriceUsd) {
      patch.priceUsdOverride = priceNum;
    } else if (draft.priceUsd.trim() === String(item.catalogPriceUsd)) {
      patch.resetPriceToCatalog = true;
    }

    if (msrpNum != null && msrpNum !== item.catalogMsrpCad) {
      patch.msrpCadOverride = msrpNum;
    } else if (draft.msrpCad.trim() === String(item.catalogMsrpCad)) {
      patch.resetMsrpToCatalog = true;
    }

    if (draft.landedCadOverride.trim() === '') {
      patch.resetLandedToCatalog = true;
    } else {
      patch.landedCadOverride = landedOverride;
    }

    const draftIds = new Set(draft.variants.filter((v) => v.id && !v._delete).map((v) => v.id));
    patch.variants = [
      ...item.variants
        .filter((v) => !draftIds.has(v.id))
        .map((v) => ({ id: v.id, _delete: true as const })),
      ...draft.variants
        .filter((v) => !v._delete)
        .map((v, i) => {
          const price = parseOptionalNumber(v.wholesaleUsd) ?? 0;
          const existing = v.id ? item.variants.find((x) => x.id === v.id) : undefined;
          if (existing) {
            // Preserve catalog wholesale_usd; user edits go to override only.
            return {
              id: v.id,
              size: v.size.trim() || null,
              color: v.color.trim() || null,
              style: v.style.trim() || null,
              wholesaleUsdOverride: price === existing.catalogWholesaleUsd ? null : price,
              sortOrder: v.sortOrder ?? i,
            };
          }
          return {
            size: v.size.trim() || null,
            color: v.color.trim() || null,
            style: v.style.trim() || null,
            wholesaleUsd: price,
            sortOrder: v.sortOrder ?? i,
          };
        }),
    ];

    const result = await patchCatalogItem({ sku: item.sku, id: item.id, patch });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.item);
    setDraft(itemToDraft(result.item));
    setEditing(false);
  }

  function updateVariant(index: number, next: Partial<DraftVariant>) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, i) => (i === index ? { ...v, ...next } : v)),
    }));
  }

  function addVariant() {
    setDraft((d) => ({
      ...d,
      variants: [
        ...d.variants,
        {
          size: '',
          color: '',
          style: '',
          wholesaleUsd: String(item.catalogPriceUsd),
          sortOrder: d.variants.length,
        },
      ],
    }));
  }

  function removeVariant(index: number) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.filter((_, i) => i !== index),
    }));
  }

  const readOnly = !editing;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-neutral-900/40"
        onClick={requestClose}
        aria-hidden="true"
      />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
      >
        <div className="border-ink/10 flex items-start gap-3 border-b px-5 py-4">
          <div className="bg-bg border-ink/10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
            {item.primaryImagePath ? (
              <img src={item.primaryImagePath} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="text-ink/35 h-8 w-8" strokeWidth={2.75} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p id="product-detail-title" className="font-heading text-xl leading-tight">
              {item.name}
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              {item.sku} · Pg {item.page}
              {item.pdfPage != null ? ` · PDF ${item.pdfPage}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Tag variant="accent-2">{item.status}</Tag>
              {item.isNew ? <Tag variant="accent">New</Tag> : null}
              {item.isBestseller ? <Tag variant="accent">Bestseller</Tag> : null}
              {item.isNameDrop ? <Tag variant="accent-2">Name Drop</Tag> : null}
              {hasManualOverride(item.priceUsdOverride) ||
              hasManualOverride(item.msrpCadOverride) ||
              hasManualOverride(item.landedCadOverride) ? (
                <Tag variant="accent">Manual override</Tag>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-40"
              aria-label="Previous SKU"
              disabled={!prev || busy}
              onClick={() => navigateTo(prev)}
            >
              <ChevronLeft size={18} strokeWidth={2.75} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-40"
              aria-label="Next SKU"
              disabled={!next || busy}
              onClick={() => navigateTo(next)}
            >
              <ChevronRight size={18} strokeWidth={2.75} />
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md"
              aria-label="Close"
              disabled={busy}
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </div>
        </div>

        <div className="border-ink/10 flex flex-wrap gap-2 border-b px-5 py-3">
          {!editing ? (
            <Button type="button" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : (
            <>
              <Button type="button" disabled={busy || !dirty} onClick={() => void handleSave()}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(itemToDraft(item));
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={resetToCatalog}>
                Reset to catalog
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-auto px-5 py-4">
          {error ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <Section
            title="Merchandising"
            open={openSections.merchandising}
            onToggle={() => toggleSection('merchandising')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Product name</FieldLabel>
                <Input
                  value={draft.name}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Input
                  value={draft.cat}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, cat: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Color</FieldLabel>
                <Input
                  value={draft.color}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Accent color</FieldLabel>
                <Input
                  value={draft.accentColor}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Collection</FieldLabel>
                <Input
                  value={draft.collection}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, collection: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Product type</FieldLabel>
                <Input
                  value={draft.productType}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, productType: e.target.value }))}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Tagline</FieldLabel>
                <Input
                  value={draft.tagline}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Sales description</FieldLabel>
                <Textarea
                  value={draft.salesDescription}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, salesDescription: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Catalog page</FieldLabel>
                <Input
                  value={draft.page}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, page: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  value={draft.status}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="discontinued">Discontinued</option>
                  <option value="unavailable">Unavailable</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isNew}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, isNew: e.target.checked }))}
                />
                New
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isNameDrop}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, isNameDrop: e.target.checked }))}
                />
                Name drop
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isBestseller}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, isBestseller: e.target.checked }))}
                />
                Bestseller
              </label>
            </div>
          </Section>

          <Section
            title="Variants & wholesale"
            open={openSections.variants}
            onToggle={() => toggleSection('variants')}
          >
            <p className="text-ink/60 m-0 mb-2 text-xs">
              Size bands (e.g. M–XL / 2X / 3X) must match verified catalog prices — do not invent.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-ink/55 text-left text-[11px] tracking-wider uppercase">
                    <th className="p-1">Size</th>
                    <th className="p-1">Color</th>
                    <th className="p-1">Style</th>
                    <th className="p-1">Wholesale USD</th>
                    <th className="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {draft.variants.map((v, i) => (
                    <tr key={v.id ?? `new-${i}`}>
                      <td className="p-1">
                        <Input
                          value={v.size}
                          disabled={readOnly || busy}
                          onChange={(e) => updateVariant(i, { size: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          value={v.color}
                          disabled={readOnly || busy}
                          onChange={(e) => updateVariant(i, { color: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          value={v.style}
                          disabled={readOnly || busy}
                          onChange={(e) => updateVariant(i, { style: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          value={v.wholesaleUsd}
                          disabled={readOnly || busy}
                          onChange={(e) => updateVariant(i, { wholesaleUsd: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        {editing ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="text-xs"
                            disabled={busy}
                            onClick={() => removeVariant(i)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editing ? (
              <Button type="button" variant="secondary" className="mt-2" onClick={addVariant}>
                Add variant
              </Button>
            ) : null}
          </Section>

          <Section
            title="Canadian pricing"
            open={openSections.pricing}
            onToggle={() => toggleSection('pricing')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>
                  Base wholesale USD
                  {hasManualOverride(item.priceUsdOverride) ? ' (override)' : ''}
                </FieldLabel>
                <Input
                  value={draft.priceUsd}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, priceUsd: e.target.value }))}
                />
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Catalog: ${item.catalogPriceUsd.toFixed(2)}
                </p>
              </Field>
              <Field>
                <FieldLabel>
                  MSRP CAD
                  {hasManualOverride(item.msrpCadOverride) ? ' (override)' : ''}
                </FieldLabel>
                <Input
                  value={draft.msrpCad}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, msrpCad: e.target.value }))}
                />
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Catalog: ${item.catalogMsrpCad.toFixed(2)}
                </p>
              </Field>
              <Field>
                <FieldLabel>Landed CAD override</FieldLabel>
                <Input
                  value={draft.landedCadOverride}
                  placeholder={calculatedLanded.toFixed(2)}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, landedCadOverride: e.target.value }))}
                />
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Calculated (before recoverable GST): ${calculatedLanded.toFixed(2)}
                </p>
              </Field>
              <div className="text-sm">
                <p className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  Retailer margin
                </p>
                <p className="m-0 mt-1 font-semibold">
                  {margin == null ? '—' : `${margin.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Specifications"
            open={openSections.specs}
            onToggle={() => toggleSection('specs')}
          >
            <Field>
              <FieldLabel>Material</FieldLabel>
              <Input
                value={draft.material}
                disabled={readOnly || busy}
                onChange={(e) => setDraft((d) => ({ ...d, material: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Special notes</FieldLabel>
              <Textarea
                value={draft.specialNotes}
                disabled={readOnly || busy}
                onChange={(e) => setDraft((d) => ({ ...d, specialNotes: e.target.value }))}
              />
            </Field>
          </Section>

          <Section
            title="Ordering"
            open={openSections.ordering}
            onToggle={() => toggleSection('ordering')}
          >
            <p className="text-ink/70 m-0 text-sm">
              Line defaults: 24-piece minimum / 6 per design (pending PDF terms verification).
              Inherited from catalog settings — not duplicated per SKU.
            </p>
          </Section>

          <Section
            title="CRM intelligence"
            open={openSections.crm}
            onToggle={() => toggleSection('crm')}
          >
            <Field>
              <FieldLabel>Sales priority</FieldLabel>
              <Input
                value={draft.salesPriority}
                disabled={readOnly || busy}
                onChange={(e) => setDraft((d) => ({ ...d, salesPriority: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Sales notes</FieldLabel>
              <Textarea
                value={draft.salesNotes}
                disabled={readOnly || busy}
                onChange={(e) => setDraft((d) => ({ ...d, salesNotes: e.target.value }))}
              />
            </Field>
          </Section>

          <Section
            title="Source & audit"
            open={openSections.source}
            onToggle={() => toggleSection('source')}
          >
            <dl className="m-0 grid gap-2 text-sm">
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">SKU</dt>
                <dd className="m-0">{item.sku}</dd>
              </div>
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Brand</dt>
                <dd className="m-0">{item.brand || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  Catalog year
                </dt>
                <dd className="m-0">{item.catalogYear ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                  Primary image
                </dt>
                <dd className="m-0">{item.primaryImagePath || 'Not yet extracted'}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-ink/10 rounded-md border">
      <button
        type="button"
        className="font-heading flex w-full items-center justify-between px-3 py-2 text-left text-sm"
        onClick={onToggle}
        aria-expanded={open}
      >
        {title}
        <span className="text-ink/50 text-xs">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <div className="border-ink/10 space-y-3 border-t px-3 py-3">{children}</div> : null}
    </section>
  );
}
