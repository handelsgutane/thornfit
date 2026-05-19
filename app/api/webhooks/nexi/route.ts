/**
 * POST /api/webhooks/nexi
 *
 * Mottar webhook-callbacks fra Nexi når betalings-events skjer:
 *
 *   - `payment.checkout.completed` — kunden har bekreftet betaling i Nexi-
 *     iframe-en. Reservasjonen er på plass på kortet, men IKKE charget enda
 *     (vi bruker manual capture). Vi flytter Woo-ordren til `processing` og
 *     skriver Nexi-meta-feltene Krokedil-plugin-en forventer.
 *   - `payment.charge.created.v2` — pengene faktisk trukket. Skjer når admin
 *     flytter Woo-ordren til `completed` og Krokedil-plugin-ens hook kaller
 *     POST /charges. Vi skriver `_dibs_charge_id` (plugin-en gjør det også,
 *     men vi gjør det her for race-protection hvis webhook lander først).
 *   - `payment.charge.failed` — capture feilet. Sett ordre til `on-hold`.
 *   - `payment.cancel.created.v2` — Nexi-reservasjonen er kansellert. Sett
 *     Woo-ordren til `cancelled` hvis ikke allerede.
 *   - `payment.cancel.failed` — kansellering feilet. Logg som error.
 *   - `payment.refund.created.v2` — refund OK. Oppdater
 *     `_dibs_refunded_amount`-meta.
 *   - `payment.refund.failed` — log error.
 *
 * Sikkerhet:
 *   - Verifiser `Authorization`-header med `timingSafeEqual` mot
 *     `NEXI_WEBHOOK_AUTH`. Returnerer 401 ved mismatch.
 *   - `eventId`-deduplisering i Redis (TTL 7 dager). Duplicate → no-op.
 *   - HTTP-status: 200 ved suksess (også for "vi har sett denne før"),
 *     401 ved auth-feil, 500 ved interne feil. Vi vil at Nexi retry-er på
 *     500 — det er hele poenget. Ikke ape chef-storefront's "alltid 200"-
 *     antimønster.
 *
 * Server-only.
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { logger, serializeError } from '@/lib/logger';
import { nexiFetch, NexiError } from '@/lib/nexi/client';
import { getRedis } from '@/lib/redis/client';
import { serverEnv } from '@/lib/env';
import { wooFetch, WooError } from '@/lib/woo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

const EVENT_DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

const HANDLED_EVENTS = new Set([
  'payment.checkout.completed',
  // Charge: v2 er primær (det vi subscriber på), v1 er bakoverkompatibel.
  'payment.charge.created.v2',
  'payment.charge.created',
  'payment.charge.failed',
  // Cancel: kun v1 finnes per Nexi-spec.
  'payment.cancel.created',
  'payment.cancel.failed',
  // Refund: `.completed` er primær. Inkluderer `.initiated.v2` defensivt
  // slik at vi ikke ignorerer den hvis Nexi noen ganger sender begge.
  'payment.refund.completed',
  'payment.refund.initiated.v2',
  'payment.refund.initiated',
  'payment.refund.failed',
]);

// ---------------------------------------------------------------------------
// Webhook-payload shape (subsetet vi bruker)
// ---------------------------------------------------------------------------

interface NexiWebhookPayload {
  readonly id?: string;
  readonly event?: string;
  readonly timestamp?: string;
  readonly merchantId?: number;
  readonly data?: {
    readonly paymentId?: string;
    readonly chargeId?: string;
    readonly cancelId?: string;
    readonly refundId?: string;
    readonly amount?: { readonly amount?: number; readonly currency?: string };
    readonly order?: {
      readonly amount?: { readonly amount?: number };
      readonly reference?: string;
    };
    readonly paymentMethod?: string;
    readonly paymentType?: string;
    readonly cardDetails?: { readonly maskedPan?: string };
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Verifiser auth
  const providedAuth = req.headers.get('authorization') ?? '';
  if (!verifyAuth(providedAuth)) {
    logger.error('nexi-webhook: invalid Authorization header', {
      providedLength: providedAuth.length,
    });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Parse body
  let payload: NexiWebhookPayload;
  try {
    payload = (await req.json()) as NexiWebhookPayload;
  } catch (err) {
    logger.warn('nexi-webhook: invalid JSON', { ...serializeError(err) });
    return new NextResponse('Bad Request', { status: 400 });
  }

  const eventName = payload.event;
  const eventId = payload.id;
  const paymentId = payload.data?.paymentId;

  if (!eventName || !paymentId) {
    logger.warn('nexi-webhook: missing event or paymentId', {
      hasEvent: !!eventName,
      hasPaymentId: !!paymentId,
    });
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (!HANDLED_EVENTS.has(eventName)) {
    logger.info('nexi-webhook: ignored event', { eventName, paymentId });
    return new NextResponse('OK', { status: 200 });
  }

  // 3. Idempotens-sjekk
  if (eventId) {
    const seen = await isEventSeen(eventId);
    if (seen) {
      logger.info('nexi-webhook: duplicate event, no-op', {
        eventId,
        eventName,
      });
      return new NextResponse('OK', { status: 200 });
    }
  }

  // 4. Slå opp Woo-ordren
  let order;
  try {
    order = await findWooOrderByPaymentId(paymentId);
  } catch (err) {
    logger.error('nexi-webhook: failed to look up Woo order', {
      paymentId,
      ...serializeError(err),
    });
    return new NextResponse('Internal Error', { status: 500 });
  }

  if (!order) {
    logger.warn('nexi-webhook: no Woo order for paymentId', { paymentId });
    // Returner 200 — vi vil ikke at Nexi skal retrye for evig hvis ordren
    // genuint ikke finnes (kunne f.eks. blitt slettet i admin). Logg som
    // warn så vi kan oppdage mønstre.
    return new NextResponse('OK — order not found', { status: 200 });
  }

  // 5. Switch på event-type
  try {
    await handleEvent(eventName, payload, order);
  } catch (err) {
    logger.error('nexi-webhook: handler failed', {
      eventName,
      paymentId,
      orderId: order.id,
      ...serializeError(err),
    });
    return new NextResponse('Internal Error', { status: 500 });
  }

  // 6. Mark som sett — først NÅ slik at en feil ikke bestmarker eventet
  // som "behandlet" om handleren feilet.
  if (eventId) {
    await markEventSeen(eventId);
  }

  return new NextResponse('OK', { status: 200 });
}

// ---------------------------------------------------------------------------
// Auth verification
// ---------------------------------------------------------------------------

function verifyAuth(provided: string): boolean {
  const expected = serverEnv.NEXI_WEBHOOK_AUTH;
  if (!expected) {
    // Fail-closed: hvis env-var mangler, godta ingen webhooks.
    logger.error('nexi-webhook: NEXI_WEBHOOK_AUTH not configured');
    return false;
  }

  // timingSafeEqual krever lik lengde — pad med nuller hvis forskjellig
  // (men det failer alltid da). Bruk ulik-lengde-sjekk først.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Idempotens
// ---------------------------------------------------------------------------

async function isEventSeen(eventId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false; // Uten Redis kan vi ikke dedupe — proces alltid.
  try {
    const key = eventKey(eventId);
    const value = await redis.get<unknown>(key);
    return value !== null && value !== undefined;
  } catch (err) {
    logger.warn('nexi-webhook: dedupe lookup failed, processing event', {
      eventId,
      ...serializeError(err),
    });
    return false;
  }
}

async function markEventSeen(eventId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(eventKey(eventId), '1', { ex: EVENT_DEDUPE_TTL_SECONDS });
  } catch (err) {
    logger.warn('nexi-webhook: dedupe write failed', {
      eventId,
      ...serializeError(err),
    });
  }
}

function eventKey(eventId: string): string {
  return `processed_events:nexi:${eventId}`;
}

// ---------------------------------------------------------------------------
// Woo-ordre lookup
// ---------------------------------------------------------------------------

interface WooOrderLookupResult {
  readonly id: number;
  readonly status: string;
  readonly meta_data?: ReadonlyArray<{ key?: string; value?: unknown }>;
}

async function findWooOrderByPaymentId(
  paymentId: string,
): Promise<WooOrderLookupResult | null> {
  // Bruker WC's REST-filter på meta-key. Krokedil-plugin-en gjør det samme.
  const orders = await wooFetch<ReadonlyArray<WooOrderLookupResult>>(
    '/wc/v3/orders',
    {
      query: {
        meta_key: '_dibs_payment_id',
        meta_value: paymentId,
        per_page: 1,
      },
      cache: 'no-store',
    },
  );
  return orders[0] ?? null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleEvent(
  eventName: string,
  payload: NexiWebhookPayload,
  order: WooOrderLookupResult,
): Promise<void> {
  const data = payload.data ?? {};

  switch (eventName) {
    case 'payment.checkout.completed':
      await onCheckoutCompleted(order, data);
      return;

    case 'payment.charge.created':
    case 'payment.charge.created.v2':
      await onChargeCreated(order, data);
      return;

    case 'payment.charge.failed':
      await onChargeFailed(order);
      return;

    case 'payment.cancel.created':
      await onCancelCreated(order, data);
      return;

    case 'payment.cancel.failed':
      await onCancelFailed(order);
      return;

    case 'payment.refund.completed':
    case 'payment.refund.initiated.v2':
    case 'payment.refund.initiated':
      await onRefundCreated(order, data);
      return;

    case 'payment.refund.failed':
      await onRefundFailed(order);
      return;
  }
}

/**
 * Shape vi leser fra `GET /payments/{id}` for å fylle ut paymentMethod/
 * paymentType/maskedPan — Nexi inkluderer IKKE disse feltene i selve
 * `payment.checkout.completed`-webhook-bodyen, så vi må hente dem.
 */
