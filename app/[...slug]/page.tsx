/**
 * Catch-all katalog-resolver — støtter nested paths slik WP/Woo leverer dem.
 *
 * URL-mønster (per revidert ADR-0007, 2026-04-23):
 *   `/{foreldre-kategori}/{barn-kategori}/…/{terminal-slug}`
 *
 * Terminal-segment er det som resolveres mot database:
 *   1. Sjekk `categories.slug` — kategori vinner ved kollisjon.
 *   2. Sjekk `products.slug` (status = 'published').
 *   3. Ellers 404.
 *
 * Vi validerer IKKE foreldrekjeden i første iterasjon — en kategori kan
 * teknisk treffes via flere URL-varianter. Canonical settes alltid fra
 * `slug[]` (den path-en brukeren kom inn på), så Google indekserer det
 * Woo-matchende formatet. Hvis dette blir et duplikat-problem kan vi
 * 301-redirecte ikke-canonical varianter senere.
 *
 * Dedupe mellom `generateMetadata` og `Page` via React `cache()`. Uten det
 * gjør vi 2× Supabase-kall per request. Med det gjør vi 1×.
 *
 * Next.js 16: `params` er en Promise. Husk `await`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';

import { CategoryListViewTracker } from '@/components/analytics/CategoryListViewTracker';
import { ProductViewTracker } from '@/components/analytics/ProductViewTracker';
import { CategoryBrowser } from '@/components/category/CategoryBrowser';
import { CategoryHeaderDefault } from '@/components/category/headers/CategoryHeaderDefault';
import { ProductDetail } from '@/components/product/ProductDetail';
import { fetchProductReviews } from '@/lib/woo/reviews';
import {
  cachedCategoryBySlug,
  cachedProductBySlug,
} from '@/lib/cache/catalog';
import { deriveFilters } from '@/lib/catalog/filters';
import {
  type CatalogProductDetail,
  extractImages,
  getCategoryBreadcrumb,
  getBrandById,
  getCategoryDefaultUpsellProductId,
  getCategorySectionTags,
  getProductById,
  getProductBySku,
  listProductsByCategory,
} from '@/lib/supabase/catalog';
import { knivbeskytterSkuForProductAttributes } from '@/lib/upsell/blade-length';
import type { Tables } from '@/types/supabase';

// ISR — siden re-genereres maks hvert 60. sekund per unik URL. Nye besøk
// innenfor det vinduet serveres fra Vercel's edge cache (cache-hit ≈ ~50 ms
// total response-tid uavhengig av Supabase/WP-latency).
//
// Trygt fordi:
//   - Ingen `searchParams`, `cookies()`, `headers()` i denne ruta — alle
//     ville ellers tvinge dynamic rendering uansett ISR-config.
//   - Webhook-baserte invalidering på produkt/kategori-slugs er allerede
//     på plass i lib/cache/catalog.ts; 60s TTL er backstop.
//   - Reviews caches i Redis 10 min, så ISR's 60s vinduer ser konsistent
//     review-data per render.
//
// Stale-revalidate-pattern: når 60s utløper, neste request får gammel
// versjon mens Next regenererer i bakgrunnen. Ingen brukere venter.
export const revalidate = 60;

// Catch-all uten generateStaticParams = ISR on-demand for ALLE paths.
// Vurder å pre-rendere top-100 produkter ved build-tid i Fase 3 hvis
// build-tid forblir akseptabel (~30–60s ekstra).
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/** Reassembler catch-all-segments til canonical path-string for SEO. */
function canonicalPath(segments: string[]): string {
  return `/${segments.join('/')}`;
}

/** Plukk terminal-slug fra catch-all. Tåler tomt array defensivt. */
function terminalSlug(segments: string[]): string | null {
  if (!segments || segments.length === 0) return null;
  return segments[segments.length - 1];
}

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

// ---------- Upsell-resolver -----------------------------------------------

/**
 * Upsell-resolver. Returnerer { product, path } eller null.
 *
 * Lookup-rekkefølge:
 *   1. product.upsell_product_id        — admin overstyrer manuelt (Woo
 *                                          Linked Products → Upsells, første ID)
 *   2. Knivbladlengde → knivbeskytter   — automatisk match basert på
 *                                          attributtet `Knivbladlengde` på
 *                                          kniven, slått opp mot leverandørens
 *                                          5 SKU-er (HTD01-095/150/200/250/300).
 *                                          Se lib/upsell/blade-length.ts.
 *   3. category.default_upsell_product_id — kategori-default fra term-meta
 *                                          `skn_default_upsell_product_id`.
 *
 * Tidligere hadde vi en global hardkodet fallback (knivbeskytter M) som ble
 * vist på ALLE produkter uten match. Den er fjernet 2026-05 — produkter uten
 * match (f.eks. slipesteiner, skjærebrett) skal ikke vise knivbeskytter-upsell.
 *
 * Hopper over hvis upsell-produktet er produktet selv (unngår selv-referanse).
 */
