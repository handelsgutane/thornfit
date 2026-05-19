'use client';

/**
 * CartRecommendationsStrip — "Kunder kjøpte også"-strip på /handlekurv.
 *
 * **Paper-refs:**
 *   - 5LD-0 (desktop, 928×98) — horisontal rad med 3 kort à 303×70.
 *   - 66P-0 (mobile, 390×102) — horisontal-scrollbar strip, kort flekser
 *     mellom 242–271px bredde (tekst dikterer). Vi bruker fast min-width
 *     (`--width-rec-card-sm`) så alle kort er like.
 *
 * **Data-flyt:**
 *   1. Hver gang cart-items endrer seg, bruker vi første items `sku` som
 *      seed-objectID. Algolia-indeksen (`products_b2c`) har `objectID = SKU`
 *      — IKKE produkt-id. Tidligere bug: vi sendte `String(productId)` og
 *      fikk null treff fordi seed aldri matchet noe i indeksen.
 *      Hopp over hvis første item mangler SKU (kan ikke matche uten).
 *   2. `fetchCartRecommendations()` prøver bought-together først, faller
 *      tilbake til related-products hvis FBT er tomt.
 *   3. Vi filtrerer ut alt som allerede ligger i kurven for å unngå
 *      "kjøp mer av det du har".
 *   4. 500ms debounce på stepper-klikk så vi ikke spam-fetcher Algolia
 *      mens brukeren justerer antall raskt.
 *
 * **Analytics:**
 *   - `view_item_list` fyres én gang per seed+modell-kombinasjon slik at vi
 *     ikke dobbelteller impresjoner når listen re-rendres med samme hits.
 *   - Klikk fyrer både GA4 `select_item` OG Algolia Insights
 *     `trackRecommendationClicked` — førstnevnte til rapportering,
 *     sistnevnte til rank-treningen.
 *
 * **MVP-scope:** Ingen "Legg i kurv"-knapp direkte fra stripet (chef-storefront
 * har det, vi droppet det per ADR-intensjon). Hele kortet er en link til PDP.
 * "+"-ikonet til høyre er rent dekorativt og matcher Paper.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { useCartItems } from '@/lib/cart/hooks';
import { formatNok } from '@/lib/cart/totals';
import {
  fetchCartRecommendations,
  type RecommendationModel,
} from '@/lib/search/recommendations';
import { trackRecommendationClicked } from '@/lib/search/insights';
import type { ProductHit } from '@/lib/search/types';

/** Hvor mange kort vi viser. Matcher Paper 5LD-0 (3 kort) og 66P-0 (3 kort). */
const MAX_RECS = 3;

/** Debounce i ms — unngå storm når stepper-knappene trykkes raskt. */
const FETCH_DEBOUNCE_MS = 500;

/** listId brukt for GA4 + intern impression-dedupe. */
const LIST_ID = 'cart:recommendations';

