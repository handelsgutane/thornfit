/**
 * Postnummer-lookup via Bring postalCode-API.
 *
 * Serverside proxy så vi:
 *   - Slipper CORS-issue fra klient (Bring tillater cross-origin, men vi vil ikke
 *     være avhengig av at det fortsetter).
 *   - Kan caches i Redis (postnumre endrer seg svært sjelden — 30 dagers TTL).
 *   - Logger usage via vår eksisterende logger.
 *   - Validerer input før vi rør Bring (4-siffer-postnummer).
 *
 * Endepunkt: GET /api/postal-lookup?postnr=0191
 * Response:  { valid: true, city: 'OSLO' } | { valid: false }
 */

import { NextResponse } from 'next/server';

import { logger, serializeError } from '@/lib/logger';
import { cacheGet } from '@/lib/redis/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BringResponse {
  postalCodeType?: string;
  result?: string;
  valid?: boolean;
}

interface PostalLookupResult {
  valid: boolean;
  city: string | null;
}

const CACHE_KEY_PREFIX = 'postal:no:v1:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dager

/** Norsk postnummer er nøyaktig 4 siffer. */
const POSTAL_CODE_REGEX = /^\d{4}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('postnr') ?? '').trim();

  if (!POSTAL_CODE_REGEX.test(raw)) {
    return NextResponse.json(
      { valid: false, city: null, error: 'invalid_postcode' },
      { status: 400 },
    );
  }

  try {
    const result = await cacheGet<PostalLookupResult>(
      `${CACHE_KEY_PREFIX}${raw}`,
      () => fetchFromBring(raw),
      CACHE_TTL_SECONDS,
    );
    return NextResponse.json(result);
  } catch (err) {
    logger.error('postal-lookup failed', { postnr: raw, ...serializeError(err) });
    return NextResponse.json(
      { valid: false, city: null, error: 'lookup_failed' },
      { status: 502 },
    );
  }
}

async function fetchFromBring(postnr: string): Promise<PostalLookupResult> {
  const url =
    `https://api.bring.com/shippingguide/api/postalCode.json` +
    `?clientUrl=skarpekniver.com&country=no&pnr=${encodeURIComponent(postnr)}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`bring postalCode lookup failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as BringResponse;
  return {
    valid: !!data.valid,
    city:
      typeof data.result === 'string' && data.result.length > 0
        ? data.result
        : null,
  };
}
