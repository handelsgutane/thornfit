/**
 * Header på /sok-siden. Tre tilstander:
 *   1. Tom query  → "Søk" + prompt-tekst.
 *   2. Med query  → "Søkeresultater for «query»" + count-linje.
 *   3. Med cat    → ekstra "i kategori X"-tilegg, og "× fjern"-link.
 *
 * Holdes som server component (ingen interaktivitet) — alt UI-state ligger
 * i URL-en.
 */

import Link from 'next/link';

interface SearchPageHeaderProps {
  query: string;
  nbHits: number;
  category: string | null;
}

export function SearchPageHeader({ query, nbHits, category }: SearchPageHeaderProps) {
  if (!query) {
    return (
      <header className="mb-sp-7">
        <h1 className="text-h2 font-bold text-ink md:text-h1">Søk</h1>
        <p className="mt-sp-2 text-body text-ink-muted">
          Skriv inn et søkeord i søkefeltet for å starte.
        </p>
      </header>
    );
  }

  const countLabel =
    nbHits === 0
      ? 'Ingen treff'
      : nbHits === 1
        ? '1 treff'
        : `${nbHits.toLocaleString('nb-NO')} treff`;

  return (
    <header className="mb-sp-6">
      <h1 className="text-h2 font-bold text-ink md:text-h1">
        Søkeresultater for{' '}
        <span className="text-aka">«{query}»</span>
      </h1>
      <div className="mt-sp-2 flex flex-wrap items-center gap-sp-3">
        <p className="text-body text-ink-muted">{countLabel}</p>
        {category && (
          <span className="inline-flex items-center gap-sp-2 rounded-full border border-divider bg-surface-muted px-sp-3 py-sp-1 text-body-xs font-medium text-ink">
            <span>Filter: {category}</span>
            <Link
              href={{ pathname: '/sok', query: { q: query } }}
              aria-label="Fjern kategori-filter"
              className="text-ink-muted transition-colors hover:text-aka"
            >
              ×
            </Link>
          </span>
        )}
      </div>
    </header>
  );
}
