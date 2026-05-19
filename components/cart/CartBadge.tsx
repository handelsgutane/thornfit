'use client';

/**
 * CartBadge — liten rød badge med antall varer i kurven.
 *
 * Client-komponent som leser fra Zustand. Rendres inn i Header-kurv-knappen
 * (desktop + mobile) og i MobileDrawer "Se din kurv"-knappen.
 *
 * **Hydration-guard:** Før `useCartHydrated()` er `true`, skjuler vi badge-en
 * helt (returnerer `null`). Hvis vi render '0' eller en placeholder før
 * hydration får brukeren en flash "0 → N" når localStorage rehydrerer. Å
 * skjule er den tryggeste defaulten for en ikke-kritisk visuell state.
 */

import { useCartCount, useCartHydrated } from '@/lib/cart/hooks';

export interface CartBadgeProps {
  /**
   * Styling-varianter. Desktop bruker aka/shiro (rød med hvit tekst), mobile
   * har samme men litt mindre. "text" varianten vises i MobileDrawer som
   * "(N varer)" inline i en lengre CTA.
   */
  variant?: 'pill' | 'text';
  className?: string;
}

export function CartBadge({ variant = 'pill', className }: CartBadgeProps) {
  const hydrated = useCartHydrated();
  const count = useCartCount();

  if (!hydrated || count === 0) return null;

  if (variant === 'text') {
    return (
      <span className={className}>
        {' '}
        ({count} {count === 1 ? 'vare' : 'varer'})
      </span>
    );
  }

  const twoDigit = count >= 10;
  // Grid place-items-center + flex-shrink-0 hindrer at parent-flex skviser
  // badgen til oval. Kvadratisk boks ensures en ekte sirkel for ensifrede
  // tall; pill-form (min-w + px) først når count ≥ 10.
  const shape = twoDigit
    ? 'h-(--size-badge) min-w-(--size-badge) px-sp-2' /* paper-exact: B8-0 — pill-form for 10+ */
    : 'h-(--size-badge) w-(--size-badge)'; /* paper-exact: B8-0 — ekte sirkel for ensifret */
  // text-muted-sm (12px) Satoshi-Bold — tallet er ca. halvparten av badge-
  // diameteren (22px). Justert ned fra text-body-sm (14px) 2026-04-24 i
  // takt med at badge-sirkelen krympet fra 28→22. tracking-normal unngår
  // tracking fra label-tokens; leading-none stacker tallet vertikalt i sirkelen.
  const typo =
    'text-muted-sm font-bold leading-none tabular-nums tracking-normal'; /* paper-exact: B8-0 */

  return (
    <span
      aria-hidden
      className={[
        'grid flex-shrink-0 place-items-center rounded-full bg-aka text-shiro',
        shape,
        typo,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {count}
    </span>
  );
}

/**
 * Live aria-label som speiler live count. Brukes på wrapper-linken
 * (Link/button) slik at screen-readers hører "Kurv — 3 varer" uten å ha
 * badge-en som egen fokusbar node.
 */
export function useCartAriaLabel(): string {
  const hydrated = useCartHydrated();
  const count = useCartCount();
  if (!hydrated || count === 0) return 'Kurv';
  return `Kurv — ${count} ${count === 1 ? 'vare' : 'varer'}`;
}
