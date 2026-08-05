import {
  DEFAULT_WHOLESALE_FILTERS,
  type WholesaleFilterState,
  type WholesaleSort,
} from '@/lib/wholesaleFilters';

type Props = {
  filters: WholesaleFilterState;
  categories: string[];
  themes: string[];
  resultCount: number;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onChange: (next: WholesaleFilterState) => void;
  onClear: () => void;
};

const SORT_OPTIONS: { value: WholesaleSort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'wholesale', label: 'Wholesale price' },
  { value: 'newest', label: 'Newest' },
];

function FilterFields({
  filters,
  categories,
  themes,
  onChange,
}: {
  filters: WholesaleFilterState;
  categories: string[];
  themes: string[];
  onChange: (next: WholesaleFilterState) => void;
}) {
  return (
    <div className="gap-3.1 grid sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70 text-xs tracking-wide uppercase">Search</span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="Name, SKU, tagline"
          className="border-divider bg-bg px-3.1 focus:border-accent-700 rounded-lg border py-2 text-sm outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70 text-xs tracking-wide uppercase">Category</span>
        <select
          value={filters.cat}
          onChange={(e) => onChange({ ...filters, cat: e.target.value })}
          className="border-divider bg-bg px-3.1 focus:border-accent-700 rounded-lg border py-2 text-sm outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70 text-xs tracking-wide uppercase">Lifestyle theme</span>
        <select
          value={filters.theme}
          onChange={(e) => onChange({ ...filters, theme: e.target.value })}
          className="border-divider bg-bg px-3.1 focus:border-accent-700 rounded-lg border py-2 text-sm outline-none"
          disabled={themes.length === 0}
        >
          <option value="">All themes</option>
          {themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/70 text-xs tracking-wide uppercase">Sort</span>
        <select
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as WholesaleSort })}
          className="border-divider bg-bg px-3.1 focus:border-accent-700 rounded-lg border py-2 text-sm outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function WholesaleFilters({
  filters,
  categories,
  themes,
  resultCount,
  mobileOpen,
  onMobileOpenChange,
  onChange,
  onClear,
}: Props) {
  const hasActive =
    Boolean(filters.q) ||
    Boolean(filters.cat) ||
    Boolean(filters.theme) ||
    filters.sort !== DEFAULT_WHOLESALE_FILTERS.sort;

  return (
    <div className="gap-3.1 flex flex-col">
      <div className="gap-3.1 flex flex-wrap items-center justify-between">
        <p className="text-ink/70 m-0 text-sm">
          {resultCount} {resultCount === 1 ? 'product' : 'products'}
        </p>
        <div className="gap-2.1 flex flex-wrap">
          <button
            type="button"
            className="border-divider px-3.1 font-heading text-ink hover:bg-ink/[0.05] inline-flex items-center justify-center rounded-full border py-2 text-sm md:hidden"
            onClick={() => onMobileOpenChange(!mobileOpen)}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? 'Hide filters' : 'Filters'}
          </button>
          {hasActive ? (
            <button
              type="button"
              className="text-accent-700 hover:text-accent-800 text-sm underline"
              onClick={onClear}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${mobileOpen ? 'block' : 'hidden'} md:block`}>
        <FilterFields
          filters={filters}
          categories={categories}
          themes={themes}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
