/**
 * Pure totals-beregning for handlekurv.
 *
 * **Ingen React/Zustand-avhengigheter** — denne modulen skal kunne brukes
 * både klient-side (Zustand `derive`) og server-side (checkout-route,
 * ordre-bekreftelse, e-post-templates) med samme resultat.
 *
 * **MVA-regelen (ADR-0005, kun Norge):** Alle priser i Woo/Supabase er lagret
 * INKL. MVA. Paper-designet viser "Delsum (eks. MVA)" — vi bryter den ut
 * her for visning. Woo er authoritative ved checkout — avviker beløpet her
 * fra Woos kalkulasjon, overstyrer Woo (sjelden, men kan skje ved endret
 * skattetabell mellom cart-hydration og checkout).
 *
 * **Besparelse-regelen:** Hvis `regularPrice > unitPrice` (produktet er på
 * salg), legger vi inn differansen per linje i `savings`. Ikke-salg gir 0 —
 * vi viser ikke "du sparte 0 kr".
 */

import type { Cart, CartItem, CartTotals } from '@/types/cart';
import { VAT_RATE } from '@/types/cart';

/**
 * Summer kurven og regn ut alle display-totalene.
 *
 * @param cart Cart fra Zustand-store (eller server-side rekonstruksjon).
 * @param options Overstyr default-verdier (brukt i checkout etter bruker har
 *        valgt frakt).
 */
export function computeCartTotals(
  cart: Pick<Cart, 'items'>,
  options: { estimatedShipping?: number | null } = {},
): CartTotals {
  const { estimatedShipping = null } = options;

  let itemCount = 0;
  let subtotal = 0;
  let savings = 0;

  for (const item of cart.items) {
    const qty = item.quantity;
    if (qty <= 0) continue;

    itemCount += qty;
    subtotal += item.unitPrice * qty;

    // `regularPrice` er alltid satt (mirror-feltet `regular_price` i Supabase).
    // Hvis av en eller annen grunn unitPrice > regularPrice (pris-endring
    // etter at produktet ble lagt i kurven), dropper vi negativ besparelse.
    if (item.regularPrice > item.unitPrice) {
      savings += (item.regularPrice - item.unitPrice) * qty;
    }
  }

  // MVA-breakout fra brutto-pris. `subtotalExVat` er verdi eks. MVA,
  // `vat` er differansen — sum = `subtotal`.
  const subtotalExVat = subtotal / (1 + VAT_RATE);
  const vat = subtotal - subtotalExVat;

  const total = subtotal + (estimatedShipping ?? 0);

  return {
    itemCount,
    subtotal,
    subtotalExVat,
    vat,
    savings,
    estimatedShipping,
    total,
  };
}

/**
 * Slå sammen identiske linjer. Brukes defensivt — store.addItem dedup-er også,
 * men hvis en linje reconstructes fra Woo (ordre-bekreftelse) vil vi ha sum
 * før display.
 */
export function mergeCartItems(items: CartItem[]): CartItem[] {
  const byKey = new Map<string, CartItem>();
  for (const item of items) {
    const existing = byKey.get(item.key);
    if (existing) {
      byKey.set(item.key, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      byKey.set(item.key, { ...item });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Norsk kronebeløp med mellomrom som tusenskille-separator og "kr" suffix.
 * Paper bruker "1 250 kr" (mellomrom, ikke punktum). `Intl.NumberFormat('nb-NO')`
 * gjør dette korrekt med NBSP — vi normaliserer til vanlig mellomrom for
 * tekst-søk i UI-tester.
 *
 * Returnerer "0 kr" for 0 (ikke "gratis") — komponenter som vil vise
 * "Gratis" for frakt må sjekke `=== 0` selv.
 */
export function formatNok(amount: number, options: { decimals?: number } = {}): string {
  const { decimals = 0 } = options;
  const fmt = new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Intl gir NBSP (\u00A0) — behold det (tall + enhet skal ikke bryte linje).
  return `${fmt.format(amount)}\u00A0kr`;
}
