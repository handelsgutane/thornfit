'use client';

/**
 * SearchOverlayDesktop — desktop-overlay, matcher Paper-artboard `8TL-0`
 * ("Søk — Overlay Desktop (Alt. 1)").
 *
 * Overlay-et dekker viewport under `<header>`-et (72px + 28px utility bar når
 * messages finnes). Header-en blir stående synlig — brukerens plass i nav-en
 * er bevart mens de søker. Vi måler header-en's faktiske høyde i en `useEffect`
 * slik at vi håndterer tilfellet der utility-bar-en er skjult (UtilityBar
 * returnerer null ved tom messages-array → høyden kollapser).
 *
 * Layout-spec fra Paper 8TL-0:
 *   - search-input-bar (8V6-0): 69px, border-b divider
 *     · 20×20 søk-ikon, padding 20px vertical / 64px horizontal, gap 16px
 *     · input-tekst text-body-md (15px)
 *     · lukk-knapp 28×28 rundt, bg-surface-muted
 *   - dropdown-columns (8VF-0): 563px, split i 1060 results / 380 sidebar
 *     · results-col: pt-28 pr-48 pb-36 pl-64, border-r divider
 *     · sidebar-col: pt-28 pr-64 pb-36 pl-40, gap 32px
 *   - Under dropdown: "page-dim" — semi-transparent kuro som dimmer siden
 *     bak. Klikk på dim-området lukker overlayet.
 *
 * Farger er semantic-tokens (ADR-0008) — overlayet virker identisk i light
 * og dark.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { IconButton, IconButtonCircle } from '@/components/ui/IconButton';
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

export function SearchOverlayDesktop({
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
  // Mål header-bunn en gang ved open → skriv direkte til inline `top` på
  // root-noden. Ref+DOM-mutasjon framfor `useState` her fordi verdien brukes
  // kun til posisjonering; ingen annen render er avhengig av den. Sparer
  // ett render-pass og unngår React 19's `set-state-in-effect`-regel.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const headerEl = document.querySelector('header');
    const rootEl = rootRef.current;
    if (!headerEl || !rootEl) return;
    const rect = headerEl.getBoundingClientRect();
    rootEl.style.top = `${rect.bottom}px`;
  }, []);

  // Fokus input når overlayet åpnes — tastatur-first-flow.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasQuery = state.debouncedQuery.length > 0;
  const facetBuckets: FacetBucket[] = state.response?.facets['category_paths'] ?? [];

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Søk"
      // `fixed` under header. `top` settes inline av effect-en over (målt
      // runtime) — kan ikke uttrykkes som en ren Tailwind-klasse. Default-
      // verdien i `style` brukes første paint før effect-en har kjørt.
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col"
      style={{ top: 'calc(var(--height-utility-bar) + var(--height-header))' }}
    >
      {/* ---- Søke-input bar --------------------------------------------
          Venstre-ikonet er ikke lenger dekorativt — det er primær-lukkingen
          av overlayet. Brukeren åpner overlayet via det samme ikonet i
          headeren, og når overlayet er åpent rommer plassen til ikonet en
          X som speiler "åpne"-handlingen. Det gir konsistent mental modell
          (søke-trigger = lukk-knapp) og fjerner behovet for to separate
          X-er. Den andre lukkingen sitter nede i sidebar (text-button). */}
      <div className="shrink-0 bg-surface border-b border-divider">
        <div className="mx-auto flex h-[69px] max-w-(--width-content) items-center gap-sp-3 px-sp-7" /* paper-exact: 8V6-0 (input-bar 69px) */>
          <IconButton variant="ghost" size="md" onClick={onClose} aria-label="Lukk søk">
            <CloseIcon />
          </IconButton>
          <input
            ref={inputRef}
            type="search"
            value={state.query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && state.debouncedQuery) {
                // TODO: når `/sok`-siden er bygd, naviger dit. Inntil da
                // holder vi bare inputen åpen — resultatene er allerede
                // synlige under.
              }
            }}
            placeholder="Søk etter produkter, merker og knivtyper …"
            aria-label="Søk"
            // `[&::-webkit-search-cancel-button]:appearance-none` skjuler
            // browserens native clear-X som ellers dukker opp i WebKit/Chrome
            // på `type="search"`. Vi har vår egen styled clear-knapp rett
            // til høyre, så uten dette får vi to X-er ved siden av hverandre.
            className="flex-1 bg-transparent tracking-[-0.01em] text-ink placeholder:text-ink-muted focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none" /* paper-exact: 8VB-0 (18/22, -0.01em) */
            style={{ fontSize: '18px', lineHeight: '22px' }}
          />
          {state.query && (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Tøm søk"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-ink hover:bg-surface-hover"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      {/* ---- Dropdown-panel (results + sidebar) -----------------------
          `min-h-0 max-h-full` + `flex flex-col` slik at panelet vokser
          naturlig opp til høyden som er igjen under input-baren, men
          aldri overskrider viewporten. Når 8 rader ikke får plass,
          skrolles hits-listen internt mens navigasjons-lenka og Lukk-
          knappen limes nederst i sidebar. `overflow-hidden` på wrapperen
          hindrer klippede skygger fra å lekke ut. */}
      <div className="flex min-h-0 max-h-full flex-col overflow-hidden bg-surface">
        <div className="mx-auto flex w-full min-h-0 flex-1 max-w-(--width-content)">
          {/* ===== Results column =====
              `min-h-0` på flex-col tillater barna (ResultsList) å ta
              ansvar for egen scroll. Se alle-navigasjonen limes i bunnen
              av kolonnen rett under scroll-området, symmetrisk med
              Lukk-knappen i sidebar-bunnen. */}
          <div className="flex flex-1 flex-col min-h-0 border-r border-divider" /* paper-exact: 8VG-0 */>
            {!hasQuery ? (
              <div className="pl-sp-7 pr-sp-6 pt-7 pb-9">
                <EmptyState categoryShortcuts={categoryShortcuts} />
              </div>
            ) : state.isLoading && filteredHits.length === 0 ? (
              <div className="pl-sp-7 pr-sp-6 pt-7 pb-9">
                <LoadingState />
              </div>
            ) : filteredHits.length === 0 ? (
              <div className="pl-sp-7 pr-sp-6 pt-7 pb-9">
                <NoResultsState query={state.debouncedQuery} />
              </div>
            ) : (
              <ResultsList
                hits={filteredHits}
                category={state.category}
                facetBuckets={facetBuckets}
                selectCategory={selectCategory}
                nbHits={state.response?.nbHits ?? filteredHits.length}
                query={state.debouncedQuery}
                onNavigate={onClose}
              />
            )}
          </div>

          {/* ===== Sidebar column =====
              To-delt: scrollbart topp-område (kategorier + populære søk) og
              pinnet bunn-område med høyre-stilt Lukk-knapp. `min-h-0`
              trengs på flex-parenten for at scroll-barnet faktisk skal
              aktivere overflow i stedet for å bare vokse.
              Lukk-knappen duplikerer handlingen som venstre-ikonet i
              input-baren gjør (søke-ikonet blir et kryss). Det er bevisst
              — en rask exit for brukere som scroller nede i sidebar og
              ikke vil stepe helt opp for å nå X-en igjen. */}
          <aside className="w-95 shrink-0 flex flex-col min-h-0" /* paper-exact: 8WR-0 */>
            <div className="flex flex-1 flex-col gap-sp-5 min-h-0 overflow-y-auto pl-10 pr-sp-7 pt-7 pb-9" /* paper-exact: 8WR-0 (pl 40, pr 64, pt 28, pb 36) */>
              <SidebarCategories
                facetBuckets={facetBuckets}
                activeCategory={state.category}
                selectCategory={selectCategory}
                fallback={categoryShortcuts}
                hasQuery={hasQuery}
                onNavigate={onClose}
              />
              <SidebarPopular
                popularQueries={popularQueries}
                applyPopularQuery={applyPopularQuery}
              />
            </div>
            {/* Lukk-bunnen — kompakt rød knapp limt mot høyre kant av grid-et.
                `pr-sp-3` (12px) holder knappen tett inntil overlayens høyre
                kant uten å berøre den; `py-sp-3` matcher samme baseline-
                høyde som "Se alle"-bunnen i results-kolonnen. */}
            <div className="shrink-0 flex justify-end border-t border-divider bg-surface pl-sp-5 pr-sp-3 py-sp-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-[6px] rounded-sm border border-aka bg-surface px-sp-2 py-1 text-body-xs font-bold uppercase text-aka transition-colors hover:bg-aka hover:text-ink-inverse" /* paper-exact: 8X7-0 (sidebar lukk-knapp gap 6) */
              >
                <CloseIcon />
                <span>Lukk</span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ---- Dimmed area under panelet (klikk for å lukke) ------------ */}
      <button
        type="button"
        aria-label="Lukk søk"
        onClick={onClose}
        // Brand-fixed kuro for dimmingen — dimming skal se lik ut i light
        // og dark (alltid mørk transparent).
        className="flex-1 cursor-default bg-kuro/40 backdrop-blur-[1px]" /* paper-exact: 8V4-0 (page-dim) */
      />
    </div>
  );
}