async function resolveUpsellProduct(
  product: CatalogProductDetail,
): Promise<{ product: CatalogProductDetail; path: string } | null> {
  // 1. Per-produkt upsell — fra Woo's egne Linked Products → Upsells.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productUpsellId = (product as any).upsell_product_id as
    | number
    | null
    | undefined;

  let upsell: CatalogProductDetail | null = null;
  if (productUpsellId && productUpsellId !== product.id) {
    upsell = await getProductById(productUpsellId);
  }

  // 2. Bladlengde-match → knivbeskytter-SKU. Returnerer null hvis produktet
  // ikke har Knivbladlengde-attributtet (f.eks. slipestein, skjærebrett),
  // og resolveren faller naturlig gjennom til kategori-default.
  if (!upsell) {
    const sku = knivbeskytterSkuForProductAttributes(product.attributes);
    if (sku) {
      const candidate = await getProductBySku(sku);
      if (candidate && candidate.id !== product.id) {
        upsell = candidate;
      }
    }
  }

  // 3. Kategori-default — første kategori produktet ligger i som har en default.
  if (!upsell && product.categories && product.categories.length > 0) {
    for (const catId of product.categories) {
      const defaultId = await getCategoryDefaultUpsellProductId(catId);
      if (defaultId && defaultId !== product.id) {
        upsell = await getProductById(defaultId);
        if (upsell) break;
      }
    }
  }

  if (!upsell) return null;
  return { product: upsell, path: upsell.slug };
}

// ---------- Slug-resolver -------------------------------------------------

type Resolved =
  | { kind: 'category'; category: Tables<'categories'> }
  | { kind: 'product'; product: CatalogProductDetail }
  | null;

// React `cache()` dedupliserer innenfor én request (generateMetadata + Page).
// Redis ligger under: `cachedCategoryBySlug`/`cachedProductBySlug` sjekker
// Upstash først, faller tilbake til Supabase ved miss. Se lib/cache/catalog.ts.
const fetchCategory = cache(cachedCategoryBySlug);
const fetchProduct = cache(cachedProductBySlug);
const fetchCategoryProducts = cache((id: number) =>
  listProductsByCategory(id, { limit: 200 }),
);

/**
 * Kjør begge lookups i parallell. Kategori vinner hvis begge matcher
 * (ADR-0007). I praksis er kategori-tabellen ~8× mindre enn produkt-tabellen,
 * men begge oppslag er O(1) på slug-indeksen — dominerende kost er
 * nettverks-RTT til Supabase, som vi halverer ved å kjøre i parallell.
 */
const resolveSlug = cache(async (slug: string): Promise<Resolved> => {
  const [category, product] = await Promise.all([
    fetchCategory(slug),
    fetchProduct(slug),
  ]);
  if (category) return { kind: 'category', category };
  if (product) return { kind: 'product', product };
  return null;
});

// ---------- Metadata ------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const terminal = terminalSlug(slug);
  if (!terminal) return { title: 'Ikke funnet' };

  const resolved = await resolveSlug(terminal);
  if (!resolved) {
    return { title: 'Ikke funnet' };
  }

  // Canonical = den nested path-en brukeren kom inn på. Speiler WP/Woo og
  // gjør 301-kartet fra gammel butikk til en identitets-mapping.
  const canonical = canonicalPath(slug);

  if (resolved.kind === 'category') {
    const c = resolved.category;
    return {
      title: c.seo_title ?? c.name,
      description: c.seo_description ?? c.description ?? undefined,
      alternates: { canonical },
    };
  }

  const p = resolved.product;
  return {
    title: p.seo_title ?? p.name,
    description: p.seo_description ?? p.short_description ?? undefined,
    alternates: { canonical },
  };
}

// ---------- Page ----------------------------------------------------------

