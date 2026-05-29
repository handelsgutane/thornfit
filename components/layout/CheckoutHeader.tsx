/**
 * CheckoutHeader — minimal header for /checkout-flowen.
 *
 * Distraksjonsfri: ingen utility-bar, ingen nav, ingen søk/konto/kurv-ikoner.
 * Kun logo sentrert + en liten "Tilbake"-lenke til venstre. Følger common
 * e-com-mønster for checkout (Stripe, Shopify-checkout, Klarna) hvor man
 * fjerner alle utgangs-veier som kan stjele konvertering.
 *
 * Tilbake-link peker på /handlekurv (siste steg før checkout). Browser-back
 * fungerer i tillegg, men eksplisitt lenke hjelper på mobil-touch og er
 * tilgjengelig for skjermleser.
 */

import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';

export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-divider bg-surface">
      <div className="relative mx-auto flex h-header max-w-[1320px] items-center px-sp-3 md:px-sp-7 lg:px-12">
        {/* Tilbake-lenke — venstre. Liten, sekundær. */}
        <Link
          href="/handlekurv"
          className="flex items-center gap-sp-2 text-body-sm text-ink-muted transition-colors hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M9 3L5 7L9 11"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Tilbake</span>
        </Link>

        {/* Logo sentrert. absolute + transform sikrer at den står i eksakt
            midten uavhengig av tilbake-lenke-bredde. */}
        <Link
          href="/"
          aria-label="ThornFit — til forsiden"
          className="absolute left-1/2 -translate-x-1/2"
        >
          {/* Stacked-logo: h-8 (32px) mobil, h-10 (40px) desktop. */}
          <Logo variant="desktop" className="h-8 w-auto md:h-10" />
        </Link>

        {/* Tom høyre-side — bevarer flex-balanse. */}
        <span className="ml-auto" aria-hidden />
      </div>
    </header>
  );
}
