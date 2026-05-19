/**
 * SearchHeaderDefault — svart editorial-band på toppen av /sok-siden.
 *
 * Speiler `CategoryHeaderDefault` (Paper 380-0) slik at søkesiden visuelt
 * lever i samme system som kategori-sidene. Forskjellen er kun innholdet:
 *
 *   - Brødsmule: "Søk" (statisk)
 *   - Tittel: "Søkeresultat" (alltid)
 *   - Subtitle: "for «{query}»" når query finnes
 *   - Filter-info: aktiv kategori-filter med "fjern"-link når satt
 *   - Søkefelt-knapp: åpner mega-meny-søket (`SearchOverlayTrigger`)
 *   - Høyre: antall treff
 *
 * Bruker brand-fikserte tokens (bg-kuro/text-shiro/text-haiiro), samme
 * mønster som CategoryHeaderDefault. ADR-0008: editorial-bånd identifiserer
 * brandet og flipper IKKE med light/dark mode.
 */

import Link from 'next/link';

import { SearchOverlayTrigger } from './SearchOverlayProvider';

export interface SearchHeaderDefaultProps {
  /** Søkestreng. Tom = "skriv inn søk"-tilstand. */
  query: string;
  /** Antall treff (totalt fra Algolia). */
  nbHits: number;
  /** Aktiv kategori-filter slug. */
  category: string | null;
  /** Vises hvis kategori er aktiv — peker tilbake til søk uten kategori. */
  clearCategoryHref?: { pathname: string; query: Record<string, string> };
}

export function SearchHeaderDefault({
  query,
  nbHits,
  category,
  clearCategoryHref,
}: SearchHeaderDefaultProps) {
  const hasQuery = query.length > 0;

  const countLabel = !hasQuery
    ? null
    : nbHits === 0
      ? 'Ingen treff'
      : nbHits === 1
        ? '1 treff'
        : `${nbHits.toLocaleString('nb-NO')} treff`;

  return (
    <section
      aria-label="Søk — header"
      className={[
        'w-full bg-kuro text-shiro',
        'flex flex-col gap-sp-4 sm:flex-row sm:items-end sm:justify-between sm:gap-sp-6',
        'px-sp-4 sm:px-sp-7',
        'pt-[40px] pb-[36px]' /* paper-exact: 380-0 padding y 40/36 */,
      ].join(' ')}
    >
      <div className="flex flex-col gap-sp-2 max-w-3xl">
        {/* Brødsmule-stil — statisk siden /sok ikke har parent-rute. */}
        <p className="text-body-xs text-haiiro">Søk</p>

        {/* H1 er alltid "Søkeresultat" — selve søkestrengen er sekundær
            og rendrer som subtitle under. Det matcher e-com-konvensjon
            (Amazon, Zalando) og holder h1 stabil for SEO/skjermleser. */}
        <h1 className="text-h1 font-bold text-shiro">Søkeresultat</h1>

        {hasQuery && (
          <p className="text-body font-normal text-shiro max-w-lg md:max-w-(--width-hero-text)">
            for{' '}
            <span className="font-bold">«{query}»</span>
            {category && clearCategoryHref ? (
              <>
                {' '}i kategori{' '}
                <span className="font-bold">{formatCategoryLabel(category)}</span>
                {' · '}
                <Link
                  href={clearCategoryHref}
                  className="underline decoration-haiiro underline-offset-2 transition-colors hover:text-aka"
                >
                  fjern filter
                </Link>
              </>
            ) : null}
          </p>
        )}

        {!hasQuery && (
          <p className="text-body font-normal text-shiro max-w-lg md:max-w-(--width-hero-text)">
            Bruk søkefeltet under for å finne produkter, merker eller knivtyper.
          </p>
        )}

        {/* Søkefelt-knapp — åpner mega-meny-søket. Stilt som et inputfelt
            (ikke en CTA), så det leser som "klikk for å søke på nytt".
            `SearchOverlayTrigger` er en knapp med `type="button"`; vi
            bruker den som wrapper og styler den som et input.
            Border + tekst er shiro (hvit) for å gi nok kontrast mot
            kuro-bakgrunnen — tidligere haiiro/30 var praktisk talt
            usynlig (Alexander 2026-05). */}
        <SearchOverlayTrigger
          ariaLabel="Åpne søk"
          className="mt-sp-3 flex w-full max-w-md items-center gap-sp-3 rounded-sm border border-shiro bg-transparent px-sp-4 py-sp-3 text-left text-body-sm text-shiro transition-colors hover:bg-shiro hover:text-kuro"
        >
          <SearchIcon />
          <span className="flex-1 truncate">
            {hasQuery ? query : 'Søk etter produkter, merker eller knivtyper …'}
          </span>
          <span className="hidden text-body-xs sm:inline">
            Trykk for å søke
          </span>
        </SearchOverlayTrigger>
      </div>

      {countLabel && (
        <p className="text-body-xs text-haiiro shrink-0">{countLabel}</p>
      )}
    </section>
  );
}

// ---------- Helpers --------------------------------------------------------

/**
 * Slug → human-readable label. "bryner-og-knivsliping" → "Bryner og
 * knivsliping". Best-effort uten å hente fra Supabase — hvis vi får
 * `category_names`-mapping i Algolia-indeksen, kan vi bytte til den.
 */
function formatCategoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((word, idx) =>
      idx === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(' ');
}

/** Forstørrelsesglass — speiler ikonet i SearchOverlay's input-bar. */
function SearchIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 11L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
