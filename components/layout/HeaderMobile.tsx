'use client';

/**
 * HeaderMobile — kompakt top-bar for mobil. Paper-ref `G3-0`.
 *
 * Client-komponent fordi hamburger-knappen snakker med `MobileDrawer` via
 * context.
 *
 * Spec (fra Paper G3-0):
 *   - Høyde: 60px (`h-mobile-header`)
 *   - Layout: [hamburger 40×40] [logo sentrert 130×20] [søk 40×40 + kurv 40×40]
 *   - Ingen konto-ikon — kontoen er i drawer-footeren
 *
 * Synlighet: `md:hidden` — DOM-rendret også på desktop men CSS-skjult.
 */

import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';
import { HeaderCartLink } from '@/components/cart/HeaderCartLink';
import { SearchOverlayTrigger } from '@/components/search/SearchOverlayProvider';

import { IconCart, IconMenu, IconSearch } from './icons';
import { useMobileDrawer } from './MobileDrawer';

export function HeaderMobile() {
  const { setOpen } = useMobileDrawer();

  return (
    <div className="flex h-mobile-header items-center border-b border-divider bg-surface px-sp-3 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Åpne meny"
        className="flex h-10 w-10 items-center justify-center text-ink"
      >
        <IconMenu size={20} />
      </button>

      <div className="flex flex-1 items-center justify-center text-ink">
        <Link href="/" aria-label="Skarpekniver — forside">
          {/*
           * Logo-høyde i mobil-nav. Paper G3-0 spesifiserer 130×20 (h-5), men
           * etter produkt-feedback er logoen bumpet til h-7 (28px → ~178×28 ved
           * 6.35:1) for bedre lesbarhet. Fortsatt god margin i h-mobile-header (60px).
           */}
          <Logo variant="mobile" className="h-7 w-auto" />
        </Link>
      </div>

      <div className="flex items-center">
        <SearchOverlayTrigger
          ariaLabel="Søk"
          className="flex h-10 w-10 items-center justify-center text-ink"
        >
          <IconSearch size={18} />
        </SearchOverlayTrigger>
        <HeaderCartLink variant="icon">
          <IconCart size={18} />
        </HeaderCartLink>
      </div>
    </div>
  );
}
