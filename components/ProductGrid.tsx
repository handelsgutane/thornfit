'use client';

/**
 * Gjenbrukbar produkt-grid (match med Paper-design "Friendly canyon" → artboard
 * 47B-0 · Product Cards, variant `card·rest` + `card·hover`).
 *
 * Kortdimensjon: 305×464 i 4-kol grid med 24px gap (`max-w-content` 1312px).
 * Hover-animasjon (47B-0 → `card·hover`): bildet krymper fra `aspect-square`
 * (305×305) til `aspect-[6/5]` (305×254), og frigjør plass til en bullet-strip
 * med 3 punkter (frakt, knivsliping, returrett) som fades/slides inn. Kortets
 * totale høyde holdes fast (464px) så grid-radene ikke hopper.
 *
 * Stil-tokens ligger i `app/globals.css` — se `docs/design-system.md`.
 *
 * Stateless og uavhengig av data-kilde utover `CatalogListItem`. Brukes av
 * `/produkter` og kategori-rotslug-siden.
 */

import Image from 'next/image';
import Link from 'next/link';

import { TrackedProductLink } from '@/components/analytics/TrackedProductLink';
import { Toast, useToast, type ToastOptions } from '@/components/ui/Toast';
import { catalogListItemToAnalyticsItem } from '@/lib/analytics/items';
import type { CatalogListItem } from '@/lib/supabase/catalog';
import { useWishlistStore } from '@/lib/wishlist/store';
import type { WishlistItem } from '@/types/wishlist';

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

/**
 * Hover-bullets er globale USPs — ikke per-produkt. Vises bare når kortet er
 * hovered (card·hover i Paper 47B-0). Kopi eies sentralt her slik at et senere
 * CMS-felt eller feature-flag kan overstyre uten å røre komponenten.
 */
const HOVER_BULLETS = [
  'Fri frakt over kr 1 500',
  'Knivsliping i Oslo og per post',
  '30 dagers returrett',
] as const;

/**
 * Nøkler vi holder unna i sub-label — de er enten "brand" (vises allerede
 * i toppraden) eller er for lange til å passe én linje. Fallback-rekkefølgen
 * i `deriveSubtitle` tar de to første andre verdier.
 */
const SUBTITLE_SKIP_KEYS = new Set<string>([
  'pa_merke',
  'pa_produsent',
  'merke',
  'produsent',
  'brand',
]);

/**
 * Pakker ut 1–2 attributt-verdier til en "210mm · VG10"-aktig spec-linje.
 * Ingen magi per-kategori — vi bare hopper over brand-aktige nøkler og tar
 * de to neste. Returnerer `null` om produktet ikke har relevante attributter.
 */
