/**
 * Cache-lag for katalog-oppslag (kategori/produkt by slug).
 *
 * Strategi:
 *   - **Cache-aside** via `cacheGet`: Redis sjekkes først, Supabase
 *     konsulteres bare ved miss. Resultatet skrives tilbake til Redis.
 *   - **Eksplisitt invalidering** fra webhook-handleren ved product.*- og
 *     product_category.*-events. Cron er sikkerhetsnett.
 *   - **TTL** er generøs (1 time). Webhook er primær invalideringspath;
 *     TTL er kun backstop hvis en webhook går tapt.
 *
 * Nøkkel-format:
 *   `cat:v1:category:<slug>` → `Tables<'categories'>` | null-sentinel
 *   `cat:v1:product:<slug>`  → `CatalogProductDetail` | null-sentinel
 *
 * Versjonering via `v1`-prefiks — hvis vi endrer cached shape, bump til `v2`
 * og gamle nøkler utløper naturlig via TTL.
 *
 * Null-sentinel: Redis kan ikke skille "ikke i cache" fra "cached null".
 * Vi lagrer `NEGATIVE_CACHE_SENTINEL` for slug-er som ikke finnes i DB, slik
 * at repeterte 404-er ikke hamrer Supabase. Sentinel har kortere TTL (60s)
 * så nyopprettede entiteter synes raskt.
 *
 * For negativ cache må invalideringen skje på BÅDE kategori- og produkt-
 * nøkkelen ved create (webhooken vet ikke hva som tidligere var cached).
 */

import { cacheGet, cacheInvalidate } from '@/lib/redis/client';
import {
  type CatalogProductDetail,
  getCategoryBySlug,
  getProductBySlug,
} from '@/lib/supabase/catalog';
import type { Tables } from '@/types/supabase';

// ---------- Keys & constants ----------------------------------------------

// Bumpet fra v1 → v2 2026-04-23 da `CatalogProductDetail` fikk `categoryPaths`
// og `primaryCategoryPath` (ADR-0007 nested paths). Gamle v1-entries utløper
// naturlig via TTL og blir ikke feilaktig deserialisert som ny shape.
const KEY_VERSION = 'v2';
const POSITIVE_TTL_SECONDS = 3600; // 1 time
// Negativ-TTL per-verdi støttes ikke av `cacheGet` i dag — se note i
// `cachedCategoryBySlug` under. Når/hvis vi splitter lookupen kan vi bruke
// en egen, kortere TTL for null-sentinel-verdier (60s er en rimelig default).

const NEGATIVE_SENTINEL = '__NULL__';
type Negative = typeof NEGATIVE_SENTINEL;

function categoryKey(slug: string): string {
  return `cat:${KEY_VERSION}:category:${slug}`;
}

function productKey(slug: string): string {
  return `cat:${KEY_VERSION}:product:${slug}`;
}

// ---------- Public reads ---------------------------------------------------

export async function cachedCategoryBySlug(
  slug: string,
): Promise<Tables<'categories'> | null> {
  const value = await cacheGet<Tables<'categories'> | Negative>(
    categoryKey(slug),
    async () => {
      const row = await getCategoryBySlug(slug);
      return row ?? (NEGATIVE_SENTINEL as Negative);
    },
    // Negativ-TTL brukes kun på null-sentinel, men cacheGet er ikke TTL-bevisst
    // per-verdi. Vi bruker positiv TTL her; ved negative hits aksepteres litt
    // lengre TTL i bytte for enklere kode. Ved behov kan vi splitte i to
    // lookups senere.
    POSITIVE_TTL_SECONDS,
  );

  return isNegative(value) ? null : value;
}

export async function cachedProductBySlug(
  slug: string,
): Promise<CatalogProductDetail | null> {
  const value = await cacheGet<CatalogProductDetail | Negative>(
    productKey(slug),
    async () => {
      const row = await getProductBySlug(slug);
      return row ?? (NEGATIVE_SENTINEL as Negative);
    },
    POSITIVE_TTL_SECONDS,
  );

  return isNegative(value) ? null : value;
}

function isNegative(value: unknown): value is Negative {
  return value === NEGATIVE_SENTINEL;
}

// ---------- Invalidation --------------------------------------------------

/**
 * Invalider cache for ett eller flere slugs. Ved kategori-endring invalideres
 * kategori-nøkkelen. Ved produkt-endring invalideres produkt-nøkkelen.
 *
 * Ved slug-endring må BÅDE gammel og ny slug invalideres — det er kallerens
 * ansvar å sørge for at begge slugs sendes inn.
 */
export async function invalidateCategorySlug(slug: string): Promise<void> {
  await cacheInvalidate(categoryKey(slug));
}

export async function invalidateProductSlug(slug: string): Promise<void> {
  await cacheInvalidate(productKey(slug));
}

/**
 * Invalider både kategori- og produkt-nøkkel for en slug. Brukes når vi ikke
 * vet hvilken type entiteten er — f.eks. ved webhook delete der webhook-body
 * bare inneholder `id`, og vi vil rydde opp konservativt. Dobbelt DEL koster
 * lite; Redis-DEL er idempotent på fraværende nøkler.
 */
export async function invalidateBothBySlug(slug: string): Promise<void> {
  await cacheInvalidate([categoryKey(slug), productKey(slug)]);
}

/**
 * Negativ-cache-invalidering ved create: når et nytt produkt dukker opp med
 * slug `X`, må vi invalidere både kategori- og produkt-negativ-entries for
 * `X` (hvis noen tidligere har forsøkt å nå slugen og fått 404).
 */
export async function invalidateOnCreate(slug: string): Promise<void> {
  await invalidateBothBySlug(slug);
}
