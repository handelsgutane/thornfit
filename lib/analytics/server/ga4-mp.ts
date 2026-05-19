import 'server-only';

/**
 * GA4 Measurement Protocol — server-side speiling av klient-events.
 *
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * Bruk: dedupe primært via samme `client_id` som gtag.js bruker (lagret i
 * `_ga`-cookien — klienten leser den og sender oss i payload). GA4 har
 * ikke et like eksplisitt `event_id`-dedupe-system som Meta/TikTok, men
 * når samme `client_id` + `event_name` + timestamp kommer inn, registreres
 * bare én — plattformen har intern dedupe på sub-minutt.
 *
 * Vi sender likevel `event_id`-en vår som event parameter så GA4 DebugView
 * kan korrelere klient og server-event manuelt under feilsøking.
 */

import { logger, serializeError } from '@/lib/logger';

import { ANALYTICS_CURRENCY, type AnalyticsEvent, type AnalyticsItem } from '../events';

export interface Ga4MpOptions {
  measurementId: string; // G-XXXXXXXXXX
  apiSecret: string;
  /** Debug-endepunkt hvis satt — validerer payload men sender ikke til GA. */
  debug?: boolean;
}

export interface Ga4MpContext {
  /** Fra `_ga`-cookien på klienten. Uten dette skrives eventet som anonym ny bruker. */
  clientId: string;
  /** Stabil user-ID (Woo customer_id) for cross-device dedupe. */
  userId?: string;
  eventId: string;
  /** Unix mikrosekunder. GA4 forventer `timestamp_micros`. */
  timestampMicros: number;
}

interface MappedGa4Event {
  name: string;
  params: Record<string, unknown>;
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

function mapEvent(event: AnalyticsEvent): MappedGa4Event | null {
  switch (event.name) {
    case 'page_view':
      return {
        name: 'page_view',
        params: {
          page_location: event.payload.path,
          page_title: event.payload.title,
        },
      };

    case 'view_item':
      return {
        name: 'view_item',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.item.price,
          items: [mapItem(event.payload.item)],
        },
      };

    case 'view_item_list':
      return {
        name: 'view_item_list',
        params: {
          item_list_id: event.payload.listId,
          item_list_name: event.payload.listName,
          items: event.payload.items.map((item, i) => ({
            ...mapItem(item),
            index: i,
          })),
        },
      };

    case 'select_item':
      return {
        name: 'select_item',
        params: {
          item_list_id: event.payload.listId,
          items: [
            { ...mapItem(event.payload.item), index: event.payload.position },
          ],
        },
      };

    case 'add_to_cart':
      return {
        name: 'add_to_cart',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.item.price * event.payload.quantity,
          items: [mapItem(event.payload.item, event.payload.quantity)],
        },
      };

    case 'remove_from_cart':
      return {
        name: 'remove_from_cart',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.item.price * event.payload.quantity,
          items: [mapItem(event.payload.item, event.payload.quantity)],
        },
      };

    case 'add_to_wishlist':
      return {
        name: 'add_to_wishlist',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.item.price,
          items: [mapItem(event.payload.item)],
        },
      };

    case 'view_cart':
      return {
        name: 'view_cart',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.value,
          items: event.payload.items.map((i) => mapItem(i)),
        },
      };

    case 'begin_checkout':
      return {
        name: 'begin_checkout',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.value,
          coupon: event.payload.coupon,
          items: event.payload.items.map((i) => mapItem(i)),
        },
      };

    case 'add_payment_info':
      return {
        name: 'add_payment_info',
        params: {
          currency: ANALYTICS_CURRENCY,
          value: event.payload.value,
          payment_type: event.payload.paymentMethod,
          items: event.payload.items.map((i) => mapItem(i)),
        },
      };

    case 'purchase':
      return {
        name: 'purchase',
        params: {
          transaction_id: event.payload.orderId,
          currency: ANALYTICS_CURRENCY,
          value: event.payload.value,
          tax: event.payload.tax,
          shipping: event.payload.shipping,
          coupon: event.payload.coupon,
          items: event.payload.items.map((i) => mapItem(i)),
        },
      };

    case 'search':
      return {
        name: 'search',
        params: { search_term: event.payload.query },
      };

    case 'login':
      return { name: 'login', params: { method: event.payload.method } };

    case 'sign_up':
      return { name: 'sign_up', params: { method: event.payload.method } };

    case 'logout':
      return { name: 'logout', params: {} };

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return null;
    }
  }
}

export async function sendGa4MpEvent(
  options: Ga4MpOptions,
  event: AnalyticsEvent,
  ctx: Ga4MpContext,
): Promise<{ sent: boolean; reason?: string }> {
  const mapped = mapEvent(event);
  if (!mapped) return { sent: false, reason: 'unsupported event' };

  const host = options.debug
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect';
  const endpoint = `${host}?measurement_id=${encodeURIComponent(
    options.measurementId,
  )}&api_secret=${encodeURIComponent(options.apiSecret)}`;

  const body = {
    client_id: ctx.clientId,
    ...(ctx.userId ? { user_id: ctx.userId } : {}),
    timestamp_micros: ctx.timestampMicros,
    events: [
      {
        name: mapped.name,
        params: {
          ...mapped.params,
          // event_id er ikke offisielt dedupe-felt, men GA4 tar det med i rapportene.
          event_id: ctx.eventId,
        },
      },
    ],
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    // MP returnerer 204 ved suksess (og 2xx ved debug).
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('ga4 mp non-2xx', {
        status: res.status,
        event: event.name,
        body: text.slice(0, 500),
      });
      return { sent: false, reason: `http ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    logger.error('ga4 mp failed', {
      event: event.name,
      ...serializeError(err),
    });
    return { sent: false, reason: 'network' };
  }
}
