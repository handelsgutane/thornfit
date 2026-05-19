/**
 * /kniv-info — kunnskaps-oversikt (Paper CGB-0).
 *
 * Desktop-layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  category-hero (CHW-0) — full-bleed kuro, breadcrumbs,      │
 *   │   h1 56px Knivkunnskap + intro 16/26 + 知識 kanji watermark │
 *   ├─────────────────────────────────────────────────────────────┤  ← border-b sakai
 *   │  filter-bar (EEI-0) — full-bleed hvit, søk + tabs + sort    │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  post-grid (CID-0) — padding 48/64, gap 40                  │
 *   │   ▸ rad 1: featured (2-col) + 2 standard kort               │
 *   │   ▸ newsletter-mid (kuro band 1312×154)                     │
 *   │   ▸ rad 2: 3 standard kort                                  │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  pagination (EFJ-0) — unohana band, "Last flere" + counter  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Datakilde: Supabase blog_posts + blog_categories (synket fra WP).
 *
 * NB: Slug-base'en er `/kniv-info` for å matche eksisterende WP-URL-mønster
 * (skarpekniver.com/kniv-info/...). Gamle `/blogg`-URL-er 301-redirectes.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { KnivInfoFilterBar } from '@/components/blog/FilterBar';
import { MobileBlogFilters } from '@/components/blog/MobileBlogFilters';
import { PostCard } from '@/components/blog/PostCard';
import { LoadMoreButton } from '@/components/blog/LoadMoreButton';
import { NewsletterBlock } from '@/components/blog/NewsletterBlock';
import {
  type PostSort,
  getAuthorsByIds,
  getCategoriesByIds,
  listBlogCategories,
  listPosts,
  searchPosts,
} from '@/lib/supabase/blog';

const PAGE_SIZE = 12;

function parseSort(raw: string | string[] | undefined): PostSort {
  if (raw === 'eldste' || raw === 'oldest') return 'oldest';
  if (raw === 'lengst' || raw === 'longest') return 'longest';
  if (raw === 'kortest' || raw === 'shortest') return 'shortest';
  return 'newest';
}

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Knivkunnskap — Skarpekniver',
  description:
    'Guides, teknikker og historier fra kjøkkenet — for deg som tar matlaging på alvor.',
  alternates: { canonical: '/kniv-info' },
  openGraph: {
    title: 'Knivkunnskap — Skarpekniver',
    description:
      'Guides, teknikker og historier fra kjøkkenet — for deg som tar matlaging på alvor.',
    url: '/kniv-info',
    type: 'website',
  },
};

interface PageProps {
  searchParams: Promise<{ side?: string; sortering?: string; sok?: string }>;
}

export default async function KnivInfoIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parsePage(sp.side);
  const sort = parseSort(sp.sortering);
  const searchQuery = (sp.sok ?? '').trim();
  const limit = PAGE_SIZE * page;

  const [{ posts, total }, categories] = await Promise.all([
    searchQuery.length >= 2
      ? searchPosts(searchQuery, { limit, sort })
      : listPosts({ limit, sort }),
    listBlogCategories(),
  ]);

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
  // Paper: nyhetsbrev plasseres etter første "rad" (featured tar 2-kol + 2
  // standard kort = 3 kolonner). Splitter rest i pre/post-newsletter.
  const restPreNewsletter = rest.slice(0, 2);
  const restAfterNewsletter = rest.slice(2);

  return (
    <main className="bg-canvas">
      {/* MOBILE HERO — Paper FYZ-0 FZM-0 (390×184). Dark kuro band med
          kanji 知識 watermark nede til høyre, breadcrumb (HJEM/BLOGG),
          h1 36px Satoshi Bold hvit, body 14px haiiro. */}
      <section
        aria-labelledby="kniv-info-hero-title-mobile"
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
          <span className="text-aka">Blogg</span>
        </nav>

        <h1
          id="kniv-info-hero-title-mobile"
          className="relative font-bold text-shiro"
          style={{
            fontSize: '36px',
            lineHeight: '38px',
            letterSpacing: '-0.025em',
          }}
        >
          Knivkunnskap
        </h1>

        <p
          className="relative max-w-[342px] text-ink-muted" /* paper-exact: FYZ-0 FZT-0 (intro width 342px) */
          style={{ fontSize: '14px', lineHeight: '22px' }}
        >
          Guides, teknikker og historier fra kjøkkenet — for deg som tar
          matlaging på alvor.
        </p>
      </section>

      {/* DESKTOP HERO — Paper CHW-0 (1440×275, full-bleed kuro).
          Padding 56/64/64/64, gap 12. h1 56px Bold white, intro 16/26
          haiiro max-w 560. 知識 kanji absolutt høyre, 160px Noto Serif JP
          Light, color rgba(255,255,255,0.04). */}
      <section
        aria-labelledby="kniv-info-hero-title-desktop"
        className="relative hidden overflow-clip border-b border-divider bg-kuro lg:block" /* paper-exact: CHW-0 (kuro bg, border-b sakai) */
      >
        <div
          className="relative mx-auto max-w-content lg:px-16" /* paper-exact: CHW-0 (paddingInline 64) */
          style={{ paddingTop: '56px', paddingBottom: '64px' }} /* paper-exact: CHW-0 (paddingTop 56, paddingBottom 64) */
        >
          <div className="flex flex-col" style={{ gap: '12px' }} /* paper-exact: CHW-0 (gap 12) */>
            <nav
              aria-label="Brødsmuler"
              className="flex items-center gap-1.5"
              style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: EEF-0/EEH-0 (13/16) */
            >
              <Link
                href="/"
                className="text-shiro/40 transition-colors hover:text-shiro/70"
              >
                Hjem
              </Link>
              <span aria-hidden className="text-shiro/40">›</span>
              <span className="font-bold text-aka" /* paper-exact: EEH-0 (Bold aka) */>
                Blogg
              </span>
            </nav>

            <h1
              id="kniv-info-hero-title-desktop"
              className="font-bold text-shiro"
              style={{
                fontSize: '56px',
                lineHeight: '62px',
                letterSpacing: '-0.03em',
              }} /* paper-exact: CHY-0 (56px Bold, line 110%, letter -0.03em) */
            >
              Knivkunnskap
            </h1>

            <p
              className="max-w-[560px] text-shiro/40" /* paper-exact: CHZ-0 (max-w 560) */
              style={{ fontSize: '16px', lineHeight: '26px' }} /* paper-exact: CHZ-0 (16/26 Regular haiiro) */
            >
              Guides, teknikker og historier fra kjøkkenet — for deg som tar
              matlaging på alvor.
            </p>
          </div>

          {/* 知識 kanji watermark — absolutt høyre (Paper GHE-0). */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 select-none font-serif font-light leading-none text-shiro/[0.04]"
            style={{ fontSize: '160px', letterSpacing: '0.05em' }} /* paper-exact: GHE-0 (160px Noto Serif JP Light, letter 0.05em, color rgba(255,255,255,0.04)) */
          >
            知識
          </span>
        </div>
      </section>

      {/* MOBILE FILTER — Paper FYZ-0 FZU-0 (search + horizontal category pills). */}
      <MobileBlogFilters
        categories={categories}
        activeCategorySlug={null}
        searchQuery={searchQuery}
      />

      {/* DESKTOP FILTER — Paper EEI-0 (full-bleed hvit stripe med 2 rader).
          Plassert UTENFOR max-w-content-wrapperen så bg går edge-to-edge. */}
      <div className="hidden lg:block">
        <KnivInfoFilterBar
          categories={categories}
          activeCategorySlug={null}
          searchQuery={searchQuery}
          sort={sort}
        />
      </div>

      {/* POST-GRID — Paper CID-0 (padding 48/64/64/64, gap 40 mellom rader).
          Mobile beholder full-bleed liste. */}
      <div
        className="mx-auto max-w-content md:px-sp-7 lg:px-16 lg:pt-12 lg:pb-16" /* paper-exact: CID-0 (paddingTop 48, paddingBottom 64) */
      >
        {posts.length === 0 && (
          <div className="mx-sp-3 rounded-1 border border-divider bg-surface p-sp-7 text-center text-body text-ink-muted lg:mx-0">
            {searchQuery
              ? `Ingen artikler matcher «${searchQuery}». Prøv et annet søkeord.`
              : 'Vi jobber med innhold — kom tilbake snart.'}
          </div>
        )}

        {/* Rad 1 — featured (2-kol) + 2 standard kort.
            Paper CIE-0: row, gap 24. Mobil har full-bleed kort (gap 0). */}
        {posts.length > 0 && (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3 lg:gap-6" /* paper-exact: CIE-0 (gap 24) */>
            {featured && (
              <div className="lg:col-span-2">
                <PostCard
                  post={featured}
                  variant="featured"
                  categoryLabel={
                    featured.categoryIds[0]
                      ? catMap.get(featured.categoryIds[0])?.name ?? null
                      : null
                  }
                  author={authorPropFor(featured)}
                />
              </div>
            )}

            {restPreNewsletter.map((post) => (
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

        {/* Newsletter — INNE i grid-wrapperen for desktop (Paper EF9-0 sitter
            inne i CID-0 med gap 40 over/under). Skjules ved søk. */}
        {posts.length > 0 && !searchQuery && <NewsletterBlock />}

        {/* Rad 2 — 3 standard kort. Paper CJF-1: row, gap 24. */}
        {restAfterNewsletter.length > 0 && (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3 lg:gap-6" /* paper-exact: CJF-1 (gap 24) */>
            {restAfterNewsletter.map((post) => (
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

      {/* PAGINATION — Paper EFJ-0 (1440×192, unohana bg, padding 48/64/64/64,
          gap 12 mellom knapp og counter, items center).
          Mobil: kompakt under grid'et, ingen unohana band. */}
      {posts.length > 0 && (
        <section
          aria-label="Paginering"
          className="bg-canvas pb-10 pt-sp-5 lg:py-16" /* paper-exact: EFJ-0 (paddingTop 48, paddingBottom 64) */
        >
          <div className="mx-auto flex max-w-content flex-col items-center gap-2.5 px-sp-4 lg:gap-3 lg:px-16" /* paper-exact: EFJ-0 (gap 12, items center) */>
            {posts.length < total && (
              <div className="w-full lg:w-auto">
                <LoadMoreButton
                  nextPage={page + 1}
                  currentSort={sort}
                  label="Last flere artikler"
                />
              </div>
            )}
            <p
              className="text-ink-muted"
              style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: EFM-0 (12/16 Regular haiiro) */
            >
              Viser {posts.length} av {total} artikler
            </p>
          </div>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Knivkunnskap',
            description:
              'Guides, teknikker og historier fra kjøkkenet — for deg som tar matlaging på alvor.',
            url: 'https://skarpekniver.com/kniv-info',
            blogPost: posts.slice(0, 10).map((p) => ({
              '@type': 'BlogPosting',
              headline: p.title,
              datePublished: p.publishedAt,
              dateModified: p.modifiedAt,
              url: `https://skarpekniver.com/kniv-info/${p.slug}`,
              image: p.featuredImage?.src,
            })),
          }),
        }}
      />
    </main>
  );
}
