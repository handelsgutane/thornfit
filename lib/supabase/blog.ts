/**
 * Supabase-fetchers for blogg-innhold. Server-only — frontend kaller disse
 * direkte fra server-komponenter (`app/blogg/...`).
 *
 * Speil-tabellene fylles av cron-rute'n (`?parts=blog_authors,blog_categories,
 * blog_tags,posts`). Frontend leser kun derfra.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface BlogPostListItem {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  modifiedAt: string;
  readingTimeMin: number;
  featuredImage: { src: string; alt: string; width: number | null; height: number | null } | null;
  authorId: number | null;
  categoryIds: number[];
  tagIds: number[];
}

export interface BlogPostDetail extends BlogPostListItem {
  content: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  /** YouTube/Vimeo-URL — vises som pinned video-sidebar hvis satt. */
  videoUrl: string | null;
  /** Woo product-IDer for "Relaterte produkter"-blokken. */
  relatedProductIds: number[];
}

export interface BlogAuthor {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  role: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  credentials: string | null;
}

export interface BlogCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  parentId: number | null;
  count: number;
}

export interface BlogTag {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  count: number;
}

const POST_LIST_COLUMNS =
  'id, slug, title, excerpt, published_at, modified_at, reading_time_min, featured_image, author_id, category_ids, tag_ids';

const POST_DETAIL_COLUMNS = `${POST_LIST_COLUMNS}, content, seo_title, seo_description, og_image_url, video_url, related_product_ids`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function postListItemFromRow(row: any): BlogPostListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? null,
    publishedAt: row.published_at,
    modifiedAt: row.modified_at,
    readingTimeMin: row.reading_time_min ?? 1,
    featuredImage: row.featured_image ?? null,
    authorId: row.author_id ?? null,
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids : [],
    tagIds: Array.isArray(row.tag_ids) ? row.tag_ids : [],
  };
}

export type PostSort = 'newest' | 'oldest' | 'longest' | 'shortest';

interface ListPostsResult {
  posts: BlogPostListItem[];
  total: number;
}

/**
 * Liste poster med sort-valg, paginering og total-count.
 * Brukes på /kniv-info-oversikten og kategori-sidene.
 */
export async function listPosts(
  options: { limit?: number; offset?: number; sort?: PostSort } = {},
): Promise<ListPostsResult> {
  const limit = options.limit ?? 24;
  const offset = options.offset ?? 0;
  const sort = options.sort ?? 'newest';
  const client = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client as any)
    .from('blog_posts')
    .select(POST_LIST_COLUMNS, { count: 'exact' });

  switch (sort) {
    case 'oldest':
      q = q.order('published_at', { ascending: true });
      break;
    case 'longest':
      q = q.order('reading_time_min', { ascending: false }).order('published_at', { ascending: false });
      break;
    case 'shortest':
      q = q.order('reading_time_min', { ascending: true }).order('published_at', { ascending: false });
      break;
    case 'newest':
    default:
      q = q.order('published_at', { ascending: false });
      break;
  }

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) {
    logger.error('failed to list blog posts', { ...serializeError(error) });
    return { posts: [], total: 0 };
  }
  return {
    posts: (data ?? []).map(postListItemFromRow),
    total: typeof count === 'number' ? count : 0,
  };
}

/**
 * Fritekst-søk i blogg-poster. ILIKE-substring-matching mot tittel + excerpt.
 * For ~50 poster er dette raskere enn å sette opp full-text-index. Når vi
 * passerer ~500 poster bør vi gå over til Postgres tsvector eller Algolia.
 */
