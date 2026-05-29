/**
 * /kniv-info/kategori/[slug] — kategori-filtrert oversikt.
 *
 * Bruker samme `KnivInfoFilterBar`-komponent som overview-siden, men med
 * den aktuelle kategorien markert som aktiv. Søk her er ikke kategori-
 * begrenset (foreløpig) — søk navigerer til `/kniv-info?sok=...` for å gi
 * resultater på tvers av alle kategorier.
 *
 * Layout (Paper CGB-0, kategori-variant):
 *   - Brødsmuler (Hjem › Blogg › <kategori>)
 *   - Eyebrow "KATEGORI" + H1 + beskrivelse
 *   - FilterBar (full-bleed hvit stripe — aktiv tab = kategori)
 *   - Grid: 1 featured + N standard kort
 *
 * Datakilde: Supabase blog_posts filtrert på blog_categories.slug.
 * 404 hvis kategorien ikke finnes.
 */

import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo/site-url';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KnivInfoFilterBar } from '@/components/blog/FilterBar';
import { MobileBlogFilters } from '@/components/blog/MobileBlogFilters';
import { PostCard } from '@/components/blog/PostCard';
import { stripHtml } from '@/lib/utils/html';
import {
  type PostSort,
  getAuthorsByIds,
  getBlogCategoryBySlug,
  getCategoriesByIds,
  listBlogCategories,
  listPostsByCategorySlug,
  searchPosts,
} from '@/lib/supabase/blog';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sortering?: string; sok?: string }>;
}

function parseSort(raw: string | string[] | undefined): PostSort {
  if (raw === 'eldste' || raw === 'oldest') return 'oldest';
  if (raw === 'lengst' || raw === 'longest') return 'longest';
  if (raw === 'kortest' || raw === 'shortest') return 'shortest';
  return 'newest';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getBlogCategoryBySlug(slug);
  if (!cat) return { title: 'Kategori ikke funnet' };

  const description = cat.description
    ? stripHtml(cat.description).slice(0, 160)
    : `Artikler i kategorien ${cat.name} — kniv-kunnskap fra THORN FIT.`;

  return {
    title: `${cat.name} — Kniv-info — THORN FIT`,
    description,
    alternates: { canonical: `/kniv-info/kategori/${cat.slug}` },
    openGraph: {
      title: `${cat.name} — Kniv-info`,
      description,
      url: `/kniv-info/kategori/${cat.slug}`,
      type: 'website',
    },
  };
}

