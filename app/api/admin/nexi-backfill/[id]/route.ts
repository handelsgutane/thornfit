/**
 * POST /api/admin/nexi-backfill/[id]
 *
 * Engangs-fix for Nexi-ordrer som ble opprettet før vi visste at
 * `transaction_id` på Woo-ordren må være satt (Krokedil-plugin-en's
 * capture-handler leser den, ikke `_dibs_payment_id`-meta).
 *
 * Tar et Woo-order-id, slår opp `_dibs_payment_id` på ordren, henter
 * payment-detaljene fra Nexi, og PUT'er Woo-ordren med `transaction_id`
 * + `dibs_payment_method`/`dibs_payment_type`/`dibs_customer_card` slik at
 * plugin-ens capture-flyt fungerer.
 *
 * Kreves admin-rolle. Idempotent — trygt å kjøre flere ganger.
 *
 * Bruk:
 *   curl -X POST https://www.skarpekniver.com/api/admin/nexi-backfill/435945 \
 *        -H "Cookie: <admin-session-cookies>"
 */

import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';
import { nexiFetch, NexiError } from '@/lib/nexi/client';
import { wooFetch, WooError } from '@/lib/woo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ADMIN_ROLES = new Set(['administrator', 'shop_manager']);

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface WooOrderResponse {
  readonly id: number;
  readonly status: string;
  readonly transaction_id?: string;
  readonly meta_data?: ReadonlyArray<{ key?: string; value?: unknown }>;
}

interface NexiPaymentDetailsResponse {
  readonly payment?: {
    readonly paymentDetails?: {
      readonly paymentMethod?: string;
      readonly paymentType?: string;
      readonly cardDetails?: { readonly maskedPan?: string };
    };
    readonly summary?: {
      readonly reservedAmount?: number;
      readonly chargedAmount?: number;
    };
  };
}

export async function POST(req: Request, context: RouteContext) {
  // 1. Auth — admin only
  const session = await getSessionUser();
  if (!session) return jsonError('Du må være innlogget.', 401);
  const isAdmin = session.roles.some((r) => ADMIN_ROLES.has(r));
  if (!isAdmin) return jsonError('Krever admin-rolle.', 403);

  // 2. Parse params
  const { id: idParam } = await context.params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonError('Ugyldig ordre-ID.', 400);
  }

  try {
    // 3. Fetch Woo order
    const order = await wooFetch<WooOrderResponse>(
      `/wc/v3/orders/${orderId}`,
      { cache: 'no-store' },
    );
    const paymentId = readMeta(order, '_dibs_payment_id');
    if (!paymentId) {
      return jsonError(
        'Ordren har ikke `_dibs_payment_id`-meta — er det en Nexi-ordre?',
        400,
      );
    }

    // 4. Fetch Nexi payment details
    let paymentMethod = '';
    let paymentType = '';
    let maskedPan: string | undefined;
    try {
      const detail = await nexiFetch<NexiPaymentDetailsResponse>(
        `/payments/${paymentId}`,
      );
      const d = detail.payment?.paymentDetails;
      if (d) {
        paymentMethod = d.paymentMethod ?? '';
        paymentType = d.paymentType ?? '';
        maskedPan = d.cardDetails?.maskedPan;
      }
    } catch (err) {
      if (err instanceof NexiError) {
        return jsonError(
          `Nexi avslo GET /payments/${paymentId}: ${err.status}`,
          502,
        );
      }
      throw err;
    }

    // 5. PUT Woo order with transaction_id + meta
    await wooFetch(`/wc/v3/orders/${orderId}`, {
      method: 'PUT',
      body: {
        transaction_id: paymentId,
        meta_data: mergeMeta(order.meta_data ?? [], [
          ...(paymentMethod
            ? [{ key: 'dibs_payment_method', value: paymentMethod }]
            : []),
          ...(paymentType
            ? [{ key: 'dibs_payment_type', value: paymentType }]
            : []),
          ...(maskedPan
            ? [{ key: 'dibs_customer_card', value: maskedPan }]
            : []),
          { key: '_dibs_backfilled_at', value: new Date().toISOString() },
        ]),
      },
    });

    logger.info('nexi-backfill: order updated', {
      orderId,
      paymentId,
      paymentMethod,
      paymentType,
      adminUserId: session.id,
    });

    return NextResponse.json(
      {
        ok: true,
        orderId,
        transaction_id: paymentId,
        dibs_payment_method: paymentMethod,
        dibs_payment_type: paymentType,
        previousTransactionId: order.transaction_id ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof WooError) {
      logger.error('nexi-backfill: Woo error', {
        orderId,
        wooStatus: err.status,
        wooBody: err.body,
      });
      return jsonError(`Woo error: ${err.status}`, 502);
    }
    logger.error('nexi-backfill: unexpected error', {
      orderId,
      ...serializeError(err),
    });
    return jsonError('Intern feil — sjekk Vercel-logs.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function readMeta(order: WooOrderResponse, key: string): string | null {
  const found = order.meta_data?.find((m) => m.key === key);
  if (!found || typeof found.value !== 'string') return null;
  return found.value;
}

interface WooMetaItem {
  readonly key?: string;
  readonly value?: unknown;
}

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
