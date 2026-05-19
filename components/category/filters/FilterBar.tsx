'use client';

/**
 * FilterBar — orchestrerer filter-dropdowns, aktive-chips og sort-kontroll.
 * Rent presentasjonell (controlled): parent eier `selections` + `sort` og gir
 * oss callbacks. Det gjør at CategoryBrowser kan re-sortere/-filtrere
 * produkt-lista synkront med UI-endringene.
 *
 * Paper-refs:
 *   - 389-0  Filter-bar wrapper (padding-inline 64px, bg shiro, bottom border sakai)
 *   - 38R-0  Aktive chips — margin-left 16px fra siste dropdown
 *   - 391-0  Sort-blokk 52px høy — dikterer filter-bar-høyde via h-drawer-row
 *
 * Chip-overflow: når aktive chips ikke får plass mellom siste filter og
 * sort-blokken, flyttes de ned til sin egen rad under row 1 med horisontal
 * scroll. Detekteres med ResizeObserver + en usynlig måle-`<ul>` som alltid
 * rendrer chip-innholdet i naturlig bredde, slik at vi slipper å flippe
 * fram og tilbake når `overflowed`-staten endrer DOM-en.
 *
 * State-eierskap: parent (CategoryBrowser) deriverer `selections` + `sort`
 * fra URL via `useFilterUrlState`. Denne baren forblir purt kontrollert —
 * callbacks propagerer opp, parent pusher til URL via `router.replace`.
 *
 * TODO (data):
 * - Hent `filters`-definisjonene fra Woo-attributter synket til Supabase.
 *   Mønster: `product_attributes` tabell med (attribute_slug, value_slug,
 *   count) aggregert per kategori. Cron-sync 1×/dag er nok.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ActiveFilterChip } from './ActiveFilterChip';
import { FilterDropdown, type FilterOption } from './FilterDropdown';
import { filterLabelCase } from './labelCase';
import { SortDropdown, type SortOption } from './SortDropdown';

export interface FilterDef {
  /** Intern nøkkel — brukt i state. */
  key: string;
  label: string;
  options: FilterOption[];
}

export interface FilterBarProps {
  filters: FilterDef[];
  sortOptions: SortOption[];

  /** Kontrollert: `{ [filterKey]: value[] }`. */
  selections: Record<string, string[]>;
  onSelectionsChange: (next: Record<string, string[]>) => void;

  /** Kontrollert: valgt sort-value. */
  sort: string;
  onSortChange: (next: string) => void;
}

