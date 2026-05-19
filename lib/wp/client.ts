/**
 * WordPress REST-klient.
 *
 * Tynn fetch-wrapper foran `/wp-json/wp/v2/*`-endpunktene med Application
 * Password-auth. Brukes for blogg-innhold (posts, kategorier, tags, brukere).
 *
 * Skiller seg fra `lib/woo/client.ts`:
 *   - Auth: WP App Password (admin-bruker), ikke WC ck/cs-keys
 *   - Path: /wp-json/wp/v2/...   (ikke /wp-json/wc/v3/...)
 *
 * Begge klienter peker på samme WP-installasjon (skarpekniver.com), men WP
 * REST og WC REST har separate auth-systemer som ikke kan blandes.
 */

import { logger, serializeError } from '@/lib/logger';
import { serverEnv } from '@/lib/env';

export class WpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'WpError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface WpRequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Retry-count på 5xx (default 2 → maks 3 forsøk). */
  retries?: number;
  cache?: RequestCache;
  tags?: string[];
  revalidate?: number;
}

/**
 * Kall et WP REST-endepunkt. Path skal være relativt `/wp-json`,
 * f.eks. `/wp/v2/posts/42`.
 *
 * ```ts
 * const post = await wpFetch<WpPost>(`/wp/v2/posts/${id}`);
 * ```
 */
export async function wpFetch<T>(
  path: string,
  options: WpRequestOptions = {},
): Promise<T> {
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
        throw new WpError(
          `WP ${method} ${path} failed with ${res.status}`,
          res.status,
          errorBody,
        );
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof WpError) throw err;
      if (attempt < retries) {
        attempt += 1;
        logger.warn('wp fetch network error, retrying', {
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

function buildUrl(path: string, query?: WpRequestOptions['query']): string {
  // WC_API_URL er domenet (ikke full API-path) — vi gjenbruker det her siden
  // WP og WC ligger på samme installasjon. Hvis vi noensinne splitter, lag
  // egen WP_API_URL i env.
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
  // WP Application Passwords aksepterer Basic Auth med admin-brukernavn +
  // app-password (ikke vanlig passord). Mellomrom i app-passordet beholdes.
  const token = Buffer.from(
    `${serverEnv.WP_ADMIN_USERNAME}:${serverEnv.WP_ADMIN_APP_PASSWORD}`,
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
  return 250 * 2 ** (attempt - 1);
}
