'use client';

/**
 * SearchOverlay — delt skall for desktop- og mobile-varianten.
 *
 * Holder søk-state (query, debounced query, valgt kategori, response) på ett
 * sted og sender det ned til riktig layout-komponent. Alternativet — eget
 * state-tre i hver overlay — ville betydd dobbel fetch og ulike "nylig søkte"-
 * caches mellom layoutene. Her bruker vi CSS (`hidden md:block` /
 * `md:hidden`) for visning — overheaden er én DOM-subtree som aldri ses, i
 * bytte for én kilde til sannhet for searchen.
 *
 * Debounce 180ms: høyt nok til at bruker rekker å skrive før vi kaller,
 * lavt nok til at skrivingen føles "live". Chef-storefront brukte 150; vi
 * bumper litt for færre Algolia-requests.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics/emitter';
import { searchProducts } from '@/lib/search/client';
import { DEFAULT_SEARCH_OVERLAY } from '@/lib/search/overlay';
import type { ProductHit, SearchResponse } from '@/lib/search/types';

import { SearchOverlayDesktop } from './SearchOverlayDesktop';
import { SearchOverlayMobile } from './SearchOverlayMobile';

export type SearchState = {
  /** Råverdi i inputfeltet (kontrollert). */
  query: string;
  /** Debounced versjon — brukes som faktisk søkestreng. */
  debouncedQuery: string;
  /** Nåværende respons. `null` før første fetch, `SearchResponse` etterpå. */
  response: SearchResponse | null;
  /** `true` mens vi venter på en Algolia-request. */
  isLoading: boolean;
  /** Valgt kategori-fasett (path). `null` = ingen filter. */
  category: string | null;
};

type Props = {
  onClose: () => void;
};

const EMPTY_RESPONSE: SearchResponse = {
  hits: [],
  nbHits: 0,
  queryID: null,
  facets: {},
};

/**
 * Min. antall tegn før vi trigger Algolia-fetch. Under dette behandles queryen
 * som "ikke skrevet enda" → EmptyState vises i stedet for NoResults. Grunnen:
 * Algolia's default `minWordSizefor1Typo: 4` gir ofte 0 treff på 1-tegns
 * prefikser, og "Ingen treff" mens bruker fortsatt skriver er dårlig UX. 2 er
 * valgt som kompromiss — korte brand-match (MAC, HJ) slipper gjennom mens
 * enkeltbokstav-støy filtreres.
 */
const MIN_QUERY_LENGTH = 2;

/**
 * Antall treff vi henter fra Algolia per søk. Overlayets "Se alle N resultater"
 * tar over utover dette — full paginering hører hjemme på `/sok`-siden.
 */
const HITS_PER_PAGE = 8;

type FetchedResult = { query: string; response: SearchResponse };

