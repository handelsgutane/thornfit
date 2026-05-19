'use client';

/**
 * TikTok Pixel-adapter.
 *
 * Oversetter interne events til `ttq.track(name, payload, { event_id })`.
 * `event_id` dedupe mot TikTok Events API (task #74) — samme ID i begge retninger.
 *
 * Event-mapping (TikTok standard events, https://business-api.tiktok.com/portal/docs?id=1739585696931842):
 *   - view_item        → ViewContent
 *   - view_item_list   → (ingen standard — skippet; TikTok retargeting-
 *                        audiences bygges via pixel-URL-match, ikke events)
 *   - add_to_cart      → AddToCart
 *   - remove_from_cart → (ingen standard — skippet)
 *   - add_to_wishlist  → AddToWishlist
 *   - view_cart        → (ingen standard — skippet)
 *   - begin_checkout   → InitiateCheckout
 *   - add_payment_info → AddPaymentInfo
 *   - purchase         → CompletePayment
 *   - search           → Search
 *   - login            → (ingen standard — skippet)
 *   - sign_up          → CompleteRegistration
 *   - logout           → (ignorert)
 *   - page_view        → (TikTok fyrer automatisk — ikke re-emit)
 *   - select_item      → ClickButton (valgfri — skippet default)
 */

import type { AnalyticsAdapter } from '../emitter';
import {
  ANALYTICS_CURRENCY,
  type AnalyticsEvent,
  type AnalyticsItem,
} from '../events';

interface TiktokQueue {
  track: (name: string, payload?: Record<string, unknown>, options?: { event_id?: string }) => void;
  identify: (payload: Record<string, unknown>) => void;
  page: () => void;
  load?: (pixelId: string) => void;
}

declare global {
  interface Window {
    ttq?: TiktokQueue;
    TiktokAnalyticsObject?: string;
  }
}

interface TikTokAdapterOptions {
  pixelId: string;
}

function contentId(item: AnalyticsItem): string {
  return item.sku ?? item.id;
}

function mapContent(item: AnalyticsItem, fallbackQty = 1) {
  return {
    content_id: contentId(item),
    content_name: item.name,
    content_category: item.category ?? undefined,
    brand: item.brand ?? undefined,
    price: item.price,
    quantity: item.quantity ?? fallbackQty,
  };
}

function sendTtq(event: AnalyticsEvent, eventId: string): void {
  const ttq = window.ttq;
  if (!ttq) return;

  const dedupe = { event_id: eventId };

  switch (event.name) {
    case 'page_view':
      // TikTok auto-sporer page views via script-init. Hvis SPA-routing
      // trenger eksplisitt re-track, bruk `ttq.page()` — men det oppretter
      // ikke event_id-dedupe mot CAPI, så vi skipper.
      return;

    case 'view_item':
      ttq.track(
        'ViewContent',
        {
          contents: [mapContent(event.payload.item)],
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'add_to_cart':
      ttq.track(
        'AddToCart',
        {
          contents: [mapContent(event.payload.item, event.payload.quantity)],
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'add_to_wishlist':
      ttq.track(
        'AddToWishlist',
        {
          contents: [mapContent(event.payload.item)],
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'begin_checkout':
      ttq.track(
        'InitiateCheckout',
        {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'add_payment_info':
      ttq.track(
        'AddPaymentInfo',
        {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
        },
        dedupe,
      );
      return;

    case 'purchase':
      ttq.track(
        'CompletePayment',
        {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          order_id: event.payload.orderId,
        },
        dedupe,
      );
      return;

    case 'search':
      ttq.track(
        'Search',
        {
          query: event.payload.query,
        },
        dedupe,
      );
      return;

    case 'sign_up':
      ttq.track(
        'CompleteRegistration',
        { method: event.payload.method },
        dedupe,
      );
      return;

    case 'remove_from_cart':
    case 'view_cart':
    case 'view_item_list':
    case 'login':
    case 'logout':
    case 'select_item':
      // Ikke standard events i TikTok — droppet for å ikke skape custom
      // events som ikke kan attribueres mot kampanjer.
      return;

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

export function createTikTokAdapter(options: TikTokAdapterOptions): AnalyticsAdapter {
  return {
    name: 'tiktok',
    consentRequired: 'marketing',
    isAvailable() {
      if (typeof window === 'undefined') return false;
      if (!options.pixelId) return false;
      return Boolean(window.ttq && typeof window.ttq.track === 'function');
    },
    track(event, eventId) {
      sendTtq(event, eventId);
    },
  };
}
