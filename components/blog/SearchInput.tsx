'use client';

/**
 * BlogSearchInput — søkefelt for /kniv-info filterbaren (Paper EEK-0).
 *
 * Layout:
 *   [🔍] [   tekst-input                                          ] [×]
 *   └── h 44, border 1.5px sakai, radius 2, paddingInline 14, gap 10 ──┘
 *
 * Magnifier 16×16 venstre, placeholder 14/18 haiiro. Når brukeren skriver
 * debounceeres URL-oppdateringen 300ms — søk innenfor aktiv kategori (eller
 * /kniv-info hvis ingen kategori er aktiv). Clear-button (×) når input har
 * verdi.
 *
 * Kategori-tabs styres av tab-raden under (FilterBar Rad 2). Søke-input
 * holder bare seg til søketekst.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

export interface BlogSearchInputProps {
  initial: string;
  /** Aktiv kategori-slug for kontekst — søk holder seg innenfor kategori. */
  activeCategorySlug?: string | null;
  className?: string;
}

export function BlogSearchInput({
  initial,
  activeCategorySlug = null,
  className,
}: BlogSearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function buildHref(query: string): string {
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('sok', trimmed);
    const base = activeCategorySlug
      ? `/kniv-info/kategori/${activeCategorySlug}`
      : '/kniv-info';
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  // Debounced URL-oppdatering når brukeren skriver.
  useEffect(() => {
    const t = setTimeout(() => {
      const href = buildHref(value);
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleClear() {
    setValue('');
  }

  return (
    <div
      className={[
        'relative flex h-11 items-center gap-2.5 rounded-1 border-[1.5px] border-divider bg-surface px-3.5 focus-within:border-ink', /* paper-exact: EEK-0 (border 1.5px sakai) */
        className ?? '',
      ].join(' ')} /* paper-exact: EEK-0 (h 44, radius 2, padding-inline 14, gap 10) */
    >
      <span aria-hidden className="flex-shrink-0 text-ink-muted">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11 11L14 14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Søk i guider og artikler — prøv «aogami», «santoku»…"
        className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
        style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: EEO-0 (14/18 haiiro) */
        aria-label="Søk i kniv-info"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Tøm søk"
          className="flex-shrink-0 text-body-xs text-ink-muted hover:text-ink"
        >
          ×
        </button>
      )}
    </div>
  );
}
