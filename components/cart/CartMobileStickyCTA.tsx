'use client';

/**
 * CartMobileStickyCTA — 65X-0 bunn-bar (390×87).
 *
 * Paper-spec:
 *   - Fixed bottom, full-width.
 *   - Venstre: "Total inkl. MVA" label (14px) + beløp (22px).
 *   - Høyre: "Gå til checkout" primary CTA (268×46 i Paper, vi lar den flekse
 *     til 1fr slik at uansett viewport-bredde får beløpet sin intrinsic space).
 *
 * **Kun mobil.** Skjules på md+ via `md:hidden`. Desktop har checkout-CTA i
 * CartSummary-panelet til høyre.
 *
 * **Høyde matcher `--height-sticky-cta` (87px).** Cart-siden må `pb-[87px]`
 * på mobil for å unngå at siste item klippes av.
 */

import { useCartTotals } from '@/lib/cart/hooks';
import { Button } from '@/components/ui/Button';
import { formatNok } from '@/lib/cart/totals';

export function CartMobileStickyCTA() {
  const totals = useCartTotals();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex h-(--height-sticky-cta) items-center gap-sp-3 border-t border-divider bg-surface px-sp-4 md:hidden"
      role="region"
      aria-label="Handlekurv — gå til checkout"
    >
      <div className="flex flex-col justify-center">
        <p className="text-label text-ink-muted normal-case tracking-normal">
          Total inkl. MVA
        </p>
        <p className="text-[18px] font-bold leading-6 tabular-nums text-ink" /* paper-exact: 6AY-0 (22 bold — nærmeste token er 18, juster ved behov) */>
          {formatNok(totals.subtotal)}
        </p>
      </div>
      <Button
        href="/checkout"
        variant="primary"
        size="lg"
        className="ml-auto flex-1" /* paper-exact: 6AZ-0 */
      >
        Gå til checkout
      </Button>
    </div>
  );
}
