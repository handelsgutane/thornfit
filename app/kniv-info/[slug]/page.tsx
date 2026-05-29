/**
 * /kniv-info/[slug] — artikkelside (Paper CGC-0).
 *
 * Layout:
 *   - Brødsmuler (Hjem › Kniv-info › kategori)
 *   - Eyebrow (kategori) + H1 + meta-byline (forfatter · dato · lesetid)
 *   - Featured image (full-bleed eller boxed)
 *   - Content (sanitized HTML)
 *   - Forfatter-bio (E-E-A-T)
 *   - Tag-chips
 *   - Relaterte artikler (samme kategori)
 *
 * Schema.org BlogPosting + Person på forfatter for SEO.
 */

import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo/site-url';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleProductSuggestions } from '@/components/blog/ArticleProductSuggestions';
import { ArticleVideo } from '@/components/blog/ArticleVideo';
import { NewsletterBlock } from '@/components/blog/NewsletterBlock';
import { PostCard } from '@/components/blog/PostCard';
import { listProductsByIds } from '@/lib/supabase/catalog';
import { sanitizeHtml } from '@/lib/utils/html';
import { injectHeadingIds } from '@/lib/utils/toc';
import {
  getAuthorById,
  getCategoriesByIds,
  getPostBySlug,
  getTagsByIds,
  listPostsByCategorySlug,
} from '@/lib/supabase/blog';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const dateFmt = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Artikkel ikke funnet' };

  const title = post.seoTitle ?? `${post.title} — THORN FIT`;
  const description = post.seoDescription ?? post.excerpt ?? undefined;
  const ogImage = post.ogImageUrl ?? post.featuredImage?.src;

  return {
    title,
    description,
    alternates: { canonical: `/kniv-info/${post.slug}` },
    openGraph: {
      title,
      description,
      url: `/kniv-info/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function KnivInfoPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const [author, categoryMap, tags, relatedProducts] = await Promise.all([
    post.authorId ? getAuthorById(post.authorId) : Promise.resolve(null),
    getCategoriesByIds(post.categoryIds),
    getTagsByIds(post.tagIds),
    listProductsByIds(post.relatedProductIds),
  ]);

  const primaryCategory = post.categoryIds[0]
    ? categoryMap.get(post.categoryIds[0]) ?? null
    : null;

  const related = primaryCategory
    ? (await listPostsByCategorySlug(primaryCategory.slug, { limit: 4 }))
        .filter((p) => p.id !== post.id)
        .slice(0, 3)
    : [];

  // ID-er injiseres på h2-er så deep-link og anchor-fragments fungerer
  // selv om WP ikke skriver dem ut. Brukes også for SEO (Google viser
  // "jump-to-section"-snippets på artikler med strukturert content).
  const contentWithIds = injectHeadingIds(post.content);
  const hasVideo = !!post.videoUrl;

  return (
    <main className="bg-surface md:bg-canvas md:pb-20 md:pt-10 lg:pt-14">
      {/* Wrapper-grid: video-sidebar (340px) + article-col, kun aktivt når
          posten har video. Posts uten video bruker enkelt sentrert max-w-3xl.
          Mobil: 20px sides padding (Paper EZ7-0 F17-0). Desktop: standard grid.

          NB: Pb fjernet på mobil (`md:pb-20`) så bunnen av siden flyter
          rett inn i siste seksjon (related-articles, bg-canvas) → footer.
          Tidligere ga `pb-20` 80px hvit-stripe under en beige seksjon, som
          så feil ut. */}
      <div className="mx-auto max-w-content px-5 md:px-sp-7 lg:px-16">
        <div
          className={
            hasVideo
              ? 'lg:flex lg:items-start lg:gap-sp-7'
              : ''
          }
        >
          {/* Video-sidebar — desktop sticky, skjult på mobil (vises inline
              under header i stedet, se nedenfor). */}
          {hasVideo && (
            <aside className="hidden lg:block lg:sticky lg:top-[100px] lg:w-[340px] lg:shrink-0 lg:self-start" /* paper-exact: ERU-0 (sticky video-sidebar 340 width, top 100 = header 72 + 28 breathing) */>
              <ArticleVideo
                videoUrl={post.videoUrl!}
                caption={post.title}
              />
            </aside>
          )}

          {/* Artikkel-kolonnen — full bredde uten video, fleksibel med video. */}
          <div
            className={
              hasVideo
                ? 'lg:flex-1 lg:min-w-0 lg:max-w-[912px]' /* paper-exact: ERU-0 (article column max-width with sticky sidebar) */
                : 'mx-auto max-w-3xl'
            }
          >
        {/* Breadcrumb — viser KUN kategori-stien (ikke selve artikkelen).
            Tittelen er allerede stor og synlig som H1 rett under, så det er
            unødvendig støy å gjenta den her. Mobil bruker labelen "Blogg"
            (Paper EZ7-0 F1B-0) selv om route'n er /kniv-info — det er det
            brukerne ser ellers i navigasjonen. */}
        <nav className="mt-sp-2 mb-sp-3 text-body-xs text-ink-muted lg:mt-0" aria-label="Brødsmuler">
          <Link href="/" className="hover:text-ink">Hjem</Link>
          <span aria-hidden className="mx-sp-2">›</span>
          <Link href="/kniv-info" className="hover:text-ink">Blogg</Link>
          {primaryCategory && (
            <>
              <span aria-hidden className="mx-sp-2">›</span>
              <Link
                href={`/kniv-info/kategori/${primaryCategory.slug}`}
                className="text-ink hover:text-aka"
              >
                {primaryCategory.name}
              </Link>
            </>
          )}
        </nav>

        <header className="mb-sp-4 md:mb-sp-7">
          {primaryCategory && (
            <span
              className="inline-block rounded-1 bg-aka font-bold uppercase text-shiro md:rounded-sm md:px-sp-2 md:py-1"
              style={{
                fontSize: '10px',
                lineHeight: '12px',
                letterSpacing: '0.1em',
                padding: '3px 10px',
              }} /* paper-exact: EZ7-0 F1F-0 (mobile pill 10/12, padding 3/10) */
            >
              {primaryCategory.name}
            </span>
          )}
          {/* H1 — mobil 26px Bold (Paper F1H-0), md 40px (text-h1), lg display.
              Letter-spacing tighter på mobil for å holde tett ord-rytme i
              små bredder. */}
          <h1
            className="mt-sp-3 font-bold text-ink md:text-h1 lg:text-display"
            style={{ fontSize: '26px', lineHeight: '33px', letterSpacing: '-0.02em' }} /* paper-exact: EZ7-0 F1H-0 (mobile h1 26/33, -0.02em) */
          >
            {post.title}
          </h1>
          {post.excerpt && (
            <p
              className="mt-sp-3 text-ink-muted md:mt-sp-4 md:text-body md:text-ink"
              style={{ fontSize: '15px', lineHeight: '24px' }} /* paper-exact: EZ7-0 F1I-0 (mobile excerpt 15/24, haiiro) */
            >
              {post.excerpt}
            </p>
          )}

          {/* Byline — Paper CGC-0.
              Mobil: avatar | (navn / Oppdatert dato · X min). Avatar
              vertikalt sentrert mot begge tekstlinjene.
              Desktop: avatar | navn+rolle | dato | oppdatert | lesing
              (én flat rad med · separatorer). */}
          {(() => {
            // Vis "oppdatert" hvis den er nyere enn publisert; ellers fall
            // tilbake til publisert. På mobil er det viktig å være kompakt.
            const showModified =
              post.modifiedAt && new Date(post.modifiedAt) > new Date(post.publishedAt);
            const mobileDateLabel = showModified ? 'Oppdatert ' : '';
            const mobileDateValue = showModified
              ? dateFmt.format(new Date(post.modifiedAt!))
              : dateFmt.format(new Date(post.publishedAt));
            const mobileDateAttr = showModified ? post.modifiedAt! : post.publishedAt;

            return (
              <div className="mt-sp-5 flex items-center gap-sp-3 text-body-xs text-ink-muted">
                {author?.avatarUrl ? (
                  <img
                    src={author.avatarUrl}
                    alt={author.name}
                    className="size-8 shrink-0 rounded-full object-cover"
                    width={32}
                    height={32}
                  />
                ) : author ? (
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-contrast text-[10px] font-bold uppercase text-ink-inverse" /* paper-exact: EZ7-0 F1L-0 (byline init 10px) */
                  >
                    {author.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                ) : null}

                {/* Mobil-layout (under md): forfatter på første linje,
                    "Oppdatert dato · X min" på andre. Vertikalt sentrert
                    mot avataren via items-center på flex-parent. */}
                <div className="flex flex-col leading-tight md:hidden">
                  {author && (
                    <Link
                      href={`/kniv-info/forfatter/${author.slug}`}
                      className="text-body-sm font-bold text-ink hover:text-aka"
                    >
                      {author.name}
                    </Link>
                  )}
                  <span>
                    {mobileDateLabel}
                    <time dateTime={mobileDateAttr}>{mobileDateValue}</time>
                    <span aria-hidden> · </span>
                    {post.readingTimeMin} min
                  </span>
                </div>

                {/* Desktop-layout (md+): full byline-rad med separatorer. */}
                {author && (
                  <div className="hidden flex-col leading-tight md:flex">
                    <Link
                      href={`/kniv-info/forfatter/${author.slug}`}
                      className="text-body-xs font-medium text-ink hover:text-aka"
                    >
                      {author.name}
                    </Link>
                    {author.credentials && (
                      <span className="text-body-xs text-ink-muted">{author.credentials}</span>
                    )}
                  </div>
                )}

                <div className="hidden items-baseline gap-sp-2 md:flex">
                  <span aria-hidden>·</span>
                  <time dateTime={post.publishedAt}>
                    {dateFmt.format(new Date(post.publishedAt))}
                  </time>
                  {showModified && (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        Oppdatert{' '}
                        <time dateTime={post.modifiedAt!}>
                          {dateFmt.format(new Date(post.modifiedAt!))}
                        </time>
                      </span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>{post.readingTimeMin} min lesing</span>
                </div>
              </div>
            );
          })()}
        </header>

        {/* Mobil-video — vises mellom byline og TOC på smale skjermer.
            På desktop ligger videoen i sticky sidebar til venstre.
            Negativ margin matcher mobile-paddingen (px-5 = 20px) så
            videoen går helt ut til viewport-kantene — det er Paper-spec
            på EZ7-0 EZU-0 (cinematic full-bleed). md+ får tilbake
            normal padding. */}
        {hasVideo && (
          <div className="-mx-5 mb-sp-7 md:mx-0 lg:hidden">
            <ArticleVideo
              videoUrl={post.videoUrl!}
              caption={post.title}
            />
          </div>
        )}

        {/* Hero featured image — kun når posten ikke har video.
            Boxet inn i article-kolonnen (ikke full-bleed) når sidebar er aktiv. */}
        {!hasVideo && post.featuredImage && (
          <div className="mb-sp-7 mt-sp-7 lg:mb-12">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-1 bg-surface-muted">
              <Image
                src={post.featuredImage.src}
                alt={post.featuredImage.alt || post.title}
                fill
                priority
                sizes="(min-width: 1024px) 912px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        )}

        {/* Body — id-er injisert på h2-er så TOC-anchor-lenker scroller riktig.
            `w-full` på mobil så teksten følger viewportbredden minus padding;
            `md:max-w-[640px]` for lesbar line-length på desktop. */}
        {contentWithIds && (
          <div
            className="product-description mt-sp-7 w-full md:max-w-[640px]" /* paper-exact: ERU-0 (article body max line-length 640 on desktop) */
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentWithIds) }}
          />
        )}

        {/* Relaterte produkter — vises hvis posten har skn_related_product_ids
            satt og produktene er publisert. */}
        {relatedProducts.length > 0 && (
          <ArticleProductSuggestions
            products={relatedProducts}
            seeAllHref={primaryCategory ? `/kniv-info/kategori/${primaryCategory.slug}` : null}
          />
        )}

        {tags.length > 0 && (
          <div className="mt-sp-7 flex flex-wrap gap-sp-2 border-t border-divider pt-sp-5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-sm bg-surface-muted px-sp-2 py-1 text-label-sm font-medium text-ink-muted"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {author && (author.description || author.credentials) && (
          // Paper EZ7-0 F3G-0: 24/20 padding, gap 14, avatar 48 black bg, top border.
          <aside className="mt-sp-7 flex gap-3.5 border-t border-divider pt-sp-5 md:gap-sp-4 md:pt-sp-7">
            {author.avatarUrl ? (
              <img
                src={author.avatarUrl}
                alt={author.name}
                className="size-12 shrink-0 rounded-full object-cover md:size-14"
                width={48}
                height={48}
              />
            ) : (
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-contrast font-bold uppercase text-ink-inverse md:size-14"
                style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: EZ7-0 F3I-0 (mobile init 12/16) */
              >
                {author.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </span>
            )}
            <div className="flex flex-1 flex-col gap-1.5 md:gap-sp-2">
              <div className="flex flex-wrap items-baseline gap-x-1 md:gap-x-sp-3">
                <Link
                  href={`/kniv-info/forfatter/${author.slug}`}
                  className="font-bold text-ink hover:text-aka md:text-body-md"
                  style={{ fontSize: '16px', lineHeight: '20px' }} /* paper-exact: EZ7-0 F3K-0 (name 16/20) */
                >
                  {author.name}
                </Link>
                {author.credentials && (
                  <span
                    className="text-ink md:text-body-sm md:text-ink-muted"
                    style={{ fontSize: '16px', lineHeight: '20px' }}
                  >
                    · {author.credentials}
                  </span>
                )}
              </div>
              {author.description && (
                <p
                  className="text-ink-muted md:text-body-sm"
                  style={{ fontSize: '13px', lineHeight: '21px' }} /* paper-exact: EZ7-0 F3L-0 (13/21, 160% line, haiiro) */
                >
                  {author.description}
                </p>
              )}
              <Link
                href={`/kniv-info/forfatter/${author.slug}`}
                className="inline-block font-bold text-aka hover:underline md:text-body-sm md:font-medium"
                style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: EZ7-0 F3M-0 (13/16 bold aka) */
              >
                Se alle artikler av {author.name.split(' ')[0].toLowerCase()} →
              </Link>
            </div>
          </aside>
        )}
          </div> {/* /article-col */}
        </div> {/* /flex */}
      </div> {/* /max-w-content wrapper */}

      {/* Nyhetsbrev (Paper CGC-0): full-bleed Kuro-blokk mellom forfatter-bio
          og relaterte artikler. Driver konvertering til abonnement på toppen
          av et leset artikkel-engasjement. */}
      <NewsletterBlock />


      {related.length > 0 && (
        // Paper EZ7-0 F3W-0: bg canvas, 32 top / 40 bottom / 20 sides, gap 16.
        <section className="bg-canvas px-5 pt-8 pb-10 md:bg-transparent md:px-sp-7 md:pt-0 md:pb-0 lg:px-16 lg:pt-12">
          <div className="mx-auto max-w-content">
            <div className="mb-sp-4 flex items-baseline justify-between md:mb-sp-5">
              <h2
                className="font-bold text-ink md:text-h2"
                style={{ fontSize: '18px', lineHeight: '22px', letterSpacing: '-0.01em' }} /* paper-exact: EZ7-0 F3Y-0 (18/22, mobile section heading) */
              >
                Relaterte artikler
              </h2>
              {primaryCategory && (
                <Link
                  href={`/kniv-info/kategori/${primaryCategory.slug}`}
                  className="font-bold text-aka hover:underline md:text-body-sm md:font-medium md:text-ink"
                  style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: EZ7-0 F3Z-0 (12/16 bold aka) */
                >
                  Se alle <span aria-hidden>→</span>
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-sp-5 lg:grid-cols-3">
              {related.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  variant="compact"
                  categoryLabel={primaryCategory?.name ?? null}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt ?? undefined,
            image: post.featuredImage?.src,
            datePublished: post.publishedAt,
            dateModified: post.modifiedAt,
            author: author
              ? {
                  '@type': 'Person',
                  name: author.name,
                  url: `${SITE_URL}/kniv-info/forfatter/${author.slug}`,
                  description: author.description ?? undefined,
                }
              : undefined,
            publisher: {
              '@type': 'Organization',
              name: 'THORN FIT',
              logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}/logo.png`,
              },
            },
            mainEntityOfPage: `${SITE_URL}/kniv-info/${post.slug}`,
          }),
        }}
      />
    </main>
  );
}
