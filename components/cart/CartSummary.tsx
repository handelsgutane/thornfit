'use client';

/**
 * CartSummary — oppsummerings-kortet (Paper 50O-0 desktop / 69Q-0 mobile).
 *
 * Fire seksjoner:
 *   1. **Tittel**: "Oppsummering" + "N varer" (kan skjules via `hideTitle`).
 *   2. **Breakdown**: Delsum (eks. MVA), Du sparer (hvis savings > 0), MVA (25%).
 *   3. **Total + CTA**: "kr X" + "inkludert MVA", primary CTA "Gå til checkout",
 *      sekundær link "Fortsett å handle".
 *   4. **Del handlekurv**: Paper 51C-0 / 6AC-0 — label + "Kopier link"-knapp
 *      som kopierer nåværende URL til utklippstavlen. Bruk-case: deling med
 *      partner før kjøp. Ingen auth/persistens — vi deler bare nåværende cart-
 *      side-URL (cart er lokal). Senere kan denne bytte til `?cart=<hash>`-
 *      signatur når vi har cart-share-endepunkt.
 *
 * Frakt-beregning er utsatt til checkout-steg — derfor "Frakt beregnes i
 * checkout" som footnote (Paper 51J-0).
 *
 * Komponenten er client-only fordi den leser `useCartTotals()` direkte og
 * må snakke med `navigator.clipboard`. Gjenbrukbar i mini-cart-drawer senere.
 */

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';

import { useCartTotals } from '@/lib/cart/hooks';
import { formatNok } from '@/lib/cart/totals';

export interface CartSummaryProps {
  /**
   * Når `true` skjules den interne overskrifts-raden — brukes i mobile layout
   * hvor kortet sitter under varelista og tittelen er åpenbar.
   */
  hideTitle?: boolean;
  /**
   * Valgfri callback som viser en "Tøm kurv"-link høyre-justert i header-raden.
   * Brukes på `/handlekurv` hvor vi vil ha destruktiv action nær summary-boksen.
   * Utelates i mini-cart-drawer hvor det ikke er relevant.
   */
  onClear?: () => void;
  className?: string;
}