interface NexiPaymentDetailsResponse {
  readonly payment?: {
    readonly paymentDetails?: {
      readonly paymentMethod?: string;
      readonly paymentType?: string;
      readonly cardDetails?: { readonly maskedPan?: string };
    };
  };
}

/**
 * Kunden har bekreftet betalingen i Nexi-iframen. Reservasjonen er på plass
 * på kortet — men IKKE charged (vi bruker manual capture). Vi flytter
 * Woo-ordren til `processing` og setter Krokedil-plugin-ens forventede meta-
 * felter.
 *
 * `payment_complete()` på Woo-ordren kalles av Krokedil-plugin-en når den
 * ser at `_dibs_date_paid` er satt. Vi setter den her — det trigger
 * Woo's "ny ordre"-e-post til kunden og admin.
 *
 * paymentMethod/paymentType/maskedPan kommer IKKE i webhook-bodyen — Nexi
 * sender minimal data der. Vi henter full payment-state via
 * `GET /payments/{id}` for å fylle dem ut. Hvis fetchen feiler, fortsetter
 * vi med tomme strenger (status-overgangen er det viktigste).
 */
async function onCheckoutCompleted(
  order: WooOrderLookupResult,
  data: NexiWebhookPayload['data'],
): Promise<void> {
  const paymentId = data?.paymentId ?? '';
  // Best-effort detail fetch. Plugin-en gjør det samme i sin confirm-flow.
  let paymentMethod = data?.paymentMethod ?? '';
  let paymentType = data?.paymentType ?? '';
  let maskedPan = data?.cardDetails?.maskedPan;

  if (paymentId && (!paymentMethod || !paymentType)) {
    try {
      const detail = await nexiFetch<NexiPaymentDetailsResponse>(
        `/payments/${paymentId}`,
      );
      const d = detail.payment?.paymentDetails;
      if (d) {
        if (!paymentMethod) paymentMethod = d.paymentMethod ?? '';
        if (!paymentType) paymentType = d.paymentType ?? '';
        if (!maskedPan) maskedPan = d.cardDetails?.maskedPan;
      }
    } catch (err) {
      // Ikke fatalt — logg og fortsett. Plugin-ens egen capture vil fortsatt
      // virke siden den leser `_dibs_payment_id` (det vi setter ved init),
      // ikke disse meta-feltene.
      logger.warn('nexi-webhook: failed to fetch payment details, continuing with empty fields', {
        orderId: order.id,
        paymentId,
        ...serializeError(err),
        ...(err instanceof NexiError ? { nexiStatus: err.status } : {}),
      });
    }
  }

  // transaction_id MÅ settes — Krokedil-plugin-ens capture-handler leser
  // den via `$order->get_transaction_id()` (IKKE `_dibs_payment_id`-meta)
  // for å bygge `POST /payments/{id}/charges`-URL-en. Hvis transaction_id
  // er tom, blir URL-en `/payments//charges` og Nexi svarer 405. Plugin-en
  // setter selv transaction_id via `$order->payment_complete($paymentId)`
  // i sin confirm-flow; vi må gjøre det manuelt siden vi ikke trigger den.
  await wooFetch(`/wc/v3/orders/${order.id}`, {
    method: 'PUT',
    body: {
      status: 'processing',
      transaction_id: paymentId,
      meta_data: mergeMeta(order.meta_data ?? [], [
        { key: '_dibs_date_paid', value: new Date().toISOString() },
        { key: 'dibs_payment_type', value: paymentType },
        { key: 'dibs_payment_method', value: paymentMethod },
        ...(maskedPan
          ? [{ key: 'dibs_customer_card', value: maskedPan }]
          : []),
      ]),
    },
  });

  await addOrderNote(
    order.id,
    `Nexi: betaling reservert (${paymentMethod || paymentType || 'ukjent metode'}). Klar for capture når ordren flyttes til Fullført.`,
  );

  logger.info('nexi-webhook: order marked processing', {
    orderId: order.id,
    paymentMethod,
    paymentType,
  });
}

