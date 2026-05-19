'use client';

/**
 * useFilterUrlState — URL-synket filter- og sort-state for kategorisider.
 *
 * **Arkitektur (oppdatert 2026-04-24):** Lokal React-state er primær kilde
 * for UI. URL-en speiles via `window.history.replaceState` — ingen router-
 * roundtrip, ingen RSC-refetch, ingen cache-invalidering. Før denne endringen
 * brukte vi `router.replace()` som trigger Next.js App Router til å resolve
 * ruten på nytt (selv for query-only changes på samme pathname), noe som ga
 * merkbar lagg på filter-klikk med ~200 produkter i DOM-et.
 *
 * Hvorfor det er trygt å bypasse router-en:
 *   - Kategori-siden er en Server Component som KUN leser searchParams på
 *     initial request. Klient-side filtrering er 100% i CategoryBrowser.
 *   - Ingen andre komponenter i treet leser `useSearchParams()` for filter-
 *     state. Så de-sync mellom Next-interne URL og window.location er no-op.
 *   - `replaceState` holder current history-entry, så tilbake-knappen oppfører
 *     seg som før (går til forrige side, ikke forrige filter-valg).
 *
 * Initial seeding: `useSearchParams()` leses kun ved mount for å hydrere
 * lokal state. Refresh, shared links og server-rendret initial HTML
 * fungerer uendret.
 *
 * Serialisering:
 *   - Hvert filter-key får sitt eget URL-param med samme navn. Multi-select
 *     verdier joines med komma: `?merke=wusthof,global`.
 *   - Pris-filteret (intern key `__price`) mappes til URL-key `price`.
 *   - Sort-param (`?sort=newest`) skrives bare når verdien avviker fra
 *     `defaultSort`, så standardvisningen har ren URL.
 *   - Tomme filter-arrays → param utelates helt.
 *
 * Comma-safe: Woo-attributt-slugs er kebab-case og pris-bucket-values er
 * tall+bindestrek — ingen kommaer å kollidere med.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

import { PRICE_FILTER_KEY } from './filters';

const SORT_PARAM = 'sort';
const PRICE_URL_KEY = 'price';

function toUrlKey(filterKey: string): string {
  return filterKey === PRICE_FILTER_KEY ? PRICE_URL_KEY : filterKey;
}

function parseSelections(
  params: URLSearchParams,
  filterKeys: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of filterKeys) {
    const raw = params.get(toUrlKey(key));
    out[key] = raw ? raw.split(',').filter(Boolean) : [];
  }
  return out;
}

export interface UseFilterUrlStateArgs {
  /** Alle filter-keys som parent rendrer — styrer hvilke URL-params vi leser. */
  filterKeys: readonly string[];
  /** Gyldige sort-values — ukjente verdier i URL-en faller tilbake til default. */
  sortValues: readonly string[];
  /** Default sort. Utelates fra URL når aktiv (ren kanonisk URL). */
  defaultSort: string;
}

export interface UseFilterUrlStateResult {
  selections: Record<string, string[]>;
  sort: string;
  setSelections: (next: Record<string, string[]>) => void;
  setSort: (next: string) => void;
}

export function useFilterUrlState({
  filterKeys,
  sortValues,
  defaultSort,
}: UseFilterUrlStateArgs): UseFilterUrlStateResult {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stabiliser filterKeys-identiteten så callbacks ikke invalideres på hver
  // render hvis parent bygger arrayet inline. Billig siden det alltid er <20.
  const keysSignature = filterKeys.join('|');

  // Seed state én gang fra URL ved mount. Etter mount er lokal state
  // primær — URL oppdateres via replaceState som speil.
  const [selections, setSelectionsState] = useState<Record<string, string[]>>(
    () => parseSelections(new URLSearchParams(searchParams.toString()), filterKeys),
  );
  const [sort, setSortState] = useState<string>(() => {
    const v = searchParams.get(SORT_PARAM);
    return v && sortValues.includes(v) ? v : defaultSort;
  });

  const pushToUrl = useCallback(
    (nextSelections: Record<string, string[]>, nextSort: string) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      for (const key of filterKeys) {
        const values = nextSelections[key] ?? [];
        if (values.length > 0) {
          params.set(toUrlKey(key), values.join(','));
        }
      }
      if (nextSort !== defaultSort) {
        params.set(SORT_PARAM, nextSort);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      // replaceState → ingen router-roundtrip, ingen RSC-refetch. Holder
      // current history-entry så tilbake-knappen går til forrige side, ikke
      // forrige filter-state.
      window.history.replaceState(window.history.state, '', url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, defaultSort, keysSignature],
  );

  const setSelections = useCallback(
    (next: Record<string, string[]>) => {
      setSelectionsState(next);
      pushToUrl(next, sort);
    },
    [pushToUrl, sort],
  );

  const setSort = useCallback(
    (next: string) => {
      setSortState(next);
      pushToUrl(selections, next);
    },
    [pushToUrl, selections],
  );

  return { selections, sort, setSelections, setSort };
}
