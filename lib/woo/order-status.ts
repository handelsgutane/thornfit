/**
 * WooCommerce order status update primitive.
 *
 * Brukes av admin-flow `PATCH /api/wc/orders/[id]/status`. Når NEXI senere
 * wires, vil betalings-webhooken også kalle denne (server-side, fra
 * `/api/webhooks/nexi`) for å flytte ordren fra `pending` → `processing`.
 *
 * Server-only.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import type { OrderStatus } from '@/types/order';
import { wooFetch, WooError } from './client';

/** Alle Woos default ordre-statuser. Holdes som tuple for type-narrowing. */
export const WOO_ORDER_STATUSES = [
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
] as const satisfies ReadonlyArray<OrderStatus>;

export type WooOrderStatus = (typeof WOO_ORDER_STATUSES)[number];

export function isWooOrderStatus(value: string): value is WooOrderStatus {
  return (WOO_ORDER_STATUSES as ReadonlyArray<string>).includes(value);
}

/** Subset av PUT-responsen vi bryr oss om. */
export interface UpdatedWooOrder {
  readonly id: number;
  readonly status: string;
  readonly total: number;
}

interface WcUpdatedOrderRaw {
  readonly id?: number;
  readonly status?: string;
  readonly total?: string;
}

/**
 * Oppdater status på en eksisterende Woo-ordre.
 *
 * Idempotent — Woo aksepterer å sette samme status uten å feile. Caller bør
 * fortsatt unngå unødvendige round-trips ved å sjekke nåværende status først.
 *
 * @throws {WooError} på 4xx/5xx fra Woo. Caller mapper til HTTP-respons.
 */
export async function updateWooOrderStatus(
  orderId: number,
  status: WooOrderStatus,
): Promise<UpdatedWooOrder> {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error(`updateWooOrderStatus: invalid orderId ${orderId}`);
  }

  try {
    const raw = await wooFetch<WcUpdatedOrderRaw>(`/wc/v3/orders/${orderId}`, {
      method: 'PUT',
      body: { status },
      retries: 1, // status-updates er trygge å retrye — idempotent på Woo-siden.
    });

    return {
      id: raw.id ?? orderId,
      status: raw.status ?? status,
      total: raw.total !== undefined ? Number(raw.total) : 0,
    };
  } catch (err) {
    if (err instanceof WooError) {
      logger.error('updateWooOrderStatus failed', {
        orderId,
        status,
        wooStatus: err.status,
      });
    }
    throw err;
  }
}