export function FilterBar({
  filters,
  sortOptions,
  selections,
  onSelectionsChange,
  sort,
  onSortChange,
}: FilterBarProps) {
  function updateFilter(key: string, next: string[]) {
    onSelectionsChange({ ...selections, [key]: next });
  }

  function removeValue(filterKey: string, value: string) {
    updateFilter(
      filterKey,
      (selections[filterKey] ?? []).filter((v) => v !== value),
    );
  }

  /**
   * Bygg label for chip: kun selve verdien (casing via `filterLabelCase` som
   * bevarer akronymer som HRC/VG/AUS + stål-koder som S30V/AUS-8). Ingen
   * filter-prefiks siden det kostet ~60px ekstra per chip og utløste overflow-
   * raden mye oftere. Filter-grupperingen er uansett visuelt klar siden hver
   * chip følger sin dropdown (med aktiv rød understrek når verdier er valgt).
   */
  function chipLabel(filter: FilterDef, value: string): string {
    const opt = filter.options.find((o) => o.value === value);
    return filterLabelCase(opt?.label ?? value);
  }

  const activeChips = useMemo(
    () =>
      filters.flatMap((filter) =>
        (selections[filter.key] ?? []).map((value) => ({
          filterKey: filter.key,
          value,
          label: chipLabel(filter, value),
        })),
      ),
    [filters, selections],
  );

  const barRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLUListElement>(null);
  const [overflowed, setOverflowed] = useState(false);

  // Horisontal plass-sjekk: sammenlign chip-innholdets naturlige bredde mot
  // den tilgjengelige plassen (bar − filters − sort − 16px margin). Målingen
  // skjer på en usynlig tvilling av chip-raden så `overflowed`-flippen ikke
  // påvirker egen måling (som ville skapt oscillasjon).
  useLayoutEffect(() => {
    const measure = () => {
      const bar = barRef.current;
      const filtersEl = filtersRef.current;
      const sortEl = sortRef.current;
      const measureEl = measureRef.current;
      if (!bar || !filtersEl || !sortEl || !measureEl) return;
      if (activeChips.length === 0) {
        setOverflowed(false);
        return;
      }
      const CHIP_MARGIN_LEFT = 16; /* paper-exact: 38R-0 */
      const available =
        bar.clientWidth -
        filtersEl.offsetWidth -
        sortEl.offsetWidth -
        CHIP_MARGIN_LEFT;
      setOverflowed(measureEl.scrollWidth > Math.max(0, available));
    };
    measure();
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [activeChips]);

  return (
    <div
      ref={barRef}
      className={[
        'relative w-full border-b border-divider bg-surface',
        'px-sp-4 sm:px-sp-7' /* paper-exact: 389-0 padding-inline 64px på sm+ */,
      ].join(' ')}
    >
      <div className="flex h-drawer-row items-stretch">
        <div ref={filtersRef} className="flex items-stretch">
          {filters.map((filter) => (
            <FilterDropdown
              key={filter.key}
              label={filter.label}
              options={filter.options}
              selected={selections[filter.key] ?? []}
              onChange={(next) => updateFilter(filter.key, next)}
            />
          ))}
        </div>

        {/* Inline chips — kun rad 1 når det er plass. Overflow-raden under
            håndterer de øvrige tilfellene. `flex-nowrap` så chips ikke
            wrapper innad i rad 1 og sprenger høyden. */}
        {!overflowed && activeChips.length > 0 && (
          <ul
            className={[
              'flex flex-nowrap items-center gap-sp-2',
              'ml-[16px]' /* paper-exact: 38R-0 margin-left 16px */,
            ].join(' ')}
          >
            {activeChips.map((chip) => (
              <li key={`${chip.filterKey}-${chip.value}`}>
                <ActiveFilterChip
                  label={chip.label}
                  onRemove={() => removeValue(chip.filterKey, chip.value)}
                />
              </li>
            ))}
          </ul>
        )}

        <div ref={sortRef} className="ml-auto flex h-full items-stretch">
          <SortDropdown
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
          />
        </div>
      </div>

      {/* Rad 2: chips flyttes hit når de ikke får plass ved siden av Sortering.
          Horisontal scroll — bruker drar chipset sideveis for å nå X-knappen
          på dem alle. Negative margins + matchende padding re-applyer wrapper-
          padding slik at chips starter flush med filter-raden over. */}
      {overflowed && activeChips.length > 0 && (
        <div
          className={[
            'flex items-center gap-sp-2 overflow-x-auto border-t border-divider',
            'py-sp-2',
            '-mx-sp-4 px-sp-4 sm:-mx-sp-7 sm:px-sp-7',
          ].join(' ')}
          role="list"
          aria-label="Aktive filtre"
        >
          {activeChips.map((chip) => (
            <div key={`${chip.filterKey}-${chip.value}`} role="listitem" className="shrink-0">
              <ActiveFilterChip
                label={chip.label}
                onRemove={() => removeValue(chip.filterKey, chip.value)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Måle-tvilling: alltid montert utenfor layout, uleselig for skjerm-
          lesere. Bredden her er chip-innholdets naturlige bredde — som er
          det vi sammenligner mot tilgjengelig plass i rad 1. `left` settes
          via inline-style siden `-9999px` ikke er en design-token og
          ESLint-regelen tillater ikke arbitrary Tailwind-verdier. */}
      <ul
        ref={measureRef}
        aria-hidden
        style={{ left: '-9999px' }}
        className="pointer-events-none invisible fixed top-0 flex flex-nowrap items-center gap-sp-2"
      >
        {activeChips.map((chip) => (
          <li key={`measure-${chip.filterKey}-${chip.value}`}>
            <ActiveFilterChip label={chip.label} onRemove={() => {}} />
          </li>
        ))}
      </ul>
    </div>
  );
}
