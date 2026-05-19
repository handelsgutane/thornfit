'use client';

/**
 * SortDropdown — høyre-side kontroll i filter-baren.
 *
 * Paper-refs:
 *   - 391-0  Sort-blokk — height 52px, paddingLeft 24px, gap 8px,
 *            borderLeft 1px sakai (vertikal skillelinje mot filtrene)
 *   - 394-0  Valgt verdi — 13px Satoshi Medium (500), #1A1A1A,
 *            lineHeight 16px
 *
 * Single-select så vi bruker en enkel knappe-liste uten checkbox-indikator.
 *
 * Interaksjon: hover åpner (samme mønster som FilterDropdown), klikk fallback
 * for touch. Se `useHoverOpen` for detaljer.
 */

import { CaretDownIcon } from './icons';
import { useHoverOpen } from './useHoverOpen';

export interface SortOption {
  value: string;
  label: string;
}

export interface SortDropdownProps {
  label?: string;
  options: SortOption[];
  value: string;
  onChange: (next: string) => void;
}

export function SortDropdown({
  label = 'Sortering',
  options,
  value,
  onChange,
}: SortDropdownProps) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const { open, containerRef, containerProps, triggerProps, close } = useHoverOpen();

  function pick(next: string) {
    onChange(next);
    close();
  }

  return (
    <div
      ref={containerRef}
      className="relative ml-auto h-full border-l border-divider" /* paper-exact: 391-0 border-left sakai */
      {...containerProps}
    >
      <button
        type="button"
        {...triggerProps}
        className={[
          'flex h-full items-center gap-sp-2' /* paper-exact: 391-0 gap 8px */,
          'pl-sp-4 pr-sp-4' /* paper-exact: 391-0 padding-left 24px, matcher pr for symmetri */,
          'text-body-xs text-ink' /* paper-exact: 394-0 13px */,
          'transition-colors hover:text-aka',
          'focus:outline-none focus-visible:text-aka',
        ].join(' ')}
      >
        <span className="text-ink-muted">{label}:</span>
        <span className="font-medium">{current?.label ?? '—'}</span>
        <CaretDownIcon
          className={[
            'transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 min-w-56 rounded-sm border border-divider bg-surface shadow-sm"
        >
          <ul className="flex flex-col py-sp-2">
            {options.map((option) => {
              const isActive = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => pick(option.value)}
                    className={[
                      'flex w-full items-center gap-sp-2 px-sp-4 py-sp-2 text-body-sm transition-colors',
                      isActive
                        ? 'font-medium text-aka'
                        : 'text-ink hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
