/**
 * PostCard — gjenbrukbart kunnskaps-kort. Brukes på /kniv-info-oversikten,
 * forsidens kunnskaps-teaser, og "relaterte artikler"-blokken på artikkelsiden.
 *
 * Varianter:
 *   - default  — standard kort. Vertikal på desktop (img top, aspect 16/9),
 *                horisontal radlayout på mobil (text venstre + 100×178
 *                thumbnail høyre) per Paper FYZ-0 G0T-0.
 *                Desktop: Paper CIR-0/CJ3-0 (rad 1) eller CJG-1 (rad 2)
 *                — w 317/421, bordered card, badge bottom-left kuro,
 *                title 16/21 Bold, excerpt 13/20.
 *   - featured — stort kort. Paper CIF-0 (631×533): aspect 16/9 image,
 *                badge bottom-left aka 10px, h2 20/26 Bold, excerpt 14/22,
 *                meta-rad med avatar/dato/lesetid.
 *   - compact  — alltid vertikal mini-kort, brukt i 2-kol grid på artikkel-
 *                sidens "Relaterte artikler"-blokk (Paper EZ7-0 F40-0).
 *
 * Henter data fra `BlogPostListItem` + valgfri kategori-label.
 */

import Image from 'next/image';
import Link from 'next/link';

import type { BlogPostListItem } from '@/lib/supabase/blog';

interface PostAuthor {
  name: string;
  avatarUrl: string | null;
  /** Initialer-fallback hvis avatar mangler — to bokstaver, uppercase. */
  initials?: string;
}

interface PostCardProps {
  post: BlogPostListItem;
  /** Vises som badge over bildet. Caller plukker ut riktig fra category_ids. */
  categoryLabel?: string | null;
  /** Variant:
   *   - default  — single-col rad: horisontal på mobil, vertikal kort på lg
   *   - featured — stort kort med excerpt og byline
   *   - compact  — alltid vertikal (image top + tekst under), brukt i 2-kol
   *                grid (artikkel-side "Relaterte artikler" Paper EZ7-0 F40-0)
   */
  variant?: 'default' | 'featured' | 'compact';
  /** Forfatter-info — vises som avatar + navn i meta-raden. */
  author?: PostAuthor | null;
}

const dateFmt = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateFmtShort = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'short',
});

export function PostCard({ post, categoryLabel, variant = 'default', author }: PostCardProps) {
  const isFeatured = variant === 'featured';
  const isCompact = variant === 'compact';
  const href = `/kniv-info/${post.slug}`;

  if (isFeatured) {
    return <FeaturedCard post={post} categoryLabel={categoryLabel} author={author} href={href} />;
  }

  if (isCompact) {
    return <CompactCard post={post} categoryLabel={categoryLabel} href={href} />;
  }

  return <DefaultCard post={post} categoryLabel={categoryLabel} author={author} href={href} />;
}

/* -------------------------------------------------------------------------- *
 * FEATURED — stort kort med full bildeflate og excerpt + author-byline.
 *
 * Mobil (Paper FYZ-0 G0D-0..G0R-0): img 220px tall, content padding 18/22/20,
 *   h3 20/25, excerpt 14/22, avatar 24px aka-sirkel + 10px hvit init.
 *
 * Desktop (Paper CIF-0, 631×533):
 *   - bordered card (1px sakai, radius 2, white bg)
 *   - image (CIG-0): aspect 16/9, kuro placeholder
 *   - badge (CII-0): absolute bottom 16, left 16, aka bg, padding 3/8,
 *     radius 2, 10px white Bold uppercase
 *   - text (CIK-0): padding 20/20/24/20, gap 10
 *   - title (CIL-0): 20/26 Bold kuro, line 130%, letter -0.01em
 *   - excerpt (CIM-0): 14/22 Regular haiiro, line 160%
 *   - meta (ECW-0): col, gap 5
 * -------------------------------------------------------------------------- */
