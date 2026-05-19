/**
 * GET /api/auth/me
 *
 * Server-side bekreftelse på at nåværende WP-auth-cookie fortsatt er gyldig.
 * Proxyer `GET /wp-json/chef/v1/me` med brukerens cookies vedlagt.
 *
 * Returnerer:
 *   - 200 `{ ok: true, user: {...} }` når pålogget
 *   - 401 `{ ok: false }`              når ikke pålogget / utløpt cookie
 *   - 503 `{ ok: false, error: ... }`  når WP er nede eller pluginen mangler
 *
 * Brukes av UI-komponenter som må verifisere session ved navigasjon (f.eks.
 * en "Min side"-header som viser kontoinfo), og potensielt av middleware
 * ved første cold-load etter deploy.
 */

import { NextResponse } from 'next/server';

import { wooMe, WooAuthError } from '@/lib/woo/auth';
import { getWpCookieHeader } from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  const cookieHeader = await getWpCookieHeader();
  if (!cookieHeader) {
    // Ingen WP-cookie i jaren → klart ikke pålogget.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const user = await wooMe(cookieHeader);
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: user.roles,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof WooAuthError) {
      if (err.code === 'plugin_missing') {
        return NextResponse.json(
          { ok: false, error: 'Auth-endepunkt ikke tilgjengelig.' },
          { status: 503 },
        );
      }
      if (err.code === 'network_error') {
        return NextResponse.json(
          { ok: false, error: 'Kunne ikke nå serveren.' },
          { status: 503 },
        );
      }
    }
    logger.error('auth /me unexpected error', { ...serializeError(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
