'use client';

/**
 * ProductRow — én rad i ArticleProductSuggestions med reell add-to-cart.
 *
 * Bygger en `CartItem` direkte fra `CatalogListItem`-data (vi har ikke full
 * `Purchasable` her, men feltene vi trenger — id, name, slug, pris, bilde —
 * finnes på list-item-shapen). For variable produkter (variationer) blir
 * dette en simplification: vi bruker primær-pris og null variationId, så
 * brukeren kan oppleve å få "feil" variant lagt i kurv. For artikkel-
 * konteksten er det akseptabelt — kniv-tilbehør og slipesteiner er primært
 * `simple` produkter.
 *
 * Toast-bekreftelse fyres via `useToast` (samme mønster som AddToCartButton
 * på PDP).
 */

import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';

import { Toast, useToast } from '@/components/ui/Toast';
import { addToCart } from '@/lib/cart/api';
import type { CatalogListItem } from '@/lib/supabase/catalog';
import type { CartItem } from '@/types/cart';

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

export function ProductRow({ product: p }: { product: CatalogListItem }) {
  const [, startTransition] = useTransition();
  const { toastProps, showToast } = useToast();

  const onSale =
    p.salePrice !== null &&
    p.regularPrice !== null &&
    p.salePrice < p.regularPrice;
  const displayPrice = onSale ? (p.salePrice as number) : (p.price ?? p.regularPrice ?? 0);
  const regularPrice = p.regularPrice ?? p.price ?? 0;
  const productHref = p.primaryCategoryPath
    ? `/${p.primaryCategoryPath}/${p.slug}`
    : `/${p.slug}`;

  // Brand-label hentes fra pa_merke-attributtet hvis det er synket; ellers
  // bruker vi primær-kategoriens slug som best-effort label.
  const brandLabel =
    p.filterValues?.pa_merke?.values?.[0] ??
    (p.primaryCategorySlug ? p.primaryCategorySlug.replace(/-/g, ' ') : null);

  const outOfStock = p.stockStatus === 'out_of_stock';

  const handleAdd = () => {
    if (outOfStock) return;
    const item: CartItem = {
      key: String(p.id),
      productId: p.id,
      variationId: null,
      sku: null,
      name: p.name,
      quantity: 1,
      unitPrice: displayPrice,
      regularPrice,
      imageUrl: p.primaryImage?.src ?? null,
      productSlug: productHref.replace(/^\//, ''),
      categorySlug: p.primaryCategorySlug ?? null,
      brand: brandLabel ?? null,
      specLine: null,
    };
    startTransition(() => {
      addToCart(item);
      showToast({
        variant: 'success',
        message: `${p.name} lagt i handlekurven`,
        action: { label: 'Gå til handlekurv →', href: '/handlekurv' },
      });
    });
  };

  return (
    <>
      <li className="flex items-center gap-sp-3 rounded-1 bg-surface p-sp-3">
        {/* Thumbnail — 56px på mobil (Paper EZ7-0 F2X-0), 64px på desktop. */}
        <Link
          href={productHref}
          aria-label={p.name}
          className="relative size-14 shrink-0 overflow-hidden rounded-1 bg-surface-muted md:size-16"
        >
          {p.primaryImage?.src && (
            <Image
              src={p.primaryImage.src}
              alt={p.primaryImage.alt || p.name}
              fill
              sizes="(min-width: 768px) 64px, 56px"
              className="object-cover"
            />
          )}
        </Link>

        {/* Info-kolonne (venstre/midten). flex-1 min-w-0 så lange titler
            trunkerer i stedet for å presse pris-kolonnen ut.
            Mobil bruker 1px mindre på alle tekster vs. desktop (Paper EZ7-0
            F2Z-0/F30-0). */}
        <div className="min-w-0 flex-1">
          {brandLabel && (
            <span
              className="block truncate font-bold uppercase tracking-wider text-ink-muted md:text-label-sm"
              style={{ fontSize: '9px', lineHeight: '12px', letterSpacing: '0.1em' }}
            >
              {brandLabel}
            </span>
          )}
          <Link href={productHref} className="block">
            <h3
              className="line-clamp-2 font-bold text-ink hover:text-aka md:text-body"
              style={{ fontSize: '13px', lineHeight: '17px' }}
            >
              {p.name}
            </h3>
          </Link>
        </div>

        {/* Høyre-kolonne — pris over CTA-knapp. items-end stiller alt
            høyrejustert i forhold til de bredeste elementene. */}
        <div className="flex shrink-0 flex-col items-end gap-sp-2">
          {/* Pris — mobil 1px mindre enn desktop */}
          <div className="flex items-baseline gap-sp-2">
            {onSale && p.regularPrice !== null && (
              <span
                className="text-ink-muted line-through md:text-body-xs"
                style={{ fontSize: '12px', lineHeight: '16px' }}
              >
                {nok.format(p.regularPrice)}
              </span>
            )}
            <span
              className={[
                'font-bold tabular-nums md:text-body',
                onSale ? 'text-aka' : 'text-ink',
              ].join(' ')}
              style={{ fontSize: '15px', lineHeight: '20px' }}
            >
              {nok.format(displayPrice)}
            </span>
          </div>

          {/* Legg i kurv-knapp — full rød CTA. `aria-disabled` brukes for
              utsolgt så skjermlesere får riktig annonsering. Mobil bruker
              1px mindre tekst enn desktop. */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            aria-disabled={outOfStock}
            className="rounded-1 bg-aka px-sp-3 py-sp-2 font-bold text-shiro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:text-body-sm"
            style={{ fontSize: '13px', lineHeight: '17px' }}
          >
            {outOfStock ? 'Utsolgt' : 'Legg i kurv'}
          </button>
        </div>
      </li>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}