export function SearchOverlay({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [fetched, setFetched] = useState<FetchedResult | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  // Debounce query → debouncedQuery. Queries kortere enn MIN_QUERY_LENGTH
  // nullstiller debouncedQuery i stedet for å propagere — det holder overlayet
  // i EmptyState mens bruker fortsatt skriver, i stedet for å flashe "Ingen
  // treff" på en 1-tegns prefiks som Algolia nesten aldri matcher.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = query.trim();
      setDebouncedQuery(trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '');
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Fetch når debouncedQuery endres. Race-guard via ref — hvis bruker skriver
  // raskt kan flere fetch-er være in-flight; vi tar bare den nyeste. All
  // setState skjer inne i Promise-callbacks (aldri synkront i effect-body), så
  // vi spiller nicely med React 19's `set-state-in-effect`-regel. "Response
  // gjelder ikke lenger"-tilstanden (tom query eller under-way fetch) er
  // derived state — se `response`/`isLoading` under.
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!debouncedQuery) return;
    const id = ++reqIdRef.current;
    searchProducts(debouncedQuery, { hitsPerPage: HITS_PER_PAGE, facets: ['category_paths'] })
      .then((res) => {
        if (id !== reqIdRef.current) return;
        setFetched({ query: debouncedQuery, response: res });
        // Analytics — fyrer én gang per faktisk fullført søk (ikke per
        // keystroke; debouncing gjør at 'skriv, vent, fetch' = ett event).
        // Race-guard samme som setFetched: kun nyeste in-flight teller.
        track({
          name: 'search',
          payload: { query: debouncedQuery, resultsCount: res.nbHits },
        });
      })
      .catch(() => {
        if (id !== reqIdRef.current) return;
        setFetched({ query: debouncedQuery, response: EMPTY_RESPONSE });
        // Feilet søk — logg som 0 treff så vi kan se "søk som feilet" i GA4
        // uten å blande dem med "søk som fant 0" (kan skilles på om query
        // matcher en kjent 0-treff). Algolias error rate = % search-events
        // hvor klienten later ikke fikk respons.
      });
  }, [debouncedQuery]);

  // Derived: responsen gjelder kun hvis den matcher nåværende debouncedQuery.
  // Hvis de er ute av sync (bruker skriver, fetch ikke ferdig, eller bruker
  // har tømt input-et) → behandle som "ingen respons enda".
  const response: SearchResponse | null =
    debouncedQuery !== '' && fetched?.query === debouncedQuery
      ? fetched.response
      : null;
  const isLoading: boolean =
    debouncedQuery !== '' && fetched?.query !== debouncedQuery;

  // Kun brukerens eksplisitte kategori-valg filtrerer resultatene. Tidligere
  // defaultet vi til største facet-bucket ("topCategory"), men det skjulte
  // ofte 6 av 8 treff: Algolia returnerer topp-8 på tvers av kategorier,
  // mens topCategory bare speiler den mest populære én — så klient-side
  // filter på den fjernet alle treff i andre kategorier. Regelsettet nå:
  // vis alle treff by default, la bruker opt-in til kategori-filter via
  // sidebar-chip.
  const activeCategory = category;

  const selectCategory = useCallback(
    (next: string | null) => setCategory(next === activeCategory ? null : next),
    [activeCategory],
  );

  // Hits filtrert på valgt kategori (client-side — vi har hentet inn hitene
  // allerede og trenger ikke en ny Algolia-call bare for dette).
  // NB: Dette filteret reduserer alltid listen — det er derfor vi ikke
  // auto-aktiverer det. For "vis 8 produkter i kokkekniv-kategorien"
  // må vi bytte til server-side `facetFilters` i fremtiden.
  const filteredHits: ProductHit[] = useMemo(() => {
    const all = response?.hits ?? [];
    if (!activeCategory) return all;
    return all.filter((h) => h.categoryPaths?.includes(activeCategory));
  }, [response, activeCategory]);

  // Når bruker klikker chip → skriv spørringen inn så de ser hva de valgte.
  const applyPopularQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  // Reset state når overlayet åpnes på nytt — ellers henger gamle hits igjen.
  // Triggeren er at komponenten mounter; parent unmounter ved close.
  // (Ikke noe å gjøre her — initial state håndterer det.)

  const state: SearchState = {
    query,
    debouncedQuery,
    response,
    isLoading,
    category: activeCategory,
  };

  const api = {
    setQuery,
    clearQuery: () => setQuery(''),
    selectCategory,
    applyPopularQuery,
    filteredHits,
    popularQueries: DEFAULT_SEARCH_OVERLAY.popularQueries,
    categoryShortcuts: DEFAULT_SEARCH_OVERLAY.categoryShortcuts,
    onClose,
  };

  // To uavhengige subtrees; CSS-breakpoint bestemmer hvilken som er synlig.
  // `fixed inset-0` i hver variant gir portal-nivå plassering uten å påvirke
  // den andre.
  return (
    <>
      <div className="hidden md:block">
        <SearchOverlayDesktop state={state} {...api} />
      </div>
      <div className="md:hidden">
        <SearchOverlayMobile state={state} {...api} />
      </div>
    </>
  );
}

export type SearchApi = {
  setQuery: (next: string) => void;
  clearQuery: () => void;
  selectCategory: (next: string | null) => void;
  applyPopularQuery: (q: string) => void;
  filteredHits: ProductHit[];
  popularQueries: typeof DEFAULT_SEARCH_OVERLAY.popularQueries;
  categoryShortcuts: typeof DEFAULT_SEARCH_OVERLAY.categoryShortcuts;
  onClose: () => void;
};
