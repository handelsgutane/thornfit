'use client';

/**
 * CartPage — orchestrator for /handlekurv (desktop + mobile).
 *
 * **Layout-strategi:**
 *   - Én komponent, responsive via Tailwind. Paper har ulike artboards for
 *     desktop (4V6-0) og mobile (65X-0), men strukturen er den samme — kun
 *     spacing/størrelser skifter.
 *   - Desktop: grid [1fr --width-cart-summary]. Summary sitter sticky.
 *   - Mobile: stacked. Summary under items. Sticky bottom-bar med total + CTA.
 *
 * **Hydration-håndtering:** Zustand persist hydrerer fra localStorage etter
 * mount. Før hydration vet vi ikke om kurven er tom eller har items. Vi
 * render en loading-skeleton slik at brukeren ikke ser en flash "Tom kurv →
 * 3 varer".
 *
 * **Cart-recommendations (Algolia Recommend) ligger over "Dine varer" —
 * matcher Paper 5LD-0 (desktop) og 66P-0 (mobile). Stripet fader inn når
 * Algolia returnerer hits; har `return null` ellers så layouten ikke har
 * en tom blokk.**
 */

import Link from 'next/link';

import { clearCart } from '@/lib/cart/api';
import {
  useCartHydrated,
  useCartItems,
  useCartTotals,
} from '@/lib/cart/hooks';
import { IconCart } from '@/components/layout/icons';

import { CartEmpty } from './CartEmpty';
import { CartLineItem } from './CartLineItem';
import { CartMobileStickyCTA } from './CartMobileStickyCTA';
import { CartRecommendationsStrip } from './CartRecommendationsStrip';
import { CartSummary } from './CartSummary';

