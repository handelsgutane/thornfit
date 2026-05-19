'use client';

/**
 * IconButton — rund ikonknapp. Delt primitiv for kompakte handlinger som
 * ikke trenger tekst-label (navigering, lukk, reset, etc.).
 *
 * Varianter (dikterer bare utseendet — klikk-håndtering er alltid lik):
 *
 *   - `default`: bordered circle. Default-fyll er surface + text-ink; på
 *     hover flipper den til aka-bakgrunn + shiro ikon. Brukes når knappen
 *     bør trekke øyet mot seg — typisk neste-pil på en lenkerad eller
 *     primær handling i en toolbar.
 *
 *   - `ghost`: ingen ramme og ingen bakgrunn i default-tilstand. Bruker
 *     ink-muted for ikonet. På hover får den lett surface-muted bakgrunn
 *     og full ink-kontrast. Brukes når knappen sitter inn i et eksisterende
 *     element (header-bar, input-rad) og ikke skal konkurrere med nabo-
 *     komponenter visuelt.
 *
 * Størrelser:
 *   - `sm` = 32px. Tette UI-flater (rad-handlinger, overlay-chrome).
 *   - `md` = 36px. Default. Brukes i mega-menu / overlay-avslutninger.
 *
 * Tilgjengelighet: `aria-label` er påkrevd fordi ikonet typisk er
 * aria-hidden. Ikonet self-colors via `currentColor` — gi ikonfunksjonene
 * `stroke="currentColor"` eller `fill="currentColor"`, ikke hardkodete farger.
 *
 * Brukes av:
 *   - SearchOverlayDesktop (lukk-knapp i input-bar, neste-pil "Se alle")
 *   - Flere kommer etter hvert som andre overlayer får samme mønster.
 */

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Variant = 'default' | 'ghost';
type Size = 'sm' | 'md';

type IconButtonProps = ComponentPropsWithoutRef<'button'> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Påkrevd for icon-only knapper (WCAG 2.4.4 / 4.1.2). */
  'aria-label': string;
};

const baseClasses =
  'inline-flex shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

const variantClasses: Record<Variant, string> = {
  default:
    'border border-divider bg-surface text-ink hover:border-aka hover:bg-aka hover:text-shiro',
  ghost:
    'text-ink-muted hover:bg-surface-muted hover:text-ink',
};

export function IconButton({
  children,
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={[
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * `IconButtonCircle` — visuell-bare versjon av `default`-varianten, ment
 * for bruk inni en `<Link>` der hele raden er ett klikkbart mål og
 * ikon-sirkelen kun rumler visuelt. Invalid HTML hvis rendered som
 * `<button>` inni `<a>`, derfor er dette en `<span>`.
 *
 * For at sirkelen skal reagere på hover-state til foreldre-Linken, sett
 * `group`-klassen på Linken og bruk `group-hover:*`-varianter automatisk
 * — de er inkludert i default-stylingen.
 */
export function IconButtonCircle({
  children,
  size = 'md',
  className,
}: {
  children: ReactNode;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full border border-divider bg-surface text-ink transition-colors group-hover:border-aka group-hover:bg-aka group-hover:text-shiro',
        sizeClasses[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
