/**
 * Catalog read helpers — brukes av sitemap, RSC-sider, API-routes.
 *
 * Holder Supabase-spørringene i ett lag slik at RSC og sitemap ikke duplikerer
 * logikk. Alle funksjoner returnerer tomme arrays hvis tabellene ikke eksisterer
 * enda (f.eks. under første scaffolding før migrasjoner er kjørt).
 *
 * Skjema-kilde: docs/data-model.md og supabase/migrations/.
 *
 * NB: `products.categories` er en `bigint[]`-kolonne (ikke en M2M-FK). Derfor
 * kan vi ikke be PostgREST om auto-join til `categories`. Vi gjør det i stedet
 * i to queries og joiner i TS.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger, serializeError } from '@/lib/logger';
import { cacheGet, cacheInvalidate } from '@/lib/redis/client';
import { decodeHtmlEntities } from '@/lib/utils/html';
import type { Tables } from '@/types/supabase';

// ---------- Redis cache-nøkler --------------------------------------------
//
// Path-map og brand er praktisk talt statisk metadata som tidligere ble
// hentet på hver eneste produktforespørsel. Caching kutter ~30–80 ms per
// product-page-render. KEY_VERSION bumpes hvis returshapen endres.

const CATALOG_CACHE_KEY_VERSION = 'v1';
const CATEGORY_PATH_MAP_KEY = `catalog:${CATALOG_CACHE_KEY_VERSION}:category-path-map`;
const CATEGORY_PATH_MAP_TTL = 3600; // 1 time — invalideres eksplisitt fra cron

function brandCacheKey(id: number): string {
  return `catalog:${CATALOG_CACHE_KEY_VERSION}:brand:${id}`;
}

const BRAND_TTL = 3600;

/**
 * Public invalidatorer — kalles fra cron etter upsert. Holdes lokalt for å
 * unngå sirkulær import mellom catalog.ts og cache/catalog.ts.
 */
export async function invalidateCategoryPathMapCache(): Promise<void> {
  // Path-map og name-map er begge avledet fra `categories`-tabellen, så
  // de invalideres samtidig. Holdes som ett kall så call-sites slipper
  // å huske begge.
  await cacheInvalidate([CATEGORY_PATH_MAP_KEY, CATEGORY_NAME_MAP_KEY]);
}

export async function invalidateBrandCache(id: number): Promise<void> {
  await cacheInvalidate(brandCacheKey(id));
}

export interface CatalogProductUrl {
  slug: string;
  /**
   * Full nested path for primær-kategori, uten leading slash. Bruk til å bygge
   * `/{categoryPath}/{slug}` i sitemap og intern-lenker. Se revidert ADR-0007
   * (2026-04-23). `null` hvis produktet mangler kategori — kall-sted må da
   * falle tilbake til flat `/{slug}` eller filtrere det ut.
   */
  categoryPath: string | null;
  updatedAt: string;
}

export interface CatalogCategoryUrl {
  /** Terminal slug (kategoriens egen slug, uten foreldre-kjeden). */
  slug: string;
  /** Full nested path uten leading slash, f.eks. `bryner/slipekurs`. */
  path: string;
  updatedAt: string;
}

/**
 * Shape brukt av `app/produkter`-listesiden. Holder den liten så listing er
 * rask — detaljer hentes på produkt-slug-siden.
 *
 * `filterValues` er valgfri og populeres kun av fetchers som trenger filter-
 * data (typisk `listProductsByCategory`). Holdt `undefined` i sitemap- og
 * flat-listing-kall for å unngå å inflate payload der den ikke brukes.
 */
export interface CatalogListItem {
  id: number;
  slug: string;
  name: string;
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;
  stockStatus: string | null;
  primaryImage: CatalogImage | null;
  /** Kategori-slug for brand-label-rendering i kortet. */
  primaryCategorySlug: string | null;
  /** Full nested path til primær-kategori — bruk for href-bygging. */
  primaryCategoryPath: string | null;
  /**
   * Valgte attributt-verdier per key (f.eks. `pa_merke` → { label: "Merke",
   * values: ["Global"] }). Drevet av Woo `products.attributes`. Kun synlige
   * (visible=true), ikke-variasjons (variation=false) attributter inkluderes.
   */
  filterValues?: Record<string, ProductFilterValue>;
  /**
   * Kort spec-linje under navnet i produktkortet, f.eks. "210mm · VG10"
   * (Paper 47P-0). Avledet server-side fra `products.short_description`
   * (HTML strippet, første linje, maks ~40 tegn). `null` hvis ikke relevant.
   */
  subtitle?: string | null;
  /**
   * Gjennomsnittlig vurdering 0–5 (Woo `average_rating`). `null` hvis
   * produktet ikke har noen reviews enda. TODO: kobles til
   * `products.average_rating` når kolonnen er migrert inn — for nå
   * leverer kataloglesere `null` og UI-en faller tilbake til "ingen rating".
   */
  averageRating?: number | null;
  /**
   * Antall reviews (Woo `rating_count`). Parer med `averageRating`. `null`
   * før data-pipeline er på plass.
   */
  ratingCount?: number | null;
  /**
   * Array av product_tag.slug — brukes for klient-side seksjonsfiltrering
   * på kategori-landingssider med section_tag_slugs.
   */
  tagSlugs?: string[];
}