export default async function RotSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const terminal = terminalSlug(slug);
  if (!terminal) notFound();

  const resolved = await resolveSlug(terminal);
  if (!resolved) notFound();

  if (resolved.kind === 'category') {
    const [products, breadcrumb, sectionTags] = await Promise.all([
      fetchCategoryProducts(resolved.category.id),
      getCategoryBreadcrumb(resolved.category),
      getCategorySectionTags(resolved.category.id),
    ]);
    return (
      <CategoryView
        category={resolved.category}
        products={products}
        breadcrumb={breadcrumb}
        sectionTags={sectionTags}
      />
    );
  }

  // Parallelliser de fire uavhengige fetchene. Tidligere kjørte de
  // sekvensielt (reviews → brand → related → upsell), noe som la
  // ~230 ms på cold-load. Promise.all er trygt fordi ingen av dem
  // leser hverandres resultat. Fail-mode per call er fortsatt graceful:
  // - reviews: returnerer [] ved feil
  // - getBrandById: returnerer null
  // - listProductsByCategory: returnerer []
  // - resolveUpsellProduct: returnerer null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brandId = (resolved.product as any).brand_id as number | null | undefined;
  const primaryCategoryId = resolved.product.categories?.[0];

  const [reviews, brand, relatedRaw, upsellProduct] = await Promise.all([
    fetchProductReviews(resolved.product.id),
    brandId ? getBrandById(brandId) : Promise.resolve(null),
    primaryCategoryId
      ? listProductsByCategory(primaryCategoryId, { limit: 12 })
      : Promise.resolve([] as Awaited<ReturnType<typeof listProductsByCategory>>),
    // Upsell — hybrid lookup-rekkefølge:
    //   1. product.upsell_product_id (Woo Linked Products → Upsells)
    //   2. category.default_upsell_product_id (skn_default_upsell_product_id-meta
    //      på første kategori produktet ligger i)
    //   3. Global hardkodet fallback (knivbeskytter-m)
    resolveUpsellProduct(resolved.product),
  ]);

  // Relaterte produkter: trim seg selv ut og kapp til 5. Filtreringen må
  // skje etter parallel-fetchen siden vi trenger product.id i scope.
  const relatedProducts = relatedRaw
    .filter((p) => p.id !== resolved.product.id)
    .slice(0, 5);

  return (
    <main className="w-full">
      <ProductDetail
        product={resolved.product}
        slugSegments={slug}
        reviews={reviews}
        brand={brand}
        relatedProducts={relatedProducts}
        upsellProduct={upsellProduct}
      />
      <ProductViewTracker product={resolved.product} />
    </main>
  );
}

// ---------- Filter & sort definitions -------------------------------------
//
// Filtere avledes fra kategoriens faktiske produktliste — se
// `lib/catalog/filters.ts` og `deriveFilters()`. Det inkluderer både synlige
// Woo-attributter (pa_merke, pa_type, osv. fra `products.attributes`) og et
// naturlig pris-bucket-filter. Ingen hardkodede placeholder-valg lenger.
//
// Sort-alternativene er en fast liste — de er ikke kategori-avhengige.
//
// Default = 'name' (A–Å). Det matcher det SectionedView allerede gjør på
// kategorier med tag-seksjoner, så standardisere alle kategori-sider på
// samme rekkefølge gir mer forutsigbar UX. Utsolgt-håndtering pusher fortsatt
// out-of-stock til bunn uavhengig av valgt sort (se lib/catalog/sort.ts).

const SORT_OPTIONS = [
  { value: 'name', label: 'Navn: A–Å' },
  { value: 'price-asc', label: 'Pris: lav → høy' },
  { value: 'price-desc', label: 'Pris: høy → lav' },
  { value: 'newest', label: 'Nyeste først' },
  { value: 'popular', label: 'Mest populær' },
];

// ---------- Views ---------------------------------------------------------

function CategoryView({
  category,
  products,
  breadcrumb,
  sectionTags,
}: {
  category: Tables<'categories'>;
  products: Awaited<ReturnType<typeof listProductsByCategory>>;
  breadcrumb: Awaited<ReturnType<typeof getCategoryBreadcrumb>>;
  sectionTags: Awaited<ReturnType<typeof getCategorySectionTags>>;
}) {
  const hasSections = sectionTags.length > 0;
  // Filtere kun i standard grid-modus — seksjonsvisningen filtrerer ikke
  const filters = hasSections ? [] : deriveFilters(products);

  return (
    <main className="w-full">
      {/* Svart editorial-band — full-bleed, Paper 380-0. */}
      <CategoryHeaderDefault
        title={category.name}
        description={category.description}
        productCount={products.length}
        breadcrumb={breadcrumb}
      />

      {/* CategoryBrowser eier filter+sort-state og rendrer FilterBar + grid
          sammen. Client component — all filtrering og sortering skjer synkront
          i browser over ~200 pre-lastede produkter.
          Suspense-boundary er påkrevd av Next 16 når klient-trekket bruker
          `useSearchParams` (via `useFilterUrlState`) — uten den opt'er hele
          ruten inn i dynamic rendering fra en utilsiktet kant-sak. */}
      <Suspense fallback={null}>
        <CategoryBrowser
          products={products}
          filters={filters}
          sortOptions={SORT_OPTIONS}
          listId={`category:${category.slug}`}
          sectionTags={sectionTags}
        />
      </Suspense>

      {/* Analytics — fyrer `view_item_list` én gang per kategori-slug.
          Plassert etter gridet så det ikke blokkerer visuell render. */}
      <CategoryListViewTracker
        listId={`category:${category.slug}`}
        listName={category.name}
        products={products}
      />
    </main>
  );
}