interface RecsState {
  hits: ProductHit[];
  model: RecommendationModel;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'empty';

export function CartRecommendationsStrip() {
  const items = useCartItems();
  const [state, setState] = useState<RecsState | null>(null);
  // `status` driver skeleton vs ekte innhold vs hidden:
  //   - 'idle'    : ingen seed enda (komponenten er sannsynligvis ikke synlig)
  //   - 'loading' : fetching → vis skeleton-rader
  //   - 'ready'   : hits returnert → vis ekte kort
  //   - 'empty'   : fetch ferdig uten treff → skjul stripet
  const [status, setStatus] = useState<LoadStatus>('idle');

  // Dedupe-nøkkel: `seed:model:objectIDs`. Hver unike kombinasjon fyrer
  // view_item_list én gang — vi bruker ref (ikke state) fordi vi ikke vil
  // trigge re-render når den settes.
  const loggedImpressionKey = useRef<string | null>(null);

  // SKU-basert seed (matcher chef-storefront `products_b2c`-indeksen).
  // Første cart-item brukes som seed; mangler SKU → ingen anbefalinger.
  // Eksklusjonsliste: alle SKU-er allerede i kurven, så vi ikke anbefaler
  // produkter brukeren har lagt til.
  const seedObjectID = items.length > 0 ? (items[0].sku ?? null) : null;
  const excludeObjectIDs = items
    .map((i) => i.sku)
    .filter((s): s is string => Boolean(s));

  // Stable nøkkel for useEffect-deps — hvis bare quantity endrer seg, vil
  // seedObjectID + excludeObjectIDs-settet være uendret (samme produkter),
  // så vi trenger en string-signatur for å unngå re-fetch ved quantity-bump.
  const excludeKey = excludeObjectIDs.slice().sort().join(',');

  useEffect(() => {
    if (!seedObjectID) {
      setStatus('idle');
      return;
    }

    // Vis skeleton umiddelbart — bedre UX enn å vente til debounce + fetch
    // er ferdig. Brukeren ser at noe LASTES rett etter cart-render i
    // stedet for et plutselig pop-in.
    setStatus('loading');

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchCartRecommendations(seedObjectID, {
            maxResults: MAX_RECS,
            excludeObjectIDs: excludeKey ? excludeKey.split(',') : [],
          });
          if (cancelled) return;

          if (result.hits.length === 0) {
            setState(null);
            setStatus('empty');
            return;
          }

          setState({ hits: result.hits, model: result.model });
          setStatus('ready');

          // Impression-tracking — dedupe så samme hit-set ikke teller
          // dobbelt når komponenten re-rendres uten faktisk endring.
          const impressionKey = `${seedObjectID}:${result.model}:${result.hits
            .map((h) => h.objectID)
            .join(',')}`;
          if (loggedImpressionKey.current !== impressionKey) {
            loggedImpressionKey.current = impressionKey;
            track({
              name: 'view_item_list',
              payload: {
                listId: LIST_ID,
                listName: 'Kurv — kunder kjøpte også',
                items: result.hits.map(hitToAnalyticsItem),
              },
            });
          }
        } catch {
          if (!cancelled) {
            setState(null);
            setStatus('empty');
          }
        }
      })();
    }, FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [seedObjectID, excludeKey]);

  // Skjul helt: ingen seed (idle) eller fetch returnerte tomt.
  if (status === 'idle' || status === 'empty') {
    return null;
  }

  // Skeleton mens vi henter — samme dimensjoner som ekte kort så det
  // ikke blir layout-shift når data lander.
  if (status === 'loading' || !state) {
    return <SkeletonStrip />;
  }

  return (
    <section
      aria-labelledby="cart-recs-label"
      // `min-w-0 max-w-full` er kritisk: uten dette setter grid-/flex-foreldre
      // (CartPage's section/grid) seksjonens min-width til innholdets natural
      // bredde (3 × 260px-kort = 780px), så `overflow-x-auto` på ul-en blir
      // meningsløs — hele siden blir 780px bred på mobil. min-w-0 lar
      // foreldre-tracket krympe til viewport-bredden, og overflow tar over.
      className="flex min-w-0 max-w-full flex-col gap-sp-3"
    >
      {/* Header — Paper 5LE-0 / 66Q-0 */}
      <div className="flex items-center gap-sp-2">
        <SparkIcon />
        <h2
          id="cart-recs-label"
          className="font-bold uppercase text-ink"
          style={{ fontSize: '12px', lineHeight: '16px', letterSpacing: '0.1em' }} /* +1 size opp fra text-label (11/16) per brukerfeedback */
        >
          Kunder kjøpte også
        </h2>
      </div>

      {/*
        Layout:
          - Mobile: horisontal scroll-strip. `overflow-x-auto` + `snap-x` gir
            snapping på touch, `-mx-sp-4 px-sp-4` ekstender scrollområdet til
            viewport-kant (Paper 66U-0 er 390 bred — hele skjermen).
          - Desktop: 3-col grid (gap 24 matcher Paper 5LI-0 beregnet gap).
      */}
      {/* Mobile: horisontal scroll-strip. Negativ margin matcher CartPage's
          `px-sp-3` (12px) — ikke `sp-4` (16px), siden det fikk strippen til
          å renne over viewport-kanten med 4px og bryte side-bredden.
          Internal padding bringer første og siste kort tilbake til samme
          flush-distanse som annen mobile content. */}
      <ul className="-mx-sp-3 flex snap-x snap-mandatory gap-sp-3 overflow-x-auto px-sp-3 pb-sp-1 md:mx-0 md:grid md:grid-cols-3 md:gap-sp-4 md:overflow-visible md:px-0 md:pb-0">
        {state.hits.map((hit, index) => (
          <RecommendationCard
            key={hit.objectID}
            hit={hit}
            position={index + 1}
            model={state.model}
          />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function RecommendationCard({
  hit,
  position,
  model,
}: {
  hit: ProductHit;
  position: number;
  model: RecommendationModel;
}) {
  const href = `/${hit.slug}`;

  const handleClick = () => {
    // GA4 / Meta / TikTok
    track({
      name: 'select_item',
      payload: {
        item: hitToAnalyticsItem(hit),
        listId: LIST_ID,
        position,
      },
    });
    // Algolia rank-signal
    trackRecommendationClicked(hit.objectID, model);
  };

  const hasSale =
    hit.salePrice !== null &&
    hit.regularPrice !== null &&
    hit.salePrice < hit.regularPrice;

  return (
    <li className="snap-start md:snap-none">
      <Link
        href={href}
        onClick={handleClick}
        className="group flex w-(--width-rec-card-sm) items-center gap-sp-2 border border-divider bg-surface p-sp-2 transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1 md:w-full" /* paper-exact: 5LJ-0 (desktop card) / 66V-0 (mobile card) */
      >
        {/* Thumb — Paper 66W-0 (40) / 5LK-0 (44) */}
        <div className="relative h-(--size-rec-thumb-sm) w-(--size-rec-thumb-sm) flex-shrink-0 overflow-hidden bg-surface-muted md:h-(--size-rec-thumb) md:w-(--size-rec-thumb)">
          {hit.image ? (
            <Image
              src={hit.image}
              alt={hit.name}
              fill
              sizes="44px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>

        {/* Tekst — name + price (Paper 66X-0 / 5LL-0) */}
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]" /* paper-exact: 66X-0 (mobile name/pris stack 130×34, gap 2) */>
          <p className="truncate text-muted-sm font-bold text-ink group-hover:text-aka">
            {hit.name}
          </p>
          {hasSale ? (
            <p className="truncate text-muted-sm font-bold tabular-nums text-aka">
              {formatNok(hit.salePrice as number)}
            </p>
          ) : hit.price !== null ? (
            <p className="truncate text-muted-sm tabular-nums text-ink-muted">
              {formatNok(hit.price)}
            </p>
          ) : null}
        </div>

        {/*
          "+" dekorativ affordance — Paper 670-0 (26, mobile, outlined white)
          / 5LO-0 (28, desktop, fylt aka). Ikke en faktisk add-to-cart-knapp
          (MVP): hele kortet er en link til PDP hvor brukeren velger variant +
          antall. Vi beholder ikonet fordi det matcher Paper-rytmen og
          signaliserer "flere valg".

          Desktop vs mobil: Paper tegner desktop-knappen rød-fylt (bg-aka) med
          hvit glyph, mens mobil er outlined på hvit bg. Vi bytter styling på
          `md:`-breakpoint.
        */}
        <span
          aria-hidden
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-divider bg-surface text-ink transition-colors group-hover:border-ink md:h-(--size-rec-plus) md:w-(--size-rec-plus) md:border-transparent md:bg-aka md:text-white md:group-hover:bg-aka-dark" /* paper-exact: 670-0 mobile (26 outlined) / 5LO-0 desktop (28 aka-filled) */
        >
          <PlusIcon />
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — vises mens Algolia Recommend henter. Samme rytme som ekte
// strip (header + 3 kort) så det ikke blir layout-shift ved hit-lanf.
// Pulser via animate-pulse på skeleton-feltene; samme bg som ekte kort.
// ---------------------------------------------------------------------------

function SkeletonStrip() {
  return (
    <section
      aria-label="Laster anbefalinger"
      aria-busy="true"
      className="flex min-w-0 max-w-full flex-col gap-sp-3"
    >
      {/* Header — samme posisjon og spacing som ekte rendering. */}
      <div className="flex items-center gap-sp-2">
        <SparkIcon />
        <h2 className="font-bold uppercase text-ink" style={{ fontSize: '12px', lineHeight: '16px', letterSpacing: '0.1em' }}>Kunder kjøpte også</h2>
      </div>

      <ul
        className="-mx-sp-3 flex snap-x snap-mandatory gap-sp-3 overflow-x-auto px-sp-3 pb-sp-1 md:mx-0 md:grid md:grid-cols-3 md:gap-sp-4 md:overflow-visible md:px-0 md:pb-0"
        aria-hidden
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="snap-start md:snap-none">
            <div className="flex w-(--width-rec-card-sm) items-center gap-sp-2 border border-divider bg-surface p-sp-2 md:w-full">
              {/* Thumb */}
              <div className="size-(--size-rec-thumb-sm) shrink-0 animate-pulse bg-surface-muted md:size-(--size-rec-thumb)" />
              {/* Tekst-felter */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
              </div>
              {/* "+"-knapp-plassholder */}
              <div className="size-7 shrink-0 animate-pulse bg-surface-muted md:size-(--size-rec-plus)" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hitToAnalyticsItem(hit: ProductHit) {
  return {
    id: String(hit.productId || hit.objectID),
    sku: null,
    name: hit.name,
    price: hit.salePrice ?? hit.price ?? 0,
    category: hit.categoryPaths?.[0] ?? null,
    brand: hit.brand ?? null,
  };
}

// ---------------------------------------------------------------------------
// Icons — inline for å slippe ekstra import-byrde (Paper viser dem som små
// utility-glyfs, ikke del av et delt icon-sett).
// ---------------------------------------------------------------------------

/**
 * "Spark" / lyn-ikon — Paper 6AJ-0 / 6AP-0 (14×14). Brukes kun som visuell
 * cue foran listen-overskriften.
 */
function SparkIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-aka"
    >
      <path
        d="M8 1L3 8H7L6 13L11 6H7L8 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 1V11M1 6H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
