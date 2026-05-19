'use client';

/**
 * HeaderSwitcher — client-side bytter mellom shop-header og checkout-header
 * basert på pathname.
 *
 * Hvorfor client-wrapper: Next.js router-cache gjenbruker root-layout'en
 * mellom navigasjoner under samme segment. En server-component-conditional
 * (basert på `headers()`) re-evaluerer derfor ikke ved /checkout → /handlekurv,
 * og brukeren satt fast i checkout-headeren.
 *
 * Begge variantene pre-rendres som server-komponenter i layout.tsx og sendes
 * inn som props (`<>`). Wrapperen velger riktig basert på `usePathname()`
 * som er reaktiv på client-side navigasjon. Cost: vi betaler nav-fetch'en
 * uansett om vi er på checkout — akseptabelt siden det er Redis-cachet.
 */

import { usePathname } from 'next/navigation';

export function HeaderSwitcher({
  shop,
  checkout,
}: {
  shop: React.ReactNode;
  checkout: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith('/checkout')) return <>{checkout}</>;
  return <>{shop}</>;
}
