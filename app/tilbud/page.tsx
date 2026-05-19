/**
 * /tilbud — Salgsside.
 *
 * Virtuell kategori — ikke en Woo product_cat, men bruker samme visuelle
 * mønster som kategori-sider med tag-seksjoner (`SectionedView`):
 *
 *   <main className="w-full">
 *     <CategoryHeaderDefault />        ← svart hero (Paper 380-0)
 *     <CategoryFilterChips />          ← chip-rad: "Alle | Kjøkkenkniver | …"
 *     <Sections />                     ← per-kategori-grid med SectionHeader
 *   </main>
 *
 * Datakilde: `listProductsOnSale()` — alle publiserte produkter med
 * `sale_price < regular_price`. Default-sortering innen hver seksjon er
 * høyest rabatt først.
 *
 * URL-state:
 *   - `?cat=<slug>` — viser kun den kategorien (ingen seksjoner ellers).
 *   - Ingen `?cat` — viser alle seksjoner gruppert per kategori.
 *
 * SEO:
 *   - ISR 60s. Salgs-status endrer seg ofte; kort TTL holder data fersk.
 *   - `index: true` — /tilbud er en evergreen brand-side med ekte content.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { CategoryListViewTracker } from '@/components/analytics/CategoryListViewTracker';
import { ProductGrid } from '@/components/ProductGrid';
import { CategoryFilterChip } from '@/components/category/filters/CategoryFilterChip';
import { CategoryHeaderDefault } from '@/components/category/headers/CategoryHeaderDefault';
import { sortProducts } from '@/lib/catalog/sort';
import {
  fetchCategoryNameMap,
  listProductsOnSale,
  type CatalogListItem,
  type CategoryNameInfo,
} from '@/lib/supabase/catalog';

export const revalidate = 60;
export const dynamicParams = true;

interface TilbudPageProps {
  searchParams: Promise<{ cat?: string | string[] }>;
}

export const metadata: Metadata = {
  title: 'Tilbud',
  description:
    'Alle produkter på salg akkurat nå — kokkekniver, slipeutstyr og kniv-tilbehør med redusert pris.',
  alternates: { canonical: '/tilbud' },
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function TilbudPage({ searchParams }: TilbudPageProps) {
  const params = await searchParams;
  const activeCatSlug = firstParam(params.cat);

  const [products, nameMap] = await Promise.all([
    listProductsOnSale({ limit: 500 }),
    fetchCategoryNameMap(),
  ]);

  // Gruppér på TOP-LEVEL kategori (parent-kjede-roten av primær-kategorien).
  // Eksempel: produkt med primær = "japanske-kniver" (barn av "kjokkenkniver")
  // havner i "Kjokkenkniver"-bucketen — ikke i en egen "Japanske kniver"-
  // bucket. Dette gir et rent overordnet kategori-filter på tilbudssiden.
  // Produkter uten kategori havner i bucket `null` og rendres som siste
  // "Øvrige"-seksjon.
  const groups = groupByTopLevelCategory(products, nameMap);

  // Aktiv filtrering: hvis ?cat= er satt, behold bare den seksjonen.
  const visibleGroups = activeCatSlug
    ? groups.filter((g) => g.info?.slug === activeCatSlug)
    : groups;

  // Counts per kategori for chip-raden — basert på den FULLE produktlista,
  // ikke filtrert. Slik at brukeren ser "(12)" ved siden av "Kjøkkenkniver"
  // selv når et annet filter er aktivt.
  const chipData = groups
    .filter((g): g is typeof g & { info: CategoryNameInfo } => Boolean(g.info))
    .map((g) => ({ slug: g.info.slug, name: g.info.name, count: g.products.length }));

  return (
    <main className="w-full">
      <CategoryHeaderDefault
        title="Tilbud"
        description={
          activeCatSlug
            ? `Produkter på tilbud i kategorien ${chipData.find((c) => c.slug === activeCatSlug)?.name ?? activeCatSlug}.`
            : 'Produkter med redusert pris akkurat nå, gruppert etter kategori.'
        }
        productCount={
          activeCatSlug
            ? visibleGroups.reduce((sum, g) => sum + g.products.length, 0)
            : products.length
        }
        breadcrumb={[{ label: 'Tilbud', href: '/tilbud' }]}
      />

      {/* Kategori-filter-rad. Chips er Link-er med URL-state — ingen
          klient-side state. `CategoryFilterChip` matcher Paper 38R-0 (samme
          design-token som ActiveFilterChip). "Alle" peker på /tilbud uten ?cat. */}
      {chipData.length > 1 && (
        <div className="border-b border-divider bg-surface px-sp-2 py-sp-3 sm:px-sp-7">
          <div className="flex flex-wrap items-center gap-sp-2">
            <CategoryFilterChip
              label={`Alle (${products.length})`}
              href="/tilbud"
              active={!activeCatSlug}
            />
            {chipData.map((c) => (
              <CategoryFilterChip
                key={c.slug}
                label={`${c.name} (${c.count})`}
                href={`/tilbud?cat=${encodeURIComponent(c.slug)}`}
                active={activeCatSlug === c.slug}
              />
            ))}
          </div>
        </div>
      )}

      {/* Seksjoner — én per kategori. Følger samme mønster som
          CategoryBrowser's SectionedView (gjenbruk av visuelt språk). */}
      <div className="px-sp-3 sm:px-sp-7">
        {visibleGroups.length === 0 ? (
          <EmptyState query={activeCatSlug} />
        ) : (
          visibleGroups.map((group) => (
            <section
              key={group.key}
              className="border-b border-divider py-sp-7 last:border-b-0"
            >
              <SectionHeader
                name={group.info?.name ?? 'Øvrige tilbud'}
                count={group.products.length}
                slug={group.info?.slug}
              />
              <ProductGrid
                products={group.products}
                listId={`tilbud${group.info ? `:${group.info.slug}` : ''}`}
              />
            </section>
          ))
        )}
      </div>

      <CategoryListViewTracker
        listId={activeCatSlug ? `tilbud:${activeCatSlug}` : 'tilbud'}
        listName={
          activeCatSlug
            ? `Tilbud — ${chipData.find((c) => c.slug === activeCatSlug)?.name ?? activeCatSlug}`
            : 'Tilbud'
        }
        products={products}
      />
    </main>
  );
}

