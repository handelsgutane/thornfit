'use client';

/**
 * TrackedProductLink — tynn client-wrapper rundt `next/link` som fyrer
 * `select_item`-event ved klikk.
 *
 * Hvorfor egen komponent i stedet for å markere `ProductGrid` som
 * `'use client'`: å konvertere hele gridet til client-rendering tar bort
 * server-rendret HTML fra katalog-sider, som er SEO-kritisk (per
 * CLAUDE.md-regelen "frontend skal aldri kalle Woo direkte på request-tid,
 * men server-rendret HTML av Supabase-data er eksplisitt ønsket").
 *
 * Denne komponenten løser det: server-component renderer vanlige `<Link>`-
 * relaterte props (href, className, children), kun onClick-bindingen kjører
 * i klienten. Ingen ekstra roundtrip, ingen hydration-kostnad utover den
 * lille boundary-en.
 *
 * Props speiler en subset av next/link. Ekstender med flere props etter behov.
 */

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';

import { track } from '@/lib/analytics/emitter';
import type { AnalyticsItem } from '@/lib/analytics/events';

export interface TrackedProductLinkProps {
  href: string;
  item: AnalyticsItem;
  /** Listens ID — samme konvensjon som `view_item_list.listId`. */
  listId: string;
  /** 0-indeksert posisjon i listen slik brukeren så den. */
  position: number;
  className?: string;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export function TrackedProductLink({
  href,
  item,
  listId,
  position,
  className,
  children,
  onClick,
}: TrackedProductLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Fyre analytics før navigasjon. `next/link` gjør client-side route-
    // endring og rekker derfor å sende eventet før siden bytter. Hvis bruker
    // cmd-klikker (åpner ny fane) kjører vi fortsatt eventet — de så kortet
    // og valgte det, uavhengig av om denne faneseansen fortsetter dit.
    track({
      name: 'select_item',
      payload: { item, listId, position },
    });
    onClick?.(e);
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
