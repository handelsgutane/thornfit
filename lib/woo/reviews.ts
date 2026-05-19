/**
 * WooCommerce produkt-anmeldelser.
 *
 * Henter fra /wp-json/wc/v3/products/{id}/reviews med admin-credentials.
 * Kall kun server-side (import 'server-only').
 */

import 'server-only';

import { wooFetch } from './client';
import { logger } from '@/lib/logger';
import { cacheGet, cacheInvalidate } from '@/lib/redis/client';

// Reviews-cache: kort TTL fordi nye anmeldelser bør synes raskt på live-siden.
// Webhook-invalidering er ikke satt opp ennå (Woo har ikke en innebygget
// review-webhook), så vi støtter oss på TTL alene. 10 min er en balanse:
// produkt-detaljsiden slipper å hente fra WP på hver request, men
// nye anmeldelser blir synlige innen 10 min uten manuell action.
const REVIEW_CACHE_TTL = 600;
const REVIEW_KEY_VERSION = 'v1';

function reviewCacheKey(productId: number, limit: number): string {
  return `woo:${REVIEW_KEY_VERSION}:reviews:${productId}:${limit}`;
}

/**
 * Manuell invalidator — kan kalles fra admin-actions hvis vi senere
 * legger til en webhook for godkjente anmeldelser.
 */
export async function invalidateProductReviews(productId: number): Promise<void> {
  // Invalider for de vanligste limit-verdiene. 20 er default, 5 brukes
  // av kompakte preview-snitt. Hvis limit-spennet utvides, oppdater her.
  await cacheInvalidate([
    reviewCacheKey(productId, 20),
    reviewCacheKey(productId, 5),
  ]);
}

export interface WooReview {
  id: number;
  /** HTML-innhold — strip tags i UI. */
  review: string;
  reviewer: string;
  rating: number; // 1–5
  date_created: string; // ISO
  verified: boolean;
}

interface WooReviewRaw {
  id: number;
  review: string;
  reviewer: string;
  rating: number;
  date_created: string;
  verified: boolean;
}

/**
 * Hent godkjente anmeldelser for ett produkt.
 * Returnerer tom liste ved feil (ikke-kritisk path).
 */
export async function fetchProductReviews(
  productId: number,
  limit = 20,
): Promise<WooReview[]> {
  return cacheGet<WooReview[]>(
    reviewCacheKey(productId, limit),
    async () => {
      try {
        const raw = await wooFetch<WooReviewRaw[]>(
          `/wc/v3/products/reviews`,
          {
            query: {
              product: productId,
              per_page: limit,
              // WC REST API bruker 'approve' (ikke 'approved')
              status: 'approve',
              order: 'desc',
              // Gyldig WC orderby-verdi er 'date', ikke 'date_created'
              orderby: 'date',
            },
            // Vi cacher selv via Redis. fetch-cache er ikke nødvendig her.
            cache: 'no-store',
          },
        );

        if (!Array.isArray(raw)) return [];

        return raw.map((r) => ({
          id: r.id,
          review: r.review,
          reviewer: r.reviewer,
          rating: r.rating,
          date_created: r.date_created,
          verified: r.verified,
        }));
      } catch (err) {
        logger.warn('fetchProductReviews failed — rendering without reviews', {
          productId,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    },
    REVIEW_CACHE_TTL,
  );
}

/** Strip HTML-tags fra Woo review-tekst. */
export function stripReviewHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Format ISO-dato til norsk kortformat: "14. mars 2025" */
export function formatReviewDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
