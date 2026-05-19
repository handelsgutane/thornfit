'use client';

/**
 * SearchOverlayMobile — full-screen søke-overlay for mobil.
 *
 * Paper-ref: `8Q9-0` ("Søk — Overlay (Mobile)"). Den tar hele viewport
 * (ingen header-offset som på desktop) og har egen topbar med tilbake-pil
 * + pill-shaped input-felt.
 *
 * Layout:
 *   - Topbar (56px): tilbake-pil [32×32] + pill-input [h-9, bg-surface-muted]
 *     med søk-ikon, tekst, clear-knapp
 *   - Kategori-seksjon: label + aktiv-chip med dropdown-ikon
 *   - Resultat-liste: counter + rader + "Se alle"
 *
 * Scrolling: hele overlayet scroller som én enhet. `overflow-y-auto` på
 * root så body-scroll-lock i Provider holder bakgrunnen stille.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { FacetBucket, ProductHit } from '@/lib/search/types';

import type { SearchApi, SearchState } from './SearchOverlay';

/**
 * Format NOK med desimaler kun når prisen faktisk har dem. 299 → "kr 299",
 * 299,50 → "kr 299,50". Ingen null-padding på heltall — ser penere ut i
 * tette produktrader enn "kr 299,00".
 */
function formatNok(n: number): string {
  const hasDecimals = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(n);
}

type Props = SearchApi & { state: SearchState };

