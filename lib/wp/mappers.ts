/**
 * Mappers fra WordPress REST-respons til Supabase-row-shapes for blogg-tabellene.
 *
 * Parallell til `lib/woo/mappers.ts` — én plass å holde kontrakten mellom
 * WP-felt og DB-kolonner. Webhook-handler og reconciliation-cron skal begge
 * bruke disse.
 */

import { decodeHtmlEntities, sanitizeHtml, stripHtml } from '@/lib/utils/html';

// ---------- WP response types ---------------------------------------------

export interface WpRendered {
  rendered?: string;
}

export interface WpEmbeddedMedia {
  id?: number;
  source_url?: string;
  alt_text?: string;
  media_details?: {
    width?: number;
    height?: number;
    sizes?: Record<string, { source_url?: string; width?: number; height?: number }>;
  };
}

export interface WpEmbeddedAuthor {
  id?: number;
  name?: string;
  slug?: string;
  description?: string;
  avatar_urls?: Record<string, string>;
}

export interface WpYoastFields {
  title?: string;
  description?: string;
  og_image?: Array<{ url?: string }>;
  og_title?: string;
  og_description?: string;
}

export interface WpPost {
  id: number;
  slug: string;
  status: string;
  type: string;
  date_gmt: string;
  modified_gmt: string;
  title: WpRendered;
  excerpt: WpRendered;
  content: WpRendered;
  author: number;
  featured_media: number;
  categories: number[];
  tags: number[];
  yoast_head_json?: WpYoastFields;
  meta?: Record<string, unknown>;
  _embedded?: {
    author?: WpEmbeddedAuthor[];
    'wp:featuredmedia'?: WpEmbeddedMedia[];
  };
}

export interface WpCategory {
  id: number;
  slug: string;
  name: string;
  description: string;
  parent: number;
  count: number;
}

export interface WpTag {
  id: number;
  slug: string;
  name: string;
  description: string;
  count: number;
}

export interface WpUser {
  id: number;
  slug: string;
  name: string;
  description?: string;
  avatar_urls?: Record<string, string>;
  roles?: string[];
  meta?: Record<string, unknown>;
  /** Custom term-meta eksponert via mu-plugin (skn_author_*). */
  meta_data?: Array<{ key: string; value: unknown }>;
}

// ---------- Row shapes (mirror DB) ----------------------------------------

export interface BlogAuthorRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  role: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  credentials: string | null;
  source_payload: unknown;
  synced_at: string;
}

export interface BlogCategoryRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  parent_id: number | null;
  count: number;
  source_payload: unknown;
  synced_at: string;
}

export interface BlogTagRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  count: number;
  source_payload: unknown;
  synced_at: string;
}

export interface BlogPostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  published_at: string;
  modified_at: string;
  author_id: number | null;
  featured_image: { src: string; alt: string; width: number | null; height: number | null } | null;
  category_ids: number[];
  tag_ids: number[];
  reading_time_min: number;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  /** YouTube/Vimeo-URL — fra post-meta `skn_video_url`. */
  video_url: string | null;
  /** Woo product-IDer for "Relaterte produkter"-blokken — fra post-meta. */
  related_product_ids: number[];
  source_payload: unknown;
  synced_at: string;
}

// ---------- Mappers --------------------------------------------------------

/**
 * Map WP-bruker → blog_authors-row.
 *
 * skn_author_*-felter leses fra `meta_data`-arrayet (eksponert av mu-plugin).
 * Hvis pluginen ikke er installert, returneres null på alle custom-felter —
 * UI håndterer det defensivt.
 */
export function mapAuthor(wp: WpUser): BlogAuthorRow {
  const meta = (key: string): string | null => {
    const entry = wp.meta_data?.find((m) => m.key === key);
    if (!entry) return null;
    const v = entry.value;
    if (typeof v !== 'string' || v.trim().length === 0) return null;
    return v.trim();
  };

  // avatar_urls er et map som '24'/'48'/'96' → URL. Ta den største.
  const avatar =
    wp.avatar_urls?.['96'] ??
    wp.avatar_urls?.['48'] ??
    wp.avatar_urls?.['24'] ??
    null;

  return {
    id: wp.id,
    slug: wp.slug,
    name: wp.name,
    description: wp.description && wp.description.trim().length > 0
      ? decodeHtmlEntities(wp.description.trim())
      : null,
    avatar_url: avatar,
    role: wp.roles?.[0] ?? null,
    instagram_url: meta('skn_author_instagram'),
    linkedin_url: meta('skn_author_linkedin'),
    credentials: meta('skn_author_credentials'),
    source_payload: wp,
    synced_at: new Date().toISOString(),
  };
}

/** Map WP-kategori (post-taxonomy `category`) → blog_categories-row. */
export function mapCategory(wp: WpCategory): BlogCategoryRow {
  return {
    id: wp.id,
    slug: wp.slug,
    name: decodeHtmlEntities(wp.name),
    description:
      wp.description && wp.description.trim().length > 0
        ? decodeHtmlEntities(wp.description.trim())
        : null,
    parent_id: wp.parent && wp.parent > 0 ? wp.parent : null,
    count: typeof wp.count === 'number' ? wp.count : 0,
    source_payload: wp,
    synced_at: new Date().toISOString(),
  };
}

