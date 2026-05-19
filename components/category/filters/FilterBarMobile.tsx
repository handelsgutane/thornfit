'use client';

/**
 * FilterBarMobile — mobile-only 52px filter-header + aktive chips-rad + drawer-
 * trigger. Motstykke til `FilterBar` som kun vises på sm+.
 *
 * Paper-refs:
 *   - 51K-0  "Category — Header Filter (Mobile)" — header med Filter/Sort split
 *   - 51L-0  Filter-knappen (venstre halvdel) — ikon + label + rød badge
 *   - 51N-0  Sort-knappen (høyre halvdel) — tekst + caret + native select
 *   - 38R-0  Aktive chips — samme komponent som desktop, horisontal scroll
 *
 * Interaksjonsmodell:
 *   - "Filter"-knappen åpner bottom-sheet-drawer (FilterDrawer).
 *   - "Sortering"-knappen er et fake-UI på toppen av en native `<select>` med
 *     `opacity-0`. Det gir oss gratis nativ-picker på iOS/Android uten å
 *     reimplementere en egen wheel. Sort-antallet er alltid 3–5 options, så
 *     native UX slår custom hver gang på mobil.
 *
 * State-eierskap: parent (CategoryBrowser) eier `selections` og `sort`. Denne
 * baren er purt kontrollert-presentasjonell — den holder kun `drawerOpen` lokalt.
 *
 * Responsive-gating: wrapper-en bruker `md:hidden` så den ikke rendres i DOM
 * på sm+, og den desktop `FilterBar` får `hidden md:block` i CategoryBrowser.
 */

import { useState } from 'react';

import { ActiveFilterChip } from './ActiveFilterChip';
import type { FilterDef } from './FilterBar';
import { FilterDrawer } from './FilterDrawer';
import { filterLabelCase } from './labelCase';
import type { SortOption } from './SortDropdown';

export interface FilterBarMobileProps {
  filters: FilterDef[];
  sortOptions: SortOption[];

  selections: Record<string, string[]>;
  onSelectionsChange: (next: Record<string, string[]>) => void;

  sort: string;
  onSortChange: (next: string) => void;

  /** Antall produkter som matcher nåværende filter — driver drawer-CTA. */
  matchCount: number;
}

export function FilterBarMobile({
  filters,
  sortOptions,
  selections,
  onSelectionsChange,
  sort,
  onSortChange,
  matchCount,
}: FilterBarMobileProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Antall aktive filter-valg på tvers av alle grupper — brukes i badge-en
  // ved siden av "Filter"-teksten.
  const totalSelections = filters.reduce(
    (acc, f) => acc + (selections[f.key] ?? []).length,
    0,
  );

  // Flate liste av aktive chips — samme shape som desktop-baren.
  const activeChips = filters.flatMap((filter) =>
    (selections[filter.key] ?? []).map((value) => {
      const opt = filter.options.find((o) => o.value === value);
      const raw = opt?.label ?? value;
      return {
        filterKey: filter.key,
        value,
        label: filterLabelCase(raw),
      };
    }),
  );

  function removeValue(filterKey: string, value: string) {
    const current = selections[filterKey] ?? [];
    onSelectionsChange({
      ...selections,
      [filterKey]: current.filter((v) => v !== value),
    });
  }

  function clearAll() {
    onSelectionsChange(
      Object.fromEntries(filters.map((f) => [f.key, []])),
    );
  }

  const currentSort = sortOptions.find((o) => o.value === sort) ?? sortOptions[0];

  return (
    <div
      // Sticky på mobil — limer Filter/Sort + aktive chips til toppen
      // når brukeren scroller produktlisten. `top` er summen av utility-bar
      // og mobile-header-høyde slik at filter-baren legger seg rett under
      // den allerede-stickyhe headeren. z-20 holder den under header (z-30)
      // men over produkt-grid.
      className="sticky z-20 bg-surface md:hidden"
      style={{ top: 'calc(var(--height-utility-bar) + var(--height-mobile-header))' }}
    >
      {/* 52px split-bar — vertikalt delt mellom Filter og Sortering. */}
      <div
        className={[
          'flex h-drawer-row items-stretch' /* paper-exact: 51K-0 h-52 */,
          'border-y border-divider bg-surface',
        ].join(' ')}
      >
        {/* Filter-trigger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          className={[
            'flex flex-1 items-center justify-center gap-sp-2' /* paper-exact: 51L-0 gap 10 */,
            'border-r border-divider' /* paper-exact: 51K-0 vertikal skillelinje */,
            'text-body-sm font-bold text-ink' /* paper-exact: 51M-0 14/18 bold */,
            'transition-colors hover:text-aka focus:outline-none focus-visible:text-aka',
          ].join(' ')}
        >
          <FilterLinesIcon />
          <span>Filter</span>
          {totalSelections > 0 && (
            // Perfekt sirkel: fast 20×20 uten horisontal padding — `inline-flex`
            // + `items-center justify-center` sentrerer tallet i kvadratet, og
            // `rounded-full` på like-sidet boks gir ekte sirkel (ikke pill).
            <span
              className={[
                'inline-flex h-5 w-5 items-center justify-center rounded-full' /* paper-exact: 51P-0 20×20 */,
                'bg-aka text-label-sm font-bold text-shiro' /* paper-exact: 51P-0 aka bg */,
              ].join(' ')}
            >
              {totalSelections}
            </span>
          )}
        </button>

        {/* Sort-trigger — native <select> stacket over en fake-UI slik at vi
            får nativ picker på mobil uten egen implementasjon. */}
        <label
          className={[
            'relative flex flex-1 items-center justify-center gap-sp-2' /* paper-exact: 51N-0 */,
            'text-body-sm text-ink',
            'transition-colors focus-within:text-aka hover:text-aka',
          ].join(' ')}
        >
          <span className="sr-only">Sortering</span>
          <span aria-hidden className="text-ink-muted">Sorter:</span>
          <span aria-hidden className="font-bold" /* paper-exact: 51N-0 valgt sort er bold */>
            {currentSort?.label ?? '—'}
          </span>
          <CaretDownIcon />
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sortering"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Aktive chips-rad — vises kun når minst én verdi er valgt. Horisontal
          scroll gir brukeren plass til å se + fjerne flere chips uten at
          filter-baren selv vokser i høyde. */}
      {activeChips.length > 0 && (
        <div
          className={[
            'flex items-center gap-sp-2' /* paper-exact: 38R-0 gap 8 */,
            'border-b border-divider bg-surface',
            'overflow-x-auto',
            'px-sp-4 py-sp-2' /* paper-exact: 51T-0 padding 8/16 */,
          ].join(' ')}
          role="list"
          aria-label="Aktive filtre"
        >
          {activeChips.map((chip) => (
            <div
              key={`${chip.filterKey}-${chip.value}`}
              role="listitem"
              className="shrink-0"
            >
              <ActiveFilterChip
                label={chip.label}
                onRemove={() => removeValue(chip.filterKey, chip.value)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-body-xs text-ink-muted underline-offset-2 hover:text-aka hover:underline"
          >
            Fjern alle
          </button>
        </div>
      )}

      {drawerOpen && (
        <FilterDrawer
          filters={filters}
          selections={selections}
          onSelectionsChange={onSelectionsChange}
          matchCount={matchCount}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Icons — inline for bundle-hygiene
// =============================================================================

function FilterLinesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <line
        x1="2"
        y1="4.5"
        x2="14"
        y2="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="8"
        x2="12"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="6"
        y1="11.5"
        x2="10"
        y2="11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CaretDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M2 4L5 7L8 4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