export function SearchOverlayMobile({
  state,
  setQuery,
  clearQuery,
  selectCategory,
  applyPopularQuery,
  filteredHits,
  popularQueries,
  categoryShortcuts,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasQuery = state.debouncedQuery.length > 0;
  const facetBuckets: FacetBucket[] = state.response?.facets['category_paths'] ?? [];
  const activeBucket = facetBuckets.find((b) => b.value === state.category);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Søk"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface"
    >
      {/* ---- Topbar: back + pill-input — Paper 8QB-0 (h 56, padding 10/16, gap 12) */}
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-divider bg-surface px-sp-3" /* paper-exact: 8QB-0 (gap 12) */>
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk søk"
          className="flex h-8 w-8 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>

        <div className="flex h-9 flex-1 items-center gap-sp-2 rounded-sm bg-canvas px-3" /* paper-exact: 8QF-0 (canvas bg, padding-x 12) */>
          <MobileSearchIcon />
          <input
            ref={inputRef}
            type="search"
            value={state.query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk etter produkter …"
            aria-label="Søk"
            // Skjuler browserens native search-clear-X (iOS Safari + Chrome)
            // slik at vår custom clear-knapp til høyre står alene.
            className="flex-1 bg-transparent text-body-md text-ink placeholder:text-ink-muted focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {state.query && (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Tøm søk"
              // 18×18 rund knapp — `h-[18px] w-[18px]` er paper-eksakt mindre
              // enn vår standard h-5 (20px). Bruker haiiro (muted) som
              // brand-fixed bg fordi den skal være synlig mot både light/dark.
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-haiiro text-shiro" /* paper-exact: 8QZ-0 (clear-knapp 18×18 haiiro/shiro brand-fixed) */
            >
              <SmallX />
            </button>
          )}
        </div>
      </div>

      {/* ---- Kategori-chip (når søk er aktivt) — Paper 8QO-0 (pt 14 pb 10) */}
      {hasQuery && (
        <div className="shrink-0 border-b border-canvas px-sp-3 pt-3.5 pb-2.5" /* paper-exact: 8QO-0 (pt 14, pb 10, divider canvas) */>
          <h3 className="text-label-sm font-bold uppercase text-ink-muted">Kategori</h3>
          <div className="mt-sp-2 flex flex-wrap gap-sp-2">
            {activeBucket ? (
              <button
                type="button"
                onClick={() => selectCategory(null)}
                className="flex items-center gap-sp-2 rounded-sm border border-divider px-sp-3 py-[7px] text-body-xs font-medium text-ink" /* paper-exact: 8RA-0 (chip py 1.75 = 7px) */
              >
                <span>{labelForCategory(activeBucket.value, activeBucket.label)}</span>
                <ChevronRight />
              </button>
            ) : facetBuckets.length > 0 ? (
              facetBuckets.slice(0, 3).map((bucket) => (
                <button
                  key={bucket.value}
                  type="button"
                  onClick={() => selectCategory(bucket.value)}
                  className="flex items-center gap-sp-2 rounded-sm border border-divider px-sp-3 py-[7px] text-body-xs text-ink" /* paper-exact: 8RA-0 */
                >
                  <span>{labelForCategory(bucket.value, bucket.label)}</span>
                  <span className="text-ink-muted">{bucket.count}</span>
                </button>
              ))
            ) : (
              <span className="py-[7px] text-body-xs text-ink-muted" /* paper-exact: 8RA-0 */>
                Ingen kategorier
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Innhold --------------------------------------------------- */}
      <div className="flex flex-1 flex-col">
        {!hasQuery ? (
          <MobileEmptyState
            categoryShortcuts={categoryShortcuts}
            popularQueries={popularQueries}
            applyPopularQuery={applyPopularQuery}
            onNavigate={onClose}
          />
        ) : state.isLoading && filteredHits.length === 0 ? (
          <LoadingState />
        ) : filteredHits.length === 0 ? (
          <NoResultsState query={state.debouncedQuery} />
        ) : (
          <ResultsList
            hits={filteredHits}
            nbHits={state.response?.nbHits ?? filteredHits.length}
            query={state.debouncedQuery}
            category={state.category}
            onNavigate={onClose}
          />
        )}
      </div>
    </div>
  );
}

// ========== Sub-components =================================================

function ResultsList({
  hits,
  nbHits,
  query,
  category,
  onNavigate,
}: {
  hits: ProductHit[];
  nbHits: number;
  query: string;
  category: string | null;
  onNavigate: () => void;
}) {
  return (
    <>
      <div className="px-sp-3 pt-3 pb-sp-2" /* paper-exact: 8QW-0 (pt 12, pb 8) */>
        <p className="text-ink-muted" style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: 8QX-0 (12/16) */>
          {hits.length === 1 ? '1 produkt' : `${hits.length} produkter`}
        </p>
      </div>
      <ul className="flex flex-col">
        {hits.map((hit) => (
          <HitRow key={hit.objectID} hit={hit} onNavigate={onNavigate} />
        ))}
      </ul>
      {nbHits > hits.length && (
        <Link
          href={{ pathname: '/sok', query: { q: query, ...(category ? { cat: category } : {}) } }}
          onClick={onNavigate}
          className="flex items-center justify-between border-b border-surface-muted px-sp-3 py-sp-3 text-body-sm font-bold text-ink"
        >
          <span>Se alle {nbHits} resultater</span>
          <ChevronRight />
        </Link>
      )}
    </>
  );
}

function HitRow({ hit, onNavigate }: { hit: ProductHit; onNavigate: () => void }) {
  const href = `/${hit.slug}`;
  const hasSale =
    hit.salePrice !== null &&
    hit.regularPrice !== null &&
    hit.salePrice < hit.regularPrice;

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className="flex items-center gap-3 border-b border-canvas px-sp-3 py-2.5 hover:bg-canvas" /* paper-exact: 8QY-0 (gap 12, py 10, divider canvas) */
      >
        <div className="h-13 w-13 shrink-0 overflow-hidden rounded-sm bg-canvas" /* paper-exact: 8QZ-0 (52×52 thumb on canvas) */>
          {hit.image ? (
            <Image
              src={hit.image}
              alt={hit.name}
              width={52}
              height={52}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[2px]" /* paper-exact: 8R0-0 (col gap 2px) */>
          {hit.brand && (
            <span className="text-label-sm font-bold uppercase text-ink-muted">
              {hit.brand}
            </span>
          )}
          <h3 className="truncate font-bold text-ink tracking-[-0.01em]" style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: 8R2-0 (14/18 bold -0.01em) */>{hit.name}</h3>
          {hit.spec && (
            <span className="text-ink-muted" style={{ fontSize: '11px', lineHeight: '14px' }} /* paper-exact: 8R3-0 (11/14 regular haiiro) */>{hit.spec}</span>
          )}
        </div>

        <div className="shrink-0 text-right">
          {hasSale ? (
            <>
              <div className="text-body-md font-bold text-aka">
                {formatNok(hit.salePrice as number)}
              </div>
              <div className="text-label text-ink-muted line-through">
                {formatNok(hit.regularPrice as number)}
              </div>
            </>
          ) : hit.price !== null ? (
            <div className="text-body-md font-bold text-ink">
              {formatNok(hit.price)}
            </div>
          ) : (
            <div className="text-body-md text-ink-muted">—</div>
          )}
        </div>
      </Link>
    </li>
  );
}

function MobileEmptyState({
  categoryShortcuts,
  popularQueries,
  applyPopularQuery,
  onNavigate,
}: {
  categoryShortcuts: SearchApi['categoryShortcuts'];
  popularQueries: SearchApi['popularQueries'];
  applyPopularQuery: (q: string) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-sp-5 px-sp-3 py-sp-4">
      <section className="flex flex-col gap-sp-2">
        <h3 className="text-label-sm font-bold uppercase text-ink-muted">Populære søk</h3>
        <div className="flex flex-wrap gap-sp-2">
          {popularQueries.map((pq) => (
            <button
              key={pq.query}
              type="button"
              onClick={() => applyPopularQuery(pq.query)}
              className="rounded-sm border border-divider px-sp-3 py-[7px] text-body-xs text-ink" /* paper-exact: 8XB-0 (chip py 7px) */
            >
              {pq.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-sp-2">
        <h3 className="text-label-sm font-bold uppercase text-ink-muted">Kategorier</h3>
        <ul className="flex flex-col">
          {categoryShortcuts.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                onClick={onNavigate}
                className="flex items-center justify-between border-b border-surface-muted py-sp-3"
              >
                <span className="text-body-sm font-medium text-ink">{s.label}</span>
                <ChevronRight />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-sp-2 px-sp-3 py-sp-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-sp-3 py-sp-2" aria-hidden>
          <div className="h-13 w-13 shrink-0 rounded-sm bg-surface-muted" />
          <div className="flex flex-1 flex-col gap-sp-1">
            <div className="h-3 w-20 rounded-sm bg-surface-muted" />
            <div className="h-4 w-48 rounded-sm bg-surface-muted" />
            <div className="h-3 w-24 rounded-sm bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col gap-sp-2 px-sp-3 py-sp-4">
      <p className="text-body-md font-bold text-ink">
        Fant ingenting for &ldquo;{query}&rdquo; enda
      </p>
      <p className="text-body-sm text-ink-muted">
        Prøv et annet ord, skriv litt mer, eller utforsk kategoriene over.
      </p>
    </div>
  );
}

function labelForCategory(value: string, label?: string): string {
  if (label) return label;
  const segments = value.split('/');
  const last = segments[segments.length - 1] ?? value;
  return last
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

// ----- Ikoner -------------------------------------------------------------

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polyline
        points="13,4 7,10 13,16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MobileSearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink-muted"
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <line
        x1="10.5"
        y1="10.5"
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SmallX() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <line
        x1="1.5"
        y1="1.5"
        x2="6.5"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="6.5"
        y1="1.5"
        x2="1.5"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink"
    >
      <polyline
        points="5,3 11,8 5,13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