export async function searchPosts(
  query: string,
  options: { limit?: number; sort?: PostSort; categorySlug?: string } = {},
): Promise<ListPostsResult> {
  const limit = options.limit ?? 24;
  const sort = options.sort ?? 'newest';
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { posts: [], total: 0 };
  }

  const client = createServiceRoleClient();
  // Escape SQL ILIKE wildcards i brukerinput så %knife% ikke kan brukes til
  // å matche alt. Vi wrapper med våre egne %-er.
  const escaped = trimmed.replace(/[%_]/g, '\\$&');
  const pattern = `%${escaped}%`;

  // Filtrer på kategori-slug: én ekstra rundtur for å resolve slug → id,
  // deretter contains-filter på category_ids.
  let categoryId: number | null = null;
  if (options.categorySlug) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cat } = await (client as any)
      .from('blog_categories')
      .select('id')
      .eq('slug', options.categorySlug)
      .maybeSingle();
    categoryId = cat?.id ?? null;
    if (categoryId === null) return { posts: [], total: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client as any)
    .from('blog_posts')
    .select(POST_LIST_COLUMNS, { count: 'exact' })
    .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`);

  if (categoryId !== null) {
    q = q.contains('category_ids', [categoryId]);
  }

  switch (sort) {
    case 'oldest':
      q = q.order('published_at', { ascending: true });
      break;
    case 'longest':
      q = q.order('reading_time_min', { ascending: false }).order('published_at', { ascending: false });
      break;
    case 'shortest':
      q = q.order('reading_time_min', { ascending: true }).order('published_at', { ascending: false });
      break;
    case 'newest':
    default:
      q = q.order('published_at', { ascending: false });
      break;
  }

  q = q.limit(limit);

  const { data, error, count } = await q;
  if (error) {
    logger.error('failed to search posts', { ...serializeError(error), query: trimmed });
    return { posts: [], total: 0 };
  }
  return {
    posts: (data ?? []).map(postListItemFromRow),
    total: typeof count === 'number' ? count : 0,
  };
}

/** Liste poster filtrert på kategori-slug. */
export async function listPostsByCategorySlug(
  slug: string,
  options: { limit?: number } = {},
): Promise<BlogPostListItem[]> {
  const limit = options.limit ?? 24;
  const client = createServiceRoleClient();

  // Først finn category_id fra slug — én ekstra rundtur, men holder API'et
  // pent (caller trenger ikke vite ID-er).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat } = await (client as any)
    .from('blog_categories')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!cat) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('blog_posts')
    .select(POST_LIST_COLUMNS)
    .contains('category_ids', [cat.id])
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('failed to list posts by category', {
      slug,
      ...serializeError(error),
    });
    return [];
  }
  return (data ?? []).map(postListItemFromRow);
}

/** Hent én post på slug. */
export async function getPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('blog_posts')
    .select(POST_DETAIL_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.error('failed to fetch post by slug', {
      slug,
      ...serializeError(error),
    });
    return null;
  }
  if (!data) return null;

  return {
    ...postListItemFromRow(data),
    content: data.content ?? null,
    seoTitle: data.seo_title ?? null,
    seoDescription: data.seo_description ?? null,
    ogImageUrl: data.og_image_url ?? null,
    videoUrl: data.video_url ?? null,
    relatedProductIds: Array.isArray(data.related_product_ids)
      ? (data.related_product_ids as number[])
      : [],
  };
}

/** Hent forfatter på id. */
export async function getAuthorById(id: number): Promise<BlogAuthor | null> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('blog_authors')
    .select('id, slug, name, description, avatar_url, role, instagram_url, linkedin_url, credentials')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? null,
    avatarUrl: data.avatar_url ?? null,
    role: data.role ?? null,
    instagramUrl: data.instagram_url ?? null,
    linkedinUrl: data.linkedin_url ?? null,
    credentials: data.credentials ?? null,
  };
}

/** Hent forfatter-info for flere IDer i én spørring (brukes på lister). */
export async function getAuthorsByIds(ids: number[]): Promise<Map<number, BlogAuthor>> {
  if (ids.length === 0) return new Map();
  const unique = Array.from(new Set(ids));
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('blog_authors')
    .select('id, slug, name, description, avatar_url, role, instagram_url, linkedin_url, credentials')
    .in('id', unique);

  const map = new Map<number, BlogAuthor>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      avatarUrl: row.avatar_url ?? null,
      role: row.role ?? null,
      instagramUrl: row.instagram_url ?? null,
      linkedinUrl: row.linkedin_url ?? null,
      credentials: row.credentials ?? null,
    });
  }
  return map;
}

/** Hent én kategori på slug — brukes på /kniv-info/kategori/[slug]-siden. */
export async function getBlogCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('blog_categories')
    .select('id, slug, name, description, parent_id, count')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? null,
    parentId: data.parent_id ?? null,
    count: data.count ?? 0,
  };
}

/** Liste alle topp-nivå-kategorier (for filter-tabs på /kniv-info). */
export async function listBlogCategories(): Promise<BlogCategory[]> {
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('blog_categories')
    .select('id, slug, name, description, parent_id, count')
    .gt('count', 0)
    .order('name', { ascending: true });

  if (error) {
    logger.error('failed to list blog categories', { ...serializeError(error) });
    return [];
  }
  return (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any): BlogCategory => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description ?? null,
      parentId: r.parent_id ?? null,
      count: r.count ?? 0,
    }),
  );
}

/** Hent ett tag-objekt for én ID — brukes til chip-rendring på artikkelside. */
export async function getTagsByIds(ids: number[]): Promise<BlogTag[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('blog_tags')
    .select('id, slug, name, description, count')
    .in('id', unique);

  return (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any): BlogTag => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description ?? null,
      count: r.count ?? 0,
    }),
  );
}

/** Hent kategorier for IDer (samme mønster som getAuthorsByIds). */
export async function getCategoriesByIds(ids: number[]): Promise<Map<number, BlogCategory>> {
  if (ids.length === 0) return new Map();
  const unique = Array.from(new Set(ids));
  const client = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('blog_categories')
    .select('id, slug, name, description, parent_id, count')
    .in('id', unique);

  const map = new Map<number, BlogCategory>();
  for (const r of data ?? []) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description ?? null,
      parentId: r.parent_id ?? null,
      count: r.count ?? 0,
    });
  }
  return map;
}