export interface ProductFilterValue {
  /** Human-readable attributt-navn (f.eks. "Merke"). Stabilt i Woo. */
  label: string;
  /** Valgte verdier på dette produktet. Rå-strenger som `"Wüsthof"`. */
  values: string[];
}

/** Shape for en enkelt Woo-attributt i `products.attributes`-JSON. */
interface WooAttributeJson {
  id?: number;
  name?: string;
  slug?: string;
  position?: number;
  visible?: boolean;
  variation?: boolean;
  options?: unknown;
}

export interface CatalogImage {
  src: string;
  alt: string;
}

/**
 * Shape brukt av produkt-detaljsiden.
 *
 * Har både `categorySlugs` (terminal-slugs) og `categoryPaths` (full nested).
 * Terminal-slug brukes som label-tekst på chips; path brukes til `href`.
 */
export interface CatalogProductDetail extends Tables<'products'> {
  primaryCategorySlug: string | null;
  primaryCategoryPath: string | null;
  categorySlugs: string[];
  categoryPaths: string[];
}

/** Form for WooCommerce-bilder i `products.images`-JSON. */
interface WooImageJson {
  id?: number;
  src?: string;
  name?: string;
  alt?: string;
  position?: number;
}

const UNDEFINED_TABLE = '42P01';
const DEFAULT_LIST_LIMIT = 200;

/**
 * Alle publiserte produkter med primær-kategori-slug for URL-bygging.
 *
 * Returnerer `[]` hvis tabellene ikke eksisterer (Supabase ikke koblet opp
 * enda, eller migrasjonene ikke kjørt).
 */
export async function listPublishedProductUrls(): Promise<CatalogProductUrl[]> {
  const client = createServiceRoleClient();

  const { data: products, error: productsError } = await client
    .from('products')
    .select('slug, updated_at, categories')
    .eq('status', 'published')
    .limit(5000);

  if (productsError) {
    if (productsError.code === UNDEFINED_TABLE) {
      logger.warn('products table not found — returning empty product list', {
        hint: 'Run Supabase migrations to create the products table',
      });
      return [];
    }
    logger.error('failed to list published products', serializeError(productsError));
    return [];
  }

  if (!products || products.length === 0) {
    return [];
  }

  // Full path-map bygd én gang — brukes til å sette `categoryPath` per produkt
  // basert på primær-kategori (første element i `categories`).
  const pathMap = await fetchCategoryPathMap();

  return products.map((product) => {
    const primaryCategoryId = product.categories[0];
    const categoryPath =
      primaryCategoryId !== undefined
        ? (pathMap.get(primaryCategoryId)?.path ?? null)
        : null;

    return {
      slug: product.slug,
      categoryPath,
      updatedAt: product.updated_at,
    };
  });
}

/**
 * Alle kategorier med slug. Returnerer `[]` hvis tabellen mangler.
 */
export async function listCategoryUrls(): Promise<CatalogCategoryUrl[]> {
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('categories')
    .select('id, slug, synced_at')
    .order('display_order', { ascending: true, nullsFirst: false });

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      logger.warn('categories table not found — returning empty category list');
      return [];
    }
    logger.error('failed to list categories', serializeError(error));
    return [];
  }

  // Bygg path-map én gang. Rader som mangler fra map-en (skal ikke skje) får
  // fallback til egen slug.
  const pathMap = await fetchCategoryPathMap();

  return (data ?? []).map((row) => ({
    slug: row.slug,
    path: pathMap.get(row.id)?.path ?? row.slug,
    updatedAt: row.synced_at,
  }));
}

/**
 * Publiserte produkter for katalog-listing. Joiner primær-kategori-slug i TS
 * (samme to-query-mønster som `listPublishedProductUrls`).
 */