/** Map WP-tag → blog_tags-row. */
export function mapTag(wp: WpTag): BlogTagRow {
  return {
    id: wp.id,
    slug: wp.slug,
    name: decodeHtmlEntities(wp.name),
    description:
      wp.description && wp.description.trim().length > 0
        ? decodeHtmlEntities(wp.description.trim())
        : null,
    count: typeof wp.count === 'number' ? wp.count : 0,
    source_payload: wp,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Map WP-post → blog_posts-row.
 *
 * Forutsetter at responsen er hentet med `?_embed=wp:featuredmedia,author`
 * slik at vi kan resolve featured-bilde uten ekstra kall.
 *
 * Returnerer null hvis posten ikke skal speiles (private, draft, etc.).
 */
export function mapPost(wp: WpPost): BlogPostRow | null {
  if (wp.status !== 'publish') return null;
  if (wp.type !== 'post') return null;

  const titleRaw = wp.title?.rendered ?? '';
  const title = decodeHtmlEntities(stripHtml(titleRaw));
  if (!title) return null;

  const contentRaw = wp.content?.rendered ?? null;
  const excerptRaw = wp.excerpt?.rendered ?? null;

  // Excerpt kan ha <p>-tags fra WP. Strip + decode + truncate til 280 tegn.
  const excerpt = excerptRaw
    ? truncate(decodeHtmlEntities(stripHtml(excerptRaw)), 280)
    : null;

  const featuredImage = extractFeaturedImage(wp);
  const readingTime = computeReadingTime(contentRaw);

  // Custom post-meta — fra mu-pluginen `skn-blog-post-meta.php`.
  // wp.meta er et nøkkel-verdi-map når register_post_meta er satt med
  // show_in_rest: true. Hvis pluginen ikke er installert, er feltene
  // udefinerte og vi faller tilbake til null/[] uten å feile.
  const meta = wp.meta ?? {};
  const videoUrlRaw = meta['skn_video_url'];
  const videoUrl =
    typeof videoUrlRaw === 'string' && videoUrlRaw.trim().length > 0
      ? videoUrlRaw.trim()
      : null;

  const productIdsRaw = meta['skn_related_product_ids'];
  const relatedProductIds: number[] =
    typeof productIdsRaw === 'string'
      ? productIdsRaw
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

  return {
    id: wp.id,
    slug: wp.slug,
    title,
    excerpt,
    // Sanitize lagres ikke — vi sanitizer ved render (samme som products).
    // DB lagrer rå rendered HTML.
    content: contentRaw,
    published_at: wp.date_gmt + (wp.date_gmt.endsWith('Z') ? '' : 'Z'),
    modified_at: wp.modified_gmt + (wp.modified_gmt.endsWith('Z') ? '' : 'Z'),
    author_id: typeof wp.author === 'number' ? wp.author : null,
    featured_image: featuredImage,
    category_ids: Array.isArray(wp.categories) ? wp.categories : [],
    tag_ids: Array.isArray(wp.tags) ? wp.tags : [],
    reading_time_min: readingTime,
    seo_title: wp.yoast_head_json?.title ?? null,
    seo_description: wp.yoast_head_json?.description ?? null,
    og_image_url: wp.yoast_head_json?.og_image?.[0]?.url ?? null,
    video_url: videoUrl,
    related_product_ids: relatedProductIds,
    source_payload: wp,
    synced_at: new Date().toISOString(),
  };
}

// ---------- Helpers --------------------------------------------------------

/**
 * Plukker featured-image fra `_embedded.wp:featuredmedia[0]`. Foretrekker
 * `medium_large`-størrelse hvis tilgjengelig (typisk ~768px-bredde) — en
 * god default for blogg-kort. Faller tilbake til `source_url` (full).
 */
function extractFeaturedImage(wp: WpPost): BlogPostRow['featured_image'] {
  const media = wp._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return null;

  const sizes = media.media_details?.sizes ?? {};
  const candidate =
    sizes.medium_large ?? sizes.large ?? sizes.medium ?? null;

  const src = candidate?.source_url ?? media.source_url ?? null;
  if (!src) return null;

  return {
    src,
    alt: media.alt_text ?? '',
    width: candidate?.width ?? media.media_details?.width ?? null,
    height: candidate?.height ?? media.media_details?.height ?? null,
  };
}

/**
 * Beregner lesetid i minutter basert på ord-telling i content. WP eksponerer
 * ikke lesetid; vi antar 200 ord/min (gjennomsnitt for norsk faglesing).
 * Minimum 1 minutt.
 */
function computeReadingTime(html: string | null): number {
  if (!html) return 1;
  const text = stripHtml(html);
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Truncate til maks `len` tegn på nærmeste mellomrom, med ellipsis. */
function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  const cut = s.slice(0, len);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Saniterer post-content for trygg `dangerouslySetInnerHTML` ved render.
 * Re-eksporteres her så frontend ikke trenger å vite om utils-mappen.
 */
export { sanitizeHtml };
