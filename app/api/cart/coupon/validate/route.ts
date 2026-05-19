/**
 * POST /api/cart/coupon/validate
 *
 * Klient sender inn en kupongkode + cart-items + eksisterende aktive
 * kuponger. Server:
 *
 *   1. Henter kupong-definisjon fra Woo (`GET /wc/v3/coupons?code=X`)
 *   2. Henter aktive bulk-rabatt-regler fra Supabase, kjører evaluator,
 *      finner bulkAppliedItemKeys (eksklusiv-stabling-policy)
 *   3. Henter category-IDer per produkt (for product_categories-matching)
 *   4. Kjører `applyCoupon` med all info
 *   5. Returnerer `AppliedCoupon` eller specific error
 *
 * Brukes av CheckoutClient når brukeren taster en rabattkode i UI.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { evaluateBulkRules } from '@/lib/cart/discounts/bulk';
import { fetchActiveBulkRules } from '@/lib/cart/discounts/fetch';
import {
  applyCoupon,
  couponErrorMessage,
  type AppliedCoupon,
  type CartItemForCoupon,
  type CouponValidationError,
} from '@/lib/cart/coupons';
import { logger, serializeError } from '@/lib/logger';
import { checkoutRateLimit } from '@/lib/redis/client';
import { getProductCategoriesByIds } from '@/lib/supabase/catalog';
import { fetchCouponByCode } from '@/lib/woo/coupons';
import { WooError } from '@/lib/woo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  items: z
    .array(
      z.object({
        /** Cart-item-key (stable identifier — bulk-evaluator referer til den). */
        key: z.string().min(1).max(128),
        productId: z.number().int().positive(),
        sku: z.string().nullable().optional(),
        quantity: z.number().int().min(1).max(99),
        unitPriceInclVat: z.number().nonnegative(),
        /** Original-pris uten salg. Hvis utelatt, antas == unitPriceInclVat. */
        regularPriceInclVat: z.number().nonnegative().optional(),
        /** Slugs brukt av bulk-evaluator. Tom array hvis ukjent. */
        categorySlugs: z.array(z.string()).default([]),
        /** Tag-slugs brukt av bulk-evaluator. Tom array hvis ukjent. */
        tagSlugs: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  /** Allerede-aktive kupong-koder på cart (for individual_use-konflikt). */
  existingActiveCouponCodes: z.array(z.string().trim().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

interface SuccessResponse {
  readonly ok: true;
  readonly applied: AppliedCoupon;
}

interface FailureResponse {
  readonly ok: false;
  readonly error: string;
  readonly code: CouponValidationError['code'] | 'INVALID_INPUT' | 'INTERNAL';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Rate-limit.
  const ip = clientIpFromHeaders(req.headers);
  if (checkoutRateLimit) {
    try {
      const { success } = await checkoutRateLimit.limit(`coupon:${ip}`);
      if (!success) {
        return jsonError(
          'For mange forsøk. Vent et øyeblikk og prøv igjen.',
          'INVALID',
          429,
        );
      }
    } catch (err) {
      logger.warn('coupon-validate rate limit error — allowing', {
        ...serializeError(err),
      });
    }
  }

  // 2. Parse body.
  let parsed: z.infer<typeof InputSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = InputSchema.safeParse(raw);
    if (!result.success) {
      return jsonError(
        result.error.issues[0]?.message ?? 'Ugyldig forespørsel.',
        'INVALID_INPUT',
        400,
      );
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig JSON i request-body.', 'INVALID_INPUT', 400);
  }

  // 3. Hent kupong fra Woo.
  let coupon;
  try {
    coupon = await fetchCouponByCode(parsed.code);
  } catch (err) {
    if (err instanceof WooError) {
      logger.error('coupon-validate: Woo error', {
        code: parsed.code,
        wooStatus: err.status,
      });
      return jsonError(
        'Vi kan ikke validere rabattkoden akkurat nå. Prøv igjen om litt.',
        'INTERNAL',
        503,
      );
    }
    logger.error('coupon-validate: unexpected error', {
      code: parsed.code,
      ...serializeError(err),
    });
    return jsonError('Noe gikk galt. Prøv igjen.', 'INTERNAL', 500);
  }

  if (!coupon) {
    return jsonError(
      couponErrorMessage({ code: 'NOT_FOUND' }),
      'NOT_FOUND',
      404,
    );
  }

  // 4. Hent kategori-IDer per produkt (for product_categories-filtering).
  //    Server-authoritative slik at klient ikke kan lyve om kategorier.
  const productIds = parsed.items.map((i) => i.productId);
  let categoriesByProductId: Map<number, ReadonlyArray<number>>;
  try {
    categoriesByProductId = await getProductCategoriesByIds(productIds);
  } catch (err) {
    logger.warn(
      'coupon-validate: failed to fetch product categories, treating as empty',
      { ...serializeError(err) },
    );
    categoriesByProductId = new Map();
  }

  // 5. Bygg CartItemForCoupon-array (med kategori-IDer fylt inn).
  const cartItems: CartItemForCoupon[] = parsed.items.map((i) => ({
    key: i.key,
    productId: i.productId,
    quantity: i.quantity,
    unitPriceInclVat: i.unitPriceInclVat,
    regularPriceInclVat: i.regularPriceInclVat ?? i.unitPriceInclVat,
    categoryIds: categoriesByProductId.get(i.productId) ?? [],
  }));

  // 6. Kjør bulk-evaluator → finn bulkAppliedItemKeys.
  //    Eksklusiv-stabling-policy: bulk-rabatterte items utelukkes fra
  //    kupong-base.
  let bulkAppliedItemKeys: Set<string>;
  try {
    const bulkRules = await fetchActiveBulkRules();
    const bulkResult = evaluateBulkRules(
      bulkRules,
      parsed.items.map((i) => ({
        key: i.key,
        productId: i.productId,
        sku: i.sku ?? null,
        quantity: i.quantity,
        unitPrice: i.unitPriceInclVat,
        categorySlugs: [...i.categorySlugs],
        tagSlugs: [...i.tagSlugs],
      })),
    );
    bulkAppliedItemKeys = new Set(bulkResult.map((d) => d.itemKey));
  } catch (err) {
    // Hvis bulk-fetch feiler, fortsetter vi med tom set (ingen bulk-eksklusjon).
    // Det er sikrere enn å avvise kupongen pga. infrastruktur-feil.
    logger.warn(
      'coupon-validate: bulk-evaluator failed, treating as no bulk applied',
      { ...serializeError(err) },
    );
    bulkAppliedItemKeys = new Set();
  }

  // 7. Kjør coupon-evaluator.
  const result = applyCoupon({
    coupon,
    items: cartItems,
    bulkAppliedItemKeys,
    existingActiveCouponCodes: parsed.existingActiveCouponCodes,
    now: new Date(),
  });

  // 8. Discriminate response.
  if ('discountInclVat' in result) {
    const success: SuccessResponse = { ok: true, applied: result };
    return NextResponse.json(success, { status: 200 });
  }

  // Status-koder per error-type. NOT_FOUND → 404, ellers 400.
  const status = result.code === 'NOT_FOUND' ? 404 : 400;
  return jsonError(couponErrorMessage(result), result.code, status);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(
  message: string,
  code: FailureResponse['code'],
  status: number,
): NextResponse {
  const body: FailureResponse = { ok: false, error: message, code };
  return NextResponse.json(body, { status });
}

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}
