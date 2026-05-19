/**
 * Mappers fra WooCommerce REST-respons til Supabase-row-shapes.
 *
 * Ett sted å holde kontrakten mellom Woo og speilet. Hvis Woo endrer
 * felt-navn eller vi legger til en ny kolonne i Supabase, er det her
 * oppdateringen skjer. Webhook-handleren og reconciliation-cronen skal
 * begge bruke disse — aldri mappe inline i en route.
 */

import type { TablesInsert } from '@/types/supabase';

// ---------- Woo response types ---------------------------------------------

export interface WooImage {
  id?: number;
  src?: string;
  name?: string;
  alt?: string;
  position?: number;
}

export interface WooCategoryRef {
  id: number;
  name?: string;
  slug?: string;
}

export interface WooAttribute {
  id?: number;
  name?: string;
  slug?: string;
  position?: number;
  visible?: boolean;
  variation?: boolean;
  options?: string[];
}

export interface WooYoastFields {
  title?: string;
  description?: string;
  og_title?: string;
  og_description?: string;
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description?: string;
  display?: string;
  image?: WooImage | null;
  menu_order?: number;
  count?: number;
  yoast_head_json?: WooYoastFields;
  /** Kategori-meta — inkluderer skn_section_tags hvis functions.php er oppdatert. */
  meta_data?: Array<{ key: string; value: unknown }>;
}

export interface WooTag {
  id: number;
  slug: string;
  name: string;
  description?: string;
}

export interface WooBrand {
  id: number;
  slug: string;
  name: string;
  description?: string;
  image?: WooImage | null;
  /** Term-meta — se docs/wp-snippets/skn-brand-meta.php. */
  meta_data?: Array<{ key: string; value: unknown }>;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  description?: string;
  short_description?: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_quantity?: number | null;
  stock_status?: string;
  manage_stock?: boolean;
  weight?: string;
  categories?: WooCategoryRef[];
  images?: WooImage[];
  attributes?: WooAttribute[];
  variations?: number[];
  date_created?: string;
  date_modified?: string;
  /**
   * Gjennomsnitt 0–5 som string (f.eks. `"4.50"`). Woo leverer `"0.00"` når
   * produktet ikke har noen reviews — se også `rating_count`.
   */
  average_rating?: string;
  /** Antall reviews. 0 når ingen reviews er publisert. */
  rating_count?: number;
  yoast_head_json?: WooYoastFields;
  /** Produkttagger (product_tag-taxonomi i Woo). */
  tags?: Array<{ id: number; name: string; slug: string }>;
  /** Brands (product_brand-taxonomi). I praksis bruker vi den første. */
  brands?: Array<{ id: number; name: string; slug: string }>;
  /**
   * Innebygde Woo-upsell-IDer (Linked Products → Upsells i admin).
   * Vi bruker første element som primær upsell på "Vil du ha med?"-boksen.
   */
  upsell_ids?: number[];
}

export interface WooVariation {
  id: number;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_quantity?: number | null;
  stock_status?: string;
  weight?: string;
  image?: WooImage | null;
  attributes?: { id?: number; name?: string; option?: string }[];
}

// ---------- Mappers --------------------------------------------------------

/**
 * Map Woo-kategori → Supabase `categories`-row.
 */