export async function listPublishedProducts(
  options: { limit?: number } = {},
): Promise<CatalogListItem[]> {
  const limit = options.limit ?? DEFAULT_LIST_LIMIT;
  const client = createServiceRoleClient();

  const { data: products, error } = await client
    .from('products')
    .select(
      'id, slug, name, price, regular_price, sale_price, stock_status, images, categories, average_rating, rating_count, updated_at',
    )
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      logger.warn('products table not found — returning empty product list');
      return [];
    }
    logger.error('failed to list published products', serializeError(error));
    return [];
  }

  if (!products || products.length === 0) return [];

  const pathMap = await fetchCategoryPathMap();

  return products.map((product) => {
    const primaryId = product.categories[0];
    const primary = primaryId !== undefined ? pathMap.get(primaryId) : undefined;
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      regularPrice: product.regular_price,
      salePrice: product.sale_price,
      stockStatus: product.stock_status,
      primaryImage: pickPrimaryImage(product.images),
      primaryCategorySlug: primary?.slug ?? null,
      primaryCategoryPath: primary?.path ?? null,
      averageRating: product.average_rating,
      ratingCount: product.rating_count,
    };
  });
}

/**
 * Publisert produkt by slug, eller `null` om det ikke finnes.
 * Bruker i produkt-detaljsiden — returnerer råraden pluss joined kategori-slugs
 * og -paths. Chip-UI trenger begge: slug til label-tekst, path til href.
 */
export async function getProductBySlug(
  slug: string,
): Promise<CatalogProductDetail | null> {
  const client = createServiceRoleClient();

  const { data: product, error } = await client
    .from('products')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      logger.warn('products table not found — returning null');
      return null;
    }
    logger.error('failed to get product by slug', { slug, ...serializeError(error) });
    return null;
  }

  if (!product) return null;

  const pathMap = await fetchCategoryPathMap();
  const infos = product.categories
    .map((id) => pathMap.get(id))
    .filter((v): v is CategoryPathInfo => v !== undefined);
  const categorySlugs = infos.map((i) => i.slug);
  const categoryPaths = infos.map((i) => i.path);

  return {
    ...product,
    primaryCategorySlug: categorySlugs[0] ?? null,
    primaryCategoryPath: categoryPaths[0] ?? null,
    categorySlugs,
    categoryPaths,
  };
}

/**
 * Hent produkt på SKU. Brukes av size-mapping-resolveren for knivbeskytter:
 * SKU er stabil identifier fra leverandør og endrer seg ikke selv om vi
 * navngir produktet om i WP. Caches i Redis 1 time — invalideres ikke
 * eksplisitt fra cron pga. ekstra kompleksitet (vi må diffe gamle/nye
 * SKU-er per produkt). TTL-en er kort nok til at dette er akseptabelt.
 */
export async function getProductBySku(
  sku: string,
): Promise<CatalogProductDetail | null> {
  return cacheGet<CatalogProductDetail | null>(
    `catalog:${CATALOG_CACHE_KEY_VERSION}:product-by-sku:${sku}`,
    async () => {
      const client = createServiceRoleClient();

      const { data: product, error } = await client
        .from('products')
        .select('*')
        .eq('sku', sku)
        .eq('status', 'published')
        .maybeSingle();

      if (error || !product) return null;

      const pathMap = await fetchCategoryPathMap();
      const infos = product.categories
        .map((catId) => pathMap.get(catId))
        .filter((v): v is CategoryPathInfo => v !== undefined);
      const categorySlugs = infos.map((i) => i.slug);
      const categoryPaths = infos.map((i) => i.path);

      return {
        ...product,
        primaryCategorySlug: categorySlugs[0] ?? null,
        primaryCategoryPath: categoryPaths[0] ?? null,
        categorySlugs,
        categoryPaths,
      };
    },
    3600,
  );
}

/**
 * Hent produkt på id (samme shape som getProductBySlug).
 * Brukes til å hente upsell-produktet etter ID-resolve i kategori-meta.
 */
export async function getProductById(
  id: number,
): Promise<CatalogProductDetail | null> {
  const client = createServiceRoleClient();

  const { data: product, error } = await client
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !product) return null;

  const pathMap = await fetchCategoryPathMap();
  const infos = product.categories
    .map((catId) => pathMap.get(catId))
    .filter((v): v is CategoryPathInfo => v !== undefined);
  const categorySlugs = infos.map((i) => i.slug);
  const categoryPaths = infos.map((i) => i.path);

  return {
    ...product,
    primaryCategorySlug: categorySlugs[0] ?? null,
    primaryCategoryPath: categoryPaths[0] ?? null,
    categorySlugs,
    categoryPaths,
  };
}

/**
 * Hent flere produkter på id (CatalogListItem-shape — for kompakte lister
 * som "Relaterte produkter" i artikkel). Bevarer rekkefølgen fra `ids`.
 * Skjuler ikke-publiserte og ikke-funne stille.
 */