function FeaturedCard({
  post,
  categoryLabel,
  author,
  href,
}: {
  post: BlogPostListItem;
  categoryLabel: string | null | undefined;
  author: PostAuthor | null | undefined;
  href: string;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-1 border-b border-divider bg-surface lg:border lg:border-divider" /* paper-exact: CIF-0 (border 1px sakai, radius 2, white bg) */>
      <Link href={href} className="block">
        <div className="relative w-full overflow-hidden bg-[#1E1C18] aspect-[390/220] lg:aspect-[16/9]" /* paper-exact: CIG-0 (desktop aspect 16/9) */>
          {post.featuredImage?.src ? (
            <Image
              src={post.featuredImage.src}
              alt={post.featuredImage.alt || post.title}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" /* paper-exact: hover micro-interaction shared with ProductCard */
            />
          ) : (
            <div className="flex h-full items-center justify-center text-label uppercase text-shiro/40">
              {post.title.slice(0, 2)}
            </div>
          )}

          {categoryLabel && (
            <span
              className="absolute bottom-3.5 left-4 rounded-1 bg-aka font-bold uppercase text-shiro" /* paper-exact: CII-0 (absolute bottom 16, left 16, aka bg, radius 2) */
              style={{
                fontSize: '10px',
                lineHeight: '12px',
                letterSpacing: '0.1em',
                padding: '3px 8px',
              }} /* paper-exact: CII-0 (paddingBlock 3, paddingInline 8) */
            >
              {categoryLabel}
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-sp-2 px-5 pt-[18px] pb-[22px] lg:gap-2.5 lg:px-5 lg:pt-5 lg:pb-6" /* paper-exact: CIK-0 (desktop padding 20/20/24/20, gap 10) */>
        <Link href={href} className="block">
          <h2
            className="font-bold text-ink text-h3 line-clamp-2"
            style={{ letterSpacing: '-0.015em' }}
          >
            <span className="lg:hidden">{post.title}</span>
            <span
              className="hidden lg:inline"
              style={{ fontSize: '20px', lineHeight: '26px', letterSpacing: '-0.01em' }} /* paper-exact: CIL-0 (20/26 Bold, letter -0.01em) */
            >
              {post.title}
            </span>
          </h2>
        </Link>

        {post.excerpt && (
          <p
            className="text-ink-muted line-clamp-3"
            style={{ fontSize: '14px', lineHeight: '22px' }} /* paper-exact: CIM-0 (14/22 Regular haiiro) */
          >
            {post.excerpt}
          </p>
        )}

        <div className="mt-sp-1 flex flex-wrap items-center gap-x-sp-2 gap-y-1 text-ink-muted lg:mt-0 lg:gap-x-1.5" /* paper-exact: ECW-0 (col, gap 5 — vi bruker meta-rad horisontalt med 6px) */
             style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: ECW-0 children (12/16 haiiro) */>
          {author && (
            <>
              <Avatar
                name={author.name}
                src={author.avatarUrl}
                initials={author.initials}
                size={24}
              />
              <span className="font-medium text-ink">{author.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={post.publishedAt}>
            {dateFmt.format(new Date(post.publishedAt))}
          </time>
          <span aria-hidden>·</span>
          <span>{post.readingTimeMin} min</span>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- *
 * DEFAULT — responsiv:
 *   • Mobil: horisontal rad med text-blokk + 100px thumbnail-kolonne høyre.
 *     Paper FYZ-0 G0T-0 (390×178). Border-bottom mellom rader, kort-bg shiro,
 *     h3 15/20 bold, excerpt 13/20, dato-rad med 20px aka-dot + init.
 *   • Desktop: vertikal kort. Paper CIR-0/CJ3-0 (rad 1, w 317×533) eller
 *     CJG-1 (rad 2, w 421×390). Bordered card (1px sakai, radius 2).
 *     - Image (CIS-0/CJH-1): aspect 16/9
 *     - Badge (CIU-0/CJJ-1): absolute bottom 12, left 12, kuro bg,
 *       padding 3/8, 9px white uppercase Bold
 *     - Text (CIW-0/CJL-1): padding 16/16/20/16, gap 8
 *     - Title (CIX-0/CJM-1): 16/21 Bold kuro, line 130%, letter -0.01em
 *     - Excerpt (CIY-0/CJN-1): 13/20 Regular haiiro, line 150%
 *     - Meta (ED5-0/EDN-0): col, gap 4
 *
 * Visuell flip implementeres med `flex-row-reverse lg:flex-col`. DOM-orden er
 * [image, text]; flex-row-reverse på mobil flytter image til høyre, mens
 * lg:flex-col gjenoppretter standard topp-til-bunn.
 * -------------------------------------------------------------------------- */
function DefaultCard({
  post,
  categoryLabel,
  author,
  href,
}: {
  post: BlogPostListItem;
  categoryLabel: string | null | undefined;
  author: PostAuthor | null | undefined;
  href: string;
}) {
  return (
    <article className="group flex flex-row-reverse overflow-hidden border-b border-divider bg-surface lg:flex-col lg:rounded-1 lg:border lg:border-divider" /* paper-exact: CIR-0 (border 1px sakai, radius 2) */>
      {/* Image — 100px wide on mobile (full height), full-bleed aspect 16/9 on desktop */}
      <Link
        href={href}
        className="block w-[100px] flex-shrink-0 self-stretch lg:w-full lg:flex-shrink lg:self-auto" /* paper-exact: FYZ-0 G13-0 (mobile thumbnail 100px) */
        aria-hidden="true"
        tabIndex={-1}
      >
        <div className="relative h-full w-full overflow-hidden bg-[#2C2C2C] lg:aspect-[16/9] lg:bg-[#3A3A3A]" /* paper-exact: CIS-0 (aspect 16/9, kuro placeholder #3A3A3A) */>
          {post.featuredImage?.src ? (
            <Image
              src={post.featuredImage.src}
              alt={post.featuredImage.alt || post.title}
              fill
              sizes="(min-width: 1024px) 33vw, 100px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" /* paper-exact: hover micro-interaction shared with ProductCard */
            />
          ) : (
            <div className="flex h-full items-center justify-center text-label uppercase text-shiro/30 lg:text-shiro/40">
              {post.title.slice(0, 2)}
            </div>
          )}

          {/* Category badge — desktop: absolute bottom-left kuro (Paper CIU-0).
              Mobile: skjult her, vises i text-blokken (Paper G0V-0). */}
          {categoryLabel && (
            <span
              className="absolute bottom-3 left-3 hidden rounded-1 bg-kuro font-bold uppercase text-shiro lg:inline-block" /* paper-exact: CIU-0 (absolute bottom 12, left 12, kuro bg, radius 2) */
              style={{
                fontSize: '9px',
                lineHeight: '12px',
                letterSpacing: '0.1em',
                padding: '3px 8px',
              }} /* paper-exact: CIU-0 (paddingBlock 3, paddingInline 8) */
            >
              {categoryLabel}
            </span>
          )}
        </div>
      </Link>

      {/* Text — padding 16/16/20/16 desktop (Paper CIW-0), gap 8. */}
      <div className="flex flex-1 flex-col gap-[6px] px-5 py-5 lg:gap-sp-2 lg:px-4 lg:pt-4 lg:pb-5" /* paper-exact: CIW-0 (desktop padding 16/16/20/16, gap 8) */>
        {/* Mobile: kategori-badge inline øverst (Paper G0V-0 — black bg, 9px label) */}
        {categoryLabel && (
          <span
            className="inline-flex w-fit rounded-1 bg-surface-contrast font-bold uppercase text-ink-inverse lg:hidden"
            style={{
              fontSize: '9px',
              lineHeight: '12px',
              letterSpacing: '0.1em',
              padding: '3px 8px',
            }}
          >
            {categoryLabel}
          </span>
        )}

        <Link href={href} className="block">
          <h2
            className="font-bold text-ink line-clamp-2"
            style={{
              fontSize: '15px',
              lineHeight: '20px',
              letterSpacing: '-0.01em',
            }}
          >
            <span className="lg:hidden">{post.title}</span>
            <span
              className="hidden lg:inline"
              style={{ fontSize: '16px', lineHeight: '21px', letterSpacing: '-0.01em' }} /* paper-exact: CIX-0 (16/21 Bold, letter -0.01em) */
            >
              {post.title}
            </span>
          </h2>
        </Link>

        {post.excerpt && (
          <>
            <p
              className="text-ink-muted line-clamp-2 lg:hidden"
              style={{ fontSize: '13px', lineHeight: '20px' }}
            >
              {post.excerpt}
            </p>
            <p
              className="hidden text-ink-muted line-clamp-2 lg:block"
              style={{ fontSize: '13px', lineHeight: '20px' }} /* paper-exact: CIY-0 (13/20 Regular haiiro) */
            >
              {post.excerpt}
            </p>
          </>
        )}

        {/* Meta — mobil viser avatar + dato; desktop viser dato + lesetid (Paper ED5-0/EDN-0). */}
        <div className="mt-[2px] flex items-center gap-[6px] text-ink-muted lg:mt-1 lg:flex-col lg:items-start lg:gap-1" /* paper-exact: ED5-0 (col, gap 4) */>
          <Avatar
            name={author?.name ?? 'THORN FIT redaksjon'}
            src={author?.avatarUrl ?? null}
            initials={author?.initials}
            size={20}
            className="lg:hidden"
          />
          <span className="lg:hidden" style={{ fontSize: '11px', lineHeight: '14px' }}>
            <time dateTime={post.publishedAt}>
              {dateFmt.format(new Date(post.publishedAt))}
            </time>
            {' · '}
            {post.readingTimeMin} min
          </span>

          {/* Desktop date-rad — 12/16 haiiro (matcher Paper meta-rad). */}
          <span
            className="hidden lg:flex lg:items-center lg:gap-1.5"
            style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: ED5-0 children (12/16 haiiro) */
          >
            <time dateTime={post.publishedAt}>
              {dateFmt.format(new Date(post.publishedAt))}
            </time>
            <span aria-hidden>·</span>
            <span>{post.readingTimeMin} min lesing</span>
          </span>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- *
 * COMPACT — vertikal mini-kort. Brukt i 2-kol grid på artikkel-sidens
 * "Relaterte artikler"-blokk (Paper EZ7-0 F41-0/F43-0):
 *   • Image: aspect 16/10, dark gradient placeholder
 *   • Text: padding 10/12/14/12, gap 4
 *   • Category badge: 9px white bold uppercase på kuro, padding 2/6
 *   • Title: 13px Bold kuro, line ~17 (130%)
 *   • Date: 11px Regular haiiro, line 14
 *   • Card: bg shiro, rounded-1, overflow clip
 * -------------------------------------------------------------------------- */
function CompactCard({
  post,
  categoryLabel,
  href,
}: {
  post: BlogPostListItem;
  categoryLabel: string | null | undefined;
  href: string;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-1 bg-surface">
      <Link href={href} className="block">
        <div
          className="relative w-full overflow-hidden bg-[#1E1C18] aspect-[16/10]" /* paper-exact: EZ7-0 F42-0 (compact-card image bg #1E1C18, aspect 16/10) */
        >
          {post.featuredImage?.src ? (
            <Image
              src={post.featuredImage.src}
              alt={post.featuredImage.alt || post.title}
              fill
              sizes="(min-width: 1024px) 280px, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" /* paper-exact: hover micro-interaction shared with ProductCard */
            />
          ) : (
            <div className="flex h-full items-center justify-center text-label uppercase text-shiro/30">
              {post.title.slice(0, 2)}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 px-3 pt-2.5 pb-3.5" /* paper-exact: EZ7-0 F43-0 (text padding 10/12/14/12, gap 4) */>
        {categoryLabel && (
          <span
            className="inline-flex w-fit rounded-1 bg-surface-contrast font-bold uppercase text-ink-inverse"
            style={{
              fontSize: '9px',
              lineHeight: '12px',
              letterSpacing: '0.1em',
              padding: '2px 6px',
            }}
          >
            {categoryLabel}
          </span>
        )}

        <Link href={href} className="block">
          <h2
            className="font-bold text-ink line-clamp-2 hover:text-aka"
            style={{
              fontSize: '13px',
              lineHeight: '17px',
              letterSpacing: '-0.01em',
            }}
          >
            {post.title}
          </h2>
        </Link>

        <span
          className="text-ink-muted"
          style={{ fontSize: '11px', lineHeight: '14px' }}
        >
          <time dateTime={post.publishedAt}>
            {dateFmtShort.format(new Date(post.publishedAt))}
          </time>
          {' · '}
          {post.readingTimeMin} min
        </span>
      </div>
    </article>
  );
}

/** Liten avatar (24px / 20px) for forfatter-byline. Faller tilbake til
 *  initialer hvis avatar mangler — Paper-designet bruker sirkel med 2-bokstavs
 *  init på rød (aka) bg, hvit bold tekst. */
function Avatar({
  name,
  src,
  initials,
  size = 24,
  className,
}: {
  name: string;
  src: string | null;
  initials?: string;
  size?: 20 | 24;
  className?: string;
}) {
  const fallback =
    initials ??
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();

  const sizeClass = size === 20 ? 'size-5' : 'size-6';
  const fontSize = size === 20 ? '9px' : '10px';

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={[sizeClass, 'flex-shrink-0 rounded-full object-cover', className ?? ''].join(' ')}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={[
        sizeClass,
        'flex flex-shrink-0 items-center justify-center rounded-full bg-aka font-bold uppercase text-shiro',
        className ?? '',
      ].join(' ')}
      style={{ fontSize, lineHeight: '12px' }}
    >
      {fallback}
    </span>
  );
}
