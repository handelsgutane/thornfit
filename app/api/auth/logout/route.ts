/**
 * POST /api/auth/logout
 *
 * Tøm WP-auth-cookies på frontend-domenet og kaller `POST /chef/v1/logout`
 * på WP (best-effort — hvis WP er nede tømmer vi cookies lokalt uansett).
 *
 * Vi aksepterer kun POST for å unngå utilsiktet logout via prefetch
 * (Next.js prefetcher ikke non-GET-routes).
 */

import { NextResponse } from 'next/server';

import { wooLogout } from '@/lib/woo/auth';
import {
  clearAllAuthCookies,
  getWpCookieHeader,
} from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST() {
  // Hent cookies FØR vi tømmer dem, så vi kan forwarde dem til WP.
  const cookieHeader = await getWpCookieHeader();

  try {
    if (cookieHeader) {
      await wooLogout(cookieHeader);
    }
  } catch (err) {
    // Best-effort — vi tømmer lokalt uansett.
    logger.warn('woo logout error — proceeding with local clear', {
      ...serializeError(err),
    });
  }

  await clearAllAuthCookies();
  logger.info('auth logout');
  return new NextResponse(null, { status: 204 });
}