async function onChargeCreated(
  order: WooOrderLookupResult,
  data: NexiWebhookPayload['data'],
): Promise<void> {
  const chargeId = data?.chargeId;
  if (!chargeId) {
    logger.warn('nexi-webhook: charge.created without chargeId', {
      orderId: order.id,
    });
    return;
  }

  // Plugin-en setter `_dibs_charge_id` selv ved sin egen capture-handler. Vi
  // skriver den hit OGSÅ for race-safety: hvis webhook'en lander før plugin-
  // en har skrevet ferdig, eller hvis charge ble trigget direkte via
  // Nexi-portalen (ikke fra Woo), så har vi den lagret.
  await wooFetch(`/wc/v3/orders/${order.id}`, {
    method: 'PUT',
    body: {
      meta_data: mergeMeta(order.meta_data ?? [], [
        { key: '_dibs_charge_id', value: chargeId },
        { key: '_dibs_charged_at', value: new Date().toISOString() },
      ]),
    },
  });

  await addOrderNote(
    order.id,
    `Nexi: betaling charged via webhook. Charge ID: ${chargeId}`,
  );

  logger.info('nexi-webhook: charge recorded', {
    orderId: order.id,
    chargeId,
  });
}

async function onChargeFailed(
  order: WooOrderLookupResult,
): Promise<void> {
  await wooFetch(`/wc/v3/orders/${order.id}`, {
    method: 'PUT',
    body: { status: 'on-hold' },
  });
  await addOrderNote(order.id, 'Nexi: capture feilet. Ordre satt til vent.');
  logger.error('nexi-webhook: capture failed — order on-hold', {
    orderId: order.id,
  });
}