export async function listProductsByIds(
  ids: number[],
): Promise<CatalogListItem[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const client = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('products')
    .select(
      'id, slug, name, price, regular_price, sale_price, stock_status, images, categories, attributes, tag_slugs, average_rating, rating_count, updated_at',
    )
    .in('id', unique)
    .eq('status', 'published');

  if (error || !data || data.length === 0) return [];

  const pathMap = await fetchCategoryPathMap();
  // Bygg index så vi kan returnere i ønsket rekkefølge etterpå.
  const byId = new Map<number, CatalogListItem>();
  for (const product of data as Array<Record<string, unknown>>) {
    const cats = product.categories as number[];
    const primaryId = cats?.[0];
    const primary = primaryId !== undefined ? pathMap.get(primaryId) : undefined;
    byId.set(product.id as number, {
      id: product.id as number,
      slug: product.slug as string,
      name: product.name as string,
      price: product.price as number | null,
      regularPrice: product.regular_price as number | null,
      salePrice: product.sale_price as number | null,
      stockStatus: product.stock_status as string | null,
      primaryImage: pickPrimaryImage(product.images as CatalogImage[]),
      primaryCategorySlug: primary?.slug ?? null,
      primaryCategoryPath: primary?.path ?? null,
      filterValues: mapAttributesToFilterValues(product.attributes),
      tagSlugs: Array.isArray(product.tag_slugs) ? (product.tag_slugs as string[]) : [],
      averageRating: product.average_rating as number | null,
      ratingCount: product.rating_count as number | null,
    });
  }

  // Bevar input-rekkefølge.
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is CatalogListItem => p !== undefined);
}

/**
 * Batch-hent kategori-ID-arrayet for hvert produkt. Brukes av kupong-
 * evaluator for å matche mot `coupon.product_categories`/
 * `excluded_product_categories`. Returnerer en Map keyed på productId;
 * produkter som ikke finnes i Supabase utelates fra resultatet (caller
 * må håndtere `undefined` lookup som "ingen kategorier").
 *
 * Batch-query — én Supabase-rundtur uavhengig av antall items.
 */
export async function getProductCategoriesByIds(
  ids: ReadonlyArray<number>,
): Promise<Map<number, ReadonlyArray<number>>> {
  const result = new Map<number, ReadonlyArray<number>>();
  if (ids.length === 0) return result;

  const unique = Array.from(new Set(ids));
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('products')
    .select('id, categories')
    .in('id', unique)
    .eq('status', 'published');

  if (error || !data) return result;

  for (const row of data as Array<{ id: number; categories: number[] | null }>) {
    result.set(row.id, row.categories ?? []);
  }

  return result;
}

/**
 * Hent default upsell-produkt-ID konfigurert på en kategori (lest fra
 * skn_default_upsell_product_id-term-meta, synket via mu-plugin).
 * Returnerer null hvis ikke satt.
 */
export async function getCategoryDefaultUpsellProductId(
  categoryId: number,
): Promise<number | null> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('categories')
    .select('default_upsell_product_id')
    .eq('id', categoryId)
    .maybeSingle();
  return data?.default_upsell_product_id ?? null;
}

// ---------- Helpers --------------------------------------------------------

/**
 * Kategori-metadata for URL-bygging.
 * - `slug`: kategoriens terminal-slug (uten foreldre).
 * - `path`: full nested path uten leading slash (f.eks. `bryner/slipekurs`).
 */
export interface CategoryPathInfo {
  slug: string;
  path: string;
}

/**
 * Utvidelse av `CategoryPathInfo` med human-readable navn. Brukes på sider
 * som rendrer kategorinavn (f.eks. /tilbud-grupperingen) — vi trenger
 * `name` for label, men ikke for URL-bygging.
 */
export interface CategoryNameInfo extends CategoryPathInfo {
  id: number;
  name: string;
}

/**
 * Henter alle kategorier og bygger en `id → { slug, path }`-map. Brukes av
 * alle queries som må produsere katalog-URLer (sitemap, produkt-lister,
 * produkt-detalj).
 *
 * Hvorfor fetch-alle i stedet for begrenset subset? Kategori-tabellen er
 * liten (~50–100 rader), og vi trenger foreldre-kjeden for å bygge path.
 * Én batch-query er billigere enn rekursive lookups per produkt.
 *
 * Cykle-beskyttelse: hvis en foreldre-kjede selvrefererer (skulle ikke skje
 * pga. FK-constraint, men er defensiv kode), bryter vi loopen og returnerer
 * path-et vi klarte å bygge fram til det punktet.
 */
