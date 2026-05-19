'use client';

/**
 * Algolia Insights — conversion- og click-signaler som lærer rank-algoritmen.
 *
 * **Hva dette IKKE er:** Dette er ikke analytics (GA4/Meta/TikTok). Det er
 * feedback til Algolia selv, som bruker signalene til å re-rangere resultater
 * og trene personalization + Recommend-modeller (FBT, related-products,
 * trending). Det gir også tilgang til A/B-tester og segment-analyser i
 * Algolia-dashbordet.
 *
 * **Separasjon:** `track()` (emitter) → GA4/Meta/TikTok. `trackAlgolia*()`
 * (denne fila) → Algolia. To events fyres for samme brukeraksjon — det er
 * by design, fordi plattformene gjør helt forskjellige ting med signalene.
 *
 * **Singel index** (ADR-0009): skarpekniver er kun B2C, så vi trenger ikke
 * chef-storefront sin B2B/B2C-index-switcher. Alt logges mot
 * `NEXT_PUBLIC_ALGOLIA_INDEX_NAME`.
 *
 * **Consent:** Algolia Insights setter en anonymous user-token i
 * `_ALGOLIA`-cookie (samme first-party-domene). Vi setter `useCookie: true`
 * kun hvis `analytics`-consent er gitt — ellers kjører vi med per-request
 * token som ikke persisteres (fortsatt nyttig for klikk-rank, men ingen
 * cross-session personalization).
 */

import insightsClient from 'search-insights';

import { logger } from '@/lib/logger';

import { hasConsentFor } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

/**
 * Initialiser insights-klienten. Idempotent — kalles fra `AnalyticsScripts`
 * etter at consent er sjekket, og fra hvert `track*`-kall som defensiv guard.
 */
export function initAlgoliaInsights(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;

  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const apiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;

  if (!appId || !apiKey) {
    // Dev-miljø uten Algolia — ikke spam konsollen, fail silently.
    return;
  }

  const useCookie = hasConsentFor('analytics');

  try {
    insightsClient('init', {
      appId,
      apiKey,
      useCookie,
      // 30 dager — match Algolia default.
      cookieDuration: 30 * 24 * 60 * 60 * 1000,
    });
    initialized = true;
  } catch (err) {
    logger.error('algolia insights init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getIndexName(): string | null {
  return process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? null;
}

function safeCall(fn: () => void): void {
  try {
    initAlgoliaInsights();
    if (!initialized) return;
    fn();
  } catch (err) {
    // Insights må aldri forårsake visible feil.
    logger.warn('algolia insights call threw', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Events — se Algolia "Insights events reference" for fullt sett.
// Vi implementerer kun dem vi faktisk trenger nå. Resten legges til når
// de kalles fra UI.
// ---------------------------------------------------------------------------

/** Bruker åpnet et produkt-detalj-side. */
export function trackProductViewed(objectId: string): void {
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    insightsClient('viewedObjectIDs', {
      index,
      eventName: 'Product Detail Viewed',
      objectIDs: [objectId],
    });
  });
}

/**
 * Bruker la produkt i kurven. Trigges fra `lib/cart/api.ts` → `addToCart()`.
 * `queryID` sendes hvis add-to-cart skjedde direkte fra søkeresultat
 * (conversion etter search) — ellers `null`.
 */
export function trackAddedToCart(
  objectId: string,
  opts: { queryID?: string | null } = {},
): void {
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    if (opts.queryID) {
      insightsClient('addedToCartObjectIDsAfterSearch', {
        index,
        eventName: 'Product Added to Cart (Search)',
        queryID: opts.queryID,
        objectIDs: [objectId],
      });
    } else {
      insightsClient('addedToCartObjectIDs', {
        index,
        eventName: 'Product Added to Cart',
        objectIDs: [objectId],
      });
    }
  });
}

/**
 * Kjøp fullført — bulk-sender hele ordre-kurven. Kalles fra thank-you-siden
 * etter purchase-event er fyrt i analytics-emitteren.
 */
export function trackPurchased(objectIds: string[]): void {
  if (objectIds.length === 0) return;
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    insightsClient('purchasedObjectIDs', {
      index,
      eventName: 'Product Purchased',
      objectIDs: objectIds,
    });
  });
}

/**
 * Bruker klikket på en anbefaling (Recommend). `recommendationType` er
 * Recommend-modellen som genererte raden — "frequently-bought-together",
 * "related-products", "trending-items".
 */
export function trackRecommendationClicked(
  objectId: string,
  recommendationType: string,
): void {
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    insightsClient('clickedObjectIDs', {
      index,
      eventName: `Recommendation Clicked (${recommendationType})`,
      objectIDs: [objectId],
    });
  });
}

/**
 * Klikk på et søkeresultat. `queryID` kommer fra `SearchResponse.queryID`
 * returnert av `searchProducts()`. `position` er 1-indeksert plass i
 * resultat-listen.
 */
export function trackSearchResultClicked(
  objectId: string,
  position: number,
  queryId: string,
): void {
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    insightsClient('clickedObjectIDsAfterSearch', {
      index,
      eventName: 'Product Clicked from Search',
      queryID: queryId,
      objectIDs: [objectId],
      positions: [position],
    });
  });
}

/**
 * Conversion via anbefaling — brukt ved checkout hvis en kjøpt linje
 * opprinnelig kom fra en Recommend-rad. MVP: ikke koblet enda.
 */
export function trackRecommendationConversion(
  objectId: string,
  recommendationType: string,
): void {
  const index = getIndexName();
  if (!index) return;
  safeCall(() => {
    insightsClient('convertedObjectIDs', {
      index,
      eventName: `Recommendation Converted (${recommendationType})`,
      objectIDs: [objectId],
    });
  });
}
