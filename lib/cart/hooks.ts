'use client';

/**
 * React-hooks for cart-konsumenter.
 *
 * **Hvorfor wrapper-hooks rundt Zustand:**
 *   - Komponenter skal ikke kjenne til `useCartStore` eller selectors.
 *     Fasaden her gir en stabil API selv om vi bytter state-bibliotek.
 *   - `useCartTotals()` memoiser totals så ikke hvert re-render regner
 *     på nytt (`computeCartTotals` er billig, men dette matcher pattern
 *     i resten av koden).
 *   - `useCartHydrated()` isolerer SSR/persist-hydration-sjekken så
 *     komponenter ikke trigger "items.length → items.length"-flash.
 */

import { useMemo } from 'react';

import {
  useCartStore,
  selectCartCount,
  selectCartItems,
  selectHydrated,
} from './store';
import { computeCartTotals } from './totals';

import type { CartItem, CartTotals } from '@/types/cart';

/**
 * Alle cart-items. Komponenter bør foretrekke `useCartCount` når de kun
 * trenger tallet, fordi denne hooken re-renderer ved hver item-endring.
 */
export function useCartItems(): CartItem[] {
  return useCartStore(selectCartItems);
}

/** Antall varer i kurven (sum av quantity). For header-badge + sticky-bar. */
export function useCartCount(): number {
  return useCartStore(selectCartCount);
}

/**
 * Totals-objekt for cart-summary-panelet. Bygger på `items` direkte så den
 * oppdateres ved hver mutation.
 *
 * `estimatedShipping` injectes av checkout-flow etter at bruker har valgt
 * leveringsmetode — hold MVP på `null` (= "Beregnes i neste steg").
 */
export function useCartTotals(
  options: { estimatedShipping?: number | null } = {},
): CartTotals {
  const items = useCartItems();
  const shipping = options.estimatedShipping ?? null;

  return useMemo(
    () => computeCartTotals({ items }, { estimatedShipping: shipping }),
    [items, shipping],
  );
}

/**
 * Har Zustand-persist hydrert fra localStorage?
 *
 * Før `true` må komponenter rendere en skeleton (eller ingenting). Hvis de
 * rendrer items-count før hydration, ser brukeren en flash "0 → N".
 *
 * Pattern:
 * ```tsx
 * const hydrated = useCartHydrated();
 * const count = useCartCount();
 * if (!hydrated) return <CartBadgeSkeleton />;
 * return <span>{count}</span>;
 * ```
 */
export function useCartHydrated(): boolean {
  return useCartStore(selectHydrated);
}

/**
 * Sjekk om en spesifikk `CartItem.key` allerede er i kurven, og returner
 * quantity hvis ja. Brukes av `AddToCartButton` for å flippe fra "Legg i
 * handlekurv" til en quantity-stepper.
 */
export function useCartItemQuantity(key: string | null): number {
  const items = useCartItems();
  if (!key) return 0;
  const item = items.find((i) => i.key === key);
  return item?.quantity ?? 0;
}
