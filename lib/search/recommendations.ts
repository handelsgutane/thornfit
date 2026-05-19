'use client';

/**
 * Algolia Recommend — "kunder kjøpte også"-anbefalinger i handlekurven.
 *
 * **Modeller vi bruker:**
 *   - `bought-together` (FBT): produkter ofte kjøpt sammen med seed. Krever
 *     treningsdata (minst et par tusen kjøp); tomt på launch.
 *   - `related-products`: content-/co-view-basert. Fungerer uten mye data.
 *
 * **Strategi:** Primary = bought-together, fallback = related-products.
 * Hvis FBT er tomt (ikke trent, smal kategori), faller vi tilbake til
 * related så cart-siden aldri blir tom. Paper-designet har ikke plass for
 * en "Ingen anbefalinger"-enclave, og fallback-mønsteret er standard.
 *
 * **Seed-strategi (MVP):** Første item i kurven er seed. Kan evolve til
 * multi-seed eller heuristikk som "dyreste item" / "siste lagt til" — vi
 * starter enkelt.
 *
 * **v5 client-API:** `@algolia/recommend@5.x` bruker `getRecommendations()`
 * med en discriminated-union `RecommendationsRequest`. Det finnes ikke
 * lenger helpers som `getFrequentlyBoughtTogether()` (v4-only) — ikke
 * forvirr deg ved refactor.
 */

import { recommendClient, type RecommendClient } from '@algolia/recommend';

import { getAlgoliaIndexName } from './client';
import type { ProductHit } from './types';

// ---------------------------------------------------------------------------
// Client-singleton
// ---------------------------------------------------------------------------

let _client: RecommendClient | null = null;

function getRecommendClient(): RecommendClient | null {
  if (_client) return _client;

  // Literal env-aksess — samme grunnen som i `lib/search/client.ts`
  // (Next.js inliner kun literal-referanser i klient-bundlen).
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  if (!appId || !searchKey) return null;

  try {
    _client = recommendClient(appId, searchKey);
    return _client;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hit-adapter — speiler `toProductHit()` i `lib/search/client.ts`. Recommend
// returnerer samme index-shape så vi gjenbruker konvensjonen.
// ---------------------------------------------------------------------------

interface RawRecommendHit {
  objectID: string;
  product_id?: number;
  name?: string;
  slug?: string;
  url?: string;
  image?: string;
  price?: number;
  brand?: string | null;
  stock_status?: string;
  category_names?: string[];
  category_slugs?: string[];
  _score?: number;
}

function toProductHit(raw: RawRecommendHit): ProductHit {
  let path: string | null = raw.slug ?? null;
  if (raw.url) {
    try {
      path = new URL(raw.url).pathname.replace(/^\//, '') || raw.slug || null;
    } catch {
      // keep fallback
    }
  }

  return {
    objectID: raw.objectID,
    productId: raw.product_id ?? 0,
    name: raw.name ?? '',
    slug: raw.slug ?? '',
    path,
    brand: raw.brand ?? null,
    image: raw.image ?? null,
    spec: null,
    price: typeof raw.price === 'number' ? raw.price : null,
    regularPrice: null,
    salePrice: null,
    stockStatus: raw.stock_status ?? null,
    categoryPaths: raw.category_slugs ?? [],
    categoryNames: raw.category_names ?? [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RecommendationModel = 'bought-together' | 'related-products';

export interface RecommendationsResult {
  /** Hvilken modell genererte hits. Sendes til Algolia Insights ved klikk. */
  model: RecommendationModel;
  hits: ProductHit[];
}

/**
 * Terskel for at Algolia returnerer et treff. 0 = alle treff (mest liberal,
 * brukes for å fylle kurv-anbefalinger så vi slipper tomt strip).
 */
const DEFAULT_THRESHOLD = 0;

/**
 * Hent anbefalinger for en seed-objectID. Prøver bought-together først,
 * faller tilbake til related-products hvis FBT er tomt.
 *
 * @param seedObjectID `objectID` fra Algolia. I chef-storefront's
 *        `products_b2c`-indeks er dette **SKU-en**, ikke produkt-id.
 *        Bruk `cartItem.sku` direkte. Hvis SKU mangler → ikke kall denne
 *        funksjonen (Recommend kan ikke matche uten gyldig seed).
 * @param options.maxResults default 6. Paper viser 3 desktop + horizontal
 *        carousel mobile — oppkaller spesifiserer.
 * @param options.excludeObjectIDs SKU-er allerede i kurven.
 */
export async function fetchCartRecommendations(
  seedObjectID: string,
  options: { maxResults?: number; excludeObjectIDs?: string[] } = {},
): Promise<RecommendationsResult> {
  const { maxResults = 6, excludeObjectIDs = [] } = options;

  let indexName: string;
  try {
    indexName = getAlgoliaIndexName();
  } catch {
    return { model: 'bought-together', hits: [] };
  }

  const client = getRecommendClient();
  if (!client) {
    return { model: 'bought-together', hits: [] };
  }

  const excludeSet = new Set(excludeObjectIDs);
  excludeSet.add(seedObjectID); // seed-item selv skal aldri anbefales tilbake
  const overFetch = maxResults + excludeSet.size;

  // --- Forsøk 1: bought-together ---
  try {
    const fbt = await client.getRecommendations({
      requests: [
        {
          indexName,
          model: 'bought-together',
          objectID: seedObjectID,
          threshold: DEFAULT_THRESHOLD,
          maxRecommendations: overFetch,
        },
      ],
    });
    const rawHits = (fbt.results?.[0]?.hits ?? []) as unknown as RawRecommendHit[];
    const hits = rawHits
      .filter((h) => !excludeSet.has(h.objectID))
      .slice(0, maxResults)
      .map(toProductHit);

    if (hits.length > 0) {
      return { model: 'bought-together', hits };
    }
  } catch {
    // FBT kan feile hvis modellen ikke er trent — stille fallback.
  }

  // --- Fallback: related-products ---
  try {
    const related = await client.getRecommendations({
      requests: [
        {
          indexName,
          model: 'related-products',
          objectID: seedObjectID,
          threshold: DEFAULT_THRESHOLD,
          maxRecommendations: overFetch,
        },
      ],
    });
    const rawHits = (related.results?.[0]?.hits ?? []) as unknown as RawRecommendHit[];
    const hits = rawHits
      .filter((h) => !excludeSet.has(h.objectID))
      .slice(0, maxResults)
      .map(toProductHit);

    return { model: 'related-products', hits };
  } catch {
    return { model: 'related-products', hits: [] };
  }
}