export async function fetchCategoryPathMap(): Promise<Map<number, CategoryPathInfo>> {
  // Cache-aside via Redis. Vi lagrer som array av [id, info]-entries
  // (Map kan ikke JSON-serialiseres direkte). Treet er ~50–100 rader, så
  // payload er minimalt. Invalideres fra cron etter kategori-upsert.
  type Entry = [number, CategoryPathInfo];
  const entries = await cacheGet<Entry[]>(
    CATEGORY_PATH_MAP_KEY,
    async () => {
      const client = createServiceRoleClient();
      const { data, error } = await client
        .from('categories')
        .select('id, slug, parent_id');

      if (error) {
        if (error.code === UNDEFINED_TABLE) return [];
        logger.error('failed to fetch category path map', serializeError(error));
        return [];
      }

      type Row = { id: number; slug: string; parent_id: number | null };
      const byId = new Map<number, Row>();
      for (const row of (data ?? []) as Row[]) {
        byId.set(row.id, row);
      }

      function buildPath(startId: number): string {
        const segments: string[] = [];
        const visited = new Set<number>();
        let cursor: number | null = startId;
        while (cursor !== null && byId.has(cursor) && !visited.has(cursor)) {
          visited.add(cursor);
          const node = byId.get(cursor) as Row;
          segments.unshift(node.slug);
          cursor = node.parent_id;
        }
        return segments.join('/');
      }

      const out: Entry[] = [];
      for (const row of byId.values()) {
        out.push([row.id, { slug: row.slug, path: buildPath(row.id) }]);
      }
      return out;
    },
    CATEGORY_PATH_MAP_TTL,
  );

  return new Map<number, CategoryPathInfo>(entries);
}

const CATEGORY_NAME_MAP_KEY = `catalog:${CATALOG_CACHE_KEY_VERSION}:category-name-map`;

/**
 * Henter alle kategorier inkludert navn. Brukes på sider som renderer
 * kategorigrupperinger (f.eks. /tilbud) — der vi trenger `name` til
 * label, ikke bare slug/path.
 *
 * Cache-aside via Redis (1t TTL), invalideres fra cron etter category
 * upsert (samme krok som path-map).
 */
export async function fetchCategoryNameMap(): Promise<Map<number, CategoryNameInfo>> {
  type Entry = [number, CategoryNameInfo];
  const entries = await cacheGet<Entry[]>(
    CATEGORY_NAME_MAP_KEY,
    async () => {
      const client = createServiceRoleClient();
      const { data, error } = await client
        .from('categories')
        .select('id, slug, name, parent_id');

      if (error) {
        if (error.code === UNDEFINED_TABLE) return [];
        logger.error('failed to fetch category name map', serializeError(error));
        return [];
      }

      type Row = { id: number; slug: string; name: string; parent_id: number | null };
      const byId = new Map<number, Row>();
      for (const row of (data ?? []) as Row[]) {
        byId.set(row.id, row);
      }

      function buildPath(startId: number): string {
        const segments: string[] = [];
        const visited = new Set<number>();
        let cursor: number | null = startId;
        while (cursor !== null && byId.has(cursor) && !visited.has(cursor)) {
          visited.add(cursor);
          const node = byId.get(cursor) as Row;
          segments.unshift(node.slug);
          cursor = node.parent_id;
        }
        return segments.join('/');
      }

      const out: Entry[] = [];
      for (const row of byId.values()) {
        out.push([
          row.id,
          { id: row.id, name: row.name, slug: row.slug, path: buildPath(row.id) },
        ]);
      }
      return out;
    },
    CATEGORY_PATH_MAP_TTL,
  );

  return new Map<number, CategoryNameInfo>(entries);
}

/**
 * Map Woo-attributt-JSON til `filterValues`-shape på CatalogListItem.
 *
 * Filtrerer ut:
 *   - `visible: false` — skal ikke vises i UI, og derfor ikke filtreres på.
 *   - `variation: true` — definerer variasjoner (f.eks. "Størrelse"), ikke
 *     primært nyttig som katalog-filter. Vi kan revurdere hvis kategori har
 *     fornuftige variasjons-attributter å filtrere på.
 *   - Mangler `name` eller har tom `options`.
 *
 * Nøkkel-valg: Woo-`slug` (f.eks. `pa_merke`) foretrekkes fordi det er
 * stabilt på tvers av stavemåte-endringer i `name`. Mangler `slug` bruker vi
 * slugifisert `name` som fallback.
 */
