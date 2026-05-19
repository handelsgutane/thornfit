'use client';

/**
 * QuantityStepper — gjenbrukbar +/− -kontroll brukt av både
 * `AddToCartButton` (etter første add på PDP) og `CartPage` (per-linje).
 *
 * **Paper-spec (4V6-0 / 65X-0):**
 *   - Kvadratisk knapp-størrelse via `--size-qty-btn` (34px), subtle border.
 *   - Minste tappebare hit-area er 44×44 via `touch-action` + padding, men
 *     visuelt står knappen som 34×34 — Paper-design, ikke WCAG-minimum
 *     (komponenten sitter alltid i en større row som også er klikkbar).
 *   - Label "Antall" kreves (aria-label) per a11y-regelen.
 *
 * Dum komponent — `value` + `onChange` er kontrollert utenfra. Grensesjekker
 * (stock-limits, min=1) bestemmes av foreldren.
 */

import { clsx } from 'clsx';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Min verdi (default 0 — sett til 1 når du vil forby zero i cart-row). */
  min?: number;
  /** Maks verdi — typisk stock_quantity. `null` = ingen grense. */
  max?: number | null;
  /**
   * Varenavn eller SKU for aria-label — "Antall {productName}". Kreves for
   * screen-reader-context når flere steppere finnes på samme side.
   */
  productLabel: string;
  className?: string;
  /** `true` hvis parent har en pågående mutation og vil låse input-et. */
  disabled?: boolean;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = null,
  productLabel,
  className,
  disabled = false,
}: QuantityStepperProps) {
  const decDisabled = disabled || value <= min;
  const incDisabled = disabled || (max !== null && value >= max);

  const btnBase = clsx(
    // Paper 682-0: ÉN border 1px sakai på outer container, ingen gap mellom
    // segmenter. Inner buttons er 34×34 (minus + plus) og 36×34 (qty middle).
    // Outer total: 34+36+34 + 2 (border) = 106×36 ≈ Paper 682-0.
    //
    // Tidligere `--size-qty-btn` 40px + `gap-sp-2` mellom 3 separate bordered
    // buttons leste som tre løse pills i stedet for ett kompakt segment.
    // Bytte til "joined segment" matcher Paper og strammer opp visuelt.
    'flex h-[34px] w-[34px] items-center justify-center', /* paper-exact: 683-0/688-0 (minus/plus 34×34) */
    'bg-surface text-ink transition-colors',
    'hover:bg-surface-hover',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-inset',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface',
  );

  return (
    <div
      className={clsx(
        'inline-flex items-center overflow-hidden rounded-1 border border-divider' /* paper-exact: 682-0 (joined stepper) */,
        className,
      )}
      role="group"
      aria-label={`Antall ${productLabel}`}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={decDisabled}
        className={btnBase}
        aria-label={`Reduser antall ${productLabel}`}
      >
        <span aria-hidden="true" className="text-body-sm font-bold leading-none">−</span>
      </button>

      {/* Tall-visning — venstre+høyre border (sakai) skiller den fra
          minus/plus-knappene. 36px bredde for å gi pust rundt 1-2 sifre. */}
      <span
        className="flex h-[34px] w-9 items-center justify-center border-x border-divider text-center text-body-sm font-bold tabular-nums text-ink" /* paper-exact: 686-0 (qty middle 36×34, sakai dividers) */
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(max !== null ? Math.min(max, value + 1) : value + 1)}
        disabled={incDisabled}
        className={btnBase}
        aria-label={`Øk antall ${productLabel}`}
      >
        <span aria-hidden="true" className="text-body-sm font-bold leading-none">+</span>
      </button>
    </div>
  );
}
