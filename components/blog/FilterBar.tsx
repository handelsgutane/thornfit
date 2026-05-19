/**
 * KnivInfoFilterBar — full-bleed hvit stripe (Paper EEI-0, 1440×130).
 *
 * To rader:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  [🔍 Søk i guider og artikler …             ]               │  rad 1 (h 77, pad 16/64)
 *   ├─────────────────────────────────────────────────────────────┤  ← 1px sakai divider
 *   │  Alle  Teknikk  Produktguider  …      │ Sorter: Nyeste ▼   │  rad 2 (h 52, pad 0/64)
 *   └────────────────────────────────────────┴───────────────────┘
 *      ↑ tabs paddingInline 16, active border-b 2px aka
 *
 * Row 1 (EEJ-0): pad 16/64, border-b sakai. Søkefelt EEK-0 max-w 560, h 44,
 *   border 1.5px sakai, radius 2, paddingInline 14, gap 10. Magnifier 16×16.
 *   Placeholder 14/18 haiiro.
 *
 * Row 2 (EEP-0): pad 0/64, h 52, justify-between.
 *   - Tabs (EEQ-0): hver tab paddingInline 16, full radhøyde. Aktiv tab har
 *     border-b 2px aka. Tekst 14/18 — Bold kuro når aktiv, Regular haiiro
 *     ellers.
 *   - Sort (EF3-0): border-l 1px sakai, pl 20, gap 8. "Sorter:" 13/16 haiiro
 *     + "Nyeste først" 13/16 Bold kuro + chevron 12×12.
 *
 * Plasser komponenten UTENFOR parent's max-w-wrapper så bg + dividerne går
 * helt til viewport-kant.
 */

import Link from 'next/link';

import { BlogSearchInput } from './SearchInput';
import { SortDropdown } from './SortDropdown';
import type { BlogCategory, PostSort } from '@/lib/supabase/blog';

export interface KnivInfoFilterBarProps {
  categories: BlogCategory[];
  /** null = "Alle" aktiv. Slug ellers. */
  activeCategorySlug: string | null;
  searchQuery: string;
  sort: PostSort;
}

export function KnivInfoFilterBar({
  categories,
  activeCategorySlug,
  searchQuery,
  sort,
}: KnivInfoFilterBarProps) {
  return (
    <section
      aria-label="Filter"
      className="w-full bg-surface" /* paper-exact: EEI-0 (1440×130, white bg) */
    >
      {/* Rad 1 — søkefelt sentrert i 64px-padding (Paper EEJ-0).
          Border-bottom sakai går full-bleed. */}
      <div className="border-b border-divider" /* paper-exact: EEJ-0 (border-bottom #E0E0DC) */>
        <div className="mx-auto max-w-content px-sp-3 py-sp-4 md:px-sp-7 lg:px-16" /* paper-exact: EEJ-0 (paddingBlock 16, paddingInline 64) */>
          <BlogSearchInput
            initial={searchQuery}
            activeCategorySlug={activeCategorySlug}
            className="max-w-[560px]" /* paper-exact: EEK-0 (max-width 560px) */
          />
        </div>
      </div>

      {/* Rad 2 — tabs venstre, sort høyre (Paper EEP-0, h 52). */}
      <div className="w-full">
        <div className="mx-auto max-w-content px-sp-3 md:px-sp-7 lg:px-16">
          <div className="flex h-13 items-stretch justify-between" /* paper-exact: EEP-0 (height 52, space-between) */>
            <nav
              className="flex items-stretch overflow-x-auto"
              aria-label="Kniv-info-kategorier"
            >
              <CategoryTab
                href="/kniv-info"
                label="Alle"
                isActive={activeCategorySlug === null}
              />
              {categories.map((cat) => (
                <CategoryTab
                  key={cat.id}
                  href={`/kniv-info/kategori/${cat.slug}`}
                  label={cat.name}
                  isActive={cat.slug === activeCategorySlug}
                />
              ))}
            </nav>

            {/* Sort-dropdown — venstre-border fyller radhøyden takket være
                items-stretch på parent + h-full inni SortDropdown. */}
            <SortDropdown current={sort} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * En kategori-tab i filter-baren. Active = bold kuro + 2px aka border-bottom
 * som strekker hele tab-høyden. Inactive = regular haiiro, hover → kuro.
 *
 * Paper EER-0 (active): paddingInline 16, height 100%, border-bottom 2px aka.
 * Paper EES-0 (text): 14/18 Bold (active) eller Regular haiiro (inactive).
 */
function CategoryTab({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'flex items-center whitespace-nowrap border-b-2 px-sp-3 transition-colors',
        isActive
          ? 'border-aka font-bold text-ink'
          : 'border-transparent text-ink-muted hover:text-ink',
      ].join(' ')} /* paper-exact: EER-0 (paddingInline 16, border-b 2px aka when active) */
      style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: EES-0 (14/18) */
    >
      {label}
    </Link>
  );
}
