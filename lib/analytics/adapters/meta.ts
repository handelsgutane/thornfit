'use client';

/**
 * Meta (Facebook/Instagram) Pixel-adapter.
 *
 * Oversetter interne events til `fbq('track', 'PixelEventName', payload,
 * { eventID })`. `eventID` er Metas dedupe-nøkkel mot CAPI (task #74) — må
 * være identisk på pixel og server-event.
 *
 * Event-mapping (Meta standard events, https://developers.facebook.com/docs/meta-pixel/reference):
 *   - view_item        → ViewContent
 *   - view_item_list   → (ingen standard — custom 'ViewItemList', nyttig for
 *                        retargeting-audiences basert på kategori-besøk)
 *   - add_to_cart      → AddToCart
 *   - remove_from_cart → (ingen standard — custom 'RemoveFromCart')
 *   - add_to_wishlist  → AddToWishlist
 *   - view_cart        → (ingen standard — custom 'ViewCart')
 *   - begin_checkout   → InitiateCheckout
 *   - add_payment_info → AddPaymentInfo
 *   - purchase         → Purchase
 *   - search           → Search
 *   - login            → (ingen standard — custom 'Login')
 *   - sign_up          → CompleteRegistration
 *   - logout           → (ignorert — Meta sporer ikke logout-events)
 *   - page_view        → PageView (Meta fyrer dette automatisk ved init, men
 *                        eksplisitt kall på SPA-route-endring sikrer tracking)
 *   - select_item      → (ignorert — kan legges til som custom event hvis nyttig)
 */

import type { AnalyticsAdapter } from '../emitter';
import {
  ANALYTICS_CURRENCY,
  type AnalyticsEvent,
  type AnalyticsItem,
} from '../events';

declare global {
  interface Window {
    fbq?: (
      method: 'track' | 'trackCustom' | 'init' | 'consent',
      ...args: unknown[]
    ) => void;
    _fbq?: unknown;
  }
}

interface MetaAdapterOptions {
  pixelId: string;
}

function contentId(item: AnalyticsItem): string {
  // Meta Ads-katalog bruker SKU som primær ID når den finnes, faller tilbake
  // til produkt-ID. Advantage+-kampanjer matcher på samme felt.
  return item.sku ?? item.id;
}

function buildContents(items: AnalyticsItem[], fallbackQty = 1) {
  return items.map((i) => ({
    id: contentId(i),
    quantity: i.quantity ?? fallbackQty,
    item_price: i.price,
  }));
}

function sendFbq(event: AnalyticsEvent, eventId: string): void {
  const fbq = window.fbq;
  if (!fbq) return;

  const dedupe = { eventID: eventId };

  switch (event.name) {
    case 'page_view':
      fbq('track', 'PageView', {}, dedupe);
      return;

    case 'view_item':
      fbq(
        'track',
        'ViewContent',
        {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          content_name: event.payload.item.name,
          content_category: event.payload.item.category ?? undefined,
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents([event.payload.item]),
        },
        dedupe,
      );
      return;

    case 'view_item_list':
      // Custom event — ikke standard, men verdifull for retargeting-audiences
      // i Ads Manager (f.eks. "besøkte /bryner siste 30 dager"). Bruker
      // content_type: 'product_group' så det ikke blandes med ViewContent-
      // attribusjon i funnel-rapporter.
      fbq(
        'trackCustom',
        'ViewItemList',
        {
          content_type: 'product_group',
          content_category: event.payload.listId,
          content_name: event.payload.listName ?? event.payload.listId,
          content_ids: event.payload.items.map(contentId),
          num_items: event.payload.items.length,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'add_to_cart':
      fbq(
        'track',
        'AddToCart',
        {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          content_name: event.payload.item.name,
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents([{ ...event.payload.item, quantity: event.payload.quantity }]),
        },
        dedupe,
      );
      return;

    case 'remove_from_cart':
      fbq(
        'trackCustom',
        'RemoveFromCart',
        {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'add_to_wishlist':
      fbq(
        'track',
        'AddToWishlist',
        {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          content_name: event.payload.item.name,
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'view_cart':
      fbq(
        'trackCustom',
        'ViewCart',
        {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          num_items: event.payload.items.length,
          contents: buildContents(event.payload.items),
        },
        dedupe,
      );
      return;

    case 'begin_checkout':
      fbq(
        'track',
        'InitiateCheckout',
        {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          num_items: event.payload.items.length,
          contents: buildContents(event.payload.items),
        },
        dedupe,
      );
      return;

    case 'add_payment_info':
      fbq(
        'track',
        'AddPaymentInfo',
        {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents(event.payload.items),
        },
        dedupe,
      );
      return;

    case 'purchase':
      fbq(
        'track',
        'Purchase',
        {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          num_items: event.payload.items.length,
          contents: buildContents(event.payload.items),
          order_id: event.payload.orderId,
        },
        dedupe,
      );
      return;

    case 'search':
      fbq(
        'track',
        'Search',
        {
          search_string: event.payload.query,
        },
        dedupe,
      );
      return;

    case 'login':
      fbq('trackCustom', 'Login', { method: event.payload.method }, dedupe);
      return;

    case 'sign_up':
      fbq(
        'track',
        'CompleteRegistration',
        { method: event.payload.method },
        dedupe,
      );
      return;

    case 'logout':
    case 'select_item':
      // Meta har ikke standard for disse — droppet bevisst.
      return;

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

export function createMetaAdapter(options: MetaAdapterOptions): AnalyticsAdapter {
  return {
    name: 'meta',
    consentRequired: 'marketing',
    isAvailable() {
      if (typeof window === 'undefined') return false;
      if (!options.pixelId) return false;
      return typeof window.fbq === 'function';
    },
    track(event, eventId) {
      sendFbq(event, eventId);
    },
  };
}
