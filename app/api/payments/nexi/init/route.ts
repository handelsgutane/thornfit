/**
 * POST /api/payments/nexi/init
 *
 * Steg 2 i checkout-flyten:
 *
 *   Steg 1 (allerede): `/api/checkout/order` har opprettet Woo-ordren med
 *     status `pending`, fee_lines (gavekort), shipping_lines, og alle meta-
 *     felter (`_source`, `_payment_accepted_per_payement_type`, ...).
 *
 *   Steg 2 (her): Klienten kaller dette endepunktet med `{ orderId, orderKey }`.
 *     Vi henter ordren fra Woo, verifiserer at orderKey matcher (basic
 *     auth-gate uten å kreve session), og oppretter en Nexi-payment-session.
 *     Vi skriver Nexis paymentId tilbake på Woo-ordren som `_dibs_payment_id`,
 *     setter `payment_method` til `dibs_easy` (Krokedil-plugin-ens gateway-id
 *     — kritisk for at capture trigges på `completed`-overgangen).
 *
 *   Steg 3: Klienten åpner `<CardPaymentModal>` med returnert `paymentId` +
 *     `checkoutKey` og mounter Nexi sitt embedded-checkout-bibliotek.
 *
 * Idempotens:
 *   - Hvis Woo-ordren ALLEREDE har `_dibs_payment_id` satt: vi henter den
 *     eksisterende payment fra Nexi, sjekker at den fortsatt er valid (ikke
 *     expired), og returnerer samme paymentId. Dette dekker "kunde refresher
 *     mid-checkout"-tilfellet uten å lage duplikat-betalinger.
 *
 * Sikkerhet:
 *   - Rate-limit per IP (10/10s).
 *   - Ordren må ha status `pending` — ikke init Nexi for completed/cancelled.
 *   - `orderKey` må matche WC's `order_key` på ordren. Dette er ekvivalent
 *     med Woo's egen "auth via order key"-mekanisme og hindrer at en angriper
 *     bare gjetter en ordre-id.
 *   - Vi sjekker IKKE session-bruker — gjest-ordrer skal også kunne betale.
 *
 * Server-only.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { clientEnv, serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';
import {
  buildNexiPaymentRequest,
  type WooOrderForNexi,
} from '@/lib/nexi/build-payment-request';
import {
  getNexiBaseUrl,
  getNexiEnvironment,
  nexiFetch,
  NexiError,
  NexiNotConfiguredError,
} from '@/lib/nexi/client';
import { checkoutRateLimit } from '@/lib/redis/client';
import { wooFetch, WooError } from '@/lib/woo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  orderId: z.number().int().positive(),
  /** Woo's `order_key` (f.eks. `wc_order_abc123def`). Brukes som soft-auth. */
  orderKey: z.string().min(1).max(64),
});

// ---------------------------------------------------------------------------
// Woo response shape — kun feltene vi leser
// ---------------------------------------------------------------------------

