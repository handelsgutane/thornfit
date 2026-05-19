/**
 * Cron endpoint authorization.
 *
 * Vercel cron-jobber treffer API-endepunktene våre med `x-vercel-cron: 1`-
 * headeren. Manuelle kall (kjørt fra CLI eller `curl` under debugging) må
 * sende `CRON_SECRET` i `Authorization: Bearer …` eller som `?secret=…`-
 * query param.
 *
 * Returnerer `true` hvis request er autorisert. Bruk `timingSafeEqual` for å
 * unngå timing-attacks ved secret-sammenligning.
 *
 * Bruk:
 * ```ts
 * export async function GET(request: Request) {
 *   if (!authorizeCron(request)) {
 *     return new Response('Unauthorized', { status: 401 });
 *   }
 *   // ...
 * }
 * ```
 */

import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';

export function authorizeCron(request: Request): boolean {
  // Vercel setter denne headeren på alle cron-invokasjoner.
  if (request.headers.get('x-vercel-cron') === '1') {
    return true;
  }

  const provided = extractSecret(request);
  if (!provided) return false;

  return safeEqual(provided, serverEnv.CRON_SECRET);
}

function extractSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const url = new URL(request.url);
  const queryParam = url.searchParams.get('secret');
  if (queryParam) return queryParam;

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