export default async function KnivInfoCategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort = parseSort(sp.sortering);
  const searchQuery = (sp.sok ?? '').trim();

  const [category, allCategories] = await Promise.all([
    getBlogCategoryBySlug(slug),
    listBlogCategories(),
  ]);
  if (!category) notFound();

  // Søk innenfor denne kategorien (eller all-listing hvis ikke søk).
  const { posts } =
    searchQuery.length >= 2
      ? await searchPosts(searchQuery, { limit: 24, sort, categorySlug: slug })
      : { posts: await listPostsByCategorySlug(slug, { limit: 24 }) };

  const allCatIds = posts.flatMap((p) => p.categoryIds);
  const allAuthorIds = posts
    .map((p) => p.authorId)
    .filter((id): id is number => typeof id === 'number');
  const [catMap, authorMap] = await Promise.all([
    getCategoriesByIds(allCatIds),
    getAuthorsByIds(allAuthorIds),
  ]);

  const authorPropFor = (post: { authorId: number | null }) => {
    if (post.authorId === null) return null;
    const a = authorMap.get(post.authorId);
    if (!a) return null;
    return { name: a.name, avatarUrl: a.avatarUrl };
  };

  const featured = posts[0];
  const rest = posts.slice(1);
  const description = category.description ? stripHtml(category.description) : null;

  return (
    <main className="bg-canvas">
      {/* MOBILE HERO — Paper FYZ-0 FZM-0 (kategori-variant: breadcrumb
          HJEM/BLOGG/<KATEGORI>, h1 = kategorinavn). */}
      <section
        aria-labelledby="kniv-info-cat-hero-title-mobile"
        className="relative flex flex-col gap-2.5 overflow-clip bg-kuro px-sp-4 pt-sp-5 pb-9 lg:hidden"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-4 -right-2 select-none font-serif font-light leading-none text-shiro/[0.04]"
          style={{ fontSize: '96px' }}
        >
          知識
        </span>

        <nav
          aria-label="Brødsmuler"
          className="relative flex items-center gap-1.5 font-bold uppercase"
          style={{
            fontSize: '11px',
            lineHeight: '14px',
            letterSpacing: '0.1em',
          }}
        >
          <Link href="/" className="text-shiro/40 transition-colors hover:text-shiro/70">
            Hjem
          </Link>
          <span aria-hidden className="font-normal text-shiro/40" style={{ letterSpacing: 0 }}>
            /
          </span>
          <Link href="/kniv-info" className="text-shiro/40 transition-colors hover:text-shiro/70">
            Blogg
          </Link>
          <span aria-hidden className="font-normal text-shiro/40" style={{ letterSpacing: 0 }}>
            /
          </span>
          <span className="text-aka">{category.name}</span>
        </nav>

        <h1
          id="kniv-info-cat-hero-title-mobile"
          className="relative font-bold text-shiro"
          style={{
            fontSize: '36px',
            lineHeight: '38px',
            letterSpacing: '-0.025em',
          }}
        >
          {category.name}
        </h1>

        {description && (
          <p
            className="relative max-w-[342px] text-ink-muted" /* paper-exact: FYZ-0 FZT-0 (intro width 342px) */
            style={{ fontSize: '14px', lineHeight: '22px' }}
          >
            {description}
          </p>
        )}
      </section>

      {/* DESKTOP HERO — Paper CHW-0 (kategori-variant: breadcrumb
          Hjem › Blogg › <kategori>, h1 = kategorinavn).
          Padding 56/64/64/64, gap 12, full-bleed kuro. */}
      <section
        aria-labelledby="kniv-info-cat-hero-title-desktop"
        className="relative hidden overflow-clip border-b border-divider bg-kuro lg:block" /* paper-exact: CHW-0 (kuro bg) */
      >
        <div
          className="relative mx-auto max-w-content lg:px-16" /* paper-exact: CHW-0 (paddingInline 64) */
          style={{ paddingTop: '56px', paddingBottom: '64px' }} /* paper-exact: CHW-0 (paddingTop 56, paddingBottom 64) */
        >
          <div className="flex flex-col" style={{ gap: '12px' }} /* paper-exact: CHW-0 (gap 12) */>
            <nav
              aria-label="Brødsmuler"
              className="flex items-center gap-1.5"
              style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: EEF-0 (13/16) */
            >
              <Link href="/" className="text-shiro/40 transition-colors hover:text-shiro/70">
                Hjem
              </Link>
              <span aria-hidden className="text-shiro/40">›</span>
              <Link
                href="/kniv-info"
                className="text-shiro/40 transition-colors hover:text-shiro/70"
              >
                Blogg
              </Link>
              <span aria-hidden className="text-shiro/40">›</span>
              <span className="font-bold text-aka" /* paper-exact: EEH-0 (Bold aka) */>
                {category.name}
              </span>
            </nav>

            <h1
              id="kniv-info-cat-hero-title-desktop"
              className="font-bold text-shiro"
              style={{
                fontSize: '56px',
                lineHeight: '62px',
                letterSpacing: '-0.03em',
              }} /* paper-exact: CHY-0 (56px Bold, line 110%, letter -0.03em) */
            >
              {category.name}
            </h1>

            {description && (
              <p
                className="max-w-[560px] text-shiro/40" /* paper-exact: CHZ-0 (max-w 560) */
                style={{ fontSize: '16px', lineHeight: '26px' }} /* paper-exact: CHZ-0 (16/26) */
              >
                {description}
              </p>
            )}
          </div>

          <span
            aria-hidden
            className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 select-none font-serif font-light leading-none text-shiro/[0.04]"
            style={{ fontSize: '160px', letterSpacing: '0.05em' }} /* paper-exact: GHE-0 (160px Noto Serif JP Light) */
          >
            知識
          </span>
        </div>
      </section>

      {/* MOBILE FILTER */}
      <MobileBlogFilters
        categories={allCategories}
        activeCategorySlug={category.slug}
        searchQuery={searchQuery}
      />

      {/* DESKTOP FILTER */}
      <div className="hidden lg:block">
        <KnivInfoFilterBar
          categories={allCategories}
          activeCategorySlug={category.slug}
          searchQuery={searchQuery}
          sort={sort}
        />
      </div>

      {/* POST-GRID — Paper CID-0 (padding 48/64/64/64). */}
      <div
        className="mx-auto max-w-content pb-10 md:px-sp-7 lg:px-16 lg:pb-16 lg:pt-12" /* paper-exact: CID-0 (paddingTop 48, paddingBottom 64) */
      >
        {posts.length === 0 ? (
          <div className="mx-sp-3 rounded-1 border border-divider bg-surface p-sp-7 text-center text-body text-ink-muted lg:mx-0">
            {searchQuery
              ? `Ingen artikler i ${category.name} matcher «${searchQuery}». Prøv et annet søkeord.`
              : (
                <>
                  Ingen artikler i denne kategorien ennå.
                  <Link href="/kniv-info" className="ml-2 text-aka hover:underline">
                    Se alle artikler →
                  </Link>
                </>
              )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3 lg:gap-6 lg:gap-y-10" /* paper-exact: CIE-0/CJF-1 (gap 24, row-gap 40) */>
            {featured && (
              <div className="lg:col-span-2">
                <PostCard
                  post={featured}
                  variant="featured"
                  categoryLabel={category.name}
                  author={authorPropFor(featured)}
                />
              </div>
            )}

            {rest.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                categoryLabel={
                  post.categoryIds[0]
                    ? catMap.get(post.categoryIds[0])?.name ?? null
                    : null
                }
                author={authorPropFor(post)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Schema.org — BreadcrumbList + ItemList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Hjem', item: `${SITE_URL}/` },
                { '@type': 'ListItem', position: 2, name: 'Kniv-info', item: `${SITE_URL}/kniv-info` },
                { '@type': 'ListItem', position: 3, name: category.name, item: `${SITE_URL}/kniv-info/kategori/${category.slug}` },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `${category.name} — Kniv-info`,
              url: `${SITE_URL}/kniv-info/kategori/${category.slug}`,
              hasPart: posts.slice(0, 10).map((p) => ({
                '@type': 'BlogPosting',
                headline: p.title,
                datePublished: p.publishedAt,
                dateModified: p.modifiedAt,
                url: `${SITE_URL}/kniv-info/${p.slug}`,
                image: p.featuredImage?.src,
              })),
            },
          ]),
        }}
      />
    </main>
  );
}