function mapAttributesToFilterValues(
  raw: unknown,
): Record<string, ProductFilterValue> | undefined {
  if (!Array.isArray(raw)) return undefined;

  const result: Record<string, ProductFilterValue> = {};
  for (const attr of raw as WooAttributeJson[]) {
    if (!attr || typeof attr !== 'object') continue;
    if (attr.visible === false) continue;
    if (attr.variation === true) continue;
    if (typeof attr.name !== 'string' || attr.name.length === 0) continue;
    if (!Array.isArray(attr.options) || attr.options.length === 0) continue;

    // Decode HTML-entiteter — Woo lagrer attributt-options med rå entiteter
    // som `&amp;`, `&oslash;` osv. Filter-dropdown viser teksten as-is, så
    // vi normaliserer her én gang før den havner i Supabase-cellen.
    const values = (attr.options as unknown[])
      .filter((o): o is string => typeof o === 'string' && o.length > 0)
      .map((o) => decodeHtmlEntities(o));
    if (values.length === 0) continue;

    // Nøkkel: slug hvis definert, ellers en enkel lowercased `name`.
    const key =
      typeof attr.slug === 'string' && attr.slug.length > 0
        ? attr.slug
        : attr.name.toLowerCase().replace(/\s+/g, '_');

    result[key] = { label: decodeHtmlEntities(attr.name), values };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Plukk første bilde fra `products.images` (Json). Woo-shape er et array av
 * `{id, src, name, alt, position}`. Hvis arrayet er tomt/ugyldig returnerer vi
 * `null` og UI viser en placeholder.
 */
function pickPrimaryImage(images: unknown): CatalogImage | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0] as WooImageJson;
  if (!first || typeof first.src !== 'string' || first.src.length === 0) return null;
  return {
    src: first.src,
    alt: typeof first.alt === 'string' && first.alt.length > 0 ? first.alt : '',
  };
}

/**
 * Bygg brødsmule-segmenter for en kategori ved å walke parent-kjeden.
 * Returnerer array fra rot → selv, med full nested path som `href` for alle
 * unntatt siste (siste er `aria-current="page"` og rendres som tekst).
 *
 * Bruker samme `fetchCategoryPathMap`-mønster som resten av URL-byggingen —
 * én batch-query mot kategori-tabellen.
 *
 * Første element er alltid "Hjem" → `/` for sammenhengende navigasjon.
 * Hvis kategorien ikke har noen foreldre returnerer vi [Hjem, Selv].
 */
export async function getCategoryBreadcrumb(
  category: Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'parent_id'>,
): Promise<{ label: string; href?: string }[]> {
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('categories')
    .select('id, name, slug, parent_id');

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return [{ label: 'Hjem', href: '/' }, { label: category.name }];
    }
    logger.error('failed to fetch categories for breadcrumb', serializeError(error));
    return [{ label: 'Hjem', href: '/' }, { label: category.name }];
  }

  type Row = {
    id: number;
    name: string;
    slug: string;
    parent_id: number | null;
  };

  const byId = new Map<number, Row>();
  for (const row of (data ?? []) as Row[]) {
    byId.set(row.id, row);
  }

  // Walk parent-kjeden — samle noder fra selv → rot, så reverser.
  const chain: Row[] = [];
  const visited = new Set<number>();
  let cursor: number | null = category.id;
  while (cursor !== null && byId.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    const node = byId.get(cursor) as Row;
    chain.unshift(node);
    cursor = node.parent_id;
  }

  // Bygg href inkrementelt mens vi går gjennom lenken — hver crumb peker til
  // full nested path fra rot til det punktet.
  const segments: string[] = [];
  const items: { label: string; href?: string }[] = [{ label: 'Hjem', href: '/' }];
  chain.forEach((node, i) => {
    segments.push(node.slug);
    const isLast = i === chain.length - 1;
    items.push({
      label: node.name,
      // Siste element er "current page" — drop href for å unngå self-link.
      href: isLast ? undefined : `/${segments.join('/')}`,
    });
  });

  return items;
}

/**
 * Hent én kategori by slug (for kategori-landing-siden). Returnerer `null` om
 * slug ikke finnes.
 */
export async function getCategoryBySlug(slug: string): Promise<Tables<'categories'> | null> {
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return null;
    logger.error('failed to get category by slug', { slug, ...serializeError(error) });
    return null;
  }

  return data;
}

/**
 * Publiserte produkter i en kategori. Bruker `products.categories`-arrayet
 * (bigint[]) med `.contains([categoryId])`.
 */
