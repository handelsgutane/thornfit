'use client';

/**
 * GA4-adapter — oversetter interne events til `gtag('event', ...)`.
 *
 * Vi bruker GA4 sitt offisielle enhanced-ecommerce-skjema (view_item,
 * add_to_cart, purchase, ...) fordi det matcher 1:1 med audit-verktøy og
 * Google Ads-kampanjer som lytter på standard events.
 *
 * Script-loading gjøres separat i `AnalyticsScripts`-komponenten (task #75).
 * Denne adapteren antar kun at `window.gtag` finnes når `isAvailable()`
 * returnerer `true`.
 *
 * Consent: `consentRequired: 'analytics'`. Vi bruker NOT Consent Mode v2
 * for "denied" state — i stedet stopper vi eventet før det treffer gtag.
 * Hvis vi senere ønsker å la GA4 levere "consent-denied modelled conversions",
 * må vi bytte til `gtag('consent', 'update', { ... })` i `AnalyticsScripts`.
 */

import type {
  AnalyticsAdapter,
} from '../emitter';
import {
  ANALYTICS_CURRENCY,
  type AnalyticsEvent,
  type AnalyticsItem,
} from '../events';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

interface GA4AdapterOptions {
  measurementId: string;
}

function mapItem(item: AnalyticsItem, fallbackQty = 1) {
  return {
    item_id: item.sku ?? item.id,
    item_name: item.name,
    item_brand: item.brand ?? undefined,
    item_category: item.category ?? undefined,
    price: item.price,
    quantity: item.quantity ?? fallbackQty,
  };
}

function sendGtag(event: AnalyticsEvent, eventId: string): void {
  const gtag = window.gtag;
  if (!gtag) return;

  // `event_id` lar GA4 deduplicate mot Measurement Protocol-events fra
  // serveren (task #74). GA4 selv bruker ikke feltet for client-dedup.
  const base = {
    event_id: eventId,
    send_to: undefined as string | undefined, // settes ikke — config-default
  };

  switch (event.name) {
    case 'page_view':
      gtag('event', 'page_view', {
        ...base,
        page_path: event.payload.path,
        page_title: event.payload.title,
      });
      return;

    case 'view_item':
      gtag('event', 'view_item', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.item.price,
        items: [mapItem(event.payload.item)],
      });
      return;

    case 'view_item_list':
      gtag('event', 'view_item_list', {
        ...base,
        item_list_id: event.payload.listId,
        item_list_name: event.payload.listName,
        items: event.payload.items.map((item, i) => ({
          ...mapItem(item),
          index: i,
        })),
      });
      return;

    case 'select_item':
      gtag('event', 'select_item', {
        ...base,
        item_list_id: event.payload.listId,
        items: [
          {
            ...mapItem(event.payload.item),
            index: event.payload.position,
          },
        ],
      });
      return;

    case 'add_to_cart':
      gtag('event', 'add_to_cart', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.item.price * event.payload.quantity,
        items: [mapItem(event.payload.item, event.payload.quantity)],
      });
      return;

    case 'remove_from_cart':
      gtag('event', 'remove_from_cart', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.item.price * event.payload.quantity,
        items: [mapItem(event.payload.item, event.payload.quantity)],
      });
      return;

    case 'add_to_wishlist':
      gtag('event', 'add_to_wishlist', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.item.price,
        items: [mapItem(event.payload.item)],
      });
      return;

    case 'view_cart':
      gtag('event', 'view_cart', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.value,
        items: event.payload.items.map((i) => mapItem(i)),
      });
      return;

    case 'begin_checkout':
      gtag('event', 'begin_checkout', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.value,
        coupon: event.payload.coupon,
        items: event.payload.items.map((i) => mapItem(i)),
      });
      return;

    case 'add_payment_info':
      gtag('event', 'add_payment_info', {
        ...base,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.value,
        payment_type: event.payload.paymentMethod,
        items: event.payload.items.map((i) => mapItem(i)),
      });
      return;

    case 'purchase':
      gtag('event', 'purchase', {
        ...base,
        transaction_id: event.payload.orderId,
        currency: ANALYTICS_CURRENCY,
        value: event.payload.value,
        tax: event.payload.tax,
        shipping: event.payload.shipping,
        coupon: event.payload.coupon,
        items: event.payload.items.map((i) => mapItem(i)),
      });
      return;

    case 'search':
      gtag('event', 'search', {
        ...base,
        search_term: event.payload.query,
      });
      return;

    case 'login':
      gtag('event', 'login', {
        ...base,
        method: event.payload.method,
      });
      return;

    case 'sign_up':
      gtag('event', 'sign_up', {
        ...base,
        method: event.payload.method,
      });
      return;

    case 'logout':
      // GA4 har ikke standard `logout` — bruk custom event.
      gtag('event', 'logout', base);
      return;

    default: {
      // Exhaustiveness-guard: TS kaster hvis et event mangler case.
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

export function createGa4Adapter(options: GA4AdapterOptions): AnalyticsAdapter {
  return {
    name: 'ga4',
    consentRequired: 'analytics',
    isAvailable() {
      if (typeof window === 'undefined') return false;
      if (!options.measurementId) return false;
      return typeof window.gtag === 'function';
    },
    track(event, eventId) {
      sendGtag(event, eventId);
    },
  };
}
