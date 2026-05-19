/**
 * ArticleProductSuggestions — "Relaterte produkter"-blokk inne i artikkel.
 *
 * Layout:
 *   - Full-bleed beige (canvas) bakgrunn — strekker seg helt til viewport-
 *     kantene via negativ margin som matcher artikkel-sidens horisontale
 *     padding (px-sp-3 / md:px-sp-7 / lg:px-16).
 *   - Header med "RELATERTE PRODUKTER" eyebrow + "Se alle →" høyrejustert.
 *   - Vertikal liste — hver rad er et hvitt kort (bg-surface) med thumbnail,
 *     brand + navn (venstre/midten), pris + Legg-i-kurv-knapp (høyre).
 *
 * "Legg i kurv"-knappen er reell — den legger produktet i kurven og fyrer
 * en toast. Klient-komponent under (`ProductRow`) eier den interaktive
 * delen; selve shell-komponenten er server-rendret.
 */

import Link from 'next/link';

import type { CatalogListItem } from '@/lib/supabase/catalog';

import { ProductRow } from './ArticleProductSuggestionsRow';

interface ArticleProductSuggestionsProps {
  products: CatalogListItem[];
  /** Lenke for "Se alle →" — typisk en kategori-side. Skjul hvis null. */
  seeAllHref?: string | null;
  className?: string;
}

export function ArticleProductSuggestions({
  products,
  seeAllHref,
  className,
}: ArticleProductSuggestionsProps) {
  if (products.length === 0) return null;

  return (
    <aside
      aria-label="Relaterte produkter"
      // Full-bleed: negative margins som matcher artikkel-sidens horisontale
      // padding så bg-canvas strekker seg helt til viewport-kant. Internt
      // padding bringer header og rader tilbake til samme content-bredde
      // som resten av artikkelen.
      // min-w-0 så seksjonen kan krympe i grid/flex-foreldre.
      className={[
        'relative mt-sp-7 min-w-0 bg-canvas',
        '-mx-5 px-5 py-5',                            /* paper-exact: EZ7-0 F2S-0 (mobile px/py 20) */
        'md:-mx-sp-7 md:px-sp-7 md:py-sp-6',
        'lg:-mx-16 lg:px-16',
        className ?? '',
      ].join(' ')}
    >
      <header className="mb-sp-4 flex items-center justify-between">
        <span
          className="font-bold uppercase tracking-wider text-ink-muted md:text-body-xs"
          style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.05em' }}
        >
          Relaterte produkter
        </span>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="font-bold text-aka hover:underline md:text-body-sm"
            style={{ fontSize: '13px', lineHeight: '16px' }}
          >
            Se alle <span aria-hidden>→</span>
          </Link>
        )}
      </header>

      <ul className="flex flex-col gap-sp-3">
        {products.map((p) => (
          <ProductRow key={p.id} product={p} />
        ))}
      </ul>
    </aside>
  );
}
