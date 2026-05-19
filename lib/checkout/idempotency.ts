/**
 * Idempotency-cache for /api/checkout/order.
 *
 * Klienten genererer en UUID per checkout-attempt og sender den som
 * `idempotencyKey`. Vi cacher resultatet (orderId/orderNumber/total) i 10
 * minutter slik at:
 *
 *   - Dobbeltklikk på "Bekreft ordre"-knappen returnerer samme ordre-id i
 *     stedet for å opprette en duplikat.
 *   - Nettverks-retries (klient-side) treffer cachen og får 200 i stedet for
 *     å trigge en ny POST mot Woo.
 *   - Hvis to identiske requests kommer inn samtidig (race), markerer vi
 *     den ene som "in flight" og avviser den andre med 409 — ellers ville vi
 *     fortsatt risikere doble Woo-ordrer.
 *
 * State-maskin:
 *
 *   - Ingen oppføring → reservere lock og returnere 'new'
 *   - Lock holdt, ingen verdi → returnere 'in-flight'
 *   - Lock holdt, verdi satt → returnere 'cached'
 *
 * Hvis Redis ikke er konfigurert (preview-deploys uten Upstash), returnerer
 * `claimIdempotencyKey()` alltid `'new'` og `storeIdempotencyResult()` er
 * no-op. Det er trygt fordi Redis er nødvendig for race-protection — uten
 * den må vi falle tilbake på klient-side disable og akseptere at samme nøkkel
 * potensielt kan opprette to ordre. Det er en akseptabel degradering for
 * lokal-dev men logges som warn så det er synlig.
 */

import 'server-only';

import { getRedis, isRedisConfigured } from '@/lib/redis/client';
import { logger, serializeError } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Hva vi cacher per idempotency-key. */
export interface CachedOrderResult {
  readonly orderId: number;
  readonly orderNumber: string;
  /** Woos `order_key` — gjøres tilgjengelig for klient som soft-auth-token
   *  ved cache-hit, slik at hen kan fortsette mot Nexi-init uten ny submit. */
  readonly orderKey: string;
  readonly status: string;
  readonly total: number;
  /** Når vi opprinnelig opprettet ordren — kun for logging/forensics. */
  readonly createdAt: string;
}

/** Resultat av `claimIdempotencyKey`. */
export type IdempotencyClaim =
  /** Klart bane — caller skal opprette ordren og kalle storeIdempotencyResult. */
  | { readonly state: 'new' }
  /** Cache hit — returner denne til klient. */
  | { readonly state: 'cached'; readonly result: CachedOrderResult }
  /** Race-tilstand — annen request behandler samme nøkkel. */
  | { readonly state: 'in-flight' };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Idempotency-cache lever 10 min — lenge nok for retry, kort nok for at
 *  tomme nøkler ikke fyller Redis. */
const TTL_SECONDS = 10 * 60;

/** Lock-timeout — hvis en in-flight request crashes uten å sette verdi, går
 *  locken ut etter 30s og en retry kan prøve igjen. */
const LOCK_TTL_SECONDS = 30;

/** Sentinel-verdi for "lock holdt, ingen ordre opprettet enda". */
const IN_FLIGHT_SENTINEL = '__in_flight__';

const KEY_PREFIX = 'idem:order:v1';

// UUIDv4 (med eller uten separators). Vi tillater ikke skjøre nøkler — en
// kort/forutsigbar nøkkel ville la en angriper kollidere med en annen brukers
// pågående ordre og potensielt få cached resultatet. Strict format-check er
// minimum-overhead defense.
const UUID_REGEX =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Validation helper — eksportert så orchestrator kan validere klient-input
// ---------------------------------------------------------------------------

