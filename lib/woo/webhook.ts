/**
 * WooCommerce webhook-helpers.
 *
 * - HMAC-SHA256-verifisering av `X-WC-Webhook-Signature` (base64).
 * - Parser av `X-WC-Webhook-Topic` → `{ resource, event }`.
 * - Detektering av Woo's "ping"-delivery (sendes når webhooken opprettes i
 *   wp-admin og trigger en test).
 *
 * Woo signerer med:
 *   signature = base64( HMAC-SHA256( secret, rawBody ) )
 *
 * `rawBody` er bytes som ankom serveren — ikke re-serialisert JSON. Derfor må
 * handleren lese body som `request.text()` FØR den gjør `JSON.parse()`.
 *
 * Topic-format: `<resource>.<event>`, f.eks. `product.updated`,
 * `product_category.deleted`, `product.restored`.
 *
 * Kilde: https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks
 *
 * Sikkerhet:
 * - Signaturen må sjekkes før vi parser body. Ellers kan en angriper sende
 *   oss en rigget JSON som får oss til å slette data.
 * - Bruk `timingSafeEqual` med konstant-tid-sammenligning.
 * - Returner 401 på signatur-feil, 400 på mangelfulle headere, 200/202 på
 *   akseptert payload. Woo retry-er ved ikke-2xx.
 * - Fail-closed: hvis `WC_WEBHOOK_SECRET` ikke er satt, avvises alle webhooks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

// ---------- Types ----------------------------------------------------------

export type WooWebhookResource =
  | 'product'
  | 'product_category'
  | 'order'
  | 'customer'
  | 'coupon'
  | string;

export type WooWebhookEvent =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'trashed'
  | string;

export interface WooWebhookTopic {
  resource: WooWebhookResource;
  event: WooWebhookEvent;
  raw: string;
}

// ---------- Signature ------------------------------------------------------

/**
 * Returnerer `true` hvis signaturen er gyldig. Returnerer `false` (og logger)
 * hvis `WC_WEBHOOK_SECRET` ikke er konfigurert — fail-closed for å unngå at
 * uferdig oppsett aksepterer usignerte webhooks.
 */
export function verifyWooSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = serverEnv.WC_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('WC_WEBHOOK_SECRET not configured — rejecting webhook', {
      hint: 'Add WC_WEBHOOK_SECRET to Vercel env (matches secret in WP admin → Webhooks)',
    });
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------- Topic ----------------------------------------------------------

/**
 * Parse `X-WC-Webhook-Topic`-headeren. Returnerer `null` for ukjent format.
 */
export function parseWooTopic(topicHeader: string | null): WooWebhookTopic | null {
  if (!topicHeader) return null;
  const dot = topicHeader.indexOf('.');
  if (dot <= 0 || dot === topicHeader.length - 1) return null;
  return {
    resource: topicHeader.slice(0, dot),
    event: topicHeader.slice(dot + 1),
    raw: topicHeader,
  };
}

// ---------- Ping -----------------------------------------------------------

/**
 * Woo sender en "ping" (test-delivery) når webhooken opprettes i admin.
 * Payload: `{ webhook_id: N }` uten resource/event-headers. Vi vil svare 200
 * på disse, men ikke gjøre DB-arbeid.
 */
export function isWooPing(rawBody: string): boolean {
  if (rawBody.length > 200) return false;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    return keys.length === 1 && keys[0] === 'webhook_id';
  } catch {
    return false;
  }
}
