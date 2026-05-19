'use client';

/**
 * FilterDrawer — bottom-sheet drawer for mobile filter-UX.
 *
 * Paper-refs:
 *   - 8Z5-0  "Filter — Grupper (Mobile)" — gruppe-liste med count-badge
 *   - 96A-0  "Filter — Enkeltgruppe (Mobile)" — søk + checkbox-liste
 *
 * To views i samme drawer, styrt av intern `activeGroupKey`:
 *   - null   → vis gruppe-lista (8Z5-0)
 *   - string → vis den valgte gruppa med options (96A-0)
 *
 * Arkitektur-valg:
 *   - Drawer renders via createPortal direkte i document.body så den slipper
 *     stacking-context-problemer hvis CategoryBrowser ligger inni en parent
 *     med egen transform / filter (Safari). Samme mønster som
 *     SearchOverlayProvider.
 *   - Body-scroll-lock via `documentElement.style.overflow = 'hidden'`
 *     (samme som SearchOverlayProvider — mer robust enn body).
 *   - Escape + backdrop-klikk + X lukker. Drag-to-dismiss ikke implementert
 *     i dag — vurder `vaul`/egen pan-handler hvis brukere savner det.
 *
 * Count-CTA: `matchCount` prop oppdateres live fra parent basert på
 * `visibleProducts.length`. Brukeren ser antallet forandre seg når de haker
 * av alternativer, så CTA-tekst er alltid korrekt ved click.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Guard på `document`: kjører ikke på server-rendering av RSC-tre. Vi bruker
 * ikke et `mounted`-state-flagg fordi `react-hooks/set-state-in-effect` flagger
 * `useEffect(() => setMounted(true), [])` som cascading render — samme atferd
 * får vi gratis ved å sjekke typeof document direkte.
 */
const canUsePortal = () => typeof document !== 'undefined';

import type { FilterDef } from './FilterBar';
import type { FilterOption } from './FilterDropdown';
import { filterLabelCase } from './labelCase';

export interface FilterDrawerProps {
  filters: FilterDef[];
  selections: Record<string, string[]>;
  onSelectionsChange: (next: Record<string, string[]>) => void;
  /** Antall produkter som matcher nåværende selections — drives av parent. */
  matchCount: number;
  onClose: () => void;
}

