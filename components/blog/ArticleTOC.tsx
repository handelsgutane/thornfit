/**
 * ArticleTOC — innholdsfortegnelse på artikkel-siden (Paper ERU-0 toc-strip).
 *
 * Boksen har en svart 2px topp-border, hvit bg, "INNHOLD"-eyebrow, og
 * 01/02/03/04-nummererte rader (Aka-rød) med klikkbare anchor-lenker som
 * scroller til respektiv h2 i innholdet.
 *
 * Auto-genereres fra h2-er i artikkel-content via `extractToc()` —
 * redaktøren slipper å vedlikeholde TOC manuelt.
 */

import Link from 'next/link';

import type { TocItem } from '@/lib/utils/toc';

export function ArticleTOC({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Innholdsfortegnelse"
      // Mobil (Paper EZ7-0 F1U-0): py 16, px 20, gap 10, top-2px-kuro, bg shiro.
      // Desktop (ERU-0): inline 347px-strip med p-sp-5 (32px).
      className="mt-sp-7 flex w-full flex-col gap-2.5 border-t-2 border-ink bg-surface px-5 py-sp-3 lg:inline-flex lg:w-[347px] lg:gap-0 lg:p-sp-5" /* paper-exact: ERU-0 (TOC desktop strip 347 width) */
    >
      <span
        className="block font-bold uppercase text-ink-muted lg:mb-sp-2"
        style={{ fontSize: '10px', lineHeight: '12px', letterSpacing: '0.12em' }} /* paper-exact: EZ7-0 F1V-0 (eyebrow 10/12) */
      >
        Innhold
      </span>
      <ol className="flex flex-col">
        {items.map((item, idx) => (
          <li
            key={item.id}
            className={[
              'flex items-center gap-2.5 py-1 lg:gap-sp-2 lg:py-1.5',
              idx > 0 ? 'lg:border-t lg:border-divider' : '',
            ].join(' ')}
          >
            <span
              aria-hidden
              className="w-7 shrink-0 font-bold text-aka lg:w-[22px]" /* paper-exact: EZ7-0 F1X-0 (mobile number col 28px, 16/20) */
              style={{ fontSize: '16px', lineHeight: '20px' }}
            >
              {String(idx + 1).padStart(2, '0')}
            </span>
            <Link
              href={`#${item.id}`}
              className="font-medium text-ink hover:text-aka"
              style={{ fontSize: '13px', lineHeight: '16px' }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
