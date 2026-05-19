'use client';

/**
 * CategoryListViewTracker — fyrer `view_item_list` når brukeren lander på
 * en kategori-side eller en annen produktliste-visning.
 *
 * Design-valg:
 *   - **Fyrer kun én gang per listId-verdi**. Filter/sort endrer ikke
 *     eventet — det ville spammet analytics med duplikat-impresjoner
 *     hver gang brukeren toggler et filter. GA4 og Meta forventer
 *     `view_item_list` som impresjon-event, ikke som interaksjon.
 *   - **Items er _initial_ liste**, ikke post-filter. Da får vi konsistent
 *     impresjon-sampling på tvers av brukere (samme inventory = samme
 *     audience-segment i retargeting). Filter-interaksjoner dekkes senere
 *     via `select_item` når brukeren klikker seg videre.
 *   - **Cap på 50 items** for å ikke blåse opp request-payload. GA4 har
 *     soft limit på 200 items per event; vi sender topp-50 så rapporter
 *     fortsatt reflekterer "hva så brukeren først".
 *
 * Plassering: i server-komponentens tre, gjerne rett under
 * `CategoryBrowser` — samme scope som resten av kategori-rendringen.
 */

import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics/emitter';
import { catalogListItemToAnalyticsItem } from '@/lib/analytics/items';
import type { CatalogListItem } from '@/lib/supabase/catalog';

const MAX_ITEMS_PER_IMPRESSION = 50;

export interface CategoryListViewTrackerProps {
  /** Stabil liste-ID — typisk `'category:<slug>'`, `'search'`, `'wishlist'`. */
  listId: string;
  /** Menneskelig navn til GA4 `item_list_name` (f.eks. "Bryner"). */
  listName?: string;
  /** Initial produktliste (pre-filter). */
  products: CatalogListItem[];
}

export function CategoryListViewTracker({
  listId,
  listName,
  products,
}: CategoryListViewTrackerProps) {
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    if (lastFired.current === listId) return;
    lastFired.current = listId;
    if (products.length === 0) return;
    const items = products
      .slice(0, MAX_ITEMS_PER_IMPRESSION)
      .map(catalogListItemToAnalyticsItem);
    track({
      name: 'view_item_list',
      payload: { listId, listName, items },
    });
  }, [listId, listName, products]);

  return null;
}
