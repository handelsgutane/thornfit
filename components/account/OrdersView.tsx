/**
 * OrdersView — klient-island som kombinerer tabell + tom-state +
 * "Vis flere ordrer"-paginering (Paper 6B7-0 6GJ-0).
 *
 * Server-siden sender ned hele ordre-listen (vi henter inntil 20 stk per
 * page).
 *
 * Paginering: vi viser 5 ordrer av gangen (Paper 6B7-0 viser 5 rader før
 * "Vis flere ordrer"-knappen). Klikk på knappen øker batch med 5 til vi
 * viser alle. Når kundene har 20+ ordrer går vi over til server-side
 * paginering; inntil da holder denne enkle løsningen.
 *
 * NB: Søk-input er fjernet i denne iterasjonen (per Alexander). Copy-
 * strenger og `getOrderStatus`-helper ligger fortsatt i
 * `lib/account/info.ts` hvis vi vil resurrekte søket senere.
 */

'use client';

import { useState } from 'react';

import {
  ORDERS_EMPTY_CTA_HREF,
  ORDERS_EMPTY_CTA_LABEL,
  ORDERS_EMPTY_SUBTITLE,
  ORDERS_EMPTY_TITLE,
  ORDERS_LOAD_MORE_LABEL,
} from '@/lib/account/info';
import { cn } from '@/lib/utils/cn';
import type { OrderListRow } from '@/lib/woo/orders';

import { AccountIcon } from './AccountIcon';
import { OrdersHeader } from './OrdersHeader';
import { OrdersList } from './OrdersList';
import { OrdersTable } from './OrdersTable';

interface OrdersViewProps {
  readonly orders: readonly OrderListRow[];
}

const INITIAL_VISIBLE = 5;
const LOAD_MORE_INCREMENT = 5;

export function OrdersView({ orders }: OrdersViewProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visible = orders.slice(0, visibleCount);
  const hasMore = orders.length > visibleCount;

  if (orders.length === 0) {
    return (
      <>
        <OrdersHeader count={0} />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <OrdersHeader count={orders.length} />

      <OrdersTable orders={visible} />
      <OrdersList orders={visible} />
      {hasMore && (
        <LoadMoreButton
          onClick={() => setVisibleCount((n) => n + LOAD_MORE_INCREMENT)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LoadMoreButton — outlined "Vis flere ordrer" m. chevron-down. To form-
// faktorer mot Paper:
//   - Desktop (Paper 6GK-0): 147×38, kompakt, sentrert under tabellen.
//     `text-body-xs font-medium` med 12px chevron.
//   - Mobile (Paper B6Q-0 B8U-0): 350×46 — full-bredde card med 14px bold
//     tekst og 14px chevron, padding 24px×20px på containeren.
// Begge i `bg-surface`, `border-divider`, `rounded-1`. Hover-state er gated
// på pointer-fine for å unngå sticky-state på tap-only enheter.
// ---------------------------------------------------------------------------

function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="-mx-sp-3 flex justify-center px-5 pt-sp-5 pb-sp-4 md:-mx-sp-7 lg:mx-0 lg:px-0 lg:pb-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center justify-center gap-sp-2 rounded-1 border border-divider bg-surface',
          'transition-colors hover:bg-surface-hover',
          // Mobile-default: full-bredde 350×46, 14px bold
          'h-(--height-load-more-btn-mobile) w-full max-w-(--width-load-more-btn-mobile)',
          'text-body-sm font-bold text-ink',
          // Desktop: kompakt 147×38, 13px medium
          'lg:h-(--height-load-more-btn) lg:w-(--width-load-more-btn) lg:max-w-none',
          'lg:gap-sp-1 lg:text-body-xs lg:font-medium',
        )}
      >
        {ORDERS_LOAD_MORE_LABEL}
        <span className="flex items-center text-ink-muted" aria-hidden>
          <ChevronDown />
        </span>
      </button>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="size-3.5 shrink-0 lg:size-3"
    >
      <polyline
        points="3,5 6,8 9,5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-sp-4 rounded-1 border border-divider bg-surface px-sp-5 py-sp-7 text-center">
      <div
        className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted"
        aria-hidden
      >
        <AccountIcon id="package" size={24} />
      </div>
      <div className="flex flex-col gap-sp-1">
        <h2 className="text-h3 font-bold text-ink">{ORDERS_EMPTY_TITLE}</h2>
        <p className="text-body-sm text-ink-muted">{ORDERS_EMPTY_SUBTITLE}</p>
      </div>
      <a
        href={ORDERS_EMPTY_CTA_HREF}
        className="inline-flex h-(--height-auth-cta) items-center rounded-1 bg-aka px-sp-4 text-body-sm font-bold text-shiro hover:bg-aka-dark"
      >
        {ORDERS_EMPTY_CTA_LABEL}
      </a>
    </div>
  );
}