export function CartSummary({ hideTitle = false, onClear, className }: CartSummaryProps) {
  const totals = useCartTotals();
  const hasSavings = totals.savings > 0;
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      // Clipboard API kan være blokkert i iframe / privacy-mode.
      // Vi feiler stille framfor å skape en støyende error-state i UI;
      // brukeren kan kopiere URL manuelt fra adressefeltet.
    }
  };

  return (
    // Paper 69Q-0: ÉN kort med border + radius, INGEN outer padding (gap 0).
    // Tre indre seksjoner med egne paddings + border-top som dividers:
    //   1. Totals (69R-0): pt 16, pb 14, px 16, gap 8 — tett rytme.
    //   2. Fortsett å handle (6A7-0): pt 14, pb 16, px 16, gap 8, border-top.
    //   3. Del handlekurv (6AC-0): pt 14, pb 16, px 16, gap 10, border-top.
    // Tidligere `p-sp-5 gap-sp-5` (32 padding + 32 gap) leste som tre løse
    // blokker; nytt layout matcher kort-arkitekturen i resten av siden.
    <aside
      className={[
        'flex flex-col overflow-hidden rounded-sm border border-divider bg-surface',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Oppsummering"
    >
      {!hideTitle && (
        <header className="flex items-start justify-between gap-sp-3 px-sp-4 pt-sp-4 pb-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-body font-bold leading-5 text-ink">Oppsummering</h2>
            <p className="text-muted-sm text-ink-muted">
              {totals.itemCount} {totals.itemCount === 1 ? 'vare' : 'varer'}
            </p>
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="mt-sp-1 text-body-xs font-medium text-ink-muted transition-colors hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
            >
              Tøm kurv
            </button>
          )}
        </header>
      )}

      {/* Section 1 — Totals — Paper 69R-0 (pt 16, pb 14, px 16, gap 8) */}
      <div className="flex flex-col gap-sp-2 px-sp-4 pt-sp-4 pb-3.5" /* paper-exact: 69R-0 */>
        <div className="flex items-baseline justify-between">
          <span className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 69T-0 (13/16 haiiro) */>
            Delsum (eks. MVA)
          </span>
          <span className="tabular-nums text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 69U-0 (13/16 kuro) */>
            {formatNok(totals.subtotalExVat)}
          </span>
        </div>

        {hasSavings && (
          <div className="flex items-baseline justify-between">
            <span className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '16px' }}>
              Du sparer
            </span>
            <span className="tabular-nums text-aka" style={{ fontSize: '13px', lineHeight: '16px' }}>
              −{formatNok(totals.savings)}
            </span>
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '16px' }}>
            MVA (25%)
          </span>
          <span className="tabular-nums text-ink" style={{ fontSize: '13px', lineHeight: '16px' }}>
            {formatNok(totals.vat)}
          </span>
        </div>

        {/* Divider — Paper 6A1-0: h 1, mt 4 mb 4, bg sakai (full bredde innenfor px-16) */}
        <div className="my-1 h-px bg-divider" /* paper-exact: 6A1-0 */ aria-hidden />

        {/* Total row — Paper 6A2-0/6A3-0/6A5-0/6A6-0 */}
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-ink" style={{ fontSize: '16px', lineHeight: '20px' }} /* paper-exact: 6A3-0 (16/20 bold) */>
            Total
          </span>
          <div className="text-right">
            <p className="font-bold tabular-nums text-ink" style={{ fontSize: '20px', lineHeight: '24px' }} /* paper-exact: 6A5-0 (20/24 bold) */>
              {formatNok(totals.subtotal)}
            </p>
            <p className="text-ink-muted" style={{ fontSize: '11px', lineHeight: '14px' }} /* paper-exact: 6A6-0 (11/14 haiiro) */>
              inkludert MVA
            </p>
          </div>
        </div>
      </div>

      {/* Section 2 — "Fortsett å handle" + CTA (Paper 6A7-0: pt 14, pb 16, gap 8, border-top).
          Mobile: bare "Fortsett å handle"-link (CTA-en lever i sticky bottom-bar).
          Desktop: full primary CTA + "Fortsett å handle"-link. */}
      <div className="flex flex-col gap-sp-2 border-t border-divider px-sp-4 pt-3.5 pb-sp-4" /* paper-exact: 6A7-0 */>
        <Button href="/checkout" variant="primary" size="lg" fullWidth className="hidden md:flex">
          Gå til checkout
        </Button>
        <Link
          href="/produkter"
          className="flex items-center justify-center py-2.5 text-ink-muted transition-colors hover:text-ink"
          style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 6AB-0 (13/16 haiiro) */
        >
          Fortsett å handle
        </Link>
      </div>

      {/* Section 3 — Del handlekurv (Paper 6AC-0: pt 14, pb 16, gap 10, border-top) */}
      <div className="flex flex-col gap-2.5 border-t border-divider px-sp-4 pt-3.5 pb-sp-4" /* paper-exact: 6AC-0 */>
        <span className="font-bold uppercase text-ink-muted" style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 6AD-0 (11/14 bold haiiro 0.1em) */>
          Del handlekurv
        </span>
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center justify-center gap-sp-2 rounded-1 border border-divider px-3.5 py-[11px] font-medium text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1" /* paper-exact: 6AE-0 (padding 11/14, border sakai) */
          style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 6AH-0 (13/16 medium) */
          aria-live="polite"
        >
          <LinkIcon />
          <span>{copyState === 'copied' ? 'Kopiert!' : 'Kopier link'}</span>
        </button>
        <p className="text-center text-ink-muted" style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: 6AI-0 (12/16 haiiro center) */>
          Frakt beregnes i checkout
        </p>
      </div>
    </aside>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M6 8a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 8 2.5L7 3.5M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5L7 10.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