// ========== Sub-components ================================================

function SidebarCategories({
  facetBuckets,
  activeCategory,
  selectCategory,
  fallback,
  hasQuery,
  onNavigate,
}: {
  facetBuckets: FacetBucket[];
  activeCategory: string | null;
  selectCategory: (value: string | null) => void;
  fallback: SearchApi['categoryShortcuts'];
  hasQuery: boolean;
  onNavigate: () => void;
}) {
  // Når brukeren har søkt → vis dynamiske fasetter fra responsen.
  // Ellers → vis de redaksjonelle kategori-snarveiene som lenker.
  if (hasQuery) {
    return (
      <div className="flex flex-col gap-sp-2">
        <Label>Kategorier</Label>
        {/* Match MerkerCol-mønsteret fra mega-menyen: h-[34px] rader, rounded-1,
            ingen gap mellom rader (h-34 fyller naturlig). Tekst er allerede
            text-body-sm. */}
        <ul className="flex flex-col">
          {facetBuckets.length === 0 ? (
            <li className="flex h-[34px] items-center px-sp-3 text-body-sm text-ink-muted" /* paper-exact: 8WV-0 (kategori-rad h 34) */>
              Ingen kategorier
            </li>
          ) : (
            facetBuckets.slice(0, 8).map((bucket) => {
              const isActive = activeCategory === bucket.value;
              return (
                <li key={bucket.value}>
                  <button
                    type="button"
                    onClick={() => selectCategory(bucket.value)}
                    className={[
                      'flex h-[34px] w-full items-center justify-between rounded-1 px-sp-3 text-left transition-colors', /* paper-exact: 8WV-0 (kategori-rad h 34) */
                      isActive ? 'bg-surface-muted font-medium' : 'hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    <span className="text-body-sm text-ink">
                      {labelForCategory(bucket.value, bucket.label)}
                    </span>
                    <span className="text-body-xs text-ink-muted">{bucket.count}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-sp-2">
      <Label>Kategorier</Label>
      <ul className="flex flex-col">
        {fallback.map((short) => (
          <li key={short.href}>
            <Link
              href={short.href}
              onClick={onNavigate}
              className="flex h-[34px] items-center justify-between rounded-1 px-sp-3 hover:bg-surface-muted" /* paper-exact: 8WV-0 (kategori-rad h 34) */
            >
              <span className="text-body-sm text-ink">{short.label}</span>
              {short.count !== undefined && (
                <span className="text-body-xs text-ink-muted">{short.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarPopular({
  popularQueries,
  applyPopularQuery,
}: {
  popularQueries: SearchApi['popularQueries'];
  applyPopularQuery: (q: string) => void;
}) {
  return (
    <div className="flex flex-col gap-sp-2">
      <Label>Populære søk</Label>
      <div className="flex flex-wrap gap-sp-2">
        {popularQueries.map((pq) => (
          <button
            key={pq.query}
            type="button"
            onClick={() => applyPopularQuery(pq.query)}
            className="rounded-sm border border-divider px-[14px] py-[7px] text-body-xs text-ink hover:bg-surface-muted" /* paper-exact: 8XB-0 (chip py 1.75 = 7px, px 3.5 = 14px) */
          >
            {pq.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsList({
  hits,
  category,
  facetBuckets,
  selectCategory,
  nbHits,
  query,
  onNavigate,
}: {
  hits: ProductHit[];
  category: string | null;
  facetBuckets: FacetBucket[];
  selectCategory: (value: string | null) => void;
  nbHits: number;
  query: string;
  onNavigate: () => void;
}) {
  const activeBucket = facetBuckets.find((b) => b.value === category);
  const countLabel = hits.length === 1 ? '1 produkt' : `${hits.length} produkter`;

  return (
    // Tre-deling: header + count (shrink-0), scrollbar liste (flex-1), og
    // "Se alle"-lenke (shrink-0) som limes nederst. `min-h-0` trigger at
    // barna tar ansvaret for overflow, ikke foreldre. Paddingen for topp/
    // bunn/sider lever per-barn slik at skrolle-barren ikke stikker inn i
    // kant-spacingen.
    <>
      <div className="shrink-0 pl-sp-7 pr-sp-6 pt-sp-5">
        <div className="mb-sp-3 flex items-center gap-sp-2">
          <Label>Kategori</Label>
          {activeBucket && (
            <button
              type="button"
              onClick={() => selectCategory(null)}
              className="flex items-center gap-[6px] rounded-sm border border-divider bg-surface-muted px-sp-3 py-[5px] text-body-xs font-medium text-ink hover:bg-surface-hover" /* paper-exact: 8VJ-0 (chip py 1.25 = 5px) */
            >
              <span>{labelForCategory(activeBucket.value, activeBucket.label)}</span>
              <ChipChevron />
            </button>
          )}
        </div>
        <p className="mb-sp-3 text-body-xs text-ink-muted">{countLabel}</p>
      </div>

      <ul className="flex flex-col flex-1 min-h-0 overflow-y-auto pl-sp-7 pr-sp-6">
        {hits.map((hit) => (
          <HitRow key={hit.objectID} hit={hit} onNavigate={onNavigate} />
        ))}
      </ul>

      {/* "Se alle N resultater" — limt til bunnen av results-kolonnen.
          Viser kun hvis det finnes flere treff enn vi rendrer her. `group`
          lar IconButtonCircle reagere på hele radens hover-state via
          `group-hover:*`-varianter i primitiven. */}
      {nbHits > hits.length && (
        <Link
          href={{ pathname: '/sok', query: { q: query, ...(category ? { cat: category } : {}) } }}
          onClick={onNavigate}
          className="group shrink-0 flex items-center justify-between gap-sp-3 border-t border-divider bg-surface pl-sp-7 pr-sp-6 py-sp-4 text-body-sm font-bold text-ink transition-colors hover:text-aka"
        >
          <span>Se alle {nbHits} resultater</span>
          <IconButtonCircle size="md">
            <ArrowRight />
          </IconButtonCircle>
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
        className="flex items-center gap-sp-3 border-b border-surface-muted py-sp-3 hover:bg-surface-muted" /* paper-exact: 8VO-0 (row py 12 gap 16) */
      >
        <div className="h-13 w-13 shrink-0 overflow-hidden rounded-sm bg-surface-muted" /* paper-exact: 8VP-0 (thumb 52x52) */>
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

        <div className="flex min-w-0 flex-1 flex-col gap-[2px]" /* paper-exact: 8VQ-0 */>
          {hit.brand && (
            <span className="text-label font-bold uppercase text-ink-muted">
              {hit.brand}
            </span>
          )}
          <h3 className="truncate text-body-md font-bold text-ink">
            {hit.name}
          </h3>
          {hit.spec && (
            <span className="text-label font-medium text-ink-muted">{hit.spec}</span>
          )}
        </div>

        <div className="shrink-0 text-right">
          {hasSale ? (
            <>
              <div className="text-body font-bold text-aka">
                {formatNok(hit.salePrice as number)}
              </div>
              <div className="text-label text-ink-muted line-through">
                {formatNok(hit.regularPrice as number)}
              </div>
            </>
          ) : hit.price !== null ? (
            <div className="text-body font-bold text-ink">{formatNok(hit.price)}</div>
          ) : (
            <div className="text-body text-ink-muted">—</div>
          )}
        </div>
      </Link>
    </li>
  );
}

function EmptyState({
  categoryShortcuts,
}: {
  categoryShortcuts: SearchApi['categoryShortcuts'];
}) {
  return (
    <div className="flex flex-col gap-sp-4">
      <Label>Start med</Label>
      <p className="text-body-sm text-ink-muted">
        Skriv for å søke etter produkter, merker eller knivtyper. Eller
        utforsk populære kategorier:
      </p>
      <ul className="flex flex-col gap-[2px]" /* paper-exact: 8X0-0 (kategori-rad gap 2px) */>
        {categoryShortcuts.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center justify-between rounded-sm px-sp-3 py-[9px] hover:bg-surface-muted" /* paper-exact: 8WT-0 */
            >
              <span className="text-body-sm font-medium text-ink">{s.label}</span>
              <ArrowRight />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-sp-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-sp-3 py-sp-3"
          aria-hidden
        >
          <div className="h-13 w-13 shrink-0 rounded-sm bg-surface-muted" /* paper-exact: 8VP-0 (52x52 skeleton) */ />
          <div className="flex flex-1 flex-col gap-sp-1">
            <div className="h-3 w-24 rounded-sm bg-surface-muted" />
            <div className="h-4 w-64 rounded-sm bg-surface-muted" />
            <div className="h-3 w-32 rounded-sm bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col gap-sp-2">
      <p className="text-body font-bold text-ink">
        Fant ingenting for &ldquo;{query}&rdquo; enda
      </p>
      <p className="text-body-sm text-ink-muted">
        Prøv et annet ord, skriv litt mer, eller utforsk kategoriene til høyre.
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label font-bold uppercase text-ink-muted">
      {children}
    </h3>
  );
}

/**
 * Pen label-gjenbruk fra category_path. `knivtyper/kokkekniv` → `Kokkekniv`.
 * Hvis Algolia returnerer en `label` bruker vi den direkte — ellers
 * title-caser vi siste segment.
 */
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

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1 1L11 11M11 1L1 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4 4L14 14M14 4L4 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChipChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M2.5 4L5 6.5L7.5 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRight() {
  // Ingen egen farge-klasse — `stroke="currentColor"` arver fra nærmeste
  // parent som setter `text-*`. Det lar pila reagere korrekt på hover-
  // state når den sitter inne i en rund ikonknapp-container.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8H13M13 8L9 4M13 8L9 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
