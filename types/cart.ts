/**
 * Cart types — client-side state (pre-login stored in cookie).
 *
 * Cart mutations go through server actions or API routes that validate against
 * the Supabase mirror (display) and Woo (authoritative) — see business-logic.md.
 */

import type { Purchasable } from './product';

export interface CartItem {
  /** Stable key for React list rendering. */
  key: string;
  productId: number;
  variationId: number | null;
  sku: string | null;
  name: string;
  quantity: number;
  /** Unit price at time of add (may be re-validated against Woo at checkout). */
  unitPrice: number;
  /** Cached original price for sale display. */
  regularPrice: number;
  imageUrl: string | null;
  /** Slug for linking back to the product page. */
  productSlug: string;
  categorySlug: string | null;
  /**
   * Merke / brand — vises som uppercase-label over navn i cart-row (Paper
   * 4X5-0/67O-0 "KANETSUGU", "YOSHIMI KATO"). Plukkes fra `pa_merke`-attributten
   * i Woo/Supabase. `null` når produkt ikke har eget merke.
   */
  brand: string | null;
  /**
   * Kort spec-linje under navn — f.eks. "210mm · VG10 · SKU: KN-21C-VG10".
   * Samlet som ferdig streng av addToCart-kalleren (PDP har domain-kunnskap om
   * hvilke attributter som er relevante per produkt-type; CartLineItem
   * rendrer bare det den får). `null` hvis produkt ikke har meningsfull spec.
   */
  specLine: string | null;
}

export interface Cart {
  items: CartItem[];
  /** Applied coupon codes. Validated server-side against Woo. */
  couponCodes: string[];
  /** Last time cart was touched by user. */
  updatedAt: string;
}

export interface CartTotals {
  /** Sum av alle `item.quantity`. Brukes i header-badge + checkout-bar. */
  itemCount: number;
  /**
   * Sum inkl. MVA — dette er det beløpet Paper-designet viser som "Delsum".
   * Alle priser i Woo/Supabase er lagret inkl. MVA (norsk retail-konvensjon),
   * så dette er bare `Σ(item.unitPrice * item.quantity)`.
   */
  subtotal: number;
  /**
   * Sum eks. MVA — `subtotal / (1 + VAT_RATE)`. Vises som "Delsum (eks. MVA)"
   * i cart-summary-panelet (Paper 4V6-0). Vi regner det her i frontend for
   * display, men Woo er authoritative ved checkout.
   */
  subtotalExVat: number;
  /** Beregnet MVA-beløp (25% default for fysiske varer i Norge). */
  vat: number;
  /**
   * Besparelse på aktive salgspriser — `Σ((regularPrice - unitPrice) * quantity)`.
   * Vises kun når > 0, under "Du sparer"-linjen.
   */
  savings: number;
  /** Estimert frakt — `null` inntil bruker velger leveringsmetode i checkout. */
  estimatedShipping: number | null;
  /** Estimert totalsum inkl. frakt. Hvis frakt er null, = subtotal. */
  total: number;
}

/**
 * MVA-sats for fysiske varer (matvarer = 15%, men kniver er standard-sats).
 * ADR-0005: kun Norge → én sats. Hvis senere multi-market, flytt til
 * `lib/tax/rates.ts` keyed på region.
 */
export const VAT_RATE = 0.25;

/** Helper to build a deterministic key from purchasable + attributes. */
export function buildCartItemKey(purchasable: Purchasable): string {
  return purchasable.variationId
    ? `${purchasable.productId}:${purchasable.variationId}`
    : String(purchasable.productId);
}