export async function listProductsByCategory(
  categoryId: number,
  options: { limit?: number } = {},
): Promise<CatalogListItem[]> {
  const limit = options.limit ?? DEFAULT_LIST_LIMIT;
  const client = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error } = await (client as any)
    .from('products')
    .select(
      'id, slug, name, price, regular_price, sale_price, stock_status, images, categories, attributes, tag_slugs, average_rating, rating_count, updated_at',
    )
    .eq('status', 'published')
    .contains('categories', [categoryId])
    .order('updated_at', { ascending: false })
    .limit(limit) as { data: Array<Record<string, unknown>> | null; error: { code: string; message: string } | null };

  if (error) {
    if (error.code === UNDEFINED_TABLE) return [];
    logger.error('failed to list products by category', {
      categoryId,
      ...serializeError(error),
    });
    return [];
  }

  if (!products || products.length === 0) return [];

  const pathMap = await fetchCategoryPathMap();

  return (products as Array<Record<string, unknown>>).map((product) => {
    const cats = product.categories as number[];
    const primaryId = cats[0];
    const primary = primaryId !== undefined ? pathMap.get(primaryId) : undefined;
    return {
      id: product.id as number,
      slug: product.slug as string,
      name: product.name as string,
      price: product.price as number | null,
      regularPrice: product.regular_price as number | null,
      salePrice: product.sale_price as number | null,
      stockStatus: product.stock_status as string | null,
      primaryImage: pickPrimaryImage(product.images as CatalogImage[]),
      primaryCategorySlug: primary?.slug ?? null,
      primaryCategoryPath: primary?.path ?? null,
      filterValues: mapAttributesToFilterValues(product.attributes),
      tagSlugs: Array.isArray(product.tag_slugs) ? (product.tag_slugs as string[]) : [],
      averageRating: product.average_rating as number | null,
      ratingCount: product.rating_count as number | null,
    };
  });
}

/**
 * Alle publiserte produkter som er på salg — `sale_price` satt og lavere
 * enn `regular_price`. Brukes av /tilbud-siden som er en virtuell kategori
 * (ikke en Woo-kategori, men samme grid-mønster).
 *
 * Returnerer rå-listen. Konsumenten (f.eks. /tilbud) grupperer og sorterer
 * etter behov via `sortProducts(list, 'discount')`.
 */
export async function listProductsOnSale(
  options: { limit?: number } = {},
): Promise<CatalogListItem[]> {
  const limit = options.limit ?? 500;
  const client = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error } = await (client as any)
    .from('products')
    .select(
      'id, slug, name, price, regular_price, sale_price, stock_status, images, categories, attributes, tag_slugs, average_rating, rating_count, updated_at',
    )
    .eq('status', 'published')
    .not('sale_price', 'is', null)
    .gt('regular_price', 0)
    .limit(limit) as { data: Array<Record<string, unknown>> | null; error: { code: string; message: string } | null };

  if (error) {
    if (error.code === UNDEFINED_TABLE) return [];
    logger.error('failed to list products on sale', serializeError(error));
    return [];
  }

  if (!products || products.length === 0) return [];

  const pathMap = await fetchCategoryPathMap();
  const items: CatalogListItem[] = [];

  for (const product of products as Array<Record<string, unknown>>) {
    const regular = product.regular_price as number | null;
    const sale = product.sale_price as number | null;
    // Defensivt mot tomme/0-priser i Woo: kun produkter der sale faktisk
    // er lavere enn regular tas med.
    if (
      typeof regular !== 'number' ||
      typeof sale !== 'number' ||
      regular <= 0 ||
      sale >= regular
    ) {
      continue;
    }

    const cats = product.categories as number[];
    const primaryId = cats?.[0];
    const primary = primaryId !== undefined ? pathMap.get(primaryId) : undefined;

    items.push({
      id: product.id as number,
      slug: product.slug as string,
      name: product.name as string,
      price: product.price as number | null,
      regularPrice: regular,
      salePrice: sale,
      stockStatus: product.stock_status as string | null,
      primaryImage: pickPrimaryImage(product.images as CatalogImage[]),
      primaryCategorySlug: primary?.slug ?? null,
      primaryCategoryPath: primary?.path ?? null,
      filterValues: mapAttributesToFilterValues(product.attributes),
      tagSlugs: Array.isArray(product.tag_slugs) ? (product.tag_slugs as string[]) : [],
      averageRating: product.average_rating as number | null,
      ratingCount: product.rating_count as number | null,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export interface Brand {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image: { src?: string; alt?: string } | null;
  region: string | null;
  founded: string | null;
  stats: Array<{ num: string; label: string }> | null;
  videoUrl: string | null;
  heroImageUrl: string | null;
}

/**
 * Henter en brand fra Supabase. Brukes på produktdetaljen for
 * "Om leverandøren"-seksjonen og på /merkevarer/<slug>-siden.
 */
export async function getBrandById(id: number): Promise<Brand | null> {
  // Brands er statisk metadata og ble tidligere hentet på hver
  // produkt-detaljside. Cache-aside via Redis sparer ~30 ms/request.
  // Negativ-resultat caches ikke (vi vil at nyopprettede brands skal
  // synes med en gang fra Supabase).
  return cacheGet<Brand | null>(
    brandCacheKey(id),
    async () => {
      const client = createServiceRoleClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (client as any)
        .from('brands')
        .select(
          'id, slug, name, description, image, region, founded, stats, video_url, hero_image_url',
        )
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return brandFromRow(data);
    },
    BRAND_TTL,
  );
}

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('brands')
    .select('id, slug, name, description, image, region, founded, stats, video_url, hero_image_url')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return brandFromRow(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function brandFromRow(row: any): Brand {
  return {
    id: row.id as number,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description ?? null,
    image: row.image ?? null,
    region: row.region ?? null,
    founded: row.founded ?? null,
    stats: Array.isArray(row.stats) ? row.stats : null,
    videoUrl: row.video_url ?? null,
    heroImageUrl: row.hero_image_url ?? null,
  };
}

/**
 * Liste alle produkter knyttet til en brand. Brukes på /merkevarer/<slug>.
 */
export async function listProductsByBrand(brandId: number): Promise<CatalogListItem[]> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products, error } = await (client as any)
    .from('products')
    .select(
      'id, slug, name, price, regular_price, sale_price, stock_status, images, categories, attributes, tag_slugs, average_rating, rating_count, updated_at',
    )
    .eq('status', 'published')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false })
    .limit(DEFAULT_LIST_LIMIT);

  if (error || !products || products.length === 0) return [];
  const pathMap = await fetchCategoryPathMap();

  return (products as Array<Record<string, unknown>>).map((product) => {
    const cats = product.categories as number[];
    const primaryId = cats[0];
    const primary = primaryId !== undefined ? pathMap.get(primaryId) : undefined;
    return {
      id: product.id as number,
      slug: product.slug as string,
      name: product.name as string,
      price: product.price as number | null,
      regularPrice: product.regular_price as number | null,
      salePrice: product.sale_price as number | null,
      stockStatus: product.stock_status as string | null,
      primaryImage: pickPrimaryImage(product.images as CatalogImage[]),
      primaryCategorySlug: primary?.slug ?? null,
      primaryCategoryPath: primary?.path ?? null,
      filterValues: mapAttributesToFilterValues(product.attributes),
      tagSlugs: Array.isArray(product.tag_slugs) ? (product.tag_slugs as string[]) : [],
      averageRating: product.average_rating as number | null,
      ratingCount: product.rating_count as number | null,
    };
  });
}

