import 'server-only';

/**
 * Meta Conversions API (CAPI) — server-side dobbeltsporing av pixel-events.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * Ansvar:
 *   - Map intern event → Meta standard/custom event name (samme som i adapters/meta.ts)
 *   - Hash PII (email, phone, navn) med sha256 før sending
 *   - Sett `event_id` identisk til det pixel-en bruker, så Meta kan dedupe
 *   - Håndter swallowed errors (analytics må aldri ta ned en request)
 *
 * Ikke-ansvar:
 *   - Consent-gate. Consent-mode signaliseres via `data_processing_options`
 *     i payload (LDU-flag hvis vi vil respektere CCPA), men for GDPR er
 *     det legitime interesse + Meta selv som avgjør bruk. CAPI kan sendes
 *     uansett — plattformen bruker modelled conversions hvis ingen pixel-match.
 */

import { logger, serializeError } from '@/lib/logger';

import { ANALYTICS_CURRENCY, type AnalyticsEvent, type AnalyticsItem } from '../events';

import { hashEmail, hashName, hashPhone, normalizeIp, sha256Hex } from './hash';

export interface MetaCapiOptions {
  pixelId: string;
  accessToken: string;
  /** Test event code fra Meta Events Manager, brukt i dev. */
  testEventCode?: string;
  /** API-versjon — pinnes for stabilitet. Bumps når Meta breaker noe. */
  apiVersion?: string;
}

export interface MetaCapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** Meta fbp-cookie fra klient (`_fbp`) — forbedrer match. */
  fbp?: string;
  /** Meta fbc-cookie (`_fbc`) — klikk-ID fra ads. */
  fbc?: string;
  ip?: string;
  userAgent?: string;
  /** Eksternt ID — typisk Woo customer_id. */
  externalId?: string | number;
}

export interface MetaCapiContext {
  eventId: string;
  eventTime: number; // unix seconds
  eventSourceUrl: string;
  user: MetaCapiUserData;
  actionSource?: 'website' | 'email' | 'app' | 'phone_call';
}

// ---------------------------------------------------------------------------
// Event mapping — MÅ holdes synkronisert med `adapters/meta.ts`.
// ---------------------------------------------------------------------------

interface MappedMetaEvent {
  eventName: string;
  customData: Record<string, unknown>;
}

function contentId(item: AnalyticsItem): string {
  return item.sku ?? item.id;
}

function buildContents(items: AnalyticsItem[], fallbackQty = 1) {
  return items.map((i) => ({
    id: contentId(i),
    quantity: i.quantity ?? fallbackQty,
    item_price: i.price,
  }));
}

function mapEvent(event: AnalyticsEvent): MappedMetaEvent | null {
  switch (event.name) {
    case 'page_view':
      return { eventName: 'PageView', customData: {} };

    case 'view_item':
      return {
        eventName: 'ViewContent',
        customData: {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          content_name: event.payload.item.name,
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents([event.payload.item]),
        },
      };

    case 'view_item_list':
      // Mirror av klient-adapterens custom 'ViewItemList' — CAPI tar
      // custom event names uten registrering.
      return {
        eventName: 'ViewItemList',
        customData: {
          content_type: 'product_group',
          content_category: event.payload.listId,
          content_name: event.payload.listName ?? event.payload.listId,
          content_ids: event.payload.items.map(contentId),
          num_items: event.payload.items.length,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'add_to_cart':
      return {
        eventName: 'AddToCart',
        customData: {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents([
            { ...event.payload.item, quantity: event.payload.quantity },
          ]),
        },
      };

    case 'remove_from_cart':
      return {
        eventName: 'RemoveFromCart',
        customData: {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          value: event.payload.item.price * event.payload.quantity,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'add_to_wishlist':
      return {
        eventName: 'AddToWishlist',
        customData: {
          content_type: 'product',
          content_ids: [contentId(event.payload.item)],
          value: event.payload.item.price,
          currency: ANALYTICS_CURRENCY,
        },
      };

    case 'view_cart':
      return {
        eventName: 'ViewCart',
        customData: {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents(event.payload.items),
        },
      };

    case 'begin_checkout':
      return {
        eventName: 'InitiateCheckout',
        customData: {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          num_items: event.payload.items.length,
          contents: buildContents(event.payload.items),
        },
      };

    case 'add_payment_info':
      return {
        eventName: 'AddPaymentInfo',
        customData: {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          contents: buildContents(event.payload.items),
        },
      };

    case 'purchase':
      return {
        eventName: 'Purchase',
        customData: {
          content_type: 'product',
          content_ids: event.payload.items.map(contentId),
          value: event.payload.value,
          currency: ANALYTICS_CURRENCY,
          num_items: event.payload.items.length,
          contents: buildContents(event.payload.items),
          order_id: event.payload.orderId,
        },
      };

    case 'search':
      return {
        eventName: 'Search',
        customData: { search_string: event.payload.query },
      };

    case 'sign_up':
      return {
        eventName: 'CompleteRegistration',
        customData: { method: event.payload.method },
      };

    case 'login':
      return {
        eventName: 'Login',
        customData: { method: event.payload.method },
      };

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

// ---------------------------------------------------------------------------
// User-data med PII hashing
// ---------------------------------------------------------------------------

function buildUserData(user: MetaCapiUserData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const em = hashEmail(user.email);
  if (em) out.em = [em];
  const ph = hashPhone(user.phone);
  if (ph) out.ph = [ph];
  const fn = hashName(user.firstName);
  if (fn) out.fn = [fn];
  const ln = hashName(user.lastName);
  if (ln) out.ln = [ln];
  if (user.fbp) out.fbp = user.fbp;
  if (user.fbc) out.fbc = user.fbc;
  const ip = normalizeIp(user.ip);
  if (ip) out.client_ip_address = ip;
  if (user.userAgent) out.client_user_agent = user.userAgent;
  if (user.externalId !== undefined && user.externalId !== null) {
    out.external_id = [sha256Hex(String(user.externalId).trim().toLowerCase())];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function sendMetaCapi(
  options: MetaCapiOptions,
  event: AnalyticsEvent,
  ctx: MetaCapiContext,
): Promise<{ sent: boolean; reason?: string }> {
  const mapped = mapEvent(event);
  if (!mapped) return { sent: false, reason: 'unsupported event' };

  const apiVersion = options.apiVersion ?? 'v19.0';
  const endpoint = `https://graph.facebook.com/${apiVersion}/${options.pixelId}/events`;

  const body = {
    data: [
      {
        event_name: mapped.eventName,
        event_time: ctx.eventTime,
        event_id: ctx.eventId,
        event_source_url: ctx.eventSourceUrl,
        action_source: ctx.actionSource ?? 'website',
        user_data: buildUserData(ctx.user),
        custom_data: mapped.customData,
      },
    ],
    access_token: options.accessToken,
    ...(options.testEventCode ? { test_event_code: options.testEventCode } : {}),
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('meta capi non-2xx', {
        status: res.status,
        event: event.name,
        body: text.slice(0, 500),
      });
      return { sent: false, reason: `http ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    logger.error('meta capi failed', {
      event: event.name,
      ...serializeError(err),
    });
    return { sent: false, reason: 'network' };
  }
}
