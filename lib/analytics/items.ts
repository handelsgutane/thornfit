/**
 * Converters — fra domene-typer til `AnalyticsItem`.
 *
 * Hold disse på ett sted så komponentene ikke gjetter hvilket felt som er
 * SKU, merke, eller kategori. Når Supabase-skjemaet endres, oppdater her.
 */

import type {
  CatalogListItem,
  CatalogProductDetail,
} from '@/lib/supabase/catalog';
import type { CartItem } from '@/types/cart';
import type { Product } from '@/types/product';

import type { AnalyticsItem } from './events';

/**
 * Brand-slug konvensjon i Woo er `pa_merke` — henter første verdi hvis
 * `filterValues` er populert. Ellers `null`.
 */
function pickBrand(item: Pick<CatalogListItem, 'filterValues'>): string | null {
  const merke = item.filterValues?.pa_merke;
  return merke?.values?.[0] ?? null;
}

export function catalogListItemToAnalyticsItem(
  item: CatalogListItem,
): AnalyticsItem {
  return {
    id: String(item.id),
    sku: null, // CatalogListItem har ikke SKU — kan populeres hvis behov
    name: item.name,
    price: item.price ?? item.regularPrice ?? 0,
    category: item.primaryCategorySlug ?? null,
    brand: pickBrand(item),
  };
}

export function productToAnalyticsItem(product: Product): AnalyticsItem {
  return {
    id: String(product.id),
    sku: product.sku,
    name: product.name,
    price: product.price ?? product.regularPrice ?? 0,
    category: null,
    brand:
      product.attributes.find((a) => a.slug === 'pa_merke')?.values?.[0] ??
      null,
  };
}

/**
 * `CatalogProductDetail` er Supabase-raden direkte (snake_case) — brukt på
 * produkt-detaljsidene. Henter brand fra `attributes`-JSON-kolonnen som er
 * en array av Woo-attributt-objekter (`{ slug, name, options: string[] }`).
 */
export function catalogProductDetailToAnalyticsItem(
  product: CatalogProductDetail,
): AnalyticsItem {
  return {
    id: String(product.id),
    sku: product.sku ?? null,
    name: product.name,
    price: product.price ?? product.regular_price ?? 0,
    category: product.primaryCategorySlug,
    brand: pickBrandFromAttributes(product.attributes),
  };
}

/**
 * Parser `products.attributes`-JSON (WooAttributeJson[]) og plukker første
 * verdi av `pa_merke`-attributten. Defensiv — kolonnen er typed `Json` i
 * Supabase så shape er ikke compile-time garantert.
 */
function pickBrandFromAttributes(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    if (obj.slug !== 'pa_merke') continue;
    const options = obj.options;
    if (Array.isArray(options) && typeof options[0] === 'string') {
      return options[0];
    }
  }
  return null;
}

export function cartItemToAnalyticsItem(line: CartItem): AnalyticsItem {
  return {
    id: String(line.productId),
    sku: line.sku,
    name: line.name,
    price: line.unitPrice,
    quantity: line.quantity,
    category: line.categorySlug ?? null,
  };
}