function deriveSubtitle(
  filterValues: CatalogListItem['filterValues'],
): string | null {
  if (!filterValues) return null;
  const parts: string[] = [];
  for (const [key, fv] of Object.entries(filterValues)) {
    if (SUBTITLE_SKIP_KEYS.has(key)) continue;
    const first = fv.values[0];
    if (!first) continue;
    parts.push(first);
    if (parts.length === 2) break;
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M2 6L5 9L10 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 5 stjerner, fylte opp til `value` (0–5). Halve stjerner avrundes ned.
 *
 * Paper-refs:
 *   - 47R-0  Stars-container (gap 2px)
 *   - 47T-0  Path — fill #D4930A for fylt, #E0E0DC for tom
 *
 * `text-kin` er brand-fixed gold (#D4930A) som ikke flipper med tema —
 * stjerner skal se like ut i lys og mørk modus (samme prinsipp som `aka`).
 * Tom stjerne bruker `text-divider` som flipper med tema og matcher sakai
 * (#E0E0DC) i light mode, og en lysere grå i dark mode.
 */
function RatingStars({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="flex gap-[2px]" /* paper-exact: 47R-0 (stars gap 2px) */>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={i < filled ? 'text-kin' : 'text-divider'}
        >
          <path d="M6 1L7.545 4.13L11 4.635L8.5 7.07L9.09 10.5L6 8.88L2.91 10.5L3.5 7.07L1 4.635L4.455 4.13L6 1Z" />
        </svg>
      ))}
    </span>
  );
}

export interface ProductGridProps {
  products: CatalogListItem[];
  /**
   * Listens ID for analytics — matcher `view_item_list.listId`-konvensjonen
   * (f.eks. `'category:bryner'`, `'catalog:all'`, `'search'`). Når satt,
   * fyrer hvert kort-klikk `select_item` med posisjon i den viste listen.
   * Utelatt = ingen klikk-tracking (f.eks. for PDP-relaterte-lister som
   * ikke har list-impresjon enda).
   */
  listId?: string;
}

export function ProductGrid({ products, listId }: ProductGridProps) {
  const { toastProps, showToast } = useToast();

  if (products.length === 0) {
    return (
      <p className="rounded-sm border border-divider bg-surface p-6 text-body text-ink-muted">
        Ingen produkter funnet.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
        {products.map((p, index) => (
          <li key={p.id} className="flex">
            <ProductCard product={p} listId={listId} position={index} showToast={showToast} />
          </li>
        ))}
      </ul>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}

function ProductCard({
  product: p,
  listId,
  position,
  showToast,
}: {
  product: CatalogListItem;
  listId?: string;
  position: number;
  showToast: (opts: ToastOptions) => void;
}) {
  const addItem = useWishlistStore((s) => s.addItem);
  const removeItem = useWishlistStore((s) => s.removeItem);
  const inWishlist = useWishlistStore((s) => s.hasItem(p.id));

  const hasSale =
    p.salePrice !== null &&
    p.regularPrice !== null &&
    p.salePrice < p.regularPrice;

  // Rabatt-prosent avrundet — matcher Paper-badge "-14%".
  const discountPct =
    hasSale && p.salePrice !== null && p.regularPrice !== null
      ? Math.round(((p.regularPrice - p.salePrice) / p.regularPrice) * 100)
      : null;

  const isSoldOut = p.stockStatus === 'out_of_stock';

  // Nested path (revidert ADR-0007): bygg `/{primary-cat-path}/{slug}`. Fall
  const href = `/${p.slug}`;

  const subtitle = deriveSubtitle(p.filterValues);
  const showRating =
    p.averageRating !== null &&
    p.averageRating !== undefined &&
    p.ratingCount !== null &&
    p.ratingCount !== undefined &&
    p.ratingCount > 0;

  // `w-full` — fyll li's bredde (li er flex-wrapper).
  // Mobil: ingen eksplisitt høyde; flex-stretch fra li + grid-align gjør
  //        at alle kort i samme rad får samme høyde (radens høyeste).
  // sm+:   Paper-fast 464px.
  const cardClassName =
    'group relative flex w-full flex-col overflow-hidden rounded-sm bg-surface transition-shadow duration-200 hover:shadow-card-hover sm:h-[464px]'; /* paper-exact: 47H-0 (card 305×464 kun ≥sm) */

  const cardContent = (
    <>
      {/* ---- Bilde + overlays ------------------------------------------- */}
      {/*
        Aspect-ratio-shrink (1/1 → 4/3) gir plass til bullet-strip under. Bruker
        transition-[aspect-ratio] som er støttet i alle evergreen-browsere —
        har ingen reflow-jank fordi kortet selv har fast h-[464px].

        **Hvorfor 4/3 i stedet for Paper-spec 6/5:** Paper 486-0 tegnet kortet
        med 1-linjers tittel og uten subtitle. I virkeligheten kan et produkt ha
        brand + 2-linjers navn + subtitle + rating samtidig (f.eks. "Diamant
        sand 'Kongousha' (400g) - NANIWA"), og da trenger hover-bullets (~77px
        inkl. border/gap/padding) mer headroom enn 6/5-shrinken frigjør (51px
        på et 305px kort). 4/3 frigjør ~76px og tåler worst-case uten å klippe
        prisen. For 1-linjers-titler er forskjellen knapt merkbar.
      */}
      <div className="relative w-full shrink-0 overflow-hidden bg-surface-muted aspect-square transition-[aspect-ratio] duration-300 ease-out group-hover:aspect-[4/3]" /* paper-exact: 486-0 (base — hover-ratio justert 6/5→4/3 for worst-case content; se kommentar over) */>
        {p.primaryImage ? (
          <Image
            src={p.primaryImage.src}
            alt={p.primaryImage.alt}
            fill
            // Grid: 2 kol mobil, 3 sm, 4 md, 5 lg. `sizes` matcher bredden
            // så next/image velger riktig srcset-variant per breakpoint.
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-label uppercase text-ink-muted">
            Uten bilde
          </div>
        )}

        {/* Badge venstre: rabatt eller utsolgt (utsolgt vinner).
            Utsolgt flipper med mode (bg-surface-contrast) slik at den leser på
            både light og dark cards. Rabatt-badge er brand-fixed (aka/shiro). */}
        {isSoldOut ? (
          <span className="absolute left-3 top-3 rounded-sm bg-surface-contrast px-2 py-[3px] text-label-sm font-bold uppercase text-ink-inverse" /* paper-exact: 47B-0 (badge y-padding 3px) */>
            Utsolgt
          </span>
        ) : discountPct !== null ? (
          <span className="absolute left-3 top-3 rounded-sm bg-aka px-2 py-[3px] text-label-sm font-bold uppercase text-shiro" /* paper-exact: 47B-0 — aka/shiro brand-fixed */>
            −{discountPct}%
          </span>
        ) : null}

        {/* Ønskeliste-knapp — fylt hjerte når i ønskeliste, kontur ellers.
            Klikk toggle: legg til / fjern fra ønskelisten (Zustand + localStorage). */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (inWishlist) {
              removeItem(p.id);
            } else {
              const wishlistItem: WishlistItem = {
                id: p.id,
                slug: p.slug,
                href,
                name: p.name,
                brand: p.primaryCategorySlug ?? null,
                specLine: subtitle,
                price: p.price,
                salePrice: p.salePrice ?? null,
                regularPrice: p.regularPrice ?? null,
                stockStatus: p.stockStatus as WishlistItem['stockStatus'],
                image: p.primaryImage ?? null,
                addedAt: new Date().toISOString(),
              };
              addItem(wishlistItem);
              showToast({
                variant: 'success',
                message: 'Lagret til ønskelisten',
                action: { label: 'Se ønskeliste →', href: '/konto/onskeliste' },
              });
            }
          }}
          aria-label={inWishlist ? `Fjern ${p.name} fra ønskelisten` : `Lagre ${p.name} til ønskelisten`}
          aria-pressed={inWishlist}
          className="shadow-sm absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface transition-opacity hover:opacity-80"
        >
          {inWishlist ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-aka" aria-hidden>
              <path d="M8 13.5C8 13.5 2 9.5 2 5.5C2 3.567 3.567 2 5.5 2C6.613 2 7.607 2.52 8 3.5C8.393 2.52 9.387 2 10.5 2C12.433 2 14 3.567 14 5.5C14 9.5 8 13.5 8 13.5Z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-ink" aria-hidden>
              <path d="M8 13.5C8 13.5 2 9.5 2 5.5C2 3.567 3.567 2 5.5 2C6.613 2 7.607 2.52 8 3.5C8.393 2.52 9.387 2 10.5 2C12.433 2 14 3.567 14 5.5C14 9.5 8 13.5 8 13.5Z" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          )}
        </button>
      </div>

      {/* ---- Tekstseksjon ----------------------------------------------
          Layout-intensjon: produktinfo (brand/navn/subtitle/rating) øverst;
          pris-gruppa låst til bunn via `mt-auto` uansett skjermstørrelse.
          Hover-bullets (kun ≥sm) plasseres i DOM mellom rating og pris,
          ikke etter. Det er essensielt: når bildet krymper (aspect-square
          → 6/5) og tekstblokken får ekstra plass, ekspanderer bullets i
          mellomrommet OVER prisen — prisen selv beholder sin absolutte
          pixel-posisjon fra kortets bunn. Forsøk på å sette `mt-auto` også
          på bullets deler opp ledig plass og mister "låst pris"-garantien.

          Padding-strategi: mobil bruker px-2.5/pt-10/pb-12 for tettere
          layout og mer plass til produktnavn. Desktop følger Paper 47M-0
          (px-4 pt-14 pb-18). */}
      {/*
        To-delt tekstseksjon med justify-between:
          - Øvre div: brand / navn / subtitle / rating / hover-bullets
          - Nedre div: pris — alltid forankret til bunnen via justify-between

        Hvorfor justify-between i stedet for mt-auto på prisen:
        mt-auto krever at flex-containeren har positiv fri plass. Når kortet
        har 2-linjers tittel + rating-rad (som legger til mt-[6px] + ~18px +
        gap), kan fri plass bli 0 ved spesifikke breakpoints/kortbredder. Da
        henger mt-auto i løse luften og prisen drifter 4–6px ned relativt til
        nabokort uten rating. justify-between låser prisen til bunnen
        ubetinget — fri plass 0 eller positiv, alltid riktig posisjon.
       */}
      {/*
        CSS Grid med grid-rows-[1fr_auto]:
          - Rad 1 (øvre innhold): 1fr = tar all plass som IKKE er pris
          - Rad 2 (pris): auto = alltid i bunnen, uavhengig av innhold over

        Hvorfor Grid fremfor justify-between (flex):
        space-between fordeler kun POSITIV fri plass. Når kort med 2-linjers
        tittel + rating fyller tekstseksjonen helt (fri plass = 0), har
        space-between ingen effekt og prisen henger i naturlig flyt — 4–6px
        lavere enn nabokort uten rating. CSS Grid med 1fr/auto garanterer at
        rad 2 (pris) ALLTID er forankret til bunnen, uavhengig av om rad 1
        har fri plass eller ikke.
       */}
      <div className="grid flex-1 grid-rows-[1fr_auto] px-2.5 pt-[10px] pb-[12px] sm:px-4 sm:pt-[14px] sm:pb-[18px]" /* paper-exact: 47M-0 kun ≥sm */>

        {/* ---- Øvre innhold (rad 1 — 1fr) ---- */}
        <div className="flex flex-col gap-[3px]">
          {/* Produktnavn: 3 linjer på mobil (lang japansk smednavn + specs klemmer
              2-linjers kutt), 2 linjer på desktop hvor kortene er bredere og
              navn sjelden trenger mer. */}
          <h2 className="line-clamp-3 text-body-sm font-bold text-ink sm:line-clamp-2">
            {p.name}
          </h2>

          {/* Spec-linje (Paper 47P-0 / 48D-0) — f.eks. "210mm · VG10". Kun hvis
              produktet har minst én relevant attributt; ellers dropper vi raden
              helt så layouten ikke får tom plass. */}
          {subtitle && (
            <span className="mt-[1px] text-body-xs text-ink-muted" /* paper-exact: 47P-0 (subtitle mt 1px) */>
              {subtitle}
            </span>
          )}

          {/* Rating-rad (Paper 47Q-0 / 48E-0) — stjerner + antall. Renderes bare
              når produktet faktisk har en score; ingen "0 reviews"-støy. */}
          {showRating && (
            <div className="mt-[6px] flex items-center gap-1" /* paper-exact: 47Q-0 (rating-rad mt 6, gap 4) */>
              <RatingStars value={p.averageRating as number} />
              <span className="text-body-xs text-ink-muted">
                ({p.ratingCount})
              </span>
            </div>
          )}

          {/* ---- Hover-bullets (Paper 48T-0) --------------------------------
              Plasseres inne i øvre innhold-div så ekspansjonen skjer mellom
              innhold og pris (justify-between fordeler mellomrommet).
              `hidden sm:grid` skrur av på mobil. */}
          {!isSoldOut && (
            <div
              aria-hidden
              /* Korrekt grid-rows-animasjon: ytre div er grid-container (0fr→1fr),
                 INGEN border/padding her — grid-trackens auto-minimum baseres på
                 grid-itemets min-content, og border + padding hindrer kollaps til 0.
                 Løsning: wrapper-div uten border/padding som grid-item med overflow-hidden;
                 ul inni kan ha border/padding fritt — de klippes av overflow-hidden. */
              className="hidden grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-300 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100 sm:grid"
            >
              {/* Grid-item wrapper — overflow-hidden er kritisk: klipper ul-innhold
                  (inkl. border-t, padding, tekst) til 0 når grid-row er 0fr.
                  Ingen border/padding her → min-content = 0 → tracken kollapser til 0. */}
              <div className="overflow-hidden">
                <ul className="mt-sp-2 flex flex-col gap-[5px] border-t border-divider pt-[10px] text-body-xs text-ink" /* paper-exact: 48T-0 */>
                  {HOVER_BULLETS.map((b) => (
                    <li key={b} className="flex items-center gap-1.5">
                      <CheckIcon />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* ---- Pris-gruppe (rad 2 — auto, alltid i bunn) ----------------- */}
        <div className="flex flex-col gap-[3px] pt-[6px]" /* paper-exact: 47B-0 (pris-gruppe intern gap); pt-[6px] sikrer minste visuell avstand til innhold over */>
          <div className="flex items-baseline gap-[7px]" /* paper-exact: 47B-0 (prisrad gap) */>
            {hasSale ? (
              <>
                <span className="text-body font-bold text-aka">
                  {nok.format(p.salePrice as number)}
                </span>
                <span className="text-body text-ink-muted line-through">
                  {nok.format(p.regularPrice as number)}
                </span>
              </>
            ) : p.price !== null ? (
              <span className="text-body font-bold text-ink">{nok.format(p.price)}</span>
            ) : (
              <span className="text-body text-ink-muted">—</span>
            )}
          </div>

          {/* Lagerstatus — kun backorder her (out_of_stock-bade vises som
              overlay på bildet). Sitter under pris i bunn-gruppa slik at
              hele "bottom block" flyttes som én enhet om det skulle
              trengs, og pris aldri blir avhengig av om feltet renderes. */}
          {p.stockStatus === 'on_backorder' ? (
            <span className="text-label-sm font-bold uppercase text-ink-muted">
              På bestilling
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  // listId satt ⇒ klikk-tracking via TrackedProductLink. Ellers plain Link
  // for å unngå å fyre select_item uten meningsfylt listId (f.eks. PDP-
  // relaterte lister som ikke har view_item_list-impresjon enda).
  if (listId) {
    return (
      <TrackedProductLink
        href={href}
        item={catalogListItemToAnalyticsItem(p)}
        listId={listId}
        position={position}
        className={cardClassName}
      >
        {cardContent}
      </TrackedProductLink>
    );
  }

  return (
    <Link href={href} className={cardClassName}>
      {cardContent}
    </Link>
  );
}
