'use client';

/**
 * MobileBlogFilters — den mobile-spesifikke filterstripen for /kniv-info.
 * Paper FYZ-0 FZU-0 (filter-area, 390×108):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [🔍 Søk i guider og artikler…]               │  rad 1 (16px top, 20px sides)
 *   ├──────────────────────────────────────────────┤
 *   │ Alle  Teknikk  Produktguider  …  →           │  rad 2 (12px top, scroll-x)
 *   └──────────────────────────────────────────────┘
 *
 * Den aktive pillen har 2px aka under-border. Søk navigerer alltid til
 * /kniv-info?sok=… (på tvers av kategorier) — pillene navigerer til
 * /kniv-info eller /kniv-info/kategori/<slug>.
 *
 * Kun synlig under lg (`lg:hidden`); på desktop brukes `KnivInfoFilterBar`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import type { BlogCategory } from '@/lib/supabase/blog';

export interface MobileBlogFiltersProps {
  categories: BlogCategory[];
  /** null = "Alle" aktiv. Slug ellers. */
  activeCategorySlug: string | null;
  searchQuery: string;
}

export function MobileBlogFilters({
  categories,
  activeCategorySlug,
  searchQuery,
}: MobileBlogFiltersProps) {
  const router = useRouter();
  const [value, setValue] = useState(searchQuery);
  const [, startTransition] = useTransition();

  // Debouncet URL-oppdatering når brukeren skriver. Søk er kategori-uavhengig —
  // alltid /kniv-info?sok=…
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = value.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set('sok', trimmed);
      const href = trimmed ? `/kniv-info?${params.toString()}` : '/kniv-info';
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <section
      aria-label="Filter"
      className="w-full border-b border-divider bg-surface lg:hidden"
    >
      {/* Rad 1 — søk (Paper FZV-0 / FZW-0).
          Input-rammen er F5F5F3 (canvas) bg + 1px sakai border, 14px padding-x. */}
      <div className="px-5 pt-sp-3 pb-0">
        <div className="flex items-center gap-2.5 rounded-1 border border-divider bg-canvas px-3.5 py-2.5">
          <span aria-hidden className="text-ink-muted">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Søk i guider og artikler…"
            aria-label="Søk i kniv-info"
            className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
            style={{ fontSize: '14px', lineHeight: '18px' }}
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              aria-label="Tøm søk"
              className="text-ink-muted hover:text-ink"
              style={{ fontSize: '14px' }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Rad 2 — kategori-piller (Paper G02-0). Horisontal scroll, ingen wrap.
          paddingInline 20, gap 0, marginTop 12. Hver pille er paddingY 10
          paddingX 14, 13px font, og aktiv-state har 2px aka under-border. */}
      <nav
        aria-label="Kniv-info-kategorier"
        className="no-scrollbar mt-3 flex overflow-x-auto px-5"
      >
        <Pill href="/kniv-info" label="Alle" active={activeCategorySlug === null} />
        {categories.map((cat) => (
          <Pill
            key={cat.id}
            href={`/kniv-info/kategori/${cat.slug}`}
            label={cat.name}
            active={cat.slug === activeCategorySlug}
          />
        ))}
      </nav>
    </section>
  );
}

function Pill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex-shrink-0 whitespace-nowrap border-b-2 transition-colors',
        active
          ? 'border-aka font-bold text-ink'
          : 'border-transparent font-medium text-ink-muted hover:text-ink',
      ].join(' ')}
      style={{
        fontSize: '13px',
        lineHeight: '16px',
        padding: '10px 14px',
      }}
    >
      {label}
    </Link>
  );
}
