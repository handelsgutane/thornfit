/**
 * POST /api/checkout/order
 *
 * Klient sender inn (server-validated):
 *   - idempotencyKey (UUID, generert av klient)
 *   - contact.email + phone
 *   - deliveryMode: 'send' | 'pickup'
 *   - shippingMethodId (når deliveryMode = 'send')
 *   - shippingAddress, billingAddress (sistnevnte = null hvis lik shipping)
 *   - paymentMethodId: 'card' | 'invoice'
 *   - items: [{ productId, variationId, quantity }]
 *   - couponCodes: string[]
 *   - expectedTotal (for drift-detection — server avviser hvis vi recomputer
 *     noe annet)
 *
 * Server:
 *   1. Rate-limit per IP (10/10s via Upstash).
 *   2. Validerer payload + idempotency-key shape.
 *   3. Kaller orchestrator (`submitCheckoutOrder`) som recomputer priser
 *      mot Supabase, kjører rabatt-evaluator, og POSTer mot Woo.
 *   4. Returner JSON med ordre-id + redirect-URL.
 *
 * Klienten får aldri Woo-spesifikke feilmeldinger — kun mappede norske
 * brukervennlige meldinger og strukturerte error-koder.
 *
 * NEXI-betaling kobles på senere — denne route'n er payment-agnostisk.
 * Status settes alltid til `pending` (orchestrator hardkoder det).
 */

import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/session';
import {
  submitCheckoutOrder,
  type CheckoutOrderError,
  type CheckoutOrderResult,
} from '@/lib/checkout/order';
import { clientEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';
import { checkoutRateLimit } from '@/lib/redis/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Woo-create kan ta noen sekunder — gi rikelig margin før vi 504-er.
export const maxDuration = 30;

export async function POST(req: Request) {
  // 1. Rate limit. Bruker IP — vi vil ikke skifte til e-post her, fordi en
  //    angriper kan skifte e-post for å unngå rate-limit, og en bruker som
  //    klikker raskt skal blokkeres så snart vi merker mønsteret.
  const ip = clientIpFromHeaders(req.headers);
  if (checkoutRateLimit) {
    try {
      const { success } = await checkoutRateLimit.limit(ip);
      if (!success) {
        return jsonError(
          'For mange forespørsler. Vent et øyeblikk og prøv igjen.',
          'RATE_LIMITED',
          429,
        );
      }
    } catch (err) {
      // Rate-limit-feil må ikke blokkere checkout — logg og gå videre.
      logger.warn('checkout rate limit error — allowing request', {
        ...serializeError(err),
      });
    }
  }

  // 2. Parse body. Defensiv mot tom/skjev body — orchestrator validerer
  //    shape via zod uansett.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('Ugyldig JSON i request-body.', 'INVALID_INPUT', 400);
  }

  // 3. Hent session — innloggede ordre får customer_id, gjester får 0.
  const session = await getSessionUser();

  // 4. Kjør orchestrator
  const result: CheckoutOrderResult = await submitCheckoutOrder(raw, {
    customerId: session?.id ?? null,
    siteUrl: clientEnv.NEXT_PUBLIC_SITE_URL,
    appVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  });

  if (!result.ok) {
    return errorResponse(result);
  }

  return NextResponse.json(
    {
      ok: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      orderKey: result.orderKey,
      status: result.status,
      total: result.total,
      currency: result.currency,
      redirectUrl: result.redirectUrl,
      cached: result.cached,
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(err: CheckoutOrderError) {
  return NextResponse.json(
    {
      ok: false,
      code: err.code,
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
    { status: err.status },
  );
}

function jsonError(
  message: string,
  code: string,
  status: number,
) {
  return NextResponse.json({ ok: false, code, error: message }, { status });
}

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}
