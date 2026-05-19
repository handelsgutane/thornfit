/**
 * Delte typer for Algolia-søk. Forma skal speile hva `/api/cron/sync-algolia`
 * skriver til index-en. Endringer her krever også endring i sync-koden — og
 * et cache-bump i `lib/search/client.ts` hvis vi trenger å tvinge re-hydrering.
 *
 * Hvorfor egne typer fremfor `Hit` fra `@algolia/client-search`? Algolia sin
 * generiske Hit er `Record<string, unknown>` og vi vil unngå å sprenge
 * `any` i komponentene. Her er alt felt-typed.
 */

/**
 * Ett produkt-treff i Algolia. `objectID` er Algolia-required. Alt annet er
 * vårt eget — matche `toAlgoliaObjects()` i sync-routen.
 */
export interface ProductHit {
  /** Algolia-krav. Vi bruker SKU hvis tilgjengelig, ellers Woo-id som streng. */
  objectID: string;
  /** Stabil intern-id (Supabase/Woo `products.id`). */
  productId: number;
  name: string;
  /** Siste segment i URL-en (ikke full path). */
  slug: string;
  /** Full nested path for Next.js href — "knivtyper/kokkekniv/yoshimi-kato-shiun". */
  path: string | null;
  /** Primær-kategori sin slug (bruk som "brand"-lignende uppercase-label i kortet). */
  brand: string | null;
  /** Hovedbilde URL (full, ikke srcset — Algolia lagrer bare én). */
  image: string | null;
  /** Kort spec-streng som rendres under tittelen ("210mm · VG10"). */
  spec: string | null;
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;
  /** "instock" | "outofstock" | "onbackorder" */
  stockStatus: string | null;
  /** Fulle kategori-paths som produktet ligger i — brukes til facet-teller. */
  categoryPaths: string[];
  /** Human-readable kategori-navn for "KATEGORIER"-kolonnen. */
  categoryNames: string[];
}

/**
 * Struktur på ett fasett-resultat. Algolia returnerer `facets: { key: { value: count } }`.
 * Vi flater dette til en array som UI-et kan mappe direkte.
 */
export interface FacetBucket {
  /** Fasett-verdien — f.eks. "knivtyper/kokkekniv". */
  value: string;
  /** Antall treff innenfor dette bucket-et for gjeldende query. */
  count: number;
  /** Visnings-label (hvis tilgjengelig). Faller tilbake til `value`. */
  label?: string;
}

/** Full response-shape fra `searchProducts()`. */
export interface SearchResponse {
  hits: ProductHit[];
  /** Totalt antall treff (ikke bare hentede). Bruk til "Se alle N resultater". */
  nbHits: number;
  /** Query-ID fra Algolia — trengs for Insights click-tracking. */
  queryID: string | null;
  /** Fasett-tellinger keyet på attributt-navn. Tom hvis ingen facets ble requested. */
  facets: Record<string, FacetBucket[]>;
}
