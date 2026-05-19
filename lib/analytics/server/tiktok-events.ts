import 'server-only';

/**
 * TikTok Events API — server-side sporing, dedupe mot pixel via `event_id`.
 *
 * Docs: https://business-api.tiktok.com/portal/docs?id=1771101303285761
 *
 * Mapping matcher `adapters/tiktok.ts` (klient-side) så server og klient
 * sender samme event_name for samme intern event.
 */

import { logger, serializeError } from '@/lib/logger';

import { ANALYTICS_CURRENCY, type AnalyticsEvent, type AnalyticsItem } from '../events';

import { hashEmail, hashPhone, normalizeIp, sha256Hex } from './hash';

export interface TikTokEventsOptions {
  pixelId: string;
  accessToken: string;
  /** Test event code fra TikTok Events Manager (dev). */
  testEventCode?: string;
}

export interface TikTokUserData {
  email?: string;
  phone?: string;
  /** External user ID (Woo customer_id). */
  externalId?: string | number;
  /** TikTok click ID (ttclid) fra URL / cookie. */
  ttclid?: string;
  /** TikTok cookie (ttp) som identifiserer browser-sesjonen. */
  ttp?: string;
  ip?: string;
  userAgent?: string;
  url?: string;
  referrer?: string;
}

export interface TikTokEventsContext {
  eventId: string;
  eventTime: number; // unix seconds
  user: TikTokUserData;
}

interface MappedTikTokEvent {
  eventName: string;
  properties: Record<string, unknown>;
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

function mapEvent(event: AnalyticsEvent): MappedTikTokEvent | null {
  switch (event.name) {
    case 'view_item':
      return {
        eventName: 'ViewContent',
        properties: {
          contents: [mapContent(event.payload.item)],
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'add_to_cart':
      return {
        eventName: 'AddToCart',
        properties: {
          contents: [mapContent(event.payload.item, event.payload.quantity)],
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'add_to_wishlist':
      return {
        eventName: 'AddToWishlist',
        properties: {
          contents: [mapContent(event.payload.item)],
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'begin_checkout':
      return {
        eventName: 'InitiateCheckout',
        properties: {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'add_payment_info':
      return {
        eventName: 'AddPaymentInfo',
        properties: {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'purchase':
      return {
        eventName: 'CompletePayment',
        properties: {
          contents: event.payload.items.map((i) => mapContent(i)),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          order_id: event.payload.orderId,
        },
      };

    case 'search':
      return {
        eventName: 'Search',
        properties: { query: event.payload.query },
      };

    case 'sign_up':
      return {
        eventName: 'CompleteRegistration',
        properties: { method: event.payload.method },
      };

    case 'page_view':
    case 'remove_from_cart':
    case 'view_cart':
    case 'view_item_list':
    case 'login':
    case 'logout':
    case 'select_item':
      return null;

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return null;
    }
  }
}

function buildUser(user: TikTokUserData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const em = hashEmail(user.email);
  if (em) out.email = em;
  const ph = hashPhone(user.phone);
  if (ph) out.phone = ph;
  if (user.externalId !== undefined && user.externalId !== null) {
    out.external_id = sha256Hex(String(user.externalId).trim().toLowerCase());
  }
  if (user.ttclid) out.ttclid = user.ttclid;
  if (user.ttp) out.ttp = user.ttp;
  const ip = normalizeIp(user.ip);
  if (ip) out.ip = ip;
  if (user.userAgent) out.user_agent = user.userAgent;
  return out;
}

export async function sendTikTokEvent(
  options: TikTokEventsOptions,
  event: AnalyticsEvent,
  ctx: TikTokEventsContext,
): Promise<{ sent: boolean; reason?: string }> {
  const mapped = mapEvent(event);
  if (!mapped) return { sent: false, reason: 'unsupported event' };

  const endpoint = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  const body = {
    event_source: 'web',
    event_source_id: options.pixelId,
    ...(options.testEventCode ? { test_event_code: options.testEventCode } : {}),
    data: [
      {
        event: mapped.eventName,
        event_time: ctx.eventTime,
        event_id: ctx.eventId,
        user: buildUser(ctx.user),
        properties: mapped.properties,
        page: {
          url: ctx.user.url,
          referrer: ctx.user.referrer,
        },
      },
    ],
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Access-Token': options.accessToken,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('tiktok events non-2xx', {
        status: res.status,
        event: event.name,
        body: text.slice(0, 500),
      });
      return { sent: false, reason: `http ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    logger.error('tiktok events failed', {
      event: event.name,
      ...serializeError(err),
    });
    return { sent: false, reason: 'network' };
  }
}
