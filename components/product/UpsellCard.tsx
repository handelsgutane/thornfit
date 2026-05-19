'use client';

/**
 * UpsellCard — "Vil du ha med?" boks på produktdetaljen (Paper 28D-0 → DHJ-1).
 *
 * Viser ett tilleggs-produkt med thumbnail, navn, pris og en checkbox
 * "Legg til <produktnavn>". Når brukeren huker på, legges produktet rett
 * i kurven (samme som ProductGrid sin wishlist-knapp). Når brukeren huker
 * av, fjernes det. Synker derfor mot cart-store, ikke lokal state — så
 * boksen reflekterer riktig tilstand selv hvis brukeren ser produktet
 * etter at de allerede har lagt det i kurv et annet sted.
 *
 * Oppførsel matcher Paper-designet hvor det ikke er en "buy together"-knapp:
 * checkboxen ER add-knappen.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';

import { Toast, useToast } from '@/components/ui/Toast';
import { useCartItemQuantity } from '@/lib/cart/hooks';
import {
  addToCart,
  purchasableToCartItem,
  removeFromCart,
} from '@/lib/cart/api';
// Type-only import — verdier (extractImages osv.) lever i server-only
// catalog.ts og kan ikke importeres i client components. Vi inliner i stedet.
import type { CatalogProductDetail } from '@/lib/supabase/catalog';
import { purchasableFromDetail } from '@/lib/cart/purchasable';
import { buildCartItemKey } from '@/types/cart';

interface ExtractedImage { src: string; alt: string }

/** Inline-versjon av lib/supabase/catalog#extractImages — pure, ingen
 *  server-imports. Hentet hit så client-bundle ikke drar inn server-only. */
function pickFirstImage(images: unknown): ExtractedImage | null {
  if (!Array.isArray(images)) return null;
  for (const img of images as Array<{ src?: unknown; alt?: unknown }>) {
    if (typeof img?.src === 'string' && img.src.length > 0) {
      return {
        src: img.src,
        alt: typeof img.alt === 'string' ? img.alt : '',
      };
    }
  }
  return null;
}

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

interface UpsellCardProps {
  /** Tilleggs-produktet som skal foreslås. */
  upsellProduct: CatalogProductDetail;
  /** Produkt-pathen til upsellet (uten leading slash) — for "Se produkt"-lenken. */
  upsellPath: string;
}

export function UpsellCard({ upsellProduct, upsellPath }: UpsellCardProps) {
  const purchasable = purchasableFromDetail(upsellProduct);
  const { toastProps, showToast } = useToast();
  const [, startTransition] = useTransition();

  // Hooks må kalles ubetinget — bygg trygg sentinel-key hvis upsellet ikke er
  // kjøpbart (f.eks. variable produkt). Da viser vi heller ingen checkbox.
  const cartKey = purchasable
    ? buildCartItemKey(purchasable)
    : '__upsell_not_purchasable__';
  const inCart = useCartItemQuantity(cartKey);
  const isInCart = inCart > 0;

  if (!purchasable) {
    // Variabel-produkt eller noe annet uvarisk — skjul hele boksen.
    return null;
  }

  const image = pickFirstImage(upsellProduct.images);
  const checkboxLabel = `Legg til ${upsellProduct.name.toLowerCase()}`;

  function handleToggle() {
    startTransition(() => {
      if (isInCart) {
        removeFromCart(cartKey);
        showToast({ variant: 'info', message: 'Fjernet fra kurven' });
      } else {
        const item = purchasableToCartItem(purchasable!, {
          quantity: 1,
          productSlug: upsellPath,
          categorySlug: upsellProduct.primaryCategorySlug,
        });
        addToCart(item);
        showToast({
          variant: 'success',
          message: `${upsellProduct.name} lagt i kurven`,
        });
      }
    });
  }

  return (
    <>
      <div className="mb-sp-3 rounded-1 border border-divider p-sp-3">
        <span
          style={{ fontSize: 'var(--text-label)', letterSpacing: '0.1em', lineHeight: '14px' }}
          className="mb-sp-2 block font-bold uppercase text-ink-muted"
        >
          Vil du ha med?
        </span>

        <div className="flex items-center gap-sp-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-1 bg-surface-muted">
            {image?.src && (
              <Image
                src={image.src}
                alt={image.alt || upsellProduct.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body-xs font-bold text-ink truncate">
              {upsellProduct.name}
            </p>
            <p className="text-body-xs text-ink-muted">
              {upsellProduct.price !== null ? nok.format(upsellProduct.price) : ''}
            </p>
          </div>
          <Link
            href={`/${upsellPath}`}
            className="text-body-xs font-medium text-aka hover:underline shrink-0"
          >
            Se produkt →
          </Link>
        </div>

        {/* Checkbox-rad — selve add/remove-toggle'en. */}
        <label className="mt-sp-2 flex cursor-pointer items-center gap-sp-2 select-none">
          <input
            type="checkbox"
            checked={isInCart}
            onChange={handleToggle}
            aria-label={checkboxLabel}
            className="size-[18px] cursor-pointer accent-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
          />
          <span className="text-body-xs text-ink">{checkboxLabel}</span>
        </label>
      </div>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}
