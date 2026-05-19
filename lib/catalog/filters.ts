/**
 * Filter-helpers for kategori-sider.
 *
 * Pure helpers — brukes både server-side (deriveFilters i RSC) og client-side
 * (filterProducts i CategoryBrowser). Ingen side-effekter, ingen Supabase-kall,
 * ingen DOM.
 *
 * Strategi:
 *   - Attributt-filtere (Merke, Type, Stål, etc.) derives fra `filterValues`
 *     på hver `CatalogListItem`. Disse stammer fra `products.attributes` i
 *     Supabase, mappet i `listProductsByCategory`.
 *   - Pris-filter har faste, naturlige NOK-buckets (Under 500 → Over 5 000).
 *     Vi viser kun bøtter som faktisk har produkter, og dropper hele filteret
 *     hvis alt samler seg i én bucket.
 *
 * Filter-nøkler:
 *   - Attributt-filtere: bruker `key`-en fra `filterValues` direkte (f.eks.
 *     `pa_merke` eller slugifisert navn).
 *   - Pris-filter: konstanten `PRICE_FILTER_KEY` med `__`-prefiks så den ikke
 *     kolliderer med en ekte Woo-attributt-slug.
 *
 * Filter-logikk:
 *   - Multi-select per filter: verdier OR-es (produkt må matche minst én).
 *   - Tvers over filtre: AND (produkt må matche alle aktive filter-kolonner).
 *   - Et produkt uten noen av de valgte attributtene er ekskludert — vi
 *     forholder oss konservativt: hvis brukeren velger "Merke: Global" og
 *     produktet ikke har noen Merke-attributt, skjules det.
 */

import type { FilterDef } from '@/components/category/filters/FilterBar';
import type { CatalogListItem } from '@/lib/supabase/catalog';

/** Nøkkel for det syntetiske pris-filteret. Understrek-prefiks hindrer
 *  kollisjon med Woo-attributt-slugs. */
export const PRICE_FILTER_KEY = '__price';

interface PriceBucket {
  value: string;
  label: string;
  /** Inklusiv min. */
  min: number;
  /** Eksklusiv max — `Infinity` for siste bucket. */
  max: number;
}

/**
 * Faste pris-buckets i NOK. Matcher mentale prisklasser norske brukere har
 * for kjøkken-kniver og slipeutstyr. Rekkefølgen bevares i UI.
 */
const PRICE_BUCKETS: readonly PriceBucket[] = [
  { value: '0-500', label: 'Under 500 kr', min: 0, max: 500 },
  { value: '500-1000', label: '500–1 000 kr', min: 500, max: 1000 },
  { value: '1000-2500', label: '1 000–2 500 kr', min: 1000, max: 2500 },
  { value: '2500-5000', label: '2 500–5 000 kr', min: 2500, max: 5000 },
  {
    value: '5000+',
    label: 'Over 5 000 kr',
    min: 5000,
    max: Number.POSITIVE_INFINITY,
  },
];

/**
 * Effektiv pris for filter-sammenligning. Bruker salgspris når den finnes —
 * samme regel som `sort.ts`, så sort og filter "ser" samme pris.
 */
function effectivePrice(p: CatalogListItem): number | null {
  return p.salePrice ?? p.price;
}

function bucketForPrice(price: number): string | null {
  for (const b of PRICE_BUCKETS) {
    if (price >= b.min && price < b.max) return b.value;
  }
  return null;
}

/**
 * Slugifiserer en attributt-verdi til et stabilt `value`-string for
 * filter-options og selections.
 *
 * Norske og tyske tegn dekomponeres og strippes (NFD + accent-fjerning) så
 * `Wüsthof` → `wusthof` og `Tøffel-stål` → `toffel-stal`. Ikke-alfanumeriske
 * tegn erstattes med `-`, deretter trimmes ledende/trailende streker.
 *
 * OBS: Denne slugen lagres ikke i DB og eksponeres ikke i URL-er (ennå) — så
 * tap av unicode-detaljer er akseptabelt. Hvis vi senere legger filter-state
 * i searchParams bør vi vurdere å bytte til Woo-attributtenes term-slugs.
 */
