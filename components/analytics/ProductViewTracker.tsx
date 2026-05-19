'use client';

/**
 * ProductViewTracker — fyrer `view_item` når en produkt-detaljside
 * mountes.
 *
 * Mountes som nest-til-siste ledd i `ProductView` (server component). Tar
 * produktet som prop, konverterer via `catalogProductDetailToAnalyticsItem`,
 * og fyrer eventet klient-side.
 *
 * De-duplisering: `useRef` på siste product-id, siden React strict-mode kan
 * re-kjøre effect i dev. Samme mønster som `PageViewTracker`.
 *
 * Rekkefølge vs. `PageViewTracker`: begge fyrer ved første render av samme
 * route-endring. `PageViewTracker` gjør pageview, `ProductViewTracker` gjør
 * view_item. Adapterne fyrer dem som to separate events — ingen
 * overlapping i GA4/Meta/TikTok-rapporter.
 */

import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics/emitter';
import { catalogProductDetailToAnalyticsItem } from '@/lib/analytics/items';
import type { CatalogProductDetail } from '@/lib/supabase/catalog';

export interface ProductViewTrackerProps {
  product: CatalogProductDetail;
}

export function ProductViewTracker({ product }: ProductViewTrackerProps) {
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    const id = String(product.id);
    if (lastFired.current === id) return;
    lastFired.current = id;
    track({
      name: 'view_item',
      payload: { item: catalogProductDetailToAnalyticsItem(product) },
    });
  }, [product]);

  return null;
}
