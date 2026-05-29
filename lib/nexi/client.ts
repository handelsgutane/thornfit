/**
 * Nexi (Nets Easy) REST-klient.
 *
 * Tynn fetch-wrapper med auth, error-mapping og typed errors. Brukes for alle
 * Nexi-API-kall — aldri direkte `fetch` mot Nexi i route-handlere.
 *
 * Auth-modell:
 *   Nexi REST krever `Authorization: <SECRET_KEY>` (RAW key, ingen Bearer-
 *   prefix). Dette står i offisiell Nexi-dokumentasjon og er det Krokedil-
 *   plugin-en bruker. Chef-storefront brukte `Bearer <key>` — det var feil.
 *
 * Endpoints (relative paths fra `/v1/`):
 *   - POST /payments — opprett payment session
 *   - GET /payments/{id} — hent payment state
 *   - PUT /payments/{id}/referenceinformation — oppdater intern reference
 *   - POST /payments/{id}/charges — capture (utføres av Krokedil-plugin)
 *   - POST /payments/{id}/cancels — kanseller før capture
 *   - POST /charges/{chargeId}/refunds — refund etter capture
 *
 * Test- vs live-endepunkt:
 *   `NEXI_ENVIRONMENT` (default `test`) bestemmer hvilken base-URL.
 *
 * Server-only.
 *
 * Se docs/plans/nexi-integration-plan.md.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { serverEnv } from '@/lib/env';

export class NexiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'NexiError';
  }
}

export class NexiNotConfiguredError extends Error {
  constructor() {
    super(
      'Nexi is not configured: NEXI_SECRET_KEY missing. Set the env-var in Vercel.',
    );
    this.name = 'NexiNotConfiguredError';
  }
}

const NEXI_LIVE_ENDPOINT = 'https://api.dibspayment.eu/v1';
const NEXI_TEST_ENDPOINT = 'https://test.api.dibspayment.eu/v1';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface NexiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** Retry-count på 5xx. Default 0 for POST (vi vil ikke duplisere charges/
   *  refunds), 2 for GET. */
  retries?: number;
  /** Optional override på timeout. Default 15s. */
  timeoutMs?: number;
}

/**
 * Returnerer base-URL'en for konfigurert Nexi-miljø. Eksportert for diagnose
 * (logging viser hvilken URL vi traff).
 */
export function getNexiBaseUrl(): string {
  return serverEnv.NEXI_ENVIRONMENT === 'live'
    ? NEXI_LIVE_ENDPOINT
    : NEXI_TEST_ENDPOINT;
}

/**
 * Returnerer nåværende environment (test/live). Bruk `clientEnv`-versjonen
 * av denne på klient-siden hvis behov, da basert på checkoutKey-en.
 */
export function getNexiEnvironment(): 'test' | 'live' {
  return serverEnv.NEXI_ENVIRONMENT;
}

/**
 * Kjør et Nexi-API-kall.
 *
 * `path` er relativ til `/v1`, f.eks. `/payments` eller `/payments/{id}/charges`.
 *
 * Kaster `NexiNotConfiguredError` hvis `NEXI_SECRET_KEY` mangler — dette er en
 * eksplisitt programmer-feil og skal ikke bli til en 500 silent.
 */
export async function nexiFetch<T>(
  path: string,
  options: NexiRequestOptions = {},
): Promise<T> {
  const secretKey = serverEnv.NEXI_SECRET_KEY;
  if (!secretKey) {
    throw new NexiNotConfiguredError();
  }

  const {
    method = 'GET',
    body,
    retries = method === 'GET' ? 2 : 0,
    timeoutMs = 15_000,
  } = options;

  const url = buildUrl(path);
  const headers: HeadersInit = {
    Authorization: secretKey,
    Accept: 'application/json',
    // Nexi anbefaler at API-konsumenter sender en identifier — det hjelper
    // dem å spore traffic per integrator i support-saker.
    commercePlatformTag: 'ThornfitNext/1.0',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errorBody = await safeReadJson(res);
        if (res.status >= 500 && attempt < retries) {
          attempt += 1;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new NexiError(
          `Nexi ${method} ${path} failed with ${res.status}`,
          res.status,
          errorBody,
        );
      }

      // 204 No Content
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (text.length === 0) return undefined as T;
      return JSON.parse(text) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof NexiError) throw err;
      // AbortError eller nettverksfeil — retry hvis vi har igjen.
      if (attempt < retries) {
        attempt += 1;
        logger.warn('nexi fetch network error, retrying', {
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

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildUrl(path: string): string {
  const base = getNexiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (text.length === 0) return null;
    return JSON.parse(text);
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
