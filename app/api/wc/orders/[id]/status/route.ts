/**
 * PATCH /api/wc/orders/[id]/status
 *
 * Admin-flow for å oppdatere status på en eksisterende Woo-ordre. Lar oss
 * bygge interne admin-verktøy uten å gå via wp-admin. Per nå brukes den i
 * praksis primært for testing og scripts; senere kan den utvides til å
 * akseptere status-overganger fra interne integrasjoner (Tripletex,
 * lager-system osv.).
 *
 * Sikkerhet:
 *   - Krever innlogget bruker med rollen `administrator` eller `shop_manager`.
 *     Andre brukere får 403 — vi vil ikke at vanlige kunder skal kunne flytte
 *     ordre selv (avbestilling går via egen flyt med verifiseringskrav).
 *   - Validerer status mot Woos lukkede sett (pending/processing/on-hold/
 *     completed/cancelled/refunded/failed).
 *   - Rate-limiter per IP for å hindre at en kompromittert admin-konto kan
 *     mass-mutere ordre.
 *
 * Klient-payload:
 *   `{ "status": "processing" }`
 *
 * Returnerer:
 *   200 `{ ok: true, orderId, status, total }` ved suksess.
 *   400 ved ugyldig status.
 *   401 hvis ikke innlogget.
 *   403 hvis innlogget men uten admin-rolle.
 *   404 hvis ordren ikke finnes.
 *   429 ved rate-limit.
 *   502 hvis Woo svarer feil.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionUser } from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';
import { checkoutRateLimit } from '@/lib/redis/client';
import { WooError } from '@/lib/woo/client';
import {
  isWooOrderStatus,
  updateWooOrderStatus,
  WOO_ORDER_STATUSES,
} from '@/lib/woo/order-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ADMIN_ROLES = new Set(['administrator', 'shop_manager']);

const BodySchema = z.object({
  status: z.string().refine(isWooOrderStatus, {
    message: `Status må være en av: ${WOO_ORDER_STATUSES.join(', ')}.`,
  }),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  // 1. Auth — må være innlogget og admin.
  const session = await getSessionUser();
  if (!session) {
    return jsonError('Du må være innlogget.', 401);
  }
  const isAdmin = session.roles.some((r) => ADMIN_ROLES.has(r));
  if (!isAdmin) {
    return jsonError('Du har ikke tilgang til denne handlingen.', 403);
  }

  // 2. Rate limit — selv admins kan ramle inn i en bug og mass-PATCHe.
  const ip = clientIpFromHeaders(req.headers);
  if (checkoutRateLimit) {
    try {
      const { success } = await checkoutRateLimit.limit(`admin:${ip}`);
      if (!success) {
        return jsonError(
          'For mange forespørsler. Vent et øyeblikk og prøv igjen.',
          429,
        );
      }
    } catch (err) {
      logger.warn('order-status rate limit error — allowing request', {
        ...serializeError(err),
      });
    }
  }

  // 3. Parse params + body
  const { id: idParam } = await context.params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonError('Ugyldig ordre-ID.', 400);
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig JSON i request-body.', 400);
  }

  // 4. Kall Woo
  try {
    const updated = await updateWooOrderStatus(orderId, parsed.status);

    logger.info('order-status updated', {
      orderId,
      newStatus: parsed.status,
      adminUserId: session.id,
    });

    return NextResponse.json(
      {
        ok: true,
        orderId: updated.id,
        status: updated.status,
        total: updated.total,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof WooError) {
      logger.warn('order-status update failed', {
        orderId,
        wooStatus: err.status,
      });
      if (err.status === 404) {
        return jsonError('Ordren finnes ikke.', 404);
      }
      return jsonError('Kunne ikke oppdatere ordre-status.', 502);
    }

    logger.error('order-status unexpected error', {
      orderId,
      ...serializeError(err),
    });
    return jsonError('Noe gikk galt. Prøv igjen om litt.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}
