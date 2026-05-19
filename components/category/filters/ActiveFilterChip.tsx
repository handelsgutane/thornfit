'use client';

/**
 * ActiveFilterChip — viser ett aktivt filter-valg med X for å fjerne det.
 *
 * Paper-refs:
 *   - 38R-0  Chip-container — margin-left 16px, border-radius 2px,
 *            padding-block 4px, padding-inline 10px, gap 6px,
 *            bg unohana (#F5F5F3), border sakai (#E0E0DC)
 *   - 38S-0  Chip-tekst — 12px Satoshi Medium (500), #1A1A1A, line-height 16px
 *
 * Bruker semantic tokens (surface-muted / divider) i stedet for brand-fikserte
 * (unohana / sakai) slik at chip-en flipper pent i dark mode. På svart filter-
 * bar ville unohana-bg blitt et svevende lyst element; surface-muted gir
 * korrekt kontrast i begge moduser.
 */

import { CloseIcon } from './icons';

export interface ActiveFilterChipProps {
  label: string;
  onRemove: () => void;
}

export function ActiveFilterChip({ label, onRemove }: ActiveFilterChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-[6px]' /* paper-exact: 38R-0 gap 6px */,
        'rounded-1 border border-divider bg-surface-muted',
        'px-[10px] py-[4px]' /* paper-exact: 38R-0 padding 4/10 — utenfor sp-skala */,
        'text-muted-sm font-medium text-ink' /* paper-exact: 38S-0 12px Medium */,
      ].join(' ')}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Fjern filter: ${label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-hover hover:text-aka focus:outline-none focus-visible:ring-1 focus-visible:ring-aka"
      >
        <CloseIcon />
      </button>
    </span>
  );
}
