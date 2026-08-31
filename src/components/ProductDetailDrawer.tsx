import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, Plus, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { OgrProductEmailComposerModal } from '@/components/OgrProductEmailComposerModal';
import { ProductEmailHistory } from '@/components/product/ProductEmailHistory';
import { getAgentProductOutreachDraftClient } from '@/lib/agentProductOutreachDraftClient';
import {
  ATTRIBUTE_REGISTRY,
  type AttributeGroup,
  type AttributeValueType,
} from '@/lib/catalogAttributes';
import { resolvePrimaryImageSrc, type CatalogItem } from '@/lib/catalog';
import { fetchCatalogFieldChanges, type CatalogFieldChange } from '@/lib/catalogFieldHistory';
import { uploadCatalogImage } from '@/lib/catalogImageUpload';
import { pickDisplayVariant } from '@/lib/catalogVariants';
import { hasManualOverride, type FieldMetaEntry } from '@/lib/catalogProvenance';
import { templatesForCategory, type CategoryPricingTemplate } from '@/lib/catalogPricingTemplates';
import type { CatalogSupplierTerms } from '@/lib/catalogSettings';
import { unitEquivalentWholesaleUsd } from '@/lib/catalogUnitPrice';
import {
  landedCostBreakdown,
  marginDollars,
  marginPct,
  variantLandedCad,
  type LandedCostFactors,
} from '@/lib/landedCost';
import { patchCatalogItem } from '@/lib/updateCatalogItemClient';
import type { CatalogItemPatch } from '@/lib/updateCatalogItem';
import { tryBuildOgrProductUrl, buildOgrCollectionUrl } from '@/lib/productUrls';
import { resolvePricingMarketFromStaffSelector, type PublicMarket } from '@/lib/pricingMarket';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  buildOgrProductEmailCardPlainText,
  copyOgrProductEmailCardToClipboard,
} from '@/lib/copyOgrProductEmailCard';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import {
  MAX_RECOMMENDED_CHANNELS,
  isLifestyleTheme,
  normalizeLifestyleThemes,
  normalizePrimaryChannels,
  LIFESTYLE_THEMES,
  PRIMARY_RETAIL_CHANNELS,
} from '@/lib/crmRetailTaxonomy';

const STATUS_OPTIONS = ['active', 'inactive', 'discontinued', 'unavailable', 'unknown'];
const DEPARTMENT_OPTIONS = [
  'Apparel',
  'Headwear',
  'Accessories',
  'Drinkware',
  'Displays',
  'Metal Signs',
];
const UNIT_OF_MEASURE_OPTIONS = ['each', 'pack', 'set', 'display'];
const VARIANT_AVAILABILITY_OPTIONS = ['available', 'limited', 'unavailable', 'discontinued'];

type DraftVariant = {
  id?: string;
  size: string;
  sizeGroup: string;
  color: string;
  style: string;
  wholesaleUsd: string;
  packQuantity: string;
  availability: string;
  sortOrder: number;
};

