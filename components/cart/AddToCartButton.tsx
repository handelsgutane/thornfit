'use client';

/**
 * AddToCartButton — hovedkonverterings-CTA på produkt-detaljsiden.
 *
 * **To tilstander:**
 *   1. Item er ikke i kurv → én bred "Legg i handlekurv"-knapp (aka/rød).
 *   2. Item er i kurv → kompakt rad med "I handlekurv: N" + stepper.
 *
 * Transisjonen skjer deklarativt basert på `useCartItemQuantity(key)` —
 * hvis brukeren navigerer tilbake til PDP etter å ha lagt i kurv, ser de
 * umiddelbart stepperen i stedet for "Legg i handlekurv"-knappen.
 *
 * **Hvorfor ikke bare "Legg i handlekurv"-knapp som stacker?** Chef-
 * storefront har samme pattern og det får betydelig bedre add-again-rate
 * sammenliknet med flashmelding. Paper 4V6-0 viser stepper-stilen på
 * cart-siden — vi gjenbruker den her for konsistens.
 *
 * **Out-of-stock:** Knappen disables visuelt og annonserer "Utsolgt" i
 * stedet for CTA-tekst. `aria-disabled` framfor `disabled` så screen-readers
 * leser opp status-teksten.
 *
 * **Ingen variation-picker enda:** Variable products (product.type !== 'simple')
 * viser en info-linje om at variant må velges — denne flyten er TODO og
 * bygges sammen med variation-picker i senere iterasjon.
 */

import { clsx } from 'clsx';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Toast, useToast } from '@/components/ui/Toast';
import { WishlistButton } from '@/components/product/WishlistButton';

import { addToCart, setQuantity as setCartQuantity } from '@/lib/cart/api';
import { useCartItemQuantity } from '@/lib/cart/hooks';
import {
  buildSpecLineForProduct,
  pickBrandFromProduct,
  purchasableFromDetail,
} from '@/lib/cart/purchasable';
import type { CatalogProductDetail } from '@/lib/supabase/catalog';
import { buildCartItemKey } from '@/types/cart';
import { purchasableToCartItem } from '@/lib/cart/api';
import type { WishlistItem } from '@/types/wishlist';


export interface AddToCartButtonProps {
  product: CatalogProductDetail;
  /**
   * Full URL path til produktet (uten leading slash), brukes til å lagre
   * `productSlug` på CartItem slik at vi kan lenke tilbake fra cart-siden
   * selv når Woo-nested-path er ikke-trivielt å rekonstruere.
   */
  productPath: string;
  /** Primær-kategoris slug — lagres på CartItem for analytics-breakdowns. */
  categorySlug: string | null;
  /**
   * Valgfri queryID fra Algolia hvis brukeren kom direkte fra en
   * søke-treff-klikk. Ikke meningsfull på PDP i praksis, men holdt for
   * framtidig bruk (deep-link fra søkeresultat direkte til "Kjøp").
   */
  queryId?: string | null;
  className?: string;
  /** Valgfri — hvis oppgitt vises ønskeliste-knapp i default-state.
   *  Forsvinner automatisk når varen er lagt i kurv (C — Aka aktiv-state). */
  wishlistItem?: WishlistItem;
}

