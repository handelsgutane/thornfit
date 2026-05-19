/**
 * Algolia-klienter. To separate former for å holde admin-key unna browser-bundle.
 *
 * Browser-side (OK å sende til klient):
 *   - `getSearchClient()` — `liteClient` fra `algoliasearch/lite`. ~2kb bundle.
 *     Tar kun APP_ID + public search-key.
 *
 * Server-side (må aldri eksporteres til klient-bundle):
 *   - `getAdminClient()` — full `algoliasearch`-klient. Tar admin-key, kan
 *     skrive til index. Markert `server-only` som compile-time guard.
 *
 * Sikkerhets-tvilling til `lib/supabase/server.ts` > `createServiceRoleClient()`.
 */

import { liteClient, type LiteClient } from 'algoliasearch/lite';

import type { ProductHit, SearchResponse, FacetBucket } from './types';

// ---------- Shared env-getters --------------------------------------------

/**
 * **Hvorfor literal `process.env.NEXT_PUBLIC_FOO`-aksess framfor dynamisk
 * `process.env[name]`:** Next.js inliner kun env-variabler i klient-bundlen
 * når de refereres med literal property-access. Dynamisk key-lookup blir
 * aldri inlined → `process.env[variable]` returnerer `undefined` i browseren
 * selv om variabelen er satt i Vercel. Derfor utsetter vi literal-aksess til
 * stedet hvor variabelen faktisk brukes (getAppId etc.), eller passer
 * verdien ned som argument.
 *
 * Bug-historie: tidligere versjon brukte `optionalEnv(name)` overalt — det
 * ga søkeresultater i lokal `next dev` (Node injiserer prosess-env på
 * serveren, og Turbopack-bundlen re-aksesserte `window.__NEXT_DATA__`), men
 * i production-build var alle keys `undefined` i browseren og søket returerte
 * stille tom respons. Sørg for å bruke literal-aksess i ALL ny kode som
 * leser NEXT_PUBLIC_-variabler fra klient-side.
 */

/** App-id er NEXT_PUBLIC_ så den er trygg å eksportere. */
export function getAlgoliaAppId(): string {
  const v = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  if (!v) throw new Error('Missing env: NEXT_PUBLIC_ALGOLIA_APP_ID');
  return v;
}

/** Search-key er NEXT_PUBLIC_ (public, rate-limited). */
export function getAlgoliaSearchKey(): string {
  const v = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  if (!v) throw new Error('Missing env: NEXT_PUBLIC_ALGOLIA_SEARCH_KEY');
  return v;
}

export function getAlgoliaIndexName(): string {
  const v = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME;
  if (!v) throw new Error('Missing env: NEXT_PUBLIC_ALGOLIA_INDEX_NAME');
  return v;
}

// ---------- Browser-trygg søkeklient ---------------------------------------

/**
 * Minne-memoisert liteClient. `useMemo` i komponenter gir per-render-instans,
 * men siden app-id + nøkkel ikke endrer seg under sesjon, holder det med én
 * global. Returnerer `null` (ikke kaster) hvis env mangler — vi vil heller
 * vise en tom resultat-liste enn å krasje overlayet.
 */
let _searchClient: LiteClient | null = null;

export function getSearchClient(): LiteClient | null {
  if (_searchClient) return _searchClient;

  // Literal aksess — se kommentar over om inlining.
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  if (!appId || !searchKey) return null;

  _searchClient = liteClient(appId, searchKey);
  return _searchClient;
}

// ---------- Search-funksjon brukt av overlay -------------------------------

// ---------- Index-schema-adapter (chef-storefront `products_b2c`) ---------

/**
 * Rå hit-shape som `products_b2c`-indexen returnerer. Indexen er synket av
 * chef-storefront og bruker snake_case + flat slug. Vi eier ikke sync-routen
 * deres, så vi adapterer i stedet for å bytte schema — se `toProductHit()`.
 *
 * Når vi senere oppretter en skarpekniverv3-dedikert index (#54), kan vi
 * enten (a) bytte til den index-en her og slette denne adapteren, eller
 * (b) beholde adapteren og indekse med samme felt-navn for kompatibilitet.
 */
interface ChefStorefrontHit {
  objectID: string;
  product_id?: number;
  name?: string;
  slug?: string;
  url?: string;
  price?: number;
  image?: string;
  brand?: string | null;
  stock_status?: string;
  category_names?: string[];
  category_slugs?: string[];
  description_snippet?: string | null;
}