export function slugifyFilterValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Aggreger FilterDef[] fra en produktliste. Rekkefølge:
 *   1. Attributt-filtere i rekkefølgen de først dukker opp i produktlisten
 *      (stabil fra Supabase `order by updated_at desc` → men i praksis brukt
 *      bare som render-hint, ikke semantisk).
 *   2. Pris-filteret alltid sist.
 *
 * Attributter droppes hvis de har <2 distinkte verdier — et filter med ett
 * alternativ gir ingen mening.
 *
 * Pris-filteret droppes hvis produktene samler seg i kun én bucket.
 *
 * Counts: `option.count` settes til antall produkter i lista som har verdien,
 * slik at dropdown-en kan vise treffstall ("Global (12)") gratis.
 */
export function deriveFilters(products: CatalogListItem[]): FilterDef[] {
  // Per attributt-key: { label, counts: Map<slugified-value, {label, count}> }
  const attrs = new Map<
    string,
    {
      label: string;
      /** Bevar insertion order så UI er deterministisk. */
      values: Map<string, { label: string; count: number }>;
    }
  >();

  for (const product of products) {
    const fv = product.filterValues;
    if (!fv) continue;

    for (const [key, entry] of Object.entries(fv)) {
      if (!attrs.has(key)) {
        attrs.set(key, { label: entry.label, values: new Map() });
      }
      const bucket = attrs.get(key)!;
      for (const rawValue of entry.values) {
        const slug = slugifyFilterValue(rawValue);
        if (!slug) continue;
        const existing = bucket.values.get(slug);
        if (existing) {
          existing.count += 1;
        } else {
          bucket.values.set(slug, { label: rawValue, count: 1 });
        }
      }
    }
  }

  const attrFilters: FilterDef[] = [];
  for (const [key, bucket] of attrs) {
    if (bucket.values.size < 2) continue;
    attrFilters.push({
      key,
      label: bucket.label,
      options: Array.from(bucket.values.entries())
        .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'nb-NO'))
        .map(([value, meta]) => ({
          value,
          label: meta.label,
          count: meta.count,
        })),
    });
  }

  // Pris-bucket-counts
  const priceCounts = new Map<string, number>();
  for (const p of products) {
    const price = effectivePrice(p);
    if (price === null) continue;
    const b = bucketForPrice(price);
    if (!b) continue;
    priceCounts.set(b, (priceCounts.get(b) ?? 0) + 1);
  }

  if (priceCounts.size >= 2) {
    attrFilters.push({
      key: PRICE_FILTER_KEY,
      label: 'Pris',
      options: PRICE_BUCKETS.filter((b) => priceCounts.has(b.value)).map(
        (b) => ({
          value: b.value,
          label: b.label,
          count: priceCounts.get(b.value) ?? 0,
        }),
      ),
    });
  }

  return attrFilters;
}

/**
 * Filtrer produktlisten basert på brukerens utvalg.
 *
 * Semantikk:
 *   - Tom selections eller kun tomme arrays → returner input uendret.
 *   - Innen ett filter: OR (minst én verdi må matche).
 *   - Mellom filtre: AND (alle aktive filter-kolonner må matche).
 *   - Produkt uten attributt-key matcher ikke → ekskluderes hvis filteret
 *     er aktivt.
 *
 * Returnerer alltid en ny array-referanse når filtrering skjer, så React
 * rerender-er grid-en korrekt. Muterer aldri input.
 */
export function filterProducts(
  products: CatalogListItem[],
  selections: Record<string, string[]>,
): CatalogListItem[] {
  const active = Object.entries(selections).filter(
    ([, values]) => values.length > 0,
  );
  if (active.length === 0) return products;

  return products.filter((p) => {
    for (const [key, selected] of active) {
      if (key === PRICE_FILTER_KEY) {
        const price = effectivePrice(p);
        if (price === null) return false;
        const bucket = bucketForPrice(price);
        if (!bucket || !selected.includes(bucket)) return false;
        continue;
      }

      const entry = p.filterValues?.[key];
      if (!entry) return false;

      const productSlugs = entry.values.map(slugifyFilterValue);
      const matches = selected.some((s) => productSlugs.includes(s));
      if (!matches) return false;
    }
    return true;
  });
}
