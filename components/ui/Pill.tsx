/**
 * Pill — fargekodet status-/metadata-badge. Delt primitiv for alle steder
 * vi trenger en kompakt label med variant-styrt farge.
 *
 * Brukes typisk for:
 *   - Ordre-status (Levert / Sendt / Behandles / Kansellert)
 *   - Produkt-flags (Tilbud, Utsolgt, Lavt lager, Forhåndsbestill)
 *   - Betalings-status, ønskeliste-state, leveranse-state, m.m.
 *
 * Tokens kobles til `--color-status-{variant}-{bg|fg|border}` i `app/globals.css`
 * (brand-fixed — fargene er ment å være lesbare i både light og dark mode
 * uten å flippe). Hvis du trenger en pill med annen farge enn de fire
 * variantene, ikke utvid varianten — bruk `className`-prop med spesifikke
 * tokens, eller diskuter om det skal bli en ny variant i design-systemet.
 *
 * To form-faktorer mot Paper:
 *   - bordered (Paper 6B7-0 desktop): bg + border + fg-tekst.
 *   - flat (Paper 7UR-0 mobile / inline-metadata): kun bg + fg-tekst.
 *
 * To størrelser:
 *
 *   `md` (default) — Paper 6F2-0 / 6FE-0 / 6FQ-0 / 6GE-0 (Mine ordrer, Cart, m.m.):
 *     - rounded-1 (2px), padding 3px×8px (`py-0.75 px-sp-2`)
 *     - text-pill (12px / 15px), font-bold, mixed case ("Levert")
 *     - Iterativt landet på 12px etter A/B mot 11px, 10px, 9px og 6px.
 *
 *   `sm` — Paper 76Y-0 (OrderDetailHeader status-tag):
 *     - rounded-2 (4px), padding 4px×12px (`py-1 px-3`)
 *     - text-table-header (11px / 14px / 0.1em tracking), font-bold, UPPERCASE ("LEVERT")
 *     - Lik table-header stilmessig — Paper-letter-spacing er 0.08em, vi
 *       tar 0.1em via tokenet (visuelt umerkbar forskjell).
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type PillVariant = 'success' | 'warning' | 'neutral' | 'danger';
export type PillSize = 'sm' | 'md';

export interface PillProps {
  readonly children: ReactNode;
  readonly variant?: PillVariant;
  /** Legg til 1px border (Paper 6B7-0 desktop). Default false (flat-stil). */
  readonly bordered?: boolean;
  /**
   * Pill-størrelse. Default `md`. Bruk `sm` for OrderDetailHeader-tag
   * (Paper 76Y-0) — 11px UPPERCASE 0.1em tracking, rounded-2, padding 4/12.
   */
  readonly size?: PillSize;
  readonly className?: string;
}

const BG_FG: Record<PillVariant, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
};

const BORDER: Record<PillVariant, string> = {
  success: 'border border-status-success-border',
  warning: 'border border-status-warning-border',
  neutral: 'border border-status-neutral-border',
  danger: 'border border-status-danger-border',
};

export function Pill({
  children,
  variant = 'neutral',
  bordered = false,
  size = 'md',
  className,
}: PillProps) {
  const isSmall = size === 'sm';
  return (
    <span
      // NB: Vi leser tokenet direkte via `var(...)` istedenfor Tailwind-
      // utility `text-pill` / `text-table-header`. Tailwind v4 + Turbopack
      // regenererer ikke utility-klasser fra `@theme`-endringer pålitelig
      // i dev — men selve CSS-variabelen som @theme legger på `:root`
      // oppdaterer fint. Inline style leser variabelen direkte og slipper
      // unna det broken utility-generation-steget. Verdien bor fortsatt i
      // `@theme`-blokken (token), så vi følger design-system-regelen.
      style={
        isSmall
          ? {
              fontSize: 'var(--text-table-header)',
              lineHeight: 'var(--text-table-header--line-height)',
              letterSpacing: 'var(--text-table-header--letter-spacing)',
            }
          : {
              fontSize: 'var(--text-pill)',
              lineHeight: 'var(--text-pill--line-height)',
            }
      }
      className={cn(
        'inline-flex items-center font-bold',
        isSmall
          ? 'rounded-1 px-3 py-1'
          : 'rounded-1 px-sp-2 py-0.75',
        BG_FG[variant],
        bordered && BORDER[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
