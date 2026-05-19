'use client';

/**
 * CategoryBrowser — client-side interaktiv del av kategori-siden.
 *
 * To render-modi:
 *
 * 1. Standard grid (ingen sectionTags):
 *    FilterBar + ProductGrid, all sortering/filtrering klient-side.
 *
 * 2. Seksjonert visning (sectionTags.length > 0):
 *    Ingen FilterBar — produktene vises gruppert per tag-seksjon med
 *    seksjonstittel og -beskrivelse øverst. Produkter uten matching tag
 *    vises i en "Øvrige"-seksjon til slutt (hvis > 0 produkter).
 *    Rekkefølgen styres av `sectionTags`-arrayet (fra categories.section_tag_slugs).
 */

import { useMemo } from 'react';

import { ProductGrid } from '@/components/ProductGrid';
import type { CatalogListItem } from '@/lib/supabase/catalog';
import type { CategorySectionTag } from '@/lib/supabase/catalog';
import { filterProducts } from '@/lib/catalog/filters';
import { sortProducts } from '@/lib/catalog/sort';
import type { SortValue } from '@/lib/catalog/sort';
import { useFilterUrlState } from '@/lib/catalog/useFilterUrlState';

import { FilterBar, type FilterDef } from './filters/FilterBar';
import { FilterBarMobile } from './filters/FilterBarMobile';
import type { SortOption } from './filters/SortDropdown';

export interface CategoryBrowserProps {
  products: CatalogListItem[];
  filters: FilterDef[];
  sortOptions: SortOption[];
  defaultSort?: string;
  listId?: string;
  /** Seksjoner fra categories.section_tag_slugs → product_tags. Tom = standard grid. */
  sectionTags?: CategorySectionTag[];
}

export function CategoryBrowser({
  products,
  filters,
  sortOptions,
  defaultSort,
  listId,
  sectionTags = [],
}: CategoryBrowserProps) {
  const hasSections = sectionTags.length > 0;

  const filterKeys = useMemo(() => filters.map((f) => f.key), [filters]);
  const sortValues = useMemo(() => sortOptions.map((o) => o.value), [sortOptions]);
  const resolvedDefaultSort = defaultSort ?? sortOptions[0]?.value ?? 'popular';

  const { selections, sort, setSelections, setSort } = useFilterUrlState({
    filterKeys,
    sortValues,
    defaultSort: resolvedDefaultSort,
  });

  const visibleProducts = useMemo(() => {
    const filtered = filterProducts(products, selections);
    return sortProducts(filtered, sort);
  }, [products, selections, sort]);

  // ---------------------------------------------------------------------------
  // Seksjonert visning
  // ---------------------------------------------------------------------------
  if (hasSections) {
    return (
      <SectionedView
        products={visibleProducts}
        sectionTags={sectionTags}
        listId={listId}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Standard grid-visning med filter/sort
  // ---------------------------------------------------------------------------
  return (
    <>
      <div className="hidden md:block">
        <FilterBar
          filters={filters}
          sortOptions={sortOptions}
          selections={selections}
          onSelectionsChange={setSelections}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      <FilterBarMobile
        filters={filters}
        sortOptions={sortOptions}
        selections={selections}
        onSelectionsChange={setSelections}
        sort={sort}
        onSortChange={setSort}
        matchCount={visibleProducts.length}
      />

      <div className="px-sp-2 py-sp-3 sm:px-sp-7 sm:py-sp-7">
        <ProductGrid products={visibleProducts} listId={listId} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Seksjonert visning
// ---------------------------------------------------------------------------

function SectionedView({
  products,
  sectionTags,
  listId,
}: {
  products: CatalogListItem[];
  sectionTags: CategorySectionTag[];
  listId?: string;
}) {
  // I seksjonsvisning sorterer vi ALLTID på navn (alfabetisk), med utsolgt
  // bakerst. `sortProducts` partisjonerer in-stock før out-of-stock automatisk.
  const sortBy: SortValue = 'name';

  // Lag sett for å spore hvilke produkter som er plassert
  const placedIds = new Set<number>();

  const sections = sectionTags.map((tag) => {
    const sectionProducts = sortProducts(
      products.filter((p) => p.tagSlugs?.includes(tag.slug)),
      sortBy,
    );
    sectionProducts.forEach((p) => placedIds.add(p.id));
    return { tag, products: sectionProducts };
  });

  // Produkter som ikke havnet i noen seksjon — sorteres samme måte
  const unsectioned = sortProducts(
    products.filter((p) => !placedIds.has(p.id)),
    sortBy,
  );

  return (
    <div className="px-sp-3 sm:px-sp-7">
      {sections.map(({ tag, products: sectionProducts }) => {
        if (sectionProducts.length === 0) return null;
        return (
          <section key={tag.slug} className="py-sp-7 border-b border-divider last:border-b-0">
            <SectionHeader name={tag.name} description={tag.description} />
            <ProductGrid products={sectionProducts} listId={listId ? `${listId}:${tag.slug}` : undefined} />
          </section>
        );
      })}

      {unsectioned.length > 0 && (
        <section className="py-sp-7">
          <ProductGrid products={unsectioned} listId={listId} />
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  name,
  description,
}: {
  name: string;
  description: string | null;
}) {
  return (
    <div className="mb-sp-5">
      <h2 className="text-h3 font-bold text-ink">{name}</h2>
      {description && (
        <p className="mt-sp-2 max-w-2xl text-body text-ink-muted">{description}</p>
      )}
    </div>
  );
}