export function mapCategory(woo: WooCategory): TablesInsert<'categories'> {
  // Hent skn_section_tags fra category meta_data (satt via functions.php).
  // Vi normaliserer alt: trim, lowercase, dedupe — slik at små feil i
  // WordPress-feltet (stor forbokstav, mellomrom, duplikater) ikke fører til
  // tomme seksjoner. Slugs som ikke matcher en eksisterende product_tag blir
  // bare hoppet over i `getCategorySectionTags` — ingenting krasjer.
  const sectionMeta = woo.meta_data?.find((m) => m.key === 'skn_section_tags');
  const sectionTagSlugs =
    typeof sectionMeta?.value === 'string' && sectionMeta.value.trim().length > 0
      ? Array.from(
          new Set(
            sectionMeta.value
              .split(',')
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          ),
        )
      : [];

  // Default upsell — produkt-ID som brukes på "Vil du ha med?"-boksen for
  // alle produkter i denne kategorien (hvis produktet selv ikke har
  // upsell_ids satt). Per-produkt-Upsells overstyrer.
  const upsellMeta = woo.meta_data?.find((m) => m.key === 'skn_default_upsell_product_id');
  let defaultUpsellId: number | null = null;
  if (upsellMeta && typeof upsellMeta.value === 'string') {
    const parsed = parseInt(upsellMeta.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) defaultUpsellId = parsed;
  }

  // Mega-meny editorial — hovedartikkel-post-ID + 0–2 knapper. Knapp-feltene
  // er paret (label + url); kun par der begge er satt går videre. Resultatet
  // er et jsonb-array vi lagrer på categories.mega_buttons.
  const megaPostMeta = woo.meta_data?.find((m) => m.key === 'skn_mega_post_id');
  let megaPostId: number | null = null;
  if (megaPostMeta && typeof megaPostMeta.value === 'string') {
    const parsed = parseInt(megaPostMeta.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) megaPostId = parsed;
  }

  const readMetaString = (key: string): string => {
    const m = woo.meta_data?.find((entry) => entry.key === key);
    return typeof m?.value === 'string' ? m.value.trim() : '';
  };

  const megaButtons: Array<{ label: string; url: string }> = [];
  for (const idx of [1, 2]) {
    const label = readMetaString(`skn_mega_button_${idx}_label`);
    const url = readMetaString(`skn_mega_button_${idx}_url`);
    if (label && url) megaButtons.push({ label, url });
  }

  return {
    id: woo.id,
    slug: woo.slug,
    name: woo.name,
    description: woo.description ?? null,
    parent_id: woo.parent && woo.parent > 0 ? woo.parent : null,
    image: woo.image ? (woo.image as unknown as TablesInsert<'categories'>['image']) : null,
    display_order: typeof woo.menu_order === 'number' ? woo.menu_order : null,
    seo_title: woo.yoast_head_json?.title ?? null,
    seo_description: woo.yoast_head_json?.description ?? null,
    source_payload: woo as unknown as TablesInsert<'categories'>['source_payload'],
    // Alltid sett feltet — selv tomt array. Ellers vil PostgREST upsert i en
    // mixed batch sende NULL for kategorier uten verdi, og kolonnen er NOT NULL.
    section_tag_slugs: sectionTagSlugs,
    // Per-kategori default upsell — cast pga. types ikke regenerert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ default_upsell_product_id: defaultUpsellId } as any),
    // Mega-meny editorial — cast pga. types ikke regenerert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ mega_post_id: megaPostId, mega_buttons: megaButtons } as any),
    synced_at: new Date().toISOString(),
  };
}

