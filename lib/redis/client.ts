/**
 * Upstash Redis singleton + cache-helpers.
 *
 * Upstash bruker stateless HTTP, så samme instans er trygg i både Edge- og
 * Node-runtime, og på tvers av serverless-invocations.
 *
 * Graceful degradation: hvis `UPSTASH_REDIS_REST_URL` / `_TOKEN` ikke er satt,
 * returnerer `getRedis()` `null`. `cacheGet()` faller da tilbake til fetcher
 * uten cache, og `cacheInvalidate()` er en no-op. Dette lar preview-deploys
 * uten Redis fortsatt kjøre fullt funksjonelt — bare uten cache-lag.
 *
 * Bruk:
 * ```ts
 * import { cacheGet, cacheInvalidate } from '@/lib/redis/client';
 *
 * const product = await cacheGet(
 *   `catalog:v1:product:${slug}`,
 *   () => fetchProduct(slug),
 *   300,
 * );
 * await cacheInvalidate(`catalog:v1:product:${slug}`);
 * ```
 *
 * Se docs/integrations.md → Upstash Redis.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';

const url = serverEnv.UPSTASH_REDIS_REST_URL;
const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;

const client: Redis | null =
  url && token ? new Redis({ url, token }) : null;

if (!client) {
  logger.warn('Upstash Redis not configured — cache helpers will no-op', {
    hint: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable cache',
  });
}

/**
 * Returns the Redis client, or `null` hvis Upstash-env ikke er satt.
 * Konsumenter må håndtere null. For vanlig cache-bruk, foretrekk `cacheGet`
 * og `cacheInvalidate` som håndterer null internt.
 */
export function getRedis(): Redis | null {
  return client;
}

export function isRedisConfigured(): boolean {
  return client !== null;
}

/**
 * Rate limiters. `null` hvis Redis ikke er konfigurert — kalleren må
 * bypasse rate limit eller avslå requesten.
 */
export const checkoutRateLimit = client
  ? new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: true,
      prefix: 'rl:checkout',
    })
  : null;

export const authRateLimit = client
  ? new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      analytics: true,
      prefix: 'rl:auth',
    })
  : null;

/**
 * Cache-aside-helper. Hvis Redis er konfigurert, sjekkes cache først;
 * ellers kalles fetcher direkte. Feil mot Redis (timeout, nettverksfeil)
 * logges som warn og fetcher kalles — cache skal aldri bryte applikasjonen.
 *
 * TTL er i sekunder. Vurder å bruke en lav TTL (300s) hvis invalidering er
 * best-effort, eller høy TTL (3600s+) hvis du har pålitelig invalidering
 * via webhooks.
 */
export async function cacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  if (!client) return fetcher();

  try {
    const cached = await client.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch (err) {
    logger.warn('redis get failed — falling back to fetcher', {
      key,
      ...serializeError(err),
    });
    return fetcher();
  }

  const fresh = await fetcher();
  try {
    // Upstash REST-klienten serialiserer non-string verdier til JSON automatisk.
    await client.set(key, fresh as unknown as string, { ex: ttlSeconds });
  } catch (err) {
    logger.warn('redis set failed — returning fresh value anyway', {
      key,
      ...serializeError(err),
    });
  }
  return fresh;
}

/**
 * Delete én eller flere nøkler. No-op hvis Redis ikke er konfigurert.
 */
export async function cacheInvalidate(keys: string | string[]): Promise<void> {
  if (!client) return;
  const arr = Array.isArray(keys) ? keys : [keys];
  if (arr.length === 0) return;

  try {
    await client.del(...arr);
  } catch (err) {
    logger.warn('redis del failed', { keys: arr, ...serializeError(err) });
  }
}