async function onCancelCreated(
  order: WooOrderLookupResult,
  data: NexiWebhookPayload['data'],
): Promise<void> {
  const cancelAmount = data?.amount?.amount ?? 0;
  await wooFetch(`/wc/v3/orders/${order.id}`, {
    method: 'PUT',
    body: {
      // Bare flytt til cancelled hvis vi ikke allerede er der eller forbi.
      ...(order.status === 'pending' || order.status === 'processing'
        ? { status: 'cancelled' }
        : {}),
      meta_data: mergeMeta(order.meta_data ?? [], [
        { key: '_dibs_canceled_amount_id', value: String(cancelAmount) },
        { key: '_dibs_canceled_at', value: new Date().toISOString() },
      ]),
    },
  });
  await addOrderNote(
    order.id,
    `Nexi: betaling kansellert (${cancelAmount / 100} kr).`,
  );
  logger.info('nexi-webhook: cancel recorded', {
    orderId: order.id,
    cancelAmount,
  });
}

async function onCancelFailed(
  order: WooOrderLookupResult,
): Promise<void> {
  await addOrderNote(order.id, 'Nexi: kansellering feilet — sjekk i Nexi-portalen.');
  logger.error('nexi-webhook: cancel failed', { orderId: order.id });
}

async function onRefundCreated(
  order: WooOrderLookupResult,
  data: NexiWebhookPayload['data'],
): Promise<void> {
  const refundAmount = data?.amount?.amount ?? 0;
  await wooFetch(`/wc/v3/orders/${order.id}`, {
    method: 'PUT',
    body: {
      meta_data: mergeMeta(order.meta_data ?? [], [
        { key: '_dibs_refunded_amount', value: String(refundAmount) },
        { key: '_dibs_refunded_at', value: new Date().toISOString() },
      ]),
    },
  });
  await addOrderNote(
    order.id,
    `Nexi: refund gjennomført (${refundAmount / 100} kr).`,
  );
  logger.info('nexi-webhook: refund recorded', {
    orderId: order.id,
    refundAmount,
  });
}

