/**
 * WooCommerce REST client.
 *
 * Thin fetch wrapper with basic auth, typed error mapping, and simple retry
 * for transient 5xx responses. Use for all Woo REST calls — never fetch Woo
 * directly in a route handler or RSC.
 *
 * See docs/integrations.md > WooCommerce.
 */

import { logger, serializeError } from '@/lib/logger';
import { serverEnv } from '@/lib/env';

export class WooError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'WooError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface WooRequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Retry count on 5xx (default 2, so max 3 attempts). */
  retries?: number;
  /** Override default cache behaviour for read-like calls. */
  cache?: RequestCache;
  /** Next.js fetch caching tags. Only used on GET requests. */
  tags?: string[];
  /** ISR revalidation hint, in seconds. */
  revalidate?: number;
}

/**
 * Call a Woo REST endpoint.
 *
 * ```ts
 * const product = await wooFetch<WooProduct>(`/wc/v3/products/${id}`);
 * ```
 *
 * Path should be relative to `/wp-json`, e.g. `/wc/v3/products/42`.
 */
export async function wooFetch<T>(path: string, options: WooRequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    query,
    body,
    retries = 2,
    cache,
    tags,
    revalidate,
  } = options;

  const url = buildUrl(path, query);
  const headers: HeadersInit = {
    Authorization: basicAuth(),
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const next: { revalidate?: number; tags?: string[] } = {};
  if (method === 'GET') {
    if (revalidate !== undefined) next.revalidate = revalidate;
    if (tags) next.tags = tags;
  }

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache,
        next: method === 'GET' && (revalidate !== undefined || tags) ? next : undefined,
      });

      if (!res.ok) {
        const errorBody = await safeReadJson(res);
        if (res.status >= 500 && attempt < retries) {
          attempt += 1;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new WooError(
          `Woo ${method} ${path} failed with ${res.status}`,
          res.status,
          errorBody,
        );
      }

      // 204 No Content
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof WooError) throw err;
      // Network error — retry a couple times.
      if (attempt < retries) {
        attempt += 1;
        logger.warn('woo fetch network error, retrying', {
          attempt,
          path,
          ...serializeError(err),
        });
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
}

function buildUrl(path: string, query?: WooRequestOptions['query']): string {
  // WC_API_URL er domenet (ikke full API-path). Vi appender /wp-json selv slik
  // at konsumentene kan skrive paths som /wc/v3/products eller /wp/v2/media
  // uten å duplikere prefixet.
  const base = serverEnv.WC_API_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}/wp-json${cleanPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function basicAuth(): string {
  const token = Buffer.from(
    `${serverEnv.WC_CONSUMER_KEY}:${serverEnv.WC_CONSUMER_SECRET}`,
  ).toString('base64');
  return `Basic ${token}`;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1000ms ...
  return 250 * 2 ** (attempt - 1);
}
