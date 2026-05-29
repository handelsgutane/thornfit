/**
 * /sok — søkeresultatside.
 *
 * Følger samme strukturelle mønster som kategori-sider (`/[...slug]`):
 *
 *   <main className="w-full">
 *     <SearchHeaderDefault />        ← svart editorial-band (Paper 380-0)
 *     <CategoryChipsRow />           ← kompakt fasett-rad (samme som FilterBar's
 *                                      aktiv-chip-rad, men kategori-only)
 *     <div className="px-sp-2 sp-7"> ← samme padding-wrapper som CategoryBrowser
 *       <ProductGrid />              ← gjenbruk av kortet og responsive grid
 *     </div>
 *   </main>
 *
 * URL-state er kilden til sannheten. Tre params:
 *   - `q`   — søkestreng (påkrevet for treff). Trim'es server-side.
 *   - `cat` — valgfri kategori-slug (matcher Algolia-facet `category_slugs`).
 *   - `page` — 0-indeksert side. Default 0.
 *
 * Render-flyt:
 *   1. Algolia-hit (server-side via `algoliasearch/lite`) gir oss IDs +
 *      paginering + facet-tellinger.
 *   2. Vi henter full produktdata fra Supabase via `listProductsByIds()`
 *      slik at kortet får faktiske priser, salg, lager, rating osv.
 *      Algolia-indekset mangler salgspris-feltene per nå (chef-storefront-
 *      shape). Frontend skal aldri vise stale priser.
 *   3. Vi bevarer Algolia-rekkefølgen ved å sortere etter hit-rangen.
 *
 * SEO:
 *   - ISR-cachet på (q, cat, page)-tuple. Trygt fordi Algolia-rangering er
 *     deterministisk innenfor 60s-vinduet.
 *   - `noindex` på alle søkesider — folk skal finne produkter via kategori-
 *     og produktsider, ikke via søkesider med tynn content.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductGrid } from '@/components/ProductGrid';
import { CategoryFilterChip } from '@/components/category/filters/CategoryFilterChip';
import { SearchHeaderDefault } from '@/components/search/SearchHeaderDefault';
import { SearchPagination } from '@/components/search/SearchPagination';
import { searchProducts } from '@/lib/search/client';
import { listProductsByIds, type CatalogListItem } from '@/lib/supabase/catalog';

// ISR — siden re-genereres maks hvert 60. sekund per unik (q, cat, page)-tuple.
export const revalidate = 60;
export const dynamicParams = true;

const HITS_PER_PAGE = 24;

interface SearchPageProps {
  searchParams: Promise<{
    q?: string | string[];
    cat?: string | string[];
    page?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parsePage(value: string | null): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = (firstParam(params.q) ?? '').trim();

  if (!q) {
    return {
      title: 'Søk',
      robots: { index: false, follow: true },
    };
  }

  return {
    title: `Søk: ${q}`,
    description: `Søkeresultater for «${q}» på THORN FIT.`,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = (firstParam(params.q) ?? '').trim();
  const cat = firstParam(params.cat);
  const page = parsePage(firstParam(params.page));

  // ---- Tom query: render header med prompt + null grid ---------------------
  if (!q) {
    return (
      <main className="w-full">
        <SearchHeaderDefault query="" nbHits={0} category={null} />
        <EmptyState
          title="Skriv inn et søkeord for å starte"
          body="Du kan søke på produktnavn, merke, eller en knivtype som «Gyuto»."
        />
      </main>
    );
  }

  // ---- Hent fra Algolia + Supabase (parallel) -----------------------------
  const results = await searchProducts(q, {
    hitsPerPage: HITS_PER_PAGE,
    page,
    categorySlug: cat,
    facets: ['category_paths'],
  });

  let products: CatalogListItem[] = [];
  if (results.hits.length > 0) {
    const ids = results.hits.map((h) => h.productId).filter((id) => id > 0);
    const fetched = await listProductsByIds(ids);
    const byId = new Map(fetched.map((p) => [p.id, p]));
    products = results.hits
      .map((h) => byId.get(h.productId))
      .filter((p): p is CatalogListItem => p !== undefined);
  }

  // Top 8 kategori-fasetter for chip-raden.
  const categoryFacets = (results.facets.category_paths ?? []).slice(0, 8);

  return (
    <main className="w-full">
      {/* Svart editorial-band — speiler kategori-sider (Paper 380-0). */}
      <SearchHeaderDefault
        query={q}
        nbHits={results.nbHits}
        category={cat}
        clearCategoryHref={{ pathname: '/sok', query: { q } }}
      />

      {/* Kategori-chip-rad — kompakt fasett-filter. Samme posisjon som
          FilterBar's aktiv-chip-rad i kategori-sider, men her kun kategori
          (Algolia-indeksen mangler attributt-fasetter per nå). Skjul hvis
          det er <2 kategorier (én er ikke et reelt valg). */}
      {categoryFacets.length > 1 && (
        <div className="border-b border-divider bg-surface px-sp-2 py-sp-3 sm:px-sp-7">
          <div className="flex flex-wrap items-center gap-sp-2">
            <CategoryFilterChip
              label={`Alle (${results.nbHits})`}
              href={`/sok?q=${encodeURIComponent(q)}`}
              active={!cat}
            />
            {categoryFacets.map((bucket) => (
              <CategoryFilterChip
                key={bucket.value}
                label={`${formatCategoryLabel(bucket.value)} (${bucket.count})`}
                href={`/sok?q=${encodeURIComponent(q)}&cat=${encodeURIComponent(bucket.value)}`}
                active={cat === bucket.value}
              />
            ))}
          </div>
        </div>
      )}

      {/* Resultater — samme padding-wrapper som CategoryBrowser bruker rundt
          ProductGrid (linje 106 i CategoryBrowser.tsx): kompakt på mobil,
          generøs på sm+. Sikrer at kortene ikke går helt ut til kantene. */}
      <div className="px-sp-2 py-sp-3 sm:px-sp-7 sm:py-sp-7">
        {products.length === 0 ? (
          <EmptyState
            title={`Ingen treff for «${q}»`}
            body="Sjekk stavemåten, eller prøv et bredere søkeord — for eksempel knivtype eller merke."
          />
        ) : (
          <>
            <ProductGrid products={products} listId={`search:${q}`} />

            {results.nbPages > 1 && (
              <div className="mt-sp-7">
                <SearchPagination
                  currentPage={page}
                  totalPages={results.nbPages}
                  buildHref={(p) => ({
                    pathname: '/sok',
                    query: {
                      q,
                      ...(cat ? { cat } : {}),
                      ...(p > 0 ? { page: String(p) } : {}),
                    },
                  })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ---------- Sub-komponenter (lokale, ikke gjenbrukbare nok for /components) ----

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-sp-3 py-16 text-center">
      <h2 className="text-h3 font-bold text-ink">{title}</h2>
      <p className="max-w-prose text-body text-ink-muted">{body}</p>
      <Link
        href="/"
        className="mt-sp-3 text-body-sm font-bold text-aka transition-colors hover:text-ink"
      >
        Tilbake til forsiden →
      </Link>
    </div>
  );
}

function formatCategoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((word, idx) =>
      idx === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(' ');
}