interface WcOrderResponse extends WooOrderForNexi {
  readonly status: string;
  readonly order_key: string;
  readonly meta_data?: ReadonlyArray<{
    readonly key?: string;
    readonly value?: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// Nexi response shape
// ---------------------------------------------------------------------------

interface NexiCreatePaymentResponse {
  readonly paymentId?: string;
  readonly hostedPaymentPageUrl?: string;
}

interface NexiGetPaymentResponse {
  readonly payment?: {
    readonly paymentId?: string;
    readonly summary?: {
      readonly reservedAmount?: number;
      readonly chargedAmount?: number;
      readonly cancelledAmount?: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Rate limit
  const ip = clientIpFromHeaders(req.headers);
  if (checkoutRateLimit) {
    try {
      const { success } = await checkoutRateLimit.limit(`nexi-init:${ip}`);
      if (!success) {
        return jsonError(
          'For mange forespørsler. Vent et øyeblikk og prøv igjen.',
          429,
        );
      }
    } catch (err) {
      logger.warn('nexi-init rate limit error — allowing', {
        ...serializeError(err),
      });
    }
  }

  // 2. Parse body
  let parsed: z.infer<typeof InputSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = InputSchema.safeParse(raw);
    if (!result.success) {
      return jsonError('Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig JSON i request-body.', 400);
  }

  // 3. Hent Woo-ordren
  let order: WcOrderResponse;
  try {
    order = await wooFetch<WcOrderResponse>(`/wc/v3/orders/${parsed.orderId}`, {
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof WooError && err.status === 404) {
      return jsonError('Ordren finnes ikke.', 404);
    }
    logger.error('nexi-init: failed to fetch Woo order', {
      orderId: parsed.orderId,
      ...serializeError(err),
    });
    return jsonError('Kunne ikke laste ordren. Prøv igjen.', 502);
  }

  // 4. Verifiser order_key — soft auth-gate
  if (order.order_key !== parsed.orderKey) {
    logger.warn('nexi-init: order_key mismatch', {
      orderId: parsed.orderId,
      providedKeyLength: parsed.orderKey.length,
    });
    return jsonError('Ugyldig ordre-referanse.', 403);
  }

  // 5. Sjekk at ordren er i pending-status
  if (order.status !== 'pending') {
    return jsonError(
      `Ordren er ikke i en tilstand som kan betales (status: ${order.status}).`,
      409,
    );
  }

  // 6. Idempotens — hvis Nexi-payment allerede er opprettet, returner den
  const existingPaymentId = readMeta(order, '_dibs_payment_id');
  if (existingPaymentId) {
    const existing = await fetchExistingNexiPayment(existingPaymentId);
    if (existing && isPaymentStillValid(existing)) {
      logger.info('nexi-init: idempotency cache hit', {
        orderId: order.id,
        paymentId: existingPaymentId,
      });
      return successResponse({
        paymentId: existingPaymentId,
      });
    }
    // Eksisterende paymentId er stale (cancelled, expired). Fortsett til å
    // opprette en ny — den gamle blir hengende i Nexi-systemet, men bryter
    // ingenting.
    logger.info('nexi-init: stale paymentId, creating fresh', {
      orderId: order.id,
      stalePaymentId: existingPaymentId,
    });
  }

  // 7. Bygg payload
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  let paymentRequest;
  try {
    paymentRequest = buildNexiPaymentRequest({
      wcOrder: order,
      checkoutUrl: `${siteUrl}/checkout`,
      webhookUrl: `${siteUrl}/api/webhooks/nexi`,
    });
  } catch (err) {
    logger.error('nexi-init: failed to build payload', {
      orderId: order.id,
      ...serializeError(err),
    });
    return jsonError('Intern feil ved bygging av betaling.', 500);
  }

  // 8. Opprett Nexi-payment
  let nexiResponse: NexiCreatePaymentResponse;
  try {
    nexiResponse = await nexiFetch<NexiCreatePaymentResponse>('/payments', {
      method: 'POST',
      body: paymentRequest,
    });
  } catch (err) {
    if (err instanceof NexiNotConfiguredError) {
      logger.error('nexi-init: NEXI_SECRET_KEY missing');
      return jsonError(
        'Betalingstjenesten er ikke konfigurert. Kontakt support.',
        503,
      );
    }
    if (err instanceof NexiError) {
      // Diagnose-info for Vercel-loggene: hvilken URL traff vi, hvilken env-
      // var sa "test"/"live", og første 4 tegn av nøkkelen (slik at vi kan
      // identifisere om feil nøkkel er i bruk uten å lekke selve verdien).
      logger.error('nexi-init: Nexi rejected create-payment', {
        orderId: order.id,
        nexiStatus: err.status,
        nexiBody: err.body,
        nexiBaseUrl: getNexiBaseUrl(),
        nexiEnvironment: getNexiEnvironment(),
        secretKeyPrefix: serverEnv.NEXI_SECRET_KEY
          ? serverEnv.NEXI_SECRET_KEY.slice(0, 4)
          : '(missing)',
        secretKeyLength: serverEnv.NEXI_SECRET_KEY?.length ?? 0,
      });
      return jsonError(
        'Vi klarte ikke å starte kortbetalingen akkurat nå. Prøv igjen om litt.',
        502,
      );
    }
    logger.error('nexi-init: unexpected error from Nexi', {
      orderId: order.id,
      ...serializeError(err),
    });
    return jsonError('Noe gikk galt. Prøv igjen.', 500);
  }

  const paymentId = nexiResponse.paymentId;
  if (!paymentId || typeof paymentId !== 'string') {
    logger.error('nexi-init: Nexi response had no paymentId', {
      orderId: order.id,
      response: nexiResponse,
    });
    return jsonError('Uventet svar fra betalingstjenesten.', 502);
  }

  // 9. Skriv tilbake til Woo: paymentId + Krokedil-plugin-ens forventede meta
  try {
    await wooFetch(`/wc/v3/orders/${order.id}`, {
      method: 'PUT',
      body: {
        // payment_method må være `dibs_easy` for at Krokedil-plugin-ens
        // capture-handler skal trigge på `woocommerce_order_status_completed`.
        payment_method: 'dibs_easy',
        payment_method_title: 'Nexi Checkout',
        meta_data: buildNexiInitMetaUpdates({
          existingMeta: order.meta_data ?? [],
          paymentId,
        }),
      },
    });
  } catch (err) {
    // Vi har en Nexi-payment, men kunne ikke skrive den til Woo. Det er en
    // alvorlig feil fordi capture-flyten ikke vil trigges. Men vi har
    // paymentId — klient kan fortsatt prøve å betale, og vi kan retry write
    // fra webhook senere. Logg som error og fortsett.
    logger.error('nexi-init: failed to write paymentId to Woo order', {
      orderId: order.id,
      paymentId,
      ...serializeError(err),
    });
    // Note: ikke returner error til klient — Nexi-payment finnes, klient
    // kan fortsatt fortsette. Webhook-handler tar over når betalingen er
    // ferdig (den gjør en separat lookup som ikke avhenger av meta).
  }

  logger.info('nexi-init: payment session created', {
    orderId: order.id,
    paymentId,
    amount: paymentRequest.order.amount,
  });

  return successResponse({ paymentId });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successResponse(input: { readonly paymentId: string }) {
  return NextResponse.json(
    {
      ok: true,
      paymentId: input.paymentId,
      // Klient-bundlet checkout-key — public-safe per Nexi-docs.
      checkoutKey: clientEnv.NEXT_PUBLIC_NEXI_CHECKOUT_KEY ?? null,
      environment: getNexiEnvironment(),
    },
    { status: 200 },
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}

function readMeta(order: WcOrderResponse, key: string): string | null {
  const found = order.meta_data?.find((m) => m.key === key);
  if (!found || typeof found.value !== 'string') return null;
  return found.value;
}

interface WooMetaItem {
  readonly key?: string;
  readonly value?: unknown;
}

/**
 * Bygg det meta-arrayet vi PUT-er til Woo: filtrer ut alle gamle `_dibs_*`-
 * keys (og `_payment_method_title`) for å unngå duplikater, behold alle
 * andre som er, og legg til de nye Nexi-tilkoblingsfeltene.
 */
function buildNexiInitMetaUpdates(args: {
  existingMeta: ReadonlyArray<WooMetaItem>;
  paymentId: string;
}): ReadonlyArray<{ key: string; value: string }> {
  const { existingMeta, paymentId } = args;
  const STRIP_PREFIXES = ['_dibs_'];
  const STRIP_KEYS = new Set([
    '_payment_method',
    '_payment_method_title',
    'is_vat_exempt',
  ]);

  const kept: Array<{ key: string; value: string }> = [];
  for (const m of existingMeta) {
    if (typeof m.key !== 'string') continue;
    if (STRIP_PREFIXES.some((p) => m.key!.startsWith(p))) continue;
    if (STRIP_KEYS.has(m.key)) continue;
    if (typeof m.value === 'string' || typeof m.value === 'number') {
      kept.push({ key: m.key, value: String(m.value) });
    }
  }

  return [
    ...kept,
    { key: '_dibs_payment_id', value: paymentId },
    { key: '_dibs_init_at', value: new Date().toISOString() },
    { key: '_dibs_checkout_flow', value: 'embedded' },
    { key: 'is_vat_exempt', value: 'no' },
  ];
}

async function fetchExistingNexiPayment(
  paymentId: string,
): Promise<NexiGetPaymentResponse | null> {
  try {
    return await nexiFetch<NexiGetPaymentResponse>(`/payments/${paymentId}`);
  } catch (err) {
    logger.warn('nexi-init: failed to fetch existing payment, will create new', {
      paymentId,
      ...serializeError(err),
    });
    return null;
  }
}

function isPaymentStillValid(payment: NexiGetPaymentResponse): boolean {
  // En payment er "valid" å gjenbruke hvis den ikke er kansellert eller
  // allerede chargd (i hvilket tilfelle vi ville hatt en ferdig ordre, ikke
  // pending). Defensiv: hvis Nexi-respons er rar, returner false så vi
  // lager en ny.
  const summary = payment.payment?.summary;
  if (!summary) return false;
  if (summary.cancelledAmount && summary.cancelledAmount > 0) return false;
  if (summary.chargedAmount && summary.chargedAmount > 0) return false;
  return true;
}