export function CartPage() {
  const hydrated = useCartHydrated();
  const items = useCartItems();
  const totals = useCartTotals();

  // Før hydration — skeleton. Uten dette ser brukeren en flash "Tom kurv"
  // før localStorage-items gjenopprettes.
  if (!hydrated) {
    return <CartPageSkeleton />;
  }

  if (items.length === 0) {
    return (
      <main className="min-h-(--min-h-cart-empty) px-sp-3 py-16 md:px-sp-7">
        <CartEmpty />
      </main>
    );
  }

  const handleClear = () => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Er du sikker på at du vil tømme handlekurven?');
    if (ok) clearCart();
  };

  return (
    <>
      {/* Matcher header-bredden: full viewport med `px-sp-7` som side-margin
          (samme som HeaderDesktop og CategoryBrowser). Se ADR-relatert note i
          HeaderDesktop.tsx — `max-w-(--width-content)` klemte layouten. */}
      <main className="px-sp-3 pb-[calc(var(--height-sticky-cta)+24px)] pt-5 md:px-sp-7 md:pb-16 md:pt-12">
        {/* Page header — Paper 4WP-0 / 66K-0. Mobil pt 20 / pb 16 (66K-0),
            desktop bruker --header-bottom-spacing fra utviklingsmønster.
            "Tøm kurv" sitter ikke her lenger — flyttet ned i høyre kolonne
            rett over CartSummary 2026-04-24 for visuell nærhet til boksen. */}
        <header className="mb-[26px] md:mb-sp-5" /* paper-exact: 66K-0 + 10px breathing — totalt 26px mellom "X varer" og "Kunder kjøpte også" på mobil */>
          <Link
            href="/produkter"
            className="mb-sp-2 hidden text-body-xs font-medium text-ink-muted transition-colors hover:text-ink md:inline-block"
          >
            ← Fortsett å handle
          </Link>
          {/* H1: mobil 28/34 (Paper 66M-0), desktop text-h1 (40/44) */}
          <h1
            className="font-bold text-ink md:text-h1"
            style={{ fontSize: '28px', lineHeight: '34px', letterSpacing: '-0.02em' }} /* paper-exact: 66M-0 (mobile h1 28/34, -0.02em) */
          >
            Handlekurv
          </h1>
          <p className="mt-1 text-ink-muted md:mt-sp-1 md:text-body-sm" style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: 66N-0 (14/18 haiiro) */>
            {totals.itemCount} {totals.itemCount === 1 ? 'vare' : 'varer'}
          </p>
        </header>

        {/* Main content — 2-col på desktop, stacked på mobil.
            Mobil row-gap: 16 (Paper 65X-0 mt 16 mellom siste cart item og
            order-summary). Desktop col-gap: sp-6 (48px) — strammere enn
            standard sp-8 så summary-kortet ligger visuelt nærmere varelista.
            NB: `gap-sp-10` fantes ikke som token — falt tidligere gjennom til
            base `gap-sp-8` = 96px, derav altfor stort vertikalt mellomrom på
            mobil og horisontalt på desktop. */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_var(--width-cart-summary)] md:gap-sp-6" /* paper-exact: 69Q-0 mt 16 mellom items og summary */>
          <section
            aria-labelledby="cart-items-label"
            // `min-w-0` så grid-tracket kan krympe under barnas natural width.
            // Uten dette tvinger CartRecommendationsStrip's 260px-kort siden
            // til 780px+ på mobil. På desktop er `minmax(0, 1fr)` på grid-
            // template-columns det samme prinsippet.
            // Mobil gap: 14 (Paper 66P-0 pb 16 + section gap 14 + 67J-0 pt 4
            //   = 34px visuell mellom "Kunder kjøpte også"-kort og "Dine varer"-
            //   label per brukerfeedback +10 ekstra breathing).
            // Desktop gap: 41px (sp-6 minus 7) — strammere seksjons-skille
            // mellom "Kunder kjøpte også"-strip og "Dine varer"-rader.
            className="flex min-w-0 flex-col gap-3.5 md:gap-[41px]" /* paper-exact: brukerjustert gap −7px fra sp-6 (48) for tettere "Kunder kjøpte også"→"Dine varer"-overgang */
          >
            {/* Recommendations — Paper 5LD-0 (desktop) / 66P-0 (mobile).
                Plassert OVER "Dine varer" på begge flater; på mobile fordi
                Paper dikterer det, på desktop fordi vi holder enhetlig
                cognitive model (jf. komponentens header-kommentar). */}
            <CartRecommendationsStrip />

            <div className="flex flex-col gap-2 md:gap-sp-3" /* paper-exact: 67J-0 pb 8 mellom DINE VARER label og første cart-item */>
              <h2
                id="cart-items-label"
                className="flex items-center gap-sp-2 font-bold uppercase text-ink"
                style={{ fontSize: '12px', lineHeight: '16px', letterSpacing: '0.1em' }} /* +1 size opp fra text-label (11/16) per brukerfeedback */
              >
                <IconCart size={14} className="shrink-0 text-ink" />
                Dine varer
              </h2>
              {/* Paper 65X-0: cart items har marginTop 8 mellom kort (ikke 16).
                  Strammet inn fra gap-sp-3 (16) til gap-2 (8) på mobil; desktop
                  beholder gap-sp-3 hvor luften er bedre brukt. */}
              <ul className="flex flex-col gap-2 md:gap-sp-3">
                {items.map((item) => (
                  <CartLineItem key={item.key} item={item} />
                ))}
              </ul>
            </div>
          </section>

          {/* Summary — på desktop sticky til høyre; på mobil stacket under.
              Tøm kurv-linken sendes inn som prop og rendres inline i summary-
              headeren (høyre-justert mot "Oppsummering"-tittelen). */}
          <div className="md:sticky md:top-sp-8 md:self-start">
            <CartSummary onClear={handleClear} />
          </div>
        </div>
      </main>

      {/* Mobile-only sticky CTA — rendres utenfor main for clean stacking */}
      <CartMobileStickyCTA />
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — ~samme dimensjoner som real state så layout ikke hopper
// ---------------------------------------------------------------------------

function CartPageSkeleton() {
  return (
    <main
      className="px-sp-3 py-12 md:px-sp-7 md:py-16"
      aria-busy="true"
    >
      <div className="mb-sp-8 h-(--height-skel-title) w-(--width-skel-title) animate-pulse bg-surface-muted" />
      <div className="grid gap-sp-8 md:grid-cols-[1fr_var(--width-cart-summary)]">
        <div className="space-y-sp-4">
          <div className="h-(--height-skel-row) animate-pulse bg-surface-muted" />
          <div className="h-(--height-skel-row) animate-pulse bg-surface-muted" />
        </div>
        <div className="h-(--height-skel-summary) animate-pulse bg-surface-muted" />
      </div>
    </main>
  );
}
