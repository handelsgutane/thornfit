'use client';

/**
 * FilterDropdown — én kolonne i filter-baren. Kontrollert komponent: parent
 * eier `selected`-tilstanden og bestemmer hva som skjer ved endring.
 *
 * Paper-refs:
 *   - 389-0  Filter-bar wrapper (hvit bakgrunn, sakai bottom border)
 *   - 38B-0  Aktiv/åpen filter — padding-inline 18px, gap 6px,
 *            border-bottom 2px aka, border-right 1px sakai, height 100%
 *   - Inaktiv filter: ingen aka underline, kun sakai right-divider
 *
 * Interaksjon: hover åpner dropdownen (desktop-mønster). På touch/tap
 * fungerer klikk som fallback. Escape + blur-outside lukker. Se
 * `useHoverOpen` for detaljer.
 *
 * Aktiv visuell indikator: rød (aka) underline på bunnen når `active` er true.
 * Active betyr "brukeren har gjort et valg i dette filteret" — ikke "åpent".
 *
 * Typografi: Paper 38B-0 har ingen eksplisitt tekst-node, så vi bruker
 * `text-body-sm font-medium` som matcher den faktiske 14px/Medium stilen
 * brukt i ProductCard, Header og SearchOverlay.
 */

import { CaretDownIcon } from './icons';
import { filterLabelCase } from './labelCase';
import { useHoverOpen } from './useHoverOpen';

export interface FilterOption {
  value: string;
  label: string;
  /** Valgfri — f.eks. antall produkter i denne bøtta. */
  count?: number;
}

export interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  /** Valgte verdier — multi-select. Tomt array = ingen aktive valg. */
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Maks antall options per kolonne før vi bryter til ny kolonne til høyre
 * (desktop). På mobil kollapser kolonnene til én vertikal liste via
 * `flex-col md:flex-row`.
 */
const COLUMN_CHUNK_SIZE = 10;

function chunkOptions<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: FilterDropdownProps) {
  const isActive = selected.length > 0;
  const { open, containerRef, containerProps, triggerProps } = useHoverOpen();
  const displayLabel = filterLabelCase(label);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div
      ref={containerRef}
      // Vi rendrer alltid border-r — også på siste filter — så filter-raden
      // har konsistent kolonne-visual uansett hvor mange filtre som finnes.
      className="relative h-full border-r border-divider"
      {...containerProps}
    >
      <button
        type="button"
        {...triggerProps}
        className={[
          'flex h-full w-full items-center gap-[6px]' /* paper-exact: 38B-0 gap 6px */,
          'px-[18px]' /* paper-exact: 38B-0 padding-inline 18px */,
          'text-body-sm font-medium text-ink',
          'border-b-2' /* paper-exact: 38B-0 aktivt filter har 2px aka underline */,
          isActive ? 'border-aka' : 'border-transparent',
          'transition-colors hover:bg-surface-muted hover:text-aka',
          'focus:outline-none focus-visible:bg-surface-muted focus-visible:text-aka',
        ].join(' ')}
      >
        <span>{displayLabel}</span>
        {isActive && (
          <span className="text-label-sm text-ink-muted">({selected.length})</span>
        )}
        <CaretDownIcon
          className={[
            'transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && (() => {
        const chunks = chunkOptions(options, COLUMN_CHUNK_SIZE);
        const isMulti = chunks.length > 1;
        return (
          <div
            role="menu"
            className={[
              'absolute left-0 top-full z-20 overflow-hidden rounded-sm border border-divider bg-surface shadow-sm',
              // Single-kolonne: behold opprinnelig bredde-låsing.
              // Multi-kolonne: la containeren vokse naturlig (hver kolonne er
              // `min-w-56`) så det aldri blir scrollbart på desktop.
              isMulti ? 'min-w-56' : 'min-w-56 max-w-xs',
            ].join(' ')}
          >
            {options.length === 0 ? (
              <ul className="flex flex-col py-sp-2">
                <li className="px-sp-4 py-sp-2 text-body-xs text-ink-muted">
                  Ingen valg tilgjengelig
                </li>
              </ul>
            ) : (
              <div className="flex flex-col md:flex-row">
                {chunks.map((chunk, chunkIdx) => (
                  <ul
                    key={chunkIdx}
                    className={[
                      'flex w-full flex-col py-sp-2',
                      // Hver desktop-kolonne holder samme minstebredde som
                      // single-kolonne-dropdown. `flex-1` gjør at kolonner
                      // vokser likt hvis en option er bredere enn andre.
                      isMulti ? 'min-w-56 flex-1' : '',
                      // Vertikal divider mellom desktop-kolonner; på mobil
                      // (stacket) brukes top-border i stedet.
                      isMulti && chunkIdx > 0
                        ? 'border-t border-divider md:border-l md:border-t-0'
                        : '',
                    ].join(' ')}
                  >
                    {chunk.map((option) => {
                      const checked = selected.includes(option.value);
                      return (
                        <li key={option.value}>
                          <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={checked}
                            onClick={() => toggle(option.value)}
                            className="flex w-full items-center justify-between gap-sp-3 px-sp-4 py-sp-2 text-body-sm text-ink transition-colors hover:bg-surface-muted"
                          >
                            <span className="flex items-center gap-sp-2">
                              <span
                                aria-hidden
                                className={[
                                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-1 border',
                                  checked
                                    ? 'border-aka bg-aka text-shiro'
                                    : 'border-divider bg-surface',
                                ].join(' ')}
                              >
                                {checked && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M2 5L4 7L8 3"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span>{filterLabelCase(option.label)}</span>
                            </span>
                            {option.count !== undefined && (
                              <span className="text-label-sm text-ink-muted">
                                {option.count}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