// ---------- Group helpers --------------------------------------------------

interface ProductGroup {
  /** Stable React key — slug eller "__none__". */
  key: string;
  /** Null hvis produktet mangler primær-kategori. */
  info: CategoryNameInfo | null;
  products: CatalogListItem[];
}

/**
 * Slug-overstyringer: noen top-level kategorier er ikke meningsfulle som
 * "browse-bucket" på /tilbud og remappes til en annen kategori. Brukstilfelle
 * 2026-05: produkter primært lagt under `knivmerker` (taksonomi for "hvilket
 * merke er dette") skal grupperes som `knivtyper` i stedet, slik at brukerne
 * ser "Knivtyper" og finner de der de forventer.
 *
 * Hvis du legger til flere overstyringer, behold mappingen til EKSISTERENDE
 * top-level-kategorier — ellers vil section header miste navn/URL og falle
 * inn i "Øvrige tilbud"-bucketen.
 */
const TOP_LEVEL_SLUG_REMAP: Record<string, string> = {
  knivmerker: 'knivtyper',
};

/**
 * Grupper produkter på TOP-LEVEL kategori (roten av primær-kategoriens
 * parent-kjede). Bruker `primaryCategoryPath` som er på formen
 * `forelder/barn/...`; første segment er top-level slugen.
 *
 * Seksjons-info hentes fra nameMap basert på top-level-slug, slik at vi
 * får riktig human-readable navn ("Kjøkkenkniver" — ikke "japanske-kniver")
 * og en URL som peker på top-level-kategori-siden.
 *
 * Hver seksjon sorteres med høyest rabatt først. Seksjoner mellom seg
 * sorteres alfabetisk på navn; "Øvrige"-bucket sist.
 */
function groupByTopLevelCategory(
  products: CatalogListItem[],
  nameMap: Map<number, CategoryNameInfo>,
): ProductGroup[] {
  const slugToInfo = new Map<string, CategoryNameInfo>();
  for (const info of nameMap.values()) {
    slugToInfo.set(info.slug, info);
  }

  const bucketsBySlug = new Map<string, CatalogListItem[]>();
  const noneBucket: CatalogListItem[] = [];

  for (const p of products) {
    // Top-level slug = første segment i path. Hvis path mangler, fallback
    // til primaryCategorySlug (som da også vil være "top-level" siden
    // path = slug for kategorier uten forelder).
    const path = p.primaryCategoryPath;
    const rawTopSlug = path
      ? path.split('/')[0]
      : (p.primaryCategorySlug ?? null);

    if (!rawTopSlug) {
      noneBucket.push(p);
      continue;
    }

    // Anvend overstyrings-mapping (f.eks. knivmerker → knivtyper).
    const topSlug = TOP_LEVEL_SLUG_REMAP[rawTopSlug] ?? rawTopSlug;

    const list = bucketsBySlug.get(topSlug);
    if (list) {
      list.push(p);
    } else {
      bucketsBySlug.set(topSlug, [p]);
    }
  }

  const groups: ProductGroup[] = [];
  for (const [slug, list] of bucketsBySlug) {
    const info = slugToInfo.get(slug) ?? null;
    groups.push({
      key: slug,
      info,
      products: sortProducts(list, 'discount'),
    });
  }

  groups.sort((a, b) => {
    const an = a.info?.name ?? '';
    const bn = b.info?.name ?? '';
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    return an.localeCompare(bn, 'nb', { sensitivity: 'base' });
  });

  if (noneBucket.length > 0) {
    groups.push({
      key: '__none__',
      info: null,
      products: sortProducts(noneBucket, 'discount'),
    });
  }

  return groups;
}

// ---------- Sub-komponenter ------------------------------------------------

interface SectionHeaderProps {
  name: string;
  count: number;
  /** Hvis satt, gjøres tittelen til en lenke til kategori-siden. */
  slug?: string;
}

function SectionHeader({ name, count, slug }: SectionHeaderProps) {
  const titleNode = slug ? (
    <Link
      href={`/${slug}`}
      className="transition-colors hover:text-aka"
    >
      {name}
    </Link>
  ) : (
    name
  );

  return (
    <div className="mb-sp-5 flex items-baseline justify-between gap-sp-3">
      <h2 className="text-h3 font-bold text-ink">{titleNode}</h2>
      <p className="shrink-0 text-body-xs text-ink-muted">
        {count} produkt{count === 1 ? '' : 'er'}
      </p>
    </div>
  );
}

function EmptyState({ query }: { query: string | null }) {
  return (
    <div className="flex flex-col items-center gap-sp-3 py-16 text-center">
      <h2 className="text-h3 font-bold text-ink">
        {query
          ? `Ingen tilbud i kategorien «${query}» akkurat nå`
          : 'Ingen tilbud akkurat nå'}
      </h2>
      <p className="max-w-prose text-body text-ink-muted">
        Sjekk innom igjen senere — vi oppdaterer kampanjer jevnlig.
      </p>
      <Link
        href="/tilbud"
        className="mt-sp-3 text-body-sm font-bold text-aka transition-colors hover:text-ink"
      >
        Se alle tilbud →
      </Link>
    </div>
  );
}
