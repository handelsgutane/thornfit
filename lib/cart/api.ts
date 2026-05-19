'use client';

/**
 * Cart API — den FUNKSJONELLE fasaden foran Zustand-storen.
 *
 * Komponenter skal kalle disse, ikke `useCartStore.getState().addItem(...)`
 * direkte. Grunnen: hver mutation har side-effekter (analytics, Algolia
 * Insights) som skal skje konsistent uansett hvor kallet kommer fra
 * (PDP, SearchOverlay, CartPage-stepper).
 *
 * **Ikke server-actions enda.** Vi holder alt klient-side inntil vi faktisk
 * trenger server-validering (coupon-apply, shipping-estimat). Når det skjer,
 * wrapper vi disse funksjonene med `useTransition` → server-action, men
 * signaturene forblir stabile.
 *
 * **Hvorfor ikke plassere i store.ts direkte:** Zustand-actions er "dumme"
 * state-mutators — enkle å teste i isolasjon. Analytics/Insights er side-
 * effekter som krever consent + event_id-generering og hører ikke hjemme i
 * state-laget. Se ADR-0011.
 */

import { track, cartItemToAnalyticsItem } from '@/lib/analytics';

import { trackAddedToCart } from '@/lib/search/insights';

import { useCartStore } from './store';

import type { CartItem } from '@/types/cart';
import type { Purchasable } from '@/types/product';

import { buildCartItemKey } from '@/types/cart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bygg en `CartItem` fra en `Purchasable` + quantity. Samler konvertering
 * på ett sted så PDP, SearchOverlay og CartRecommendations bygger det likt.
 */
export function purchasableToCartItem(
  purchasable: Purchasable,
  opts: {
    quantity: number;
    productSlug: string;
    categorySlug?: string | null;
    brand?: string | null;
    specLine?: string | null;
  },
): CartItem {
  return {
    key: buildCartItemKey(purchasable),
    productId: purchasable.productId,
    variationId: purchasable.variationId,
    sku: purchasable.sku,
    name: purchasable.name,
    quantity: opts.quantity,
    unitPrice: purchasable.price,
    regularPrice: purchasable.regularPrice,
    imageUrl: purchasable.image?.url ?? null,
    productSlug: opts.productSlug,
    categorySlug: opts.categorySlug ?? null,
    brand: opts.brand ?? null,
    specLine: opts.specLine ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Legg en linje i kurven. Fyrer `add_to_cart` analytics-event og Algolia
 * Insights `addedToCartObjectIDs`.
 *
 * `queryID` passes inn når add-to-cart skjer direkte fra søkeresultat
 * (SearchOverlay) — da tagges Insights-eventet som `AfterSearch` slik at
 * Algolia kan rangere resultatet høyere for liknende queries.
 */
export function addToCart(
  item: CartItem,
  opts: { queryID?: string | null } = {},
): void {
  useCartStore.getState().addItem(item);

  track({
    name: 'add_to_cart',
    payload: {
      item: cartItemToAnalyticsItem(item),
      quantity: item.quantity,
    },
  });

  // Algolia Insights — objectID = SKU (match `products_b2c`-indeksen).
  // Hopp over hvis SKU mangler: Recommend-modellen kan uansett ikke
  // matche en produkt-id-streng mot et SKU-basert indeks-key.
  if (item.sku) {
    trackAddedToCart(item.sku, { queryID: opts.queryID ?? null });
  }
}

/**
 * Fjern en linje helt. Fyrer `remove_from_cart` med full quantity på linjen
 * før den forsvinner (så GA4 ser hvor mye som ble fjernet).
 */
export function removeFromCart(key: string): void {
  const state = useCartStore.getState();
  const item = state.items.find((i) => i.key === key);
  if (!item) return;

  state.removeItem(key);

  track({
    name: 'remove_from_cart',
    payload: {
      item: cartItemToAnalyticsItem(item),
      quantity: item.quantity,
    },
  });
}

/**
 * Set quantity til et eksakt tall. Fyrer `add_to_cart` ved økning og
 * `remove_from_cart` ved reduksjon (med diff-quantity) — det speiler GA4-
 * konvensjon (events er delta, ikke set).
 */
export function setQuantity(key: string, nextQuantity: number): void {
  const state = useCartStore.getState();
  const item = state.items.find((i) => i.key === key);
  if (!item) return;

  const diff = nextQuantity - item.quantity;
  state.setQuantity(key, nextQuantity);

  if (diff === 0) return;

  if (diff > 0) {
    track({
      name: 'add_to_cart',
      payload: {
        item: cartItemToAnalyticsItem(item),
        quantity: diff,
      },
    });
    // Algolia Insights bruker SKU som objectID — se kommentar i addToCart.
    if (item.sku) {
      trackAddedToCart(item.sku);
    }
  } else {
    track({
      name: 'remove_from_cart',
      payload: {
        item: cartItemToAnalyticsItem(item),
        quantity: -diff,
      },
    });
  }
}

/**
 * Tøm hele kurven. Fyrer ikke et samlet "clear"-event — `purchase`-flyten
 * håndterer det, og manuell tømming er sjelden nok til at GA4-insight er lav.
 */
export function clearCart(): void {
  useCartStore.getState().clear();
}
