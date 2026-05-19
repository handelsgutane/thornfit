'use client';

/**
 * HeaderCartLink — cart-icon med live count-badge.
 *
 * Wraps `<Link href="/handlekurv">` med:
 *   - Dynamisk `aria-label` (antall varer speilet til screen-readers)
 *   - Live `<CartBadge />` floater på top-right av icon-knappen (kun synlig
 *     når count > 0 og etter hydration)
 *   - Ingen count-flash ved første render (se `useCartHydrated`)
 *
 * **To varianter:** Strukturelt identiske (begge = icon-only 40×40 med
 * floating badge). Skilles kun på icon-størrelsen: `desktop` bruker
 * `<IconCart size={18} />`, `icon` (mobile) `size={18}` eller tilsvarende
 * passed inn som children. Tidligere hadde `desktop` en dark pill med "Kurv"-
 * label — fjernet 2026-04-24 etter design-review: icon-only matcher Paper-
 * mockup bedre, gir renere header og unngår duplikasjon mellom pill-label
 * og den prominente badgen. Variant-prop-en beholdes for API-stabilitet.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { CartBadge, useCartAriaLabel } from './CartBadge';

export interface HeaderCartLinkProps {
  variant: 'desktop' | 'icon';
  /** Icon-node — server-rendret SVG injectes inn via children. */
  children: ReactNode;
  className?: string;
}

export function HeaderCartLink({
  children,
  className,
}: HeaderCartLinkProps) {
  const ariaLabel = useCartAriaLabel();

  return (
    <Link
      href="/handlekurv"
      aria-label={ariaLabel}
      className={`relative flex h-10 w-10 items-center justify-center text-ink hover:bg-surface-hover ${className ?? ''}`}
    >
      {children}
      <span className="absolute right-0 top-0">
        <CartBadge />
      </span>
    </Link>
  );
}