/** Map WooCommerce product tag → Supabase product_tags-row. */
export function mapTag(woo: WooTag): { id: number; slug: string; name: string; description: string | null; synced_at: string } {
  return {
    id: woo.id,
    slug: woo.slug,
    name: woo.name,
    description: woo.description && woo.description.trim().length > 0
      ? woo.description.trim()
      : null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Map WooCommerce product_brand → Supabase brands-row.
 *
 * Innebygde Woo-felter (id/slug/name/description/image) + custom term-meta
 * registrert via mu-plugin (skn-brand-meta.php). Manglende meta returnerer
 * null på alle felt — defaults håndteres i UI.
 */
export interface BrandRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image: { src?: string; alt?: string } | null;
  region: string | null;
  founded: string | null;
  stats: Array<{ num: string; label: string }> | null;
  video_url: string | null;
  hero_image_url: string | null;
  source_payload: unknown;
  synced_at: string;
}

export function mapBrand(woo: WooBrand): BrandRow {
  const meta = (key: string): string | null => {
    const entry = woo.meta_data?.find((m) => m.key === key);
    if (!entry) return null;
    const value = entry.value;
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    return value.trim();
  };

  // skn_brand_stats er JSON-string som vi parser til array. Feiler vi her,
  // returnerer vi null så UI'et skjuler stats-blokken — ikke krasj.
  let stats: BrandRow['stats'] = null;
  const rawStats = meta('skn_brand_stats');
  if (rawStats) {
    try {
      const parsed = JSON.parse(rawStats);
      if (Array.isArray(parsed)) {
        stats = parsed
          .filter(
            (s): s is { num: string; label: string } =>
              typeof s === 'object' &&
              s !== null &&
              typeof (s as { num?: unknown }).num === 'string' &&
              typeof (s as { label?: unknown }).label === 'string',
          )
          .slice(0, 6);
      }
    } catch {
      stats = null;
    }
  }

  return {
    id: woo.id,
    slug: woo.slug,
    name: woo.name,
    description:
      woo.description && woo.description.trim().length > 0
        ? woo.description.trim()
        : null,
    image: woo.image ? { src: woo.image.src, alt: woo.image.alt } : null,
    region: meta('skn_brand_region'),
    founded: meta('skn_brand_founded'),
    stats,
    video_url: meta('skn_brand_video_url'),
    hero_image_url: meta('skn_brand_hero_image'),
    source_payload: woo,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Map Woo-produkt → Supabase `products`-row, eller `null` hvis produktet
 * ikke er speilbart (f.eks. `type=external`, ukjent status).
 */
export function mapProduct(woo: WooProduct): TablesInsert<'products'> | null {
  const type = mapProductType(woo.type);
  if (!type) return null;

  const status = mapProductStatus(woo.status);
  if (!status) return null;

  const categories = Array.isArray(woo.categories)
    ? woo.categories.map((c) => c.id).filter((id): id is number => typeof id === 'number')
    : [];

  return {
    id: woo.id,
    slug: woo.slug,
    name: woo.name,
    type,
    status,
    description: woo.description ?? null,
    short_description: woo.short_description ?? null,
    sku: woo.sku && woo.sku.length > 0 ? woo.sku : null,
    // Priser overstyres i cron med data fra WC Store API
    // (`/wc/store/v1/products`) — den gir prisen ferdig beregnet inkl mva
    // per Woo's egen tax-display-konfigurasjon. Her settes EX-mva-prisen som
    // fallback hvis Store API skulle mangle produktet.
    price: parseDecimal(woo.price),
    regular_price: parseDecimal(woo.regular_price),
    sale_price: parseDecimal(woo.sale_price),
    stock_quantity:
      typeof woo.stock_quantity === 'number' ? woo.stock_quantity : null,
    stock_status: mapStockStatus(woo.stock_status),
    weight_g: parseWeightToGrams(woo.weight),
    categories,
    images: (woo.images ?? []) as unknown as TablesInsert<'products'>['images'],
    attributes: (woo.attributes ?? []) as unknown as TablesInsert<'products'>['attributes'],
    tag_slugs: (woo.tags ?? []).map((t) => t.slug),
    // Brand + per-produkt-upsell: cast pga. types/supabase.ts ikke regenerert
    // ennå (kjør `supabase gen types typescript --linked` etter migrasjon).
    // upsell_product_id leses fra Woo's innebygde Linked Products → Upsells.
    // Vi tar første ID — hvis redaktøren legger flere, brukes resten ikke.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({
      brand_id: woo.brands && woo.brands.length > 0 ? woo.brands[0].id : null,
      brand_slug: woo.brands && woo.brands.length > 0 ? woo.brands[0].slug : null,
      upsell_product_id:
        woo.upsell_ids && woo.upsell_ids.length > 0 ? woo.upsell_ids[0] : null,
    } as any),
    // Rating: Woo returnerer `"0.00"` + `0` for produkter uten reviews. Vi
    // beholder den som-er (ingen null-konvertering) slik at DB-rad speiler
    // kilden; UI sjekker `rating_count > 0` før stjerner rendres.
    average_rating: parseDecimal(woo.average_rating),
    rating_count:
      typeof woo.rating_count === 'number' ? woo.rating_count : null,
    seo_title: woo.yoast_head_json?.title ?? null,
    seo_description: woo.yoast_head_json?.description ?? null,
    source_payload: woo as unknown as TablesInsert<'products'>['source_payload'],
    created_at: woo.date_created ?? new Date().toISOString(),
    updated_at: woo.date_modified ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Map Woo-variasjon → Supabase `product_variations`-row.
 */
export function mapVariation(
  woo: WooVariation,
  parentId: number,
): TablesInsert<'product_variations'> {
  const attributesPayload = (woo.attributes ?? []).reduce<Record<string, string>>(
    (acc, attr) => {
      if (attr.name && attr.option) acc[attr.name] = attr.option;
      return acc;
    },
    {},
  );

  return {
    id: woo.id,
    parent_id: parentId,
    sku: woo.sku && woo.sku.length > 0 ? woo.sku : null,
    // Variasjon-priser ex mva — overstyres ikke ennå pga. variasjoner ikke
    // synkes i nåværende cron (TODO: Fase 2). Når Store API tas i bruk for
    // variasjoner, må disse også hentes derfra.
    price: parseDecimal(woo.price),
    regular_price: parseDecimal(woo.regular_price),
    sale_price: parseDecimal(woo.sale_price),
    stock_quantity:
      typeof woo.stock_quantity === 'number' ? woo.stock_quantity : null,
    stock_status: mapStockStatus(woo.stock_status),
    weight_g: parseWeightToGrams(woo.weight),
    attributes: attributesPayload as unknown as TablesInsert<'product_variations'>['attributes'],
    image: woo.image
      ? (woo.image as unknown as TablesInsert<'product_variations'>['image'])
      : null,
    source_payload: woo as unknown as TablesInsert<'product_variations'>['source_payload'],
    synced_at: new Date().toISOString(),
  };
}

// ---------- helpers --------------------------------------------------------

function mapProductType(
  type: string,
): TablesInsert<'products'>['type'] | null {
  switch (type) {
    case 'simple':
    case 'variable':
    case 'grouped':
      return type;
    default:
      // external, bundle, subscription, etc. — ikke støttet i første runde.
      return null;
  }
}

function mapProductStatus(
  status: string,
): TablesInsert<'products'>['status'] | null {
  switch (status) {
    case 'publish':
      return 'published';
    case 'private':
      return 'private';
    case 'draft':
    case 'pending':
    case 'auto-draft':
      return 'draft';
    default:
      return null;
  }
}

function mapStockStatus(status: string | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case 'instock':
      return 'in_stock';
    case 'outofstock':
      return 'out_of_stock';
    case 'onbackorder':
      return 'on_backorder';
    default:
      return status;
  }
}

function parseDecimal(value: string | undefined): number | null {
  if (!value || value.length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * WC Store API (`/wc/store/v1/products`) returnerer priser ferdig beregnet
 * inkl. mva, i "minor units" (cents). Denne typen + helperen brukes i
 * cron-rute'n for å overstyre prisene fra wc/v3-mapperen.
 */
export interface StoreApiProductPrices {
  id: number;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
}

/**
 * Konverterer en Store API minor-unit-pris til hovedenhet (NOK med 2 desimaler).
 * F.eks. "1199900" + minor_unit 2 → 11999.00.
 *
 * Returnerer null hvis input er tom/ugyldig — håndterer både tom string,
 * "0" (gyldig 0,00), og null/undefined.
 */
function minorUnitToDecimal(
  raw: unknown,
  minorUnit: number,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / Math.pow(10, minorUnit);
}

/**
 * Parser én Store API-rad til { id, price, regular_price, sale_price }.
 * Brukes i cron til å bygge en `Map<number, prices>` som overstyrer
 * mapper'ens ex-mva-priser før upsert.
 */
export function mapStorePrices(row: {
  id: number;
  prices?: {
    price?: string | number;
    regular_price?: string | number;
    sale_price?: string | number;
    currency_minor_unit?: number;
  };
}): StoreApiProductPrices {
  const minor = row.prices?.currency_minor_unit ?? 2;
  return {
    id: row.id,
    price: minorUnitToDecimal(row.prices?.price, minor),
    regular_price: minorUnitToDecimal(row.prices?.regular_price, minor),
    sale_price: minorUnitToDecimal(row.prices?.sale_price, minor),
  };
}

/**
 * Woo lagrer vekt som string i konfigurert enhet (vi bruker kg). Konverter til
 * heltall gram — Supabase lagrer som `integer` for å unngå flytall i DB.
 */
function parseWeightToGrams(value: string | undefined): number | null {
  if (!value || value.length === 0) return null;
  const kg = Number(value);
  if (!Number.isFinite(kg)) return null;
  return Math.round(kg * 1000);
}