type DraftAttribute = {
  id?: string;
  attributeKey: string;
  label: string;
  value: string;
  valueType: AttributeValueType;
  unit: string;
  attributeGroup: AttributeGroup;
  displayOrder: number;
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
  department: string;
  unitOfMeasure: string;
  packQuantity: string;
  minimumQuantity: string;
  orderMultiple: string;
  madeInUsaClaim: boolean;
  countryOfBlankManufacture: string;
  countryOfDecoration: string;
  countryOfOrigin: string;
  primaryImageUrl: string;
  catalogVerified: boolean;
  verificationNotes: string;
  lifestyleThemes: string[];
  recommendedChannels: string[];
  seasonality: string;
  sampleStatus: string;
  buyerFeedback: string;
  isPubliclyPublished: boolean;
  featured: boolean;
  publicSortOrder: string;
  publicSlug: string;
  liveSku: string;
  liveSkuNote: string;
  alternateImageUrls: string;
  variants: DraftVariant[];
  attributes: DraftAttribute[];
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
    department: item.department,
    unitOfMeasure: item.unitOfMeasure,
    packQuantity: item.packQuantity == null ? '' : String(item.packQuantity),
    minimumQuantity: item.minimumQuantity == null ? '' : String(item.minimumQuantity),
    orderMultiple: item.orderMultiple == null ? '' : String(item.orderMultiple),
    madeInUsaClaim: item.madeInUsaClaim ?? false,
    countryOfBlankManufacture: item.countryOfBlankManufacture,
    countryOfDecoration: item.countryOfDecoration,
    countryOfOrigin: item.countryOfOrigin,
    primaryImageUrl: item.primaryImageUrl ?? '',
    catalogVerified: item.catalogVerified,
    verificationNotes: item.verificationNotes,
    lifestyleThemes: normalizeLifestyleThemes(item.lifestyleThemes),
    recommendedChannels: normalizePrimaryChannels(item.recommendedChannels).slice(
      0,
      MAX_RECOMMENDED_CHANNELS,
    ),
    seasonality: item.seasonality,
    sampleStatus: item.sampleStatus,
    buyerFeedback: item.buyerFeedback,
    isPubliclyPublished: item.isPubliclyPublished,
    featured: item.featured,
    publicSortOrder: String(item.publicSortOrder ?? 0),
    publicSlug: item.publicSlug ?? '',
    liveSku: item.liveSku ?? '',
    liveSkuNote: item.liveSkuNote ?? '',
    alternateImageUrls: item.alternateImageUrls.join('\n'),
    variants: item.variants.map((v, i) => ({
      id: v.id,
      size: v.size,
      sizeGroup: v.sizeGroup,
      color: v.color,
      style: v.style,
      wholesaleUsd: String(v.wholesaleUsdOverride ?? v.catalogWholesaleUsd),
      packQuantity: v.packQuantity == null ? '' : String(v.packQuantity),
      availability: v.availability || 'available',
      sortOrder: v.sortOrder ?? i,
    })),
    attributes: item.attributes.map((a, i) => ({
      id: a.id,
      attributeKey: a.attributeKey,
      label: a.label,
      value: a.value,
      valueType: a.valueType,
      unit: a.unit,
      attributeGroup: a.attributeGroup,
      displayOrder: a.displayOrder ?? i,
    })),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseNewlineList(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function publicWholesaleUrl(slug: string, publicMarket: PublicMarket = 'ca'): string {
  const trimmed = slug.trim();
  if (!trimmed) return '';
  if (typeof window === 'undefined') return '';
  return tryBuildOgrProductUrl(trimmed, window.location.origin, publicMarket) ?? '';
}

function parseDraftNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Draft snapshot → public product shape for email card presentation (no salesVolumeRank). */
function draftToPublicOgrProduct(item: CatalogItem, draft: Draft): PublicOgrProduct {
  return {
    id: item.id,
    sku: item.sku,
    publicSlug: draft.publicSlug.trim(),
    name: draft.name.trim(),
    cat: draft.cat.trim(),
    color: draft.color.trim(),
    tagline: draft.tagline.trim(),
    description: draft.salesDescription.trim(),
    page: item.page,
    catalogYear: item.catalogYear,
    collection: draft.collection.trim(),
    wholesaleUsd: null,
    msrpCad: parseDraftNumber(draft.msrpCad),
    isNew: draft.isNew,
    featured: draft.featured,
    publicSortOrder: parseDraftNumber(draft.publicSortOrder),
    primaryImageUrl: draft.primaryImageUrl.trim() || null,
    alternateImageUrls: draft.alternateImageUrls
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    unitOfMeasure: draft.unitOfMeasure.trim() || 'each',
    minimumQuantity: draft.minimumQuantity.trim() ? parseDraftNumber(draft.minimumQuantity) : null,
    orderMultiple: draft.orderMultiple.trim() ? parseDraftNumber(draft.orderMultiple) : null,
    packQuantity: draft.packQuantity.trim() ? parseDraftNumber(draft.packQuantity) : null,
    lifestyleThemes: draft.lifestyleThemes,
    liveSku: draft.liveSku.trim() || null,
    availableSizes: item.variants.map((v) => v.size).filter(Boolean),
  };
}

function formatHistoryValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

interface ProductDetailDrawerProps {
  item: CatalogItem | null;
  items: CatalogItem[];
  factors: LandedCostFactors;
  supplierTerms?: CatalogSupplierTerms | null;
  presentationMarket?: PublicMarket;
  /** When set, open the agent draft review modal after the drawer mounts. */
  initialReviewDraftId?: string | null;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  onNavigate: (sku: string) => void;
  onProductEmailSent?: () => void;
}

export function ProductDetailDrawer({
  item,
  items,
  factors,
  supplierTerms = null,
  presentationMarket = 'ca',
  initialReviewDraftId = null,
  onClose,
  onSaved,
  onNavigate,
  onProductEmailSent,
}: ProductDetailDrawerProps) {
  if (!item) return null;
  return (
    <ProductDetailDrawerInner
      key={item.id}
      item={item}
      items={items}
      factors={factors}
      supplierTerms={supplierTerms}
      presentationMarket={presentationMarket}
      initialReviewDraftId={initialReviewDraftId}
      onClose={onClose}
      onSaved={onSaved}
      onNavigate={onNavigate}
      onProductEmailSent={onProductEmailSent}
    />
  );
}

function ProductDetailDrawerInner({
  item,
  items,
  factors,
  supplierTerms,
  presentationMarket = 'ca',
  initialReviewDraftId = null,
  onClose,
  onSaved,
  onNavigate,
  onProductEmailSent,
}: {
  item: CatalogItem;
  items: CatalogItem[];
  factors: LandedCostFactors;
  supplierTerms: CatalogSupplierTerms | null;
  presentationMarket?: PublicMarket;
  initialReviewDraftId?: string | null;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  onNavigate: (sku: string) => void;
  onProductEmailSent?: () => void;
}) {
  const line = useOptionalLineContext();
  const eaglePeakOutreachBlocked = line.lineSlug === 'eagle-peak' && !line.eaglePeakOutreach;
  const bigFishOutreachBlocked = line.lineSlug === 'big-fish' && !line.bigFishOutreach;
  const outreachBlocked = eaglePeakOutreachBlocked || bigFishOutreachBlocked;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => itemToDraft(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(() => {
    if (!item.variants.length) return 0;
    const preferred = pickDisplayVariant(item.variants);
    const idx = preferred ? item.variants.findIndex((v) => v.id === preferred.id) : 0;
    return idx >= 0 ? idx : 0;
  });
  const [templateChoice, setTemplateChoice] = useState<string>('');
  const [attributeChoice, setAttributeChoice] = useState<string>('');
  const [history, setHistory] = useState<CatalogFieldChange[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    info: true,
    variants: true,
    pricing: true,
    attributes: false,
    specs: false,
    ordering: false,
    publicWholesale: false,
    crm: false,
    source: false,
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailCardCopyState, setEmailCardCopyState] = useState<'idle' | 'rich' | 'plain' | 'error'>(
    'idle',
  );
  const emailCardCopyTimerRef = useRef<number | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailReviewDraft, setEmailReviewDraft] = useState<{
    id: string;
    to: string;
    toName: string;
    subject: string;
    introText: string;
    closingText: string;
    prospectId: number;
    accountContactId: string;
    catalogItemId: string;
    prospectName?: string;
    productSku?: string;
    productSlug?: string;
    productIsNew?: boolean;
  } | null>(null);
  const [emailSendState, setEmailSendState] = useState<'idle' | 'sent'>('idle');
  const emailSendTimerRef = useRef<number | null>(null);
  const [emailHistoryReloadToken, setEmailHistoryReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchCatalogFieldChanges(item.id).then((result) => {
      if (!active) return;
      setHistoryLoading(false);
      if (result.error) {
        setHistoryError(result.error);
        return;
      }
      setHistory(result.data);
    });
    return () => {
      active = false;
    };
  }, [item.id]);

  useEffect(() => {
    const draftId = initialReviewDraftId?.trim();
    if (!draftId) return;
    let active = true;
    void getAgentProductOutreachDraftClient(draftId).then((result) => {
      if (!active || !result.ok) return;
      const d = result.draft;
      setEmailReviewDraft({
        id: d.id,
        to: d.toEmail,
        toName: d.toName,
        subject: d.subject,
        introText: d.introText,
        closingText: d.closingText,
        prospectId: d.prospectId,
        accountContactId: d.accountContactId,
        catalogItemId: d.catalogItemId,
        productSku: d.payload.sku,
        productSlug: d.payload.slug,
      });
      setEmailModalOpen(true);
    });
    return () => {
      active = false;
    };
  }, [initialReviewDraftId, item.id]);

  useEffect(() => {
    return () => {
      if (emailCardCopyTimerRef.current != null) {
        window.clearTimeout(emailCardCopyTimerRef.current);
      }
      if (emailSendTimerRef.current != null) {
        window.clearTimeout(emailSendTimerRef.current);
      }
    };
  }, []);

  const emailCardPreviewHtml = useMemo(() => {
    if (!emailModalOpen) return '';
    if (typeof window === 'undefined') return '';
    const href = tryBuildOgrProductUrl(
      draft.publicSlug,
      window.location.origin,
      presentationMarket ?? 'ca',
    );
    if (!href) return '';
    const catalogHref = buildOgrCollectionUrl(window.location.origin, presentationMarket ?? 'ca');
    const presentation = buildPublicProductPresentation(draftToPublicOgrProduct(item, draft), {
      publicMarket: presentationMarket ?? 'ca',
    });
    return renderOgrProductEmailCard(presentation, {
      href,
      catalogHref,
      wholesaleUsd: parseOptionalNumber(draft.priceUsd) ?? item.catalogPriceUsd,
    });
  }, [emailModalOpen, draft, item, presentationMarket]);

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(itemToDraft(item));
  }, [draft, item]);

  const index = items.findIndex((i) => i.sku === item.sku);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  const nameError = !draft.name.trim() ? 'Product name is required' : null;
  const catError = !draft.cat.trim() ? 'Category is required' : null;
  const slugError =
    draft.isPubliclyPublished && !draft.publicSlug.trim()
      ? 'Public slug is required when published'
      : null;
  const canSave = !nameError && !catError && !slugError;

  const displayWholesale = parseOptionalNumber(draft.priceUsd) ?? item.catalogPriceUsd;
  const displayMsrp = parseOptionalNumber(draft.msrpCad) ?? item.catalogMsrpCad;
  const landedOverride = parseOptionalNumber(draft.landedCadOverride);
  const showCanadianLanded = resolvePricingMarketFromStaffSelector(
    presentationMarket ?? 'ca',
  ).showCanadianLanded;

  const safeVariantIndex = draft.variants.length
    ? Math.min(selectedVariantIndex, draft.variants.length - 1)
    : 0;
  const selectedDraftVariant = draft.variants[safeVariantIndex] ?? null;
  const selectedWholesaleUsd = selectedDraftVariant
    ? (parseOptionalNumber(selectedDraftVariant.wholesaleUsd) ?? displayWholesale)
    : displayWholesale;

  const calculatedLanded = variantLandedCad(selectedWholesaleUsd, factors, { includeGst: false });
  const breakdown = landedCostBreakdown(selectedWholesaleUsd, factors);
  const margin = marginPct(selectedWholesaleUsd, displayMsrp, factors, {
    landedOverrideCad: landedOverride,
  });
  const marginCad = marginDollars(selectedWholesaleUsd, displayMsrp, factors, {
    landedOverrideCad: landedOverride,
  });

  const templates = useMemo(() => templatesForCategory(draft.cat), [draft.cat]);
  const activeTemplate: CategoryPricingTemplate | null =
    templates.find((t) => t.id === templateChoice) ?? templates[0] ?? null;

  const usedAttributeKeys = new Set(draft.attributes.map((a) => a.attributeKey));
  const availableRegistryEntries = ATTRIBUTE_REGISTRY.filter(
    (entry) => !usedAttributeKeys.has(entry.attributeKey),
  );
  const activeRegistryEntry =
    availableRegistryEntries.find((entry) => entry.attributeKey === attributeChoice) ??
    availableRegistryEntries[0] ??
    null;

  const readOnly = !editing;

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
        sizeGroup: v.sizeGroup,
        color: v.color,
        style: v.style,
        wholesaleUsd: String(v.catalogWholesaleUsd),
        packQuantity: v.packQuantity == null ? '' : String(v.packQuantity),
        availability: v.availability || 'available',
        sortOrder: v.sortOrder ?? i,
      })),
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!canSave) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

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
      department: draft.department.trim() || null,
      unitOfMeasure: draft.unitOfMeasure.trim() || 'each',
      packQuantity: parseOptionalNumber(draft.packQuantity),
      minimumQuantity: parseOptionalNumber(draft.minimumQuantity),
      orderMultiple: parseOptionalNumber(draft.orderMultiple),
      madeInUsaClaim: draft.madeInUsaClaim,
      countryOfBlankManufacture: draft.countryOfBlankManufacture.trim() || null,
      countryOfDecoration: draft.countryOfDecoration.trim() || null,
      countryOfOrigin: draft.countryOfOrigin.trim() || null,
      primaryImageUrl: draft.primaryImageUrl.trim() || null,
      catalogVerified: draft.catalogVerified,
      verificationNotes: draft.verificationNotes.trim() || null,
      // Keep any non-canonical stored values so a save (without touching CRM
      // checkboxes) cannot silently wipe pre-taxonomy data.
      lifestyleThemes: [
        ...normalizeLifestyleThemes(draft.lifestyleThemes),
        ...item.lifestyleThemes.filter((raw) => {
          const v = raw.trim();
          return v.length > 0 && !isLifestyleTheme(v);
        }),
      ],
      recommendedChannels: [
        ...normalizePrimaryChannels(draft.recommendedChannels).slice(0, MAX_RECOMMENDED_CHANNELS),
        ...item.recommendedChannels.filter((raw) => {
          const v = raw.trim();
          return v.length > 0 && normalizePrimaryChannels([v]).length === 0;
        }),
      ],
      seasonality: draft.seasonality.trim() || null,
      sampleStatus: draft.sampleStatus.trim() || null,
      buyerFeedback: draft.buyerFeedback.trim() || null,
      isPubliclyPublished: draft.isPubliclyPublished,
      featured: draft.featured,
      publicSortOrder: parseOptionalNumber(draft.publicSortOrder) ?? 0,
      publicSlug: draft.publicSlug.trim() || null,
      liveSku: draft.liveSku.trim() || null,
      liveSkuNote: draft.liveSkuNote.trim() || null,
      alternateImageUrls: parseNewlineList(draft.alternateImageUrls),
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

    const draftVariantIds = new Set(draft.variants.filter((v) => v.id).map((v) => v.id));
    patch.variants = [
      ...item.variants
        .filter((v) => !draftVariantIds.has(v.id))
        .map((v) => ({ id: v.id, _delete: true as const })),
      ...draft.variants.map((v, i) => {
        const price = parseOptionalNumber(v.wholesaleUsd) ?? 0;
        const packQty = parseOptionalNumber(v.packQuantity);
        const existing = v.id ? item.variants.find((x) => x.id === v.id) : undefined;
        if (existing) {
          // Preserve catalog wholesale_usd; user edits go to override only.
          return {
            id: v.id,
            size: v.size.trim() || null,
            sizeGroup: v.sizeGroup.trim() || null,
            color: v.color.trim() || null,
            style: v.style.trim() || null,
            wholesaleUsdOverride: price === existing.catalogWholesaleUsd ? null : price,
            packQuantity: packQty,
            availability: v.availability || 'available',
            sortOrder: v.sortOrder ?? i,
          };
        }
        return {
          size: v.size.trim() || null,
          sizeGroup: v.sizeGroup.trim() || null,
          color: v.color.trim() || null,
          style: v.style.trim() || null,
          wholesaleUsd: price,
          packQuantity: packQty,
          availability: v.availability || 'available',
          sortOrder: v.sortOrder ?? i,
        };
      }),
    ];

    const draftAttributeIds = new Set(draft.attributes.filter((a) => a.id).map((a) => a.id));
    patch.attributes = [
      ...item.attributes
        .filter((a) => !draftAttributeIds.has(a.id))
        .map((a) => ({
          id: a.id,
          attributeKey: a.attributeKey,
          label: a.label,
          _delete: true as const,
        })),
      ...draft.attributes.map((a, i) => ({
        id: a.id,
        attributeKey: a.attributeKey,
        label: a.label,
        value: a.value.trim() || null,
        valueType: a.valueType,
        unit: a.unit.trim() || null,
        attributeGroup: a.attributeGroup,
        displayOrder: i,
      })),
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

  function updateVariant(i: number, next: Partial<DraftVariant>) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, idx) => (idx === i ? { ...v, ...next } : v)),
    }));
  }

  function addVariant() {
    setDraft((d) => ({
      ...d,
      variants: [
        ...d.variants,
        {
          size: '',
          sizeGroup: '',
          color: '',
          style: '',
          wholesaleUsd: String(item.catalogPriceUsd),
          packQuantity: '',
          availability: 'available',
          sortOrder: d.variants.length,
        },
      ],
    }));
  }

  function removeVariant(i: number) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.filter((_, idx) => idx !== i),
    }));
    setSelectedVariantIndex((cur) => (cur >= i ? Math.max(0, cur - 1) : cur));
  }

  function applyTemplate(template: CategoryPricingTemplate) {
    const confirmed = window.confirm(
      `Add ${template.bands.length} size band${template.bands.length === 1 ? '' : 's'} from “${template.label}” as new variants? Verified catalog prices only — nothing is invented.`,
    );
    if (!confirmed) return;
    setDraft((d) => ({
      ...d,
      variants: [
        ...d.variants,
        ...template.bands.map((band, i) => ({
          size: band.sizeGroup,
          sizeGroup: band.sizeGroup,
          color: '',
          style: '',
          wholesaleUsd: String(band.wholesaleUsd),
          packQuantity: '',
          availability: 'available',
          sortOrder: d.variants.length + i,
        })),
      ],
    }));
  }

  function addAttribute() {
    if (!activeRegistryEntry) return;
    setDraft((d) => ({
      ...d,
      attributes: [
        ...d.attributes,
        {
          attributeKey: activeRegistryEntry.attributeKey,
          label: activeRegistryEntry.label,
          value: '',
          valueType: activeRegistryEntry.valueType,
          unit: activeRegistryEntry.unit ?? '',
          attributeGroup: activeRegistryEntry.attributeGroup,
          displayOrder: d.attributes.length,
        },
      ],
    }));
    setAttributeChoice('');
  }

  function updateAttribute(i: number, value: string) {
    setDraft((d) => ({
      ...d,
      attributes: d.attributes.map((a, idx) => (idx === i ? { ...a, value } : a)),
    }));
  }

  function removeAttribute(i: number) {
    setDraft((d) => ({
      ...d,
      attributes: d.attributes.filter((_, idx) => idx !== i),
    }));
  }

  async function handleImageFile(file: File) {
    setImageBusy(true);
    setImageError(null);
    const result = await uploadCatalogImage({ sku: item.sku, id: item.id, file });
    setImageBusy(false);
    if (!result.ok) {
      setImageError(result.error);
      return;
    }
    onSaved(result.item);
    setDraft((d) => ({ ...d, primaryImageUrl: result.item.primaryImageUrl ?? '' }));
  }

  const previewImageSrc = draft.primaryImageUrl.trim() || resolvePrimaryImageSrc(item);

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
          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="bg-bg border-ink/10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
              {previewImageSrc ? (
                <img src={previewImageSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="text-ink/35 h-8 w-8" strokeWidth={2.75} aria-hidden />
              )}
            </div>
            {editing ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleImageFile(file);
                  }}
                />
                <button
                  type="button"
                  className="text-ink/60 inline-flex items-center gap-1 text-[11px] hover:underline disabled:opacity-40"
                  disabled={imageBusy || busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} strokeWidth={2.75} />
                  {imageBusy ? 'Uploading…' : 'Upload'}
                </button>
              </>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p id="product-detail-title" className="font-heading text-xl leading-tight">
              {item.name}
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">
              {item.sku} · Pg {item.page}
              {item.pdfPage != null ? ` · PDF ${item.pdfPage}` : ''}
              {item.cat ? ` · ${item.cat}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Tag variant="accent-2">{item.status}</Tag>
              {item.isNew ? <Tag variant="accent">New</Tag> : null}
              {item.isBestseller ? <Tag variant="accent">Bestseller</Tag> : null}
              {item.isNameDrop ? <Tag variant="accent-2">Name Drop</Tag> : null}
              {item.catalogVerified ? <Tag variant="outline">Verified</Tag> : null}
              {hasManualOverride(item.priceUsdOverride) ||
              hasManualOverride(item.msrpCadOverride) ||
              hasManualOverride(item.landedCadOverride) ? (
                <Tag variant="accent">Manual override</Tag>
              ) : null}
            </div>
            {editing ? (
              <div className="mt-2">
                <Input
                  value={draft.primaryImageUrl}
                  placeholder="https://…"
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, primaryImageUrl: e.target.value }))}
                  className="text-xs"
                />
              </div>
            ) : null}
            {imageError ? (
              <p className="text-accent-800 m-0 mt-1 text-xs" role="alert">
                {imageError}
              </p>
            ) : null}
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

        <div className="border-ink/10 flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {!editing ? (
            <Button type="button" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : (
            <>
              <Button
                type="button"
                disabled={busy || !dirty || !canSave}
                onClick={() => void handleSave()}
              >
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
          {error ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-auto px-5 py-4">
          <Section
            title="Catalog information"
            open={openSections.info}
            onToggle={() => toggleSection('info')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Product name</FieldLabel>
                <Input
                  value={draft.name}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                {editing && nameError ? (
                  <p className="text-accent-800 m-0 mt-1 text-xs" role="alert">
                    {nameError}
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Input
                  value={draft.cat}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, cat: e.target.value }))}
                />
                {editing && catError ? (
                  <p className="text-accent-800 m-0 mt-1 text-xs" role="alert">
                    {catError}
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Department</FieldLabel>
                <Select
                  value={draft.department}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
                >
                  <option value="">—</option>
                  {DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel>Product type</FieldLabel>
                <Input
                  value={draft.productType}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, productType: e.target.value }))}
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
                <FieldLabel>Unit of measure</FieldLabel>
                <Select
                  value={draft.unitOfMeasure}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, unitOfMeasure: e.target.value }))}
                >
                  {UNIT_OF_MEASURE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
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
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
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

            <div className="border-ink/10 mt-3 border-t pt-3">
              <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wider uppercase">
                Origin &amp; verification
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Country of blank manufacture</FieldLabel>
                  <Input
                    value={draft.countryOfBlankManufacture}
                    disabled={readOnly || busy}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, countryOfBlankManufacture: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Country of decoration</FieldLabel>
                  <Input
                    value={draft.countryOfDecoration}
                    disabled={readOnly || busy}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, countryOfDecoration: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Country of origin</FieldLabel>
                  <Input
                    value={draft.countryOfOrigin}
                    disabled={readOnly || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, countryOfOrigin: e.target.value }))}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Verification notes</FieldLabel>
                  <Textarea
                    value={draft.verificationNotes}
                    disabled={readOnly || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, verificationNotes: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.madeInUsaClaim}
                    disabled={readOnly || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, madeInUsaClaim: e.target.checked }))}
                  />
                  Made in the USA claim
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.catalogVerified}
                    disabled={readOnly || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, catalogVerified: e.target.checked }))}
                  />
                  Catalog verified
                </label>
              </div>
            </div>
          </Section>

          <Section
            title="Variants & wholesale"
            open={openSections.variants}
            onToggle={() => toggleSection('variants')}
          >
            <p className="text-ink/60 m-0 mb-2 text-xs">
              Size bands (e.g. M–XL / 2X / 3X) must match verified catalog prices — do not invent.
              Click a row to price it below.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-ink/55 text-left text-[11px] tracking-wider uppercase">
                    <th className="p-1">Size group</th>
                    <th className="p-1">Size</th>
                    <th className="p-1">Color</th>
                    <th className="p-1">Style</th>
                    <th className="p-1">Pack qty</th>
                    <th className="p-1">Wholesale USD</th>
                    <th className="p-1">Unit-eq USD</th>
                    <th className="p-1">Availability</th>
                    <th className="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {draft.variants.map((v, i) => {
                    const wholesaleNum = parseOptionalNumber(v.wholesaleUsd) ?? 0;
                    const packQtyNum = parseOptionalNumber(v.packQuantity);
                    const unitEq = unitEquivalentWholesaleUsd({
                      wholesaleUsd: wholesaleNum,
                      packQuantity: packQtyNum,
                    });
                    const active = i === safeVariantIndex;
                    return (
                      <tr
                        key={v.id ?? `new-${i}`}
                        className={active ? 'bg-accent/10' : undefined}
                        role="button"
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => setSelectedVariantIndex(i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedVariantIndex(i);
                          }
                        }}
                      >
                        <td className="p-1">
                          <Input
                            value={v.sizeGroup}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { sizeGroup: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={v.size}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { size: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={v.color}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { color: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={v.style}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { style: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={v.packQuantity}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { packQuantity: e.target.value })}
                            className="w-16"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={v.wholesaleUsd}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { wholesaleUsd: e.target.value })}
                            className="w-20"
                          />
                        </td>
                        <td className="text-ink/70 p-1 whitespace-nowrap">${unitEq.toFixed(2)}</td>
                        <td className="p-1">
                          <Select
                            value={v.availability}
                            disabled={readOnly || busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateVariant(i, { availability: e.target.value })}
                            className="w-auto"
                          >
                            {VARIANT_AVAILABILITY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="p-1">
                          {editing ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="text-xs"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeVariant(i);
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editing ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={addVariant}>
                  <Plus size={14} strokeWidth={2.75} /> Add variant
                </Button>
                {templates.length > 0 ? (
                  <>
                    {templates.length > 1 ? (
                      <Select
                        value={activeTemplate?.id ?? ''}
                        onChange={(e) => setTemplateChoice(e.target.value)}
                        className="w-auto"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-ink/60 text-xs">{templates[0].label}</span>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => activeTemplate && applyTemplate(activeTemplate)}
                    >
                      Add matrix…
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section
            title={showCanadianLanded ? 'Canadian pricing' : 'Wholesale'}
            open={openSections.pricing}
            onToggle={() => toggleSection('pricing')}
          >
            <p className="text-ink/60 m-0 mb-2 text-xs">
              Priced from the selected variant
              {selectedDraftVariant
                ? ` (${
                    [
                      selectedDraftVariant.sizeGroup || selectedDraftVariant.size,
                      selectedDraftVariant.color,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'base'
                  })`
                : ''}
              . One size’s cost is never applied to another.
            </p>
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
              {showCanadianLanded ? (
                <>
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
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, landedCadOverride: e.target.value }))
                      }
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
                      {marginCad != null ? ` · $${marginCad.toFixed(2)} CAD` : ''}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
            {showCanadianLanded ? (
              <dl className="border-ink/10 mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-ink/55 uppercase">FX</dt>
                  <dd className="m-0">{breakdown.fx}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 uppercase">Freight</dt>
                  <dd className="m-0">
                    ${(breakdown.afterFreight - breakdown.afterFx).toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/55 uppercase">Duty / surtax / other</dt>
                  <dd className="m-0">
                    ${(breakdown.beforeGst - breakdown.afterFreight).toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/55 uppercase">Before-GST landed</dt>
                  <dd className="m-0">${breakdown.beforeGst.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 uppercase">GST</dt>
                  <dd className="m-0">${(breakdown.withGst - breakdown.beforeGst).toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 uppercase">Cash cost incl. GST</dt>
                  <dd className="m-0">${breakdown.withGst.toFixed(2)}</dd>
                </div>
                {breakdown.brokerageAllocationCad ? (
                  <div>
                    <dt className="text-ink/55 uppercase">Brokerage</dt>
                    <dd className="m-0">${breakdown.brokerageAllocationCad.toFixed(2)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </Section>

          <Section
            title="Attributes"
            open={openSections.attributes}
            onToggle={() => toggleSection('attributes')}
          >
            {draft.attributes.length === 0 ? (
              <p className="text-ink/60 m-0 text-sm">No attributes recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {groupAttributes(draft.attributes).map(([group, entries]) => (
                  <div key={group}>
                    <p className="text-ink/55 m-0 mb-1 text-[11px] tracking-wider uppercase">
                      {group}
                    </p>
                    <div className="flex flex-col gap-2">
                      {entries.map(({ attr, index: i }) => (
                        <div key={attr.id ?? `new-attr-${i}`} className="flex items-center gap-2">
                          <span className="w-40 shrink-0 text-sm">{attr.label}</span>
                          {attr.valueType === 'boolean' ? (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={attr.value === 'true'}
                                disabled={readOnly || busy}
                                onChange={(e) =>
                                  updateAttribute(i, e.target.checked ? 'true' : 'false')
                                }
                              />
                              Yes
                            </label>
                          ) : (
                            <Input
                              value={attr.value}
                              disabled={readOnly || busy}
                              onChange={(e) => updateAttribute(i, e.target.value)}
                              className="flex-1"
                            />
                          )}
                          {attr.unit ? (
                            <span className="text-ink/55 text-xs">{attr.unit}</span>
                          ) : null}
                          {editing ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="text-xs"
                              disabled={busy}
                              onClick={() => removeAttribute(i)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {editing && availableRegistryEntries.length > 0 ? (
              <div className="border-ink/10 mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <Select
                  value={activeRegistryEntry?.attributeKey ?? ''}
                  onChange={(e) => setAttributeChoice(e.target.value)}
                  className="w-auto"
                >
                  {availableRegistryEntries.map((entry) => (
                    <option key={entry.attributeKey} value={entry.attributeKey}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" onClick={addAttribute}>
                  <Plus size={14} strokeWidth={2.75} /> Add attribute
                </Button>
              </div>
            ) : null}
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
            {supplierTerms ? (
              <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    Minimum order
                  </dt>
                  <dd className="m-0">
                    {supplierTerms.minOrderPieces} pcs total / {supplierTerms.minPiecesPerDesign}{' '}
                    per design
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    Default shipping
                  </dt>
                  <dd className="m-0">{supplierTerms.defaultShippingMethod || '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                    Prices subject to change
                  </dt>
                  <dd className="m-0">{supplierTerms.pricesSubjectToChange ? 'Yes' : 'No'}</dd>
                </div>
                {supplierTerms.backorderPolicy ? (
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                      Backorder policy
                    </dt>
                    <dd className="m-0">{supplierTerms.backorderPolicy}</dd>
                  </div>
                ) : null}
                {supplierTerms.orderProcessingPolicy ? (
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                      Order processing
                    </dt>
                    <dd className="m-0">{supplierTerms.orderProcessingPolicy}</dd>
                  </div>
                ) : null}
                {supplierTerms.claimsPolicy ? (
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                      Claims policy
                    </dt>
                    <dd className="m-0">{supplierTerms.claimsPolicy}</dd>
                  </div>
                ) : null}
                {supplierTerms.returnsPolicy ? (
                  <div>
                    <dt className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
                      Returns policy
                    </dt>
                    <dd className="m-0">{supplierTerms.returnsPolicy}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-ink/60 m-0 text-sm">
                No catalog-wide supplier terms configured yet.
              </p>
            )}
            <div className="border-ink/10 mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
              <Field>
                <FieldLabel>SKU minimum quantity</FieldLabel>
                <Input
                  value={draft.minimumQuantity}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, minimumQuantity: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Order multiple</FieldLabel>
                <Input
                  value={draft.orderMultiple}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, orderMultiple: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Pack quantity</FieldLabel>
                <Input
                  value={draft.packQuantity}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, packQuantity: e.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Public wholesale"
            open={openSections.publicWholesale}
            onToggle={() => toggleSection('publicWholesale')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isPubliclyPublished}
                  disabled={readOnly || busy}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isPubliclyPublished: e.target.checked }))
                  }
                />
                Published on public showroom
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, featured: e.target.checked }))}
                />
                Featured
              </label>
              <Field>
                <FieldLabel>Sales rank</FieldLabel>
                <Input
                  type="number"
                  value={draft.publicSortOrder}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, publicSortOrder: e.target.value }))}
                />
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Lower numbers appear first on the wholesale showroom.
                </p>
              </Field>
              <Field>
                <FieldLabel>Public slug{draft.isPubliclyPublished ? ' *' : ''}</FieldLabel>
                <Input
                  value={draft.publicSlug}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, publicSlug: e.target.value }))}
                />
                {slugError ? <p className="text-accent-800 mt-1 text-xs">{slugError}</p> : null}
              </Field>
              <Field>
                <FieldLabel>Live store SKU</FieldLabel>
                <Input
                  value={draft.liveSku}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, liveSku: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Live SKU note</FieldLabel>
                <Input
                  value={draft.liveSkuNote}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, liveSkuNote: e.target.value }))}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Alternate image URLs (one per line)</FieldLabel>
                <Textarea
                  value={draft.alternateImageUrls}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, alternateImageUrls: e.target.value }))}
                  rows={3}
                />
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!draft.publicSlug.trim()}
                  onClick={() => {
                    const url = publicWholesaleUrl(draft.publicSlug, presentationMarket ?? 'ca');
                    if (!url) return;
                    void navigator.clipboard.writeText(url).then(() => {
                      setLinkCopied(true);
                      window.setTimeout(() => setLinkCopied(false), 2000);
                    });
                  }}
                >
                  {linkCopied ? 'Copied' : 'Copy public link'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!draft.isPubliclyPublished || !draft.publicSlug.trim()}
                  title={
                    !draft.isPubliclyPublished ? 'Publish to preview on the public site' : undefined
                  }
                  onClick={() => {
                    const url = publicWholesaleUrl(draft.publicSlug, presentationMarket ?? 'ca');
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Preview public page
                </Button>
              </div>
              <div className="sm:col-span-2">
                <p className="text-ink/55 m-0 mb-2 text-xs font-medium tracking-wide uppercase">
                  Email
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!draft.publicSlug.trim()}
                    onClick={() => {
                      const href = tryBuildOgrProductUrl(
                        draft.publicSlug,
                        window.location.origin,
                        presentationMarket ?? 'ca',
                      );
                      if (!href) {
                        setEmailCardCopyState('error');
                        if (emailCardCopyTimerRef.current != null) {
                          window.clearTimeout(emailCardCopyTimerRef.current);
                        }
                        emailCardCopyTimerRef.current = window.setTimeout(
                          () => setEmailCardCopyState('idle'),
                          2000,
                        );
                        return;
                      }
                      const presentation = buildPublicProductPresentation(
                        draftToPublicOgrProduct(item, draft),
                        { publicMarket: presentationMarket ?? 'ca' },
                      );
                      const catalogHref = buildOgrCollectionUrl(
                        window.location.origin,
                        presentationMarket ?? 'ca',
                      );
                      const html = renderOgrProductEmailCard(presentation, {
                        href,
                        catalogHref,
                        wholesaleUsd: parseOptionalNumber(draft.priceUsd) ?? item.catalogPriceUsd,
                      });
                      const plainText = buildOgrProductEmailCardPlainText({
                        productName: presentation.name,
                        tagline: presentation.tagline,
                        productHref: href,
                        catalogHref,
                      });
                      void copyOgrProductEmailCardToClipboard({ html, plainText })
                        .then((mode) => {
                          setEmailCardCopyState(mode);
                          if (emailCardCopyTimerRef.current != null) {
                            window.clearTimeout(emailCardCopyTimerRef.current);
                          }
                          emailCardCopyTimerRef.current = window.setTimeout(
                            () => setEmailCardCopyState('idle'),
                            2000,
                          );
                        })
                        .catch(() => {
                          setEmailCardCopyState('error');
                          if (emailCardCopyTimerRef.current != null) {
                            window.clearTimeout(emailCardCopyTimerRef.current);
                          }
                          emailCardCopyTimerRef.current = window.setTimeout(
                            () => setEmailCardCopyState('idle'),
                            2000,
                          );
                        });
                    }}
                  >
                    {emailCardCopyState === 'rich'
                      ? 'Email card copied'
                      : emailCardCopyState === 'plain'
                        ? 'Copied as plain text'
                        : emailCardCopyState === 'error'
                          ? 'Could not copy email card'
                          : 'Copy Email Card'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      outreachBlocked || !draft.publicSlug.trim() || !draft.isPubliclyPublished
                    }
                    title={
                      eaglePeakOutreachBlocked
                        ? 'Eagle Peak outreach is not enabled'
                        : bigFishOutreachBlocked
                          ? 'Big Fish outreach is not enabled'
                          : !draft.publicSlug.trim()
                            ? 'Public slug is required'
                            : !draft.isPubliclyPublished
                              ? 'Publish to send product email'
                              : undefined
                    }
                    onClick={() => {
                      setEmailReviewDraft(null);
                      setEmailModalOpen(true);
                    }}
                  >
                    {emailSendState === 'sent' ? 'Email sent' : 'Email Product'}
                  </Button>
                </div>
              </div>
              {!draft.isPubliclyPublished ? (
                <p className="text-ink/55 text-xs sm:col-span-2">
                  Publish to preview on the public site or send Email Product. Copy link and Copy
                  Email Card still work from the slug.
                </p>
              ) : null}
              <ProductEmailHistory
                key={`${item.id}-${emailHistoryReloadToken}`}
                catalogItemId={item.id}
                onReviewDraft={(historyItem) => {
                  if (
                    historyItem.prospectId == null ||
                    !historyItem.accountContactId ||
                    !historyItem.catalogItemId
                  ) {
                    return;
                  }
                  setEmailReviewDraft({
                    id: historyItem.id,
                    to: historyItem.toEmail,
                    toName: historyItem.toName?.trim() || '',
                    subject: historyItem.subject,
                    introText: historyItem.introText ?? '',
                    closingText: historyItem.closingText ?? '',
                    prospectId: historyItem.prospectId,
                    accountContactId: historyItem.accountContactId,
                    catalogItemId: historyItem.catalogItemId,
                    prospectName: historyItem.prospectName ?? undefined,
                    productSku: item.sku,
                    productSlug: draft.publicSlug ?? undefined,
                    productIsNew: draft.isNew,
                  });
                  setEmailModalOpen(true);
                }}
              />
            </div>
          </Section>

          <Section
            title="CRM intelligence"
            open={openSections.crm}
            onToggle={() => toggleSection('crm')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>Lifestyle Themes</FieldLabel>
                <div className="gap-2.1 mt-1 flex flex-wrap">
                  {LIFESTYLE_THEMES.map((opt) => {
                    const checked = draft.lifestyleThemes.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="border-divider text-ink inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly || busy}
                          onChange={() => {
                            setDraft((d) => {
                              const next = new Set(d.lifestyleThemes);
                              if (next.has(opt.value)) next.delete(opt.value);
                              else next.add(opt.value);
                              return {
                                ...d,
                                lifestyleThemes: normalizeLifestyleThemes([...next]),
                              };
                            });
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Merchandise themes shown on the wholesale showroom Lifestyle Theme filter.
                </p>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>
                  Recommended Retail Channels (up to {MAX_RECOMMENDED_CHANNELS})
                </FieldLabel>
                <div className="gap-2.1 mt-1 flex flex-wrap">
                  {PRIMARY_RETAIL_CHANNELS.map((opt) => {
                    const checked = draft.recommendedChannels.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="border-divider text-ink inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly || busy}
                          onChange={() => {
                            setDraft((d) => {
                              const next = new Set(d.recommendedChannels);
                              if (next.has(opt.value)) next.delete(opt.value);
                              else if (next.size < MAX_RECOMMENDED_CHANNELS) next.add(opt.value);
                              return {
                                ...d,
                                recommendedChannels: normalizePrimaryChannels([...next]),
                              };
                            });
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-ink/55 m-0 mt-1 text-xs">
                  Retailer types this garment best fits (staff CRM guidance).
                </p>
              </Field>
              <Field>
                <FieldLabel>Seasonality</FieldLabel>
                <Input
                  value={draft.seasonality}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, seasonality: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Sample status</FieldLabel>
                <Input
                  value={draft.sampleStatus}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, sampleStatus: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel>Sales priority</FieldLabel>
                <Input
                  value={draft.salesPriority}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, salesPriority: e.target.value }))}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Buyer feedback</FieldLabel>
                <Textarea
                  value={draft.buyerFeedback}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, buyerFeedback: e.target.value }))}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Sales notes</FieldLabel>
                <Textarea
                  value={draft.salesNotes}
                  disabled={readOnly || busy}
                  onChange={(e) => setDraft((d) => ({ ...d, salesNotes: e.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Source & history"
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
                <dd className="m-0">{resolvePrimaryImageSrc(item) || 'Not yet extracted'}</dd>
              </div>
            </dl>

            <div className="border-ink/10 mt-3 border-t pt-3">
              <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wider uppercase">
                Field provenance
              </p>
              {Object.keys(item.fieldMeta).length === 0 ? (
                <p className="text-ink/60 m-0 text-sm">
                  No manual edits recorded — all fields reflect catalog import.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(item.fieldMeta).map(([field, meta]) => (
                    <Tag key={field} variant={fieldMetaTagVariant(meta)}>
                      {field}: {meta.source ?? 'catalog'}
                      {meta.verified ? ' ✓' : ''}
                    </Tag>
                  ))}
                </div>
              )}
            </div>

            <div className="border-ink/10 mt-3 border-t pt-3">
              <p className="text-ink/55 m-0 mb-2 text-[11px] tracking-wider uppercase">
                Recent changes
              </p>
              {historyLoading ? (
                <p className="text-ink/60 m-0 text-sm">Loading history…</p>
              ) : historyError ? (
                <p className="text-accent-800 m-0 text-sm" role="alert">
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className="text-ink/60 m-0 text-sm">No recorded changes yet.</p>
              ) : (
                <ul className="border-ink/10 m-0 list-none rounded-md border p-0 text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="border-ink/10 border-b px-3 py-2 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{h.fieldPath}</span>
                        <Tag variant="neutral">{h.source}</Tag>
                        <span className="text-ink/50 ml-auto">
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-ink/70 mt-0.5">
                        {formatHistoryValue(h.oldValue)} → {formatHistoryValue(h.newValue)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        </div>
      </aside>
      <OgrProductEmailComposerModal
        open={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setEmailReviewDraft(null);
        }}
        onSent={() => {
          setEmailSendState('sent');
          setEmailHistoryReloadToken((n) => n + 1);
          onProductEmailSent?.();
          if (emailSendTimerRef.current != null) {
            window.clearTimeout(emailSendTimerRef.current);
          }
          emailSendTimerRef.current = window.setTimeout(() => setEmailSendState('idle'), 2000);
        }}
        onDraftCancelled={() => {
          setEmailHistoryReloadToken((n) => n + 1);
        }}
        productId={item.id}
        productName={draft.name.trim()}
        cardHtml={emailCardPreviewHtml}
        draft={emailReviewDraft}
        publicMarket={presentationMarket ?? 'ca'}
      />
    </>
  );
}

function groupAttributes(
  attributes: DraftAttribute[],
): [AttributeGroup, { attr: DraftAttribute; index: number }[]][] {
  const groups = new Map<AttributeGroup, { attr: DraftAttribute; index: number }[]>();
  attributes.forEach((attr, index) => {
    const list = groups.get(attr.attributeGroup) ?? [];
    list.push({ attr, index });
    groups.set(attr.attributeGroup, list);
  });
  return Array.from(groups.entries());
}

function fieldMetaTagVariant(meta: FieldMetaEntry): 'accent' | 'accent-2' | 'neutral' | 'outline' {
  if (meta.source === 'user') return 'accent';
  if (meta.source === 'calculated' || meta.source === 'ai') return 'accent-2';
  if (meta.source === 'catalog') return 'outline';
  return 'neutral';
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
