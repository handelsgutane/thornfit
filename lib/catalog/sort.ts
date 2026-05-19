/**
 * Sort-helpers for produkt-lister. Brukes av kategori-sider, `/produkter`
 * og (senere) `/sok`. Holdes bevisst enkelt og rent — ingen side-effekter,
 * idempotent for gitt (input, sort-value).
 *
 * Kjente sort-verdier:
 *   - `popular`    Default. Ingen popularity-metrikk i Supabase enda, så vi
 *                  faller tilbake til original rekkefølge (som er
 *                  updated_at DESC fra `listProductsByCategory`).
 *                  TODO: Når `products.order_count` eller lignende finnes,
 *                  sorter der etter.
 *   - `price-asc`  Lav → høy. Null-priser puttes sist så "ingen pris"-
 *                  produkter ikke forstyrrer toppen.
 *   - `price-desc` Høy → lav. Null-priser sist av samme grunn.
 *   - `newest`     Antar inngangen allerede er updated_at DESC. Returnerer
 *                  uendret.
 *
 * Utsolgt-håndtering: uansett valgt sort pushes `out_of_stock`-produkter til
 * slutten av lista (bakerst). Kunden er mest tjent med å se kjøpbare varer
 * øverst — utsolgte vises fortsatt (de har fortsatt SEO-verdi og kan være
 * på vei inn), men aldri over noe som er i lager. `on_backorder` regnes
 * som kjøpbar (kunden kan legge inn forhåndsbestilling) og rangeres derfor
 * som in-stock.
 *
 * For salgs-produkter bruker vi `salePrice` når den finnes, ellers `price`.
 * Det matcher hvordan kortet viser prisen — bruker forventer å se
 * "salgsprisen" bli sortert, ikke ordinærprisen.
 */

import type { CatalogListItem } from '@/lib/supabase/catalog';

export type SortValue =
  | 'popular'
  | 'price-asc'
  | 'price-desc'
  | 'newest'
  | 'name'
  /**
   * Brukes på /tilbud — sorterer etter rabatt-prosent (regular - sale) / regular,
   * høyest først. Produkter uten salgspris faller til bunn (i.e. etter ordinære
   * "ingen rabatt"-produkter, hvis de skulle havne i lista).
   */
  | 'discount';

/** Effektiv pris for sort-sammenligning. Returnerer `null` hvis hverken
 *  `salePrice` eller `price` er satt. */
function effectivePrice(p: CatalogListItem): number | null {
  return p.salePrice ?? p.price;
}

/** Er produktet utsolgt? Backorder teller som kjøpbar og havner derfor ikke
 *  bakerst. Stock-status som verken er satt eller matcher kjent verdi tolkes
 *  defensivt som in-stock (bedre å vise enn å skjule) — terskelen for å bli
 *  pushet bakerst er eksplisitt `out_of_stock`. */
function isOutOfStock(p: CatalogListItem): boolean {
  return p.stockStatus === 'out_of_stock';
}

function byPrice(direction: 1 | -1) {
  return (a: CatalogListItem, b: CatalogListItem): number => {
    const aPrice = effectivePrice(a);
    const bPrice = effectivePrice(b);
    // Null puttes alltid sist uansett retning — ellers bubbler "Ingen pris"
    // opp på price-asc (0 < all).
    if (aPrice === null && bPrice === null) return 0;
    if (aPrice === null) return 1;
    if (bPrice === null) return -1;
    return direction * (aPrice - bPrice);
  };
}

/**
 * Anvender den valgte sort-funksjonen uten å rote med stock-rekkefølge.
 * Returnerer en ny array; input-arrayen mutereres aldri. `popular`/`newest`/
 * ukjent verdi antas å være korrekt sortert fra kilden og returneres som-er
 * (men fortsatt som en ny array så kall-stedet trygt kan konkatenere).
 */
function applySortOnly(
  products: CatalogListItem[],
  sort: string,
): CatalogListItem[] {
  switch (sort) {
    case 'price-asc':
      return [...products].sort(byPrice(1));
    case 'price-desc':
      return [...products].sort(byPrice(-1));
    case 'name':
      return [...products].sort((a, b) =>
        a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' }),
      );
    case 'discount':
      return [...products].sort((a, b) => discountFraction(b) - discountFraction(a));
    case 'newest':
    case 'popular':
    default:
      return [...products];
  }
}

/**
 * Rabatt som fraksjon av regulærpris. 0 hvis hverken sale eller regular er
 * gyldig — produkter uten rabatt rangerer dermed etter alle med rabatt.
 */
function discountFraction(p: CatalogListItem): number {
  const reg = p.regularPrice;
  const sale = p.salePrice;
  if (typeof reg !== 'number' || reg <= 0) return 0;
  if (typeof sale !== 'number' || sale >= reg) return 0;
  return (reg - sale) / reg;
}

/**
 * Returnerer en ny, sortert array. Muterer aldri input.
 *
 * Rekkefølge:
 *   1. In-stock / backorder-produkter, sortert etter `sort`.
 *   2. Utsolgte produkter, internt sortert etter samme `sort`.
 *
 * Ukjente sort-verdier gir original rekkefølge uten feil — defensivt mot
 * tilfeller der URL-param eller lagret preferanse har en eldre verdi.
 */
export function sortProducts(
  products: CatalogListItem[],
  sort: string,
): CatalogListItem[] {
  // Partisjonér én gang — unngår å kalle `isOutOfStock` flere ganger per
  // sammenligning, og bevarer input-rekkefølge innen hver bøtte for "popular"/
  // "newest" hvor vi ikke ellers sorterer.
  const available: CatalogListItem[] = [];
  const soldOut: CatalogListItem[] = [];
  for (const p of products) {
    (isOutOfStock(p) ? soldOut : available).push(p);
  }

  return [...applySortOnly(available, sort), ...applySortOnly(soldOut, sort)];
}