export function AddToCartButton({
  product,
  productPath,
  categorySlug,
  queryId = null,
  className,
  wishlistItem,
}: AddToCartButtonProps) {
  const purchasable = purchasableFromDetail(product);
  const [, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const { toastProps, showToast } = useToast();

  // Hooks må kalles ubetinget (Rules of Hooks). Bruk sentinel-key når produktet
  // ikke er kjøpbart (variable/grouped) — den keyen vil aldri være i kurven, så
  // `useCartItemQuantity` returnerer 0 i placeholder-grenen under.
  const key = purchasable ? buildCartItemKey(purchasable) : '__not_purchasable__';
  const inCart = useCartItemQuantity(key);

  // --- Edge cases som ikke tillater kjøp ---

  if (!purchasable) {
    // Variable / grouped product: placeholder inntil variation-picker bygges.
    return (
      <div
        className={clsx(
          'mt-8 border border-divider bg-surface-muted p-sp-4 text-body text-ink-muted',
          className,
        )}
        role="status"
      >
        Velg variant for å legge i handlekurv.
      </div>
    );
  }

  const outOfStock = purchasable.stockStatus === 'out_of_stock';
  const stockLimit = purchasable.stockQuantity ?? null;

  // Hent CartItem for `addToCart`. Bygges lazily i handlerne — ikke i render —
  // for å unngå allokering per render.
  const brand = pickBrandFromProduct(product);
  const specLine = buildSpecLineForProduct(product);

  const buildItem = (qty = 1) =>
    purchasableToCartItem(purchasable, {
      quantity: qty,
      productSlug: productPath,
      categorySlug,
      brand,
      specLine,
    });

  const handleAdd = () => {
    if (outOfStock) return;
    startTransition(() => {
      addToCart(buildItem(1), { queryID: queryId });
      // Kort visuell bekreftelse (500ms) før stepper tar over.
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 500);
      // Toast-notifikasjon — speiler WishlistButton-mønsteret. Gir
      // umiddelbar bekreftelse + en hurtig vei til handlekurven (lavere
      // friksjon for "se hva som er i kurven nå"-impulsen).
      showToast({
        variant: 'success',
        message: `${product.name} lagt i handlekurven`,
        action: { label: 'Gå til handlekurv →', href: '/handlekurv' },
      });
    });
  };

  const handleStepperChange = (next: number) => {
    startTransition(() => {
      setCartQuantity(key, next);
    });
  };

  // --- Out of stock ---

  if (outOfStock) {
    return (
      <div className={clsx('mt-8', className)}>
        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          disabled
          aria-disabled="true"
          className="cursor-not-allowed text-ink-muted opacity-60"
        >
          Utsolgt
        </Button>
        <p className="mt-2 text-body-sm text-ink-muted">
          Meld deg på for å bli varslet når produktet er tilbake på lager.
        </p>
      </div>
    );
  }

  // --- C — Aka: Aktiv (i kurv) — rød knapp beholder aka-farge
  //     Paper EAG-1: h-56px, bg-aka, pl-20 pr-6, gap-8
  //     Innhold: [sjekk-sirkel] [tekst flex-1] [stepper bg-black/15] [cart-nav bg-black/15]

  if (inCart > 0) {
    return (
      <>
      <div
        className={clsx('mt-8 flex h-14 items-center rounded-1 bg-aka pl-5 pr-1.5 gap-2', className)}
        aria-live="polite"
      >
        {/* Sjekk-sirkel (Paper EAH-1: 18×18) */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
          <circle cx="9" cy="9" r="8" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
          <path d="M5.5 9L7.5 11L12.5 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Tekst (Paper EAK-1: 15px bold white, flex-1, -0.01em) */}
        <span
          className="flex-1 font-bold text-white"
          style={{ fontSize: '15px', letterSpacing: '-0.01em', lineHeight: '18px' }}
        >
          Lagt i handlekurv
        </span>

        {/* Quantity stepper (Paper EAL-1: h-44, bg-black/15, rounded-1) */}
        <div className="flex h-11 items-center rounded-1" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
          <button
            type="button"
            onClick={() => handleStepperChange(inCart - 1)}
            aria-label="Fjern én"
            className="flex h-10 w-[38px] items-center justify-center text-white transition-opacity hover:opacity-70"
          >
            <MinusIcon />
          </button>
          <span
            className="w-6 shrink-0 text-center font-bold text-white"
            style={{ fontSize: '15px', lineHeight: '18px' }}
          >
            {inCart}
          </span>
          <button
            type="button"
            onClick={() => handleStepperChange(inCart + 1)}
            disabled={stockLimit !== null && inCart >= stockLimit}
            aria-label="Legg til én"
            className="flex h-10 w-[38px] items-center justify-center text-white transition-opacity hover:opacity-70 disabled:opacity-40"
          >
            <PlusIcon />
          </button>
        </div>

        {/* Cart-nav-knapp (Paper EAT-1: 44×44, bg-black/15, rounded-1) */}
        <a
          href="/handlekurv"
          aria-label="Gå til handlekurv"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-1 text-white transition-opacity hover:opacity-70"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
        >
          <CartNavIcon />
        </a>
      </div>
      {toastProps && <Toast {...toastProps} />}
      </>
    );
  }

  // --- C — Aka Default: h-56px rød knapp + ønskeliste-knapp ved siden
  //     Paper EA1-1: flex-1, h-56, bg-aka, rounded-1, justify-center
  //     Paper EA7-1: 56×56, border-2px solid ink, rounded-1

  return (
    <>
    <div className={clsx('mt-8 flex items-center gap-sp-2', className)}>
      <button
        type="button"
        onClick={handleAdd}
        aria-live="polite"
        className={clsx(
          'flex h-14 flex-1 items-center justify-center rounded-1 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          justAdded
            ? 'bg-surface-contrast'
            : 'bg-aka hover:bg-aka-dark',
        )}
      >
        <span
          className="font-bold text-white"
          style={{ fontSize: '15px', letterSpacing: '-0.01em', lineHeight: '18px' }}
        >
          {justAdded ? 'Lagt til!' : 'Legg i handlekurv'}
        </span>
      </button>

      {/* Ønskeliste-knapp — kun i default-state (Paper EA7-1: 56×56, border-2px-kuro) */}
      {wishlistItem && (
        <WishlistButton item={wishlistItem} size="lg" />
      )}
    </div>
    {toastProps && <Toast {...toastProps} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ikoner
// ---------------------------------------------------------------------------

function CartNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
      <path d="M2 2h2.5l2 8H13l2-5.5H5.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="14.5" r="1" fill="white" />
      <circle cx="13" cy="14.5" r="1" fill="white" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 2v8M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
