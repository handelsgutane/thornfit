'use client';

/**
 * WishlistView — /konto/onskeliste
 *
 * Desktop (Paper 6GO-0): sidebar-layout via AccountShell.
 *   - Header: "Ønskeliste" + "N produkter lagret"
 *   - 4-kolonne produktgrid
 *
 * Mobil (Paper 7US-0):
 *   - Sub-header: 52px hvit bar, flush mot nav (−mt-sp-5 kansellerer
 *     AccountShell sin py-sp-5), chevron tilbake + "Ønskeliste" + antall
 *   - 2-kolonne grid på canvas-bakgrunn
 *
 * Hjerte-knapp på hvert kort fjerner produktet fra ønskelisten.
 * Tom liste viser empty-state med lenke til katalogen.
 */

import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import {
  selectWishlistCount,
  selectWishlistHydrated,
  selectWishlistItems,
  useWishlistStore,
} from '@/lib/wishlist/store';
import type { WishlistItem } from '@/types/wishlist';

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function WishlistView() {
  const items = useWishlistStore(selectWishlistItems);
  const count = useWishlistStore(selectWishlistCount);
  const hydrated = useWishlistStore(selectWishlistHydrated);
  const removeItem = useWishlistStore((s) => s.removeItem);

  const countLabel =
    count === 1 ? '1 produkt lagret' : `${count} produkter lagret`;
  const countLabelMobile = count === 1 ? '1 produkt' : `${count} produkter`;

  return (
    <>
      {/* ---- Mobil sub-header (Paper 7XL-0) --------------------------------
          52px hvit bar, flush mot nav. -mt-sp-5 kansellerer AccountShell sin
          py-sp-5 (32px) toppadding. -mx-sp-3 bryter ut av horisontal padding. */}
      <header className="-mx-sp-3 -mt-sp-5 flex h-13 shrink-0 items-center gap-3 border-b border-divider bg-surface px-sp-3 md:-mx-sp-7 md:px-sp-7 lg:hidden">
        <Link
          href="/konto"
          aria-label="Tilbake til kontooversikt"
          className="flex shrink-0 items-center text-ink-muted hover:text-ink"
        >
          <BackChevron />
        </Link>
        {/* "Ønskeliste" — 15px bold (Paper 7XO-0: text-body-md) */}
        <span className="text-body-md font-bold text-ink">Ønskeliste</span>
        {/* Antall — 13px regular ink-muted, ml-auto (Paper 7XP-0) */}
        {hydrated && (
          <span className="ml-auto text-body-xs text-ink-muted">
            {countLabelMobile}
          </span>
        )}
      </header>

      {/* ---- Desktop header (Paper 6RJ-0 / 6RK-0) ---- */}
      <header className="hidden flex-col gap-sp-1 pb-sp-4 lg:flex">
        <h1 className="text-h2 font-bold text-ink">Ønskeliste</h1>
        {hydrated && (
          <p className="text-body-sm text-ink-muted">{countLabel}</p>
        )}
      </header>

      {/* ---- Innhold ---- */}
      {!hydrated ? null : items.length === 0 ? (
        <WishlistEmpty />
      ) : (
        /* Canvas-bakgrunn på mobil (Paper 8IH-0: bg #F5F5F3, p-16, gap-12).
           Desktop: ingen canvas-wrapper — cards mot hvit side-bg. */
        <div className="-mx-sp-3 bg-canvas p-sp-3 md:-mx-sp-7 md:p-sp-7 lg:mx-0 lg:bg-transparent lg:p-0">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-sp-4">
            {items.map((item) => (
              <li key={item.id} className="flex">
                <WishlistCard item={item} onRemove={() => removeItem(item.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wishlist card (Paper 8IJ-0 mobil / 8FG-0 desktop)
// ---------------------------------------------------------------------------

function WishlistCard({
  item,
  onRemove,
}: {
  item: WishlistItem;
  onRemove: () => void;
}) {
  const hasSale =
    item.salePrice !== null &&
    item.regularPrice !== null &&
    item.salePrice < item.regularPrice;

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-1 bg-surface">
      {/* Bilde — 1:1 aspect ratio (Paper 8IK-0) */}
      <Link href={item.href} className="relative block w-full bg-canvas aspect-square">
        {item.image ? (
          <Image
            src={item.image.src}
            alt={item.image.alt}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-label uppercase text-ink-muted">
            Uten bilde
          </div>
        )}

        {/* Hjerte-knapp — fylt, klikk fjerner fra ønskelisten (Paper 8IN-0) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          aria-label={`Fjern ${item.name} fra ønskelisten`}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-sm transition-opacity hover:opacity-80"
        >
          <HeartFilledIcon />
        </button>
      </Link>

      {/* Info-seksjon (Paper 8IQ-0: pt-14 pr-16 pb-18 pl-16, gap-3) */}
      <Link
        href={item.href}
        className="flex flex-1 flex-col gap-[3px] px-sp-3 pt-3.5 pb-sp-3"
      >
        {item.brand && (
          <span className="text-label-sm font-bold uppercase text-ink-muted">
            {item.brand}
          </span>
        )}
        <h2 className="line-clamp-2 text-body-sm font-bold text-ink">
          {item.name}
        </h2>
        {item.specLine && (
          <span className="mt-[1px] text-body-xs text-ink-muted">
            {item.specLine}
          </span>
        )}

        {/* Pris */}
        <div className="mt-auto pt-sp-2">
          {hasSale ? (
            <div className="flex items-baseline gap-[7px]">
              <span className="text-body font-bold text-aka">
                {nok.format(item.salePrice as number)}
              </span>
              <span className="text-body text-ink-muted line-through">
                {nok.format(item.regularPrice as number)}
              </span>
            </div>
          ) : item.price !== null ? (
            <span className="text-body font-bold text-ink">
              {nok.format(item.price)}
            </span>
          ) : null}
        </div>
      </Link>

      {/* Legg i handlekurv-knapp (Paper 8JA-0: h-40px, bg-aka, rounded-1) */}
      <div className="px-sp-3 pb-sp-3">
        <Button
          href={item.href}
          variant="primary"
          size="lg"
          fullWidth
          className="h-10 text-body-xs"
        >
          Se produkt
        </Button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function WishlistEmpty() {
  return (
    <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-sp-4 text-center">
      <HeartOutlineIcon className="size-12 text-ink-muted" />
      <div className="flex flex-col gap-1">
        <p className="text-body-md font-bold text-ink">Ingen produkter lagret</p>
        <p className="text-body-sm text-ink-muted">
          Trykk på hjertet på et produkt for å lagre det her.
        </p>
      </div>
      <Button href="/produkter" variant="primary" size="lg">
        Utforsk produkter
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ikoner
// ---------------------------------------------------------------------------

function BackChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function HeartFilledIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-aka" aria-hidden>
      <path d="M8 13.5C8 13.5 2 9.5 2 5.5C2 3.567 3.567 2 5.5 2C6.613 2 7.607 2.52 8 3.5C8.393 2.52 9.387 2 10.5 2C12.433 2 14 3.567 14 5.5C14 9.5 8 13.5 8 13.5Z" />
    </svg>
  );
}

function HeartOutlineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M12 21C12 21 3 14.5 3 8.5C3 5.46 5.46 3 8.5 3C10.02 3 11.41 3.78 12 5.25C12.59 3.78 13.98 3 15.5 3C18.54 3 21 5.46 21 8.5C21 14.5 12 21 12 21Z" />
    </svg>
  );
}