export function FilterDrawer({
  filters,
  selections,
  onSelectionsChange,
  matchCount,
  onClose,
}: FilterDrawerProps) {
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  // Lås body-scroll mens drawer er åpen. html > body — mer robust på iOS Safari.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  // Escape lukker hele drawer-en (ikke bare detail-view — brukerens mentale
  // modell er at Esc lukker "dette vinduet", og drawer er ett vindu).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!canUsePortal()) return null;

  const activeGroup = activeGroupKey
    ? filters.find((f) => f.key === activeGroupKey) ?? null
    : null;

  function clearAll() {
    onSelectionsChange(
      Object.fromEntries(filters.map((f) => [f.key, []])),
    );
  }

  function clearGroup(key: string) {
    onSelectionsChange({ ...selections, [key]: [] });
  }

  function toggleOption(key: string, value: string) {
    const current = selections[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onSelectionsChange({ ...selections, [key]: next });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filter"
      className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
    >
      {/* Backdrop — brand-fixed mørk så det ikke "forsvinner" i dark mode.
          Samme mønster som MobileDrawer-overlayet. */}
      <button
        type="button"
        aria-label="Lukk filter"
        onClick={onClose}
        className="absolute inset-0 bg-kuro/40" /* paper-exact: 94T-0 (rgba(26,26,26,0.4)) */
      />

      <div
        className={[
          'relative flex max-h-[90vh] flex-col' /* paper-exact: 94U-0 (maxHeight 780) */,
          'rounded-t-4 bg-surface' /* paper-exact: 94U-0 (radius 12) */,
        ].join(' ')}
      >
        {/* Drag-handle — kosmetisk i dag; visuell affordance for bottom-sheet. */}
        <div className="flex justify-center pt-[12px]" /* paper-exact: 94V-0 (paddingTop 12) */>
          <span
            aria-hidden
            className="h-[4px] w-[36px] rounded-1 bg-divider" /* paper-exact: 94W-0 (36×4 radius 2) */
          />
        </div>

        {activeGroup ? (
          <GroupDetailView
            group={activeGroup}
            selected={selections[activeGroup.key] ?? []}
            onBack={() => setActiveGroupKey(null)}
            onClose={onClose}
            onClear={() => clearGroup(activeGroup.key)}
            onToggle={(value) => toggleOption(activeGroup.key, value)}
            matchCount={matchCount}
          />
        ) : (
          <GroupsListView
            filters={filters}
            selections={selections}
            onPickGroup={(key) => setActiveGroupKey(key)}
            onClose={onClose}
            onClearAll={clearAll}
            matchCount={matchCount}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

// =============================================================================
// Groups list view (8Z5-0)
// =============================================================================

function GroupsListView({
  filters,
  selections,
  onPickGroup,
  onClose,
  onClearAll,
  matchCount,
}: {
  filters: FilterDef[];
  selections: Record<string, string[]>;
  onPickGroup: (key: string) => void;
  onClose: () => void;
  onClearAll: () => void;
  matchCount: number;
}) {
  const anyActive = filters.some((f) => (selections[f.key] ?? []).length > 0);

  return (
    <>
      {/* Header */}
      <header
        className={[
          'flex items-center justify-between',
          'border-b border-divider',
          'px-sp-5 py-sp-3' /* paper-exact: 94X-0 (padding 16/20) */,
        ].join(' ')}
      >
        <h2
          className={[
            'text-body font-bold leading-5 tracking-[-0.01em] text-ink' /* paper-exact: 94Y-0 (16/20 bold) */,
          ].join(' ')}
        >
          Filter
        </h2>
        <div className="flex items-center gap-sp-3" /* paper-exact: 94Z-0 (gap 16) */>
          {anyActive && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-body-xs text-ink-muted hover:text-ink"
            >
              Fjern alle
            </button>
          )}
          <CloseButton onClick={onClose} />
        </div>
      </header>

      {/* Groups list */}
      <ul className="flex-1 overflow-y-auto">
        {filters.map((filter) => {
          const count = (selections[filter.key] ?? []).length;
          return (
            <li key={filter.key}>
              <button
                type="button"
                onClick={() => onPickGroup(filter.key)}
                className={[
                  'flex h-[56px] w-full items-center justify-between' /* paper-exact: 955-0 (h-56) */,
                  'border-b border-surface-hover' /* paper-exact: 955-0 (border #F5F5F3) */,
                  'px-sp-5' /* paper-exact: 955-0 (padding-inline 20) */,
                  'text-body-md font-medium text-ink' /* paper-exact: 956-0 (15/18 medium) */,
                  'transition-colors hover:bg-surface-muted',
                ].join(' ')}
              >
                <span>{filterLabelCase(filter.label)}</span>
                <span className="flex items-center gap-sp-2" /* paper-exact: 957-0 (gap 10) */>
                  {count > 0 && (
                    <span
                      className={[
                        'flex items-center rounded-full' /* paper-exact: 958-0 (radius 10) */,
                        'px-sp-2 py-[2px]' /* paper-exact: 958-0 (padding 2/8) */,
                        'bg-aka text-muted-sm font-medium text-shiro' /* paper-exact: 958-0 (aka bg) */,
                      ].join(' ')}
                    >
                      {count}
                    </span>
                  )}
                  <ChevronRight />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <SheetFooter matchCount={matchCount} onClose={onClose} />
    </>
  );
}

// =============================================================================
// Single group detail view (96A-0)
// =============================================================================

function GroupDetailView({
  group,
  selected,
  onBack,
  onClose,
  onClear,
  onToggle,
  matchCount,
}: {
  group: FilterDef;
  selected: string[];
  onBack: () => void;
  onClose: () => void;
  onClear: () => void;
  onToggle: (value: string) => void;
  matchCount: number;
}) {
  const [query, setQuery] = useState('');
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('nb-NO');
    if (!q) return group.options;
    return group.options.filter((o) =>
      o.label.toLocaleLowerCase('nb-NO').includes(q),
    );
  }, [group.options, query]);

  return (
    <>
      {/* Header */}
      <header
        className={[
          'flex items-center' /* paper-exact: 9FD-0 (padding 14/20) */,
          'border-b border-divider',
          'py-[14px] pl-sp-5 pr-sp-5' /* paper-exact: 9FD-0 (padding 14/20) */,
          'gap-sp-1' /* paper-exact: 9FD-0 (gap 4) */,
        ].join(' ')}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Tilbake til filter-liste"
          className="-ml-[6px] flex h-8 w-8 shrink-0 items-center justify-center text-ink" /* paper-exact: 9FE-0 (ml -6) */
        >
          <BackArrowIcon />
        </button>
        <h2
          className={[
            'flex-1 text-body font-bold leading-5 tracking-[-0.01em] text-ink' /* paper-exact: 9FH-0 (16/20 bold) */,
          ].join(' ')}
        >
          {filterLabelCase(group.label)}
        </h2>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="mr-sp-3 text-body-xs text-ink-muted hover:text-ink" /* paper-exact: 9FI-0 (mr 12) */
          >
            Fjern
          </button>
        )}
        <CloseButton onClick={onClose} />
      </header>

      {/* Search field */}
      <div
        className={[
          'shrink-0 border-b border-divider',
          'px-sp-5 py-sp-2' /* paper-exact: 9FM-0 (padding 12/20) */,
        ].join(' ')}
      >
        <label
          className={[
            'flex items-center gap-sp-2' /* paper-exact: 9FN-0 (gap 10) */,
            'rounded-3 bg-surface-muted' /* paper-exact: 9FN-0 (radius 6) */,
            'px-[14px] py-[10px]' /* paper-exact: 9FN-0 (padding 10/14) */,
          ].join(' ')}
        >
          <SearchIcon />
          <span className="sr-only">Søk i {group.label.toLocaleLowerCase('nb-NO')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Søk i ${group.label.toLocaleLowerCase('nb-NO')}…`}
            className={[
              'flex-1 bg-transparent outline-none',
              'text-body-sm text-ink placeholder:text-ink-muted' /* paper-exact: 9FS-0 (14/18 regular) */,
              // Skjul browserens native clear-X på iOS/Chrome
              '[&::-webkit-search-cancel-button]:appearance-none',
              '[&::-webkit-search-decoration]:appearance-none',
            ].join(' ')}
          />
        </label>
      </div>

      {/* Options list */}
      <ul className="flex-1 overflow-y-auto">
        {filteredOptions.length === 0 ? (
          <li className="px-sp-5 py-sp-4 text-body-sm text-ink-muted">
            Ingen treff på &ldquo;{query}&rdquo;.
          </li>
        ) : (
          filteredOptions.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              checked={selected.includes(option.value)}
              onToggle={() => onToggle(option.value)}
            />
          ))
        )}
      </ul>

      <SheetFooter matchCount={matchCount} onClose={onClose} />
    </>
  );
}

function OptionRow({
  option,
  checked,
  onToggle,
}: {
  option: FilterOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={[
          'flex h-[52px] w-full items-center justify-between' /* paper-exact: 9FU-0 (h-52) */,
          'border-b border-surface-hover' /* paper-exact: 9FU-0 (border #F5F5F3) */,
          'px-sp-5' /* paper-exact: 9FU-0 (padding-inline 20) */,
          'transition-colors hover:bg-surface-muted',
        ].join(' ')}
      >
        <span className="flex items-center gap-[14px]" /* paper-exact: 9FV-0 (gap 14) */>
          <span
            aria-hidden
            className={[
              'inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center' /* paper-exact: 9FW-0 (20×20) */,
              'rounded-1' /* paper-exact: 9FW-0 (radius 3) er nærmest vår rounded-1=2px — beholder 3px via arbitrary */,
              checked
                ? 'bg-ink text-ink-inverse' /* paper-exact: 9FW-0 (bg #1A1A1A) */
                : 'border border-divider bg-surface',
            ].join(' ')}
          >
            {checked && <CheckIcon />}
          </span>
          <span className="text-body-md font-medium text-ink" /* paper-exact: 9FZ-0 (15/18 medium) */>
            {filterLabelCase(option.label)}
          </span>
        </span>
        {option.count !== undefined && (
          <span className="text-muted-sm text-ink-muted" /* paper-exact: 9G0-0 (12/16) */>
            {option.count}
          </span>
        )}
      </button>
    </li>
  );
}

// =============================================================================
// Shared sub-components
// =============================================================================

function SheetFooter({
  matchCount,
  onClose,
}: {
  matchCount: number;
  onClose: () => void;
}) {
  return (
    <footer
      className={[
        'shrink-0 border-t border-divider bg-surface',
        'pt-sp-3 pr-sp-5 pb-[28px] pl-sp-5' /* paper-exact: 967-0 (padding 16/20/28/20) */,
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onClose}
        className={[
          'flex h-[52px] w-full items-center justify-center' /* paper-exact: 968-0 (h-52) */,
          'rounded-2 bg-aka' /* paper-exact: 968-0 (radius 4) */,
          'text-body-md font-bold tracking-[-0.01em] text-shiro' /* paper-exact: 969-0 (15/18 bold) */,
          'transition-colors hover:bg-aka-dark',
        ].join(' ')}
      >
        {matchCount === 1 ? 'Vis 1 produkt' : `Vis ${matchCount} produkter`}
      </button>
    </footer>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Lukk filter"
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center' /* paper-exact: 951-0 (32×32) */,
        'rounded-full bg-surface-muted text-ink',
      ].join(' ')}
    >
      <CloseIcon />
    </button>
  );
}

// =============================================================================
// Icons — inline for RSC/bundle hygiene
// =============================================================================

function BackArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polyline
        points="12,5 7,10 12,15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink-muted"
    >
      <polyline
        points="6,3 11,8 6,13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 2L10 10M10 2L2 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink-muted"
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <line
        x1="10.5"
        y1="10.5"
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
