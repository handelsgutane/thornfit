/**
 * Build `Purchasable` fra katalog-shapes. Ett sentralt sted for konvertering
 * så PDP, SearchOverlay, recommendations og fremtidige flater ikke alle
 * duplikerer "hvilket felt er prisen, og hva med salg?".
 *
 * **MVP: kun simple products.** Variable products må løses med variation-
 * picker som velger den spesifikke `ProductVariation` — da bygger vi
 * `Purchasable` fra variation'en i stedet. Dette stubbet returnerer `null`
 * for non-simple så kallende kode kan vise "Velg variant"-tilstand.
 */

import type { CatalogProductDetail } from '@/lib/supabase/catalog';
import type { ProductImage, Purchasable, StockStatus } from '@/types/product';

/** Minimal shape fra Supabase `products.images`-JSON vi trenger her. */
interface SupabaseImageJson {
  src?: string;
  url?: string;
  alt?: string;
  width?: number;
  height?: number;
}

function firstImage(raw: unknown, productName: string): ProductImage | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0] as SupabaseImageJson | null;
  if (!first) return null;
  const src = first.src ?? first.url;
  if (!src) return null;
  return {
    url: src,
    alt: first.alt || productName,
    width: first.width,
    height: first.height,
  };
}

/**
 * Godta stock_status-strengen fra Supabase og cast til vår TypeScript-enum.
 * Verdiene matcher Woo's (`in_stock` / `out_of_stock` / `on_backorder`). Hvis
 * Woo en dag legger til en ny status og vi ser `null`/ukjent, faller vi
 * tilbake til `out_of_stock` — det er den sikreste defaulten (hindrer
 * "legg i kurv" på noe vi ikke kan selge).
 */
function normalizeStockStatus(raw: string | null): StockStatus {
  if (raw === 'in_stock' || raw === 'out_of_stock' || raw === 'on_backorder') {
    return raw;
  }
  return 'out_of_stock';
}

/**
 * Bygg et `Purchasable` fra et `CatalogProductDetail` (PDP-shapen).
 * Returnerer `null` for produkter som ikke er direkte kjøpbare uten mer
 * input (variable products + grouped products).
 *
 * Priorterings-regel for pris (matcher PDP-ens visnings-logikk):
 *   - `sale_price` hvis satt OG < `regular_price` → on sale
 *   - ellers `price` (Woo's "effective price" som også faller tilbake til regular)
 */
export function purchasableFromDetail(
  product: CatalogProductDetail,
): Purchasable | null {
  if (product.type !== 'simple') {
    // grouped/variable — krever mer UI enn MVP tilbyr.
    return null;
  }

  const regular = product.regular_price ?? product.price ?? 0;
  const sale = product.sale_price;
  const onSale = sale !== null && regular !== null && sale < regular;
  const effective = onSale && sale !== null ? sale : (product.price ?? regular);

  return {
    productId: product.id,
    variationId: null,
    sku: product.sku ?? null,
    name: product.name,
    price: effective,
    regularPrice: regular,
    onSale,
    image: firstImage(product.images, product.name),
    stockQuantity: product.stock_quantity ?? null,
    stockStatus: normalizeStockStatus(product.stock_status),
  };
}

// ---------------------------------------------------------------------------
// Brand + spec-line extraction for cart display (Paper 4X5-0 / 67O-0)
// ---------------------------------------------------------------------------

/** Woo-attributt-shape i `products.attributes`-kolonnen (JSON). */
interface WooAttributeJson {
  slug?: string;
  name?: string;
  options?: string[];
}

/**
 * Plukk første verdi av `pa_merke`-attributten — det er konvensjonen Woo-
 * butikken bruker for merke/brand. Samme logikk som i `lib/analytics/items.ts`,
 * men duplisert her bevisst så cart-laget ikke krysskopler mot analytics
 * (analytics-fila tar `CatalogProductDetail`-skiver, vi ønsker ikke sirkulær
 * import).
 */
export function pickBrandFromProduct(
  product: CatalogProductDetail,
): string | null {
  const raw = product.attributes;
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const attr = entry as WooAttributeJson;
    if (attr.slug !== 'pa_merke') continue;
    const first = attr.options?.[0];
    if (typeof first === 'string' && first.trim()) return first;
  }
  return null;
}

/**
 * Bygg spec-linjen som vises i cart-row under produktnavn (Paper 67W-0:
 * "210mm · VG10 · SKU: KN-21C-VG10"). Sentral-dot (U+00B7) som separator.
 *
 * Strategi: plukk 1–2 attributter med høy signalverdi (lengde/stål), og
 * avslutt med SKU hvis tilgjengelig. Rekkefølgen er deterministisk så samme
 * produkt alltid får samme linje.
 *
 * Prioritert attributt-rekkefølge (første-vinner for 2 slots):
 *   `pa_lengde`, `pa_blad`, `pa_stal`, `pa_type`, `pa_bruksomrade`
 *
 * Returnerer `null` når vi ikke har noe å vise (ingen attributter og ingen SKU).
 */
export function buildSpecLineForProduct(
  product: CatalogProductDetail,
): string | null {
  const parts: string[] = [];
  const raw = product.attributes;

  if (Array.isArray(raw)) {
    const priority = ['pa_lengde', 'pa_blad', 'pa_stal', 'pa_type', 'pa_bruksomrade'];
    const byslug = new Map<string, string>();
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const attr = entry as WooAttributeJson;
      if (!attr.slug) continue;
      const first = attr.options?.[0];
      if (typeof first === 'string' && first.trim()) {
        byslug.set(attr.slug, first);
      }
    }
    for (const slug of priority) {
      const v = byslug.get(slug);
      if (v) parts.push(v);
      if (parts.length === 2) break;
    }
  }

  if (product.sku) parts.push(`SKU: ${product.sku}`);

  if (parts.length === 0) return null;
  return parts.join(' · ');
}