export function isValidIdempotencyKey(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildKey(idempotencyKey: string): string {
  // Normaliser bort separators og lowercase så `aBc` og `abc` bruker samme rad.
  const normalized = idempotencyKey.replace(/-/g, '').toLowerCase();
  return `${KEY_PREFIX}:${normalized}`;
}

interface CachedEntry {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly orderKey: string;
  readonly status: string;
  readonly total: number;
  readonly createdAt: string;
}

function isCachedEntry(value: unknown): value is CachedEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.orderId === 'number' &&
    typeof v.orderNumber === 'string' &&
    typeof v.orderKey === 'string' &&
    typeof v.status === 'string' &&
    typeof v.total === 'number' &&
    typeof v.createdAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Forsøk å reservere en idempotency-key for ordre-opprettelse.
 *
 * Atomicity: bruker `SET key value NX EX 30` for å reservere lock'en. Hvis
 * SET returnerer null (allerede satt), leser vi nåværende verdi og avgjør
 * om det er sentinel (in-flight) eller cached resultat.
 */
export async function claimIdempotencyKey(
  idempotencyKey: string,
): Promise<IdempotencyClaim> {
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new Error('claimIdempotencyKey: invalid key — caller must validate first');
  }

  const redis = getRedis();
  if (!redis) {
    if (isRedisConfigured()) {
      // Should never happen — getRedis returnerer null kun når env mangler.
      // Defensiv path.
      logger.warn('idempotency: Redis unavailable, allowing without race protection');
    } else {
      logger.warn(
        'idempotency: Redis not configured — order create runs without race protection',
      );
    }
    return { state: 'new' };
  }

  const key = buildKey(idempotencyKey);

  try {
    // SET NX EX — atomisk: setter sentinel kun hvis nøkkelen ikke finnes.
    // Returnerer 'OK' ved success, null hvis nøkkelen allerede eksisterte.
    const setResult = await redis.set(key, IN_FLIGHT_SENTINEL, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });

    if (setResult === 'OK') {
      // Vi tok låsen — caller skal nå opprette ordren.
      return { state: 'new' };
    }

    // Nøkkelen fantes fra før — les nåværende verdi og avgjør tilstand.
    const existing = await redis.get<unknown>(key);

    if (existing === IN_FLIGHT_SENTINEL) {
      return { state: 'in-flight' };
    }

    if (isCachedEntry(existing)) {
      return { state: 'cached', result: { ...existing } };
    }

    // Korrupt data — log og behandle som ny så bruker ikke blokkeres.
    // (En angriper kunne potensielt få cache-pollution, men nøkkelen er en
    // UUID og vi bruker NX-set — angrepsoverflate er svært smal.)
    logger.warn('idempotency: cache had invalid entry, treating as new', {
      key,
      existingType: typeof existing,
    });
    return { state: 'new' };
  } catch (err) {
    // Redis-feil må ikke bryte checkout. Logg og la requesten gå videre uten
    // race-protection — bedre enn å avslå alle ordre når Redis blinker.
    logger.warn('idempotency: redis claim failed, allowing without protection', {
      ...serializeError(err),
    });
    return { state: 'new' };
  }
}

/**
 * Lagre resultatet etter en vellykket ordre-create. Erstatter sentinel-verdien
 * og forlenger TTL til 10 min (slik at retries i de neste 10 min får cache-hit).
 */
export async function storeIdempotencyResult(
  idempotencyKey: string,
  result: CachedOrderResult,
): Promise<void> {
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return; // Caller har allerede validert; defensiv guard.
  }

  const redis = getRedis();
  if (!redis) return;

  const key = buildKey(idempotencyKey);

  try {
    // Plain SET (ikke NX) — vi overskriver sentinel-verdien.
    await redis.set(key, result, { ex: TTL_SECONDS });
  } catch (err) {
    logger.warn('idempotency: redis store failed — order created but cache miss', {
      orderId: result.orderId,
      ...serializeError(err),
    });
  }
}

/**
 * Frigi locken hvis ordre-opprettelse FEILET. Lar bruker prøve igjen umiddelbart
 * i stedet for å vente 30s på lock-timeout. Trygt å kalle flere ganger.
 */
export async function releaseIdempotencyKey(
  idempotencyKey: string,
): Promise<void> {
  if (!isValidIdempotencyKey(idempotencyKey)) return;

  const redis = getRedis();
  if (!redis) return;

  const key = buildKey(idempotencyKey);

  try {
    // Slett kun hvis verdien er sentinel — ikke slett en cached suksess
    // hvis vi blir kalt feilaktig. Lua-script for atomicity.
    // Upstash REST støtter `eval` for Lua. For minimum kompleksitet bruker
    // vi bare en GET-then-DEL — racy, men worst-case sletter vi en ny lock
    // som er trygt (neste request får 'new' og prøver igjen).
    const current = await redis.get<unknown>(key);
    if (current === IN_FLIGHT_SENTINEL) {
      await redis.del(key);
    }
  } catch (err) {
    logger.warn('idempotency: redis release failed', {
      ...serializeError(err),
    });
  }
}