function pathFromUrl(url: string | undefined, slug: string | undefined): string | null {
  if (!url) return slug ?? null;
  try {
    const u = new URL(url);
    // Strip leading slash — `ProductHit.path` er relative for Next.js `href`.
    return u.pathname.replace(/^\//, '') || slug || null;
  } catch {
    return slug ?? null;
  }
}

function toProductHit(raw: ChefStorefrontHit): ProductHit {
  return {
    objectID: raw.objectID,
    productId: raw.product_id ?? 0,
    name: raw.name ?? '',
    slug: raw.slug ?? '',
    path: pathFromUrl(raw.url, raw.slug),
    brand: raw.brand ?? null,
    image: raw.image ?? null,
    // `description_snippet` er ofte en full setning — for lang for en spec-
    // under-tittel. Droppes til null inntil sync-routen gir oss en dedikert
    // `spec`-streng (typisk "210mm · VG10").
    spec: null,
    price: typeof raw.price === 'number' ? raw.price : null,
    // products_b2c har kun én pris. Regular/sale-paret finnes ikke i indexen
    // enda — frontend rendrer "hasSale" bare når begge er satt, så null-pair
    // er trygt.
    regularPrice: null,
    salePrice: null,
    stockStatus: raw.stock_status ?? null,
    // Vi mapper `category_slugs` → vår `categoryPaths`-array. Overlay-en
    // filtrerer client-side på `hit.categoryPaths?.includes(bucket.value)` så
    // dette fungerer så lenge facet-verdiene også er slugs (se `facets`
    // nedenfor).
    categoryPaths: raw.category_slugs ?? [],
    categoryNames: raw.category_names ?? [],
  };
}

/**
 * Wrapper rundt `liteClient.search()` som:
 *   - Requester både hits OG facet-counts i én request.
 *   - Typer responsen til vår `SearchResponse`-shape.
 *   - Returnerer tom response (ikke throw) hvis klient eller env mangler —
 *     så UI-et ikke crash-er ved manglende Algolia-oppsett i dev.
 *
 * `facets`-default er `['category_slugs']` fordi det er den som er registrert
 * som facetable i `products_b2c`. Facet-keyen eksponeres imidlertid som
 * `category_paths` ut mot UI-et slik at komponentene slipper å vite om
 * index-schemaet (gjør det enkelt å bytte til et nytt index senere — da
 * flytter vi bare denne linjen).
 */
const INTERNAL_FACET = 'category_slugs';
const PUBLIC_FACET = 'category_paths';

export interface SearchProductsOptions {
  /** Antall treff per side. Default 6 (overlay). /sok bruker f.eks. 24. */
  hitsPerPage?: number;
  /** 0-indeksert side. Default 0. Algolia validerer at page < 1000. */
  page?: number;
  /** Public facet-navn å hente bucket-tall for. Default `['category_paths']`. */
  facets?: string[];
  /**
   * Kategori-slug å filtrere på (f.eks. 'kjokkenkniver'). Sendes til Algolia
   * som `filters: category_slugs:<slug>`. Tom = ingen kategori-filter.
   */
  categorySlug?: string | null;
}

export interface SearchProductsResult extends SearchResponse {
  /** Antall sider tilgjengelig (for paginering). */
  nbPages: number;
  /** Aktiv 0-indeksert side. */
  page: number;
  /** hitsPerPage Algolia faktisk returnerte. */
  hitsPerPage: number;
}

export async function searchProducts(
  query: string,
  opts: SearchProductsOptions = {},
): Promise<SearchProductsResult> {
  const client = getSearchClient();
  // Literal aksess — se kommentaren i `getAlgoliaAppId` om Next.js
  // inlining-oppførsel.
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME;

  const hitsPerPage = opts.hitsPerPage ?? 6;
  const page = Math.max(0, opts.page ?? 0);
  const empty: SearchProductsResult = {
    hits: [],
    nbHits: 0,
    queryID: null,
    facets: {},
    nbPages: 0,
    page,
    hitsPerPage,
  };

  if (!client || !indexName || !query.trim()) return empty;

  // Map public facet-names → internal (index) facet-names. Ukjente navn
  // sendes gjennom som-er så konsumenter kan be om tillegg-facets (brand,
  // stock_status, etc.) direkte.
  const facets = (opts.facets ?? [PUBLIC_FACET]).map((f) =>
    f === PUBLIC_FACET ? INTERNAL_FACET : f,
  );

  // Kategori-filter: oversett public facet-key til intern. Escapet via
  // dobbel-quotes — slug-er er alfanumerisk + bindestrek, men defensiv koding
  // tåler fremtidige endringer.
  const filters = opts.categorySlug
    ? `${INTERNAL_FACET}:"${opts.categorySlug.replace(/"/g, '\\"')}"`
    : undefined;

  try {
    const res = await client.search<ChefStorefrontHit>({
      requests: [
        {
          indexName,
          query,
          hitsPerPage,
          page,
          facets,
          ...(filters ? { filters } : {}),
          clickAnalytics: true,
          attributesToRetrieve: [
            'objectID',
            'product_id',
            'name',
            'slug',
            'url',
            'image',
            'price',
            'brand',
            'stock_status',
            'category_names',
            'category_slugs',
            'description_snippet',
          ],
        },
      ],
    });

    const first = res.results?.[0];
    if (!first || !('hits' in first)) return empty;

    const facetResult: Record<string, FacetBucket[]> = {};
    const facetsObj = (first as { facets?: Record<string, Record<string, number>> }).facets;
    if (facetsObj) {
      for (const [attr, buckets] of Object.entries(facetsObj)) {
        // Re-map internal facet-key tilbake til public-key for UI-et.
        const publicKey = attr === INTERNAL_FACET ? PUBLIC_FACET : attr;
        facetResult[publicKey] = Object.entries(buckets)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    const rawHits = first.hits as unknown as ChefStorefrontHit[];
    return {
      hits: rawHits.map(toProductHit),
      nbHits: first.nbHits ?? 0,
      queryID: (first as { queryID?: string }).queryID ?? null,
      facets: facetResult,
      nbPages: (first as { nbPages?: number }).nbPages ?? 0,
      page,
      hitsPerPage,
    };
  } catch {
    // Network- eller nøkkel-feil skal ikke velte UI-et. Tom response → "Ingen treff".
    return empty;
  }
}
