/**
 * Paginering for søk og kategori-rester. URL-drevet: hver side er sin egen
 * URL → bookmark-bar, browser-back/forward fungerer naturlig.
 *
 * Window-strategi: viser alltid første og siste side, pluss inntil 2 sider
 * på hver side av aktiv. Fyller hull med "…". Mønsteret er kjent fra Google
 * og brukere finner intuitivt ut hvor de er.
 */

import Link from 'next/link';
import type { Route } from 'next';

interface SearchPaginationProps {
  /** 0-indeksert. */
  currentPage: number;
  totalPages: number;
  /** Returner Next-href for en gitt 0-indeksert side. */
  buildHref: (page: number) => Route | { pathname: string; query: Record<string, string> };
}

export function SearchPagination({
  currentPage,
  totalPages,
  buildHref,
}: SearchPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pagesToRender(currentPage, totalPages);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;

  return (
    <nav
      aria-label="Søkeresultat-paginering"
      className="flex flex-wrap items-center justify-center gap-sp-2"
    >
      {hasPrev ? (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={buildHref(currentPage - 1) as any}
          className="rounded-full border border-divider bg-surface px-sp-4 py-sp-2 text-body-sm font-medium text-ink transition-colors hover:bg-surface-hover"
        >
          ← Forrige
        </Link>
      ) : (
        <span className="rounded-full border border-divider px-sp-4 py-sp-2 text-body-sm text-ink-subtle">
          ← Forrige
        </span>
      )}

      {pages.map((p, idx) => {
        if (p === null) {
          return (
            <span
              key={`gap-${idx}`}
              className="px-sp-2 text-body-sm text-ink-subtle"
              aria-hidden
            >
              …
            </span>
          );
        }
        const isActive = p === currentPage;
        if (isActive) {
          return (
            <span
              key={p}
              aria-current="page"
              className="rounded-full bg-ink px-sp-4 py-sp-2 text-body-sm font-bold text-ink-inverse"
            >
              {p + 1}
            </span>
          );
        }
        return (
          <Link
            key={p}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            href={buildHref(p) as any}
            className="rounded-full border border-divider bg-surface px-sp-4 py-sp-2 text-body-sm font-medium text-ink transition-colors hover:bg-surface-hover"
          >
            {p + 1}
          </Link>
        );
      })}

      {hasNext ? (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={buildHref(currentPage + 1) as any}
          className="rounded-full border border-divider bg-surface px-sp-4 py-sp-2 text-body-sm font-medium text-ink transition-colors hover:bg-surface-hover"
        >
          Neste →
        </Link>
      ) : (
        <span className="rounded-full border border-divider px-sp-4 py-sp-2 text-body-sm text-ink-subtle">
          Neste →
        </span>
      )}
    </nav>
  );
}

/**
 * Genererer arrayen av sidetall som skal vises. `null` representerer "…"-gap.
 *
 * Eksempler (current = 5, total = 20):
 *   [0, null, 3, 4, 5, 6, 7, null, 19]
 *
 * Eksempel (current = 0, total = 5):
 *   [0, 1, 2, 3, 4]
 */
function pagesToRender(current: number, total: number): Array<number | null> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }

  const window: Array<number | null> = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total - 2, current + 2);

  window.push(0);
  if (start > 1) window.push(null);
  for (let i = start; i <= end; i++) window.push(i);
  if (end < total - 2) window.push(null);
  window.push(total - 1);

  return window;
}