async function onRefundFailed(
  order: WooOrderLookupResult,
): Promise<void> {
  await addOrderNote(order.id, 'Nexi: refund feilet — sjekk i Nexi-portalen.');
  logger.error('nexi-webhook: refund failed', { orderId: order.id });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WooMetaItem {
  readonly key?: string;
  readonly value?: unknown;
}

/**
 * Merge ny meta inn i eksisterende. Eksisterende keys med samme navn som
 * de nye blir overskrevet — slik unngår vi duplikater i Woos meta-tabell.
 */
function mergeMeta(
  existing: ReadonlyArray<WooMetaItem>,
  updates: ReadonlyArray<{ key: string; value: string }>,
): ReadonlyArray<{ key: string; value: string }> {
  const newKeys = new Set(updates.map((u) => u.key));
  const kept: Array<{ key: string; value: string }> = [];
  for (const m of existing) {
    if (typeof m.key !== 'string') continue;
    if (newKeys.has(m.key)) continue;
    if (typeof m.value === 'string' || typeof m.value === 'number') {
      kept.push({ key: m.key, value: String(m.value) });
    }
  }
  return [...kept, ...updates];
}

async function addOrderNote(orderId: number, note: string): Promise<void> {
  try {
    await wooFetch(`/wc/v3/orders/${orderId}/notes`, {
      method: 'POST',
      body: { note, customer_note: false },
    });
  } catch (err) {
    if (err instanceof WooError) {
      logger.warn('nexi-webhook: failed to add order note', {
        orderId,
        wooStatus: err.status,
      });
    } else {
      logger.warn('nexi-webhook: order note unexpected error', {
        orderId,
        ...serializeError(err),
      });
    }
  }
}