// ---------------------------------------------------------------------------
// Seksjonstagger for kategori-landingssider
// ---------------------------------------------------------------------------

export interface CategorySectionTag {
  slug: string;
  name: string;
  description: string | null;
}

/**
 * Henter seksjonstagger for en kategori basert på `categories.section_tag_slugs`.
 * Returnerer en ordnet liste av `{ slug, name, description }` slik at
 * CategoryBrowser kan splitte produktlisten i seksjoner.
 *
 * Returnerer tom liste hvis kategorien ikke har seksjoner definert.
 */
export async function getCategorySectionTags(
  categoryId: number,
): Promise<CategorySectionTag[]> {
  const client = createServiceRoleClient();

  // Hent category.section_tag_slugs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat, error: catErr } = await (client as any)
    .from('categories')
    .select('section_tag_slugs')
    .eq('id', categoryId)
    .single();

  if (catErr || !cat || !cat.section_tag_slugs?.length) return [];

  const slugs: string[] = cat.section_tag_slugs;

  // Hent tag-data for disse slugsene
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tags, error: tagErr } = await (client as any)
    .from('product_tags')
    .select('slug, name, description')
    .in('slug', slugs);

  if (tagErr || !tags) return [];

  // Bevar rekkefølgen fra section_tag_slugs
  type TagRow = { slug: string; name: string; description: string | null };
  const tagMap = new Map<string, TagRow>(
    (tags as TagRow[]).map((t) => [t.slug, t]),
  );
  return slugs
    .map((slug) => tagMap.get(slug))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description ?? null,
    }));
}

/**
 * Alle kategorier på topp-nivå (parent_id IS NULL), sortert etter display_order.
 * Brukes i kategori-oversikt og nav.
 */
export async function listTopLevelCategories(): Promise<Tables<'categories'>[]> {
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('categories')
    .select('*')
    .is('parent_id', null)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    if (error.code === UNDEFINED_TABLE) return [];
    logger.error('failed to list top-level categories', serializeError(error));
    return [];
  }

  return data ?? [];
}

/**
 * Hent alle bilder fra `products.images` (Json), filtrert til de med gyldig `src`.
 * Bruk i detaljsiden der vi viser bilde-galleri.
 */
export function extractImages(images: unknown): CatalogImage[] {
  if (!Array.isArray(images)) return [];
  return (images as WooImageJson[])
    .filter((img) => typeof img?.src === 'string' && img.src.length > 0)
    .map((img) => ({
      src: img.src as string,
      alt: typeof img.alt === 'string' ? img.alt : '',
    }));
}
