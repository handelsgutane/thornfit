/**
 * OrdersTable — desktop tabell-visning av ordrer (Paper 6B7-0 6EO-0).
 *
 * Verifisert mot Paper 6B7-0:
 *   - Tabell-card: bg-surface, border-divider, rounded-1, overflow-clip.
 *   - Header-rad (6EP-0): bg-canvas, border-b-divider, py-2.5 px-5,
 *     11px BOLD UPPERCASE tracking-[0.08em] muted-tekst.
 *   - Body-rad (6EV-0/6F7-0/...): py-4 px-5, border-b i CANVAS-fargen
 *     (#F5F5F3) — lysere enn divideren mellom header/body. Siste rad har
 *     INGEN border-b.
 *   - 5 kolonner med fast bredde (130 / flex / 110 / 110 / 100):
 *       Ordrenr | Produkter (2-linjers) | Dato | Status (pill) | Total (2-linjers)
 *   - INGEN produkt-thumbnails. Produkter-cellen er ren tekst:
 *       linje 1: produktnavn (13px ink eller muted hvis kansellert)
 *       linje 2: "+ N produkter til" / "1 produkt" / "N produkter"
 *   - Total-cellen er to-linjers:
 *       linje 1: pris 14px bold (muted hvis kansellert)
 *       linje 2: "Se detaljer →" 11px muted
 *
 * Synlighet: `hidden lg:flex` — på mobil bruker vi `OrdersList`.
 *
 * Server-komponent. Ordrer kommer ferdig-mappet fra `fetchUserOrders()`. Søk
 * er klient-side (parent håndterer state og sender filtrert liste).
 *
 * NB: Vi bruker `<div role="table">` istedenfor semantisk `<table>` fordi
 * radene har 2-linjers innhold som er enklere å layouten med flex/gap. Roller
 * settes for screenreader-eksponering.
 */

import Link from 'next/link';

import {
  ORDERS_SEE_DETAILS_LABEL,
  ORDERS_TABLE_HEADERS,
  getOrderItemsRemainderLabel,
  getOrderItemsCountLabel,
  getOrderStatus,
} from '@/lib/account/info';
import { cn } from '@/lib/utils/cn';
import { formatPrice } from '@/lib/utils/format-price';
import type { OrderListRow } from '@/lib/woo/orders';

import { Tag } from '@/components/ui/Tag';

interface OrdersTableProps {
  readonly orders: readonly OrderListRow[];
}

// Column-bredder (paper-exact mot 6EQ-0/6ER-0/6ES-0/6ET-0/6EU-0):
// 130 / grow / 110 / 110 / 100. Tailwind v4 spacing er 0.25rem-multiplum,
// så w-32.5=130px, w-27.5=110px, w-25=100px.
const COL_NUM = 'w-32.5 shrink-0';
const COL_PRODUCTS = 'min-w-0 grow shrink basis-0';
const COL_DATE = 'w-27.5 shrink-0';
const COL_STATUS = 'w-27.5 shrink-0';
const COL_TOTAL = 'w-25 shrink-0';

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div
      role="table"
      aria-label="Dine ordrer"
      className="hidden overflow-clip rounded-1 border border-divider bg-surface lg:flex lg:flex-col"
    >
      {/* Header-rad */}
      <div
        role="row"
        className="flex border-b border-divider bg-canvas py-2.5 px-5"
      >
        <Th className={COL_NUM}>{ORDERS_TABLE_HEADERS.number}</Th>
        <Th className={COL_PRODUCTS}>{ORDERS_TABLE_HEADERS.products}</Th>
        <Th className={COL_DATE}>{ORDERS_TABLE_HEADERS.date}</Th>
        <Th className={COL_STATUS}>{ORDERS_TABLE_HEADERS.status}</Th>
        <Th className={COL_TOTAL}>{ORDERS_TABLE_HEADERS.total}</Th>
      </div>

      {/* Body-rader */}
      {orders.map((order, idx) => (
        <OrderRow
          key={order.id}
          order={order}
          isLast={idx === orders.length - 1}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      role="columnheader"
      // Leser tokenet via `var(...)` direkte. Se Pill.tsx for kontekst:
      // Tailwind v4 + Turbopack kan miste utility-klasser fra @theme i dev,
      // men :root-variabelen oppdaterer pålitelig. Verdien bor i @theme.
      style={{
        fontSize: 'var(--text-table-header)',
        lineHeight: 'var(--text-table-header--line-height)',
        letterSpacing: 'var(--text-table-header--letter-spacing)',
      }}
      className={cn('font-bold uppercase text-ink-muted', className)}
    >
      {children}
    </span>
  );
}

function OrderRow({
  order,
  isLast,
}: {
  order: OrderListRow;
  isLast: boolean;
}) {
  const status = getOrderStatus(order.status);
  const detailHref = `/konto/ordrer/${order.id}`;
  // Kansellerte/refunderte ordrer dempes — Paper 6G7-0 viser produktnavn og
  // total i muted gray for å signalisere at raden er "død".
  const isMuted = status.variant === 'danger';

  const remainder = getOrderItemsRemainderLabel(order.itemCount);
  const subLine = remainder ?? getOrderItemsCountLabel(order.itemCount);

  return (
    <Link
      href={detailHref}
      role="row"
      className={cn(
        'flex items-center py-sp-3 px-5 transition-colors hover:bg-surface-hover',
        !isLast && 'border-b border-canvas',
      )}
    >
      {/* Ordrenr — 13px bold ink */}
      <span
        role="cell"
        className={cn(
          'text-body-xs font-bold text-ink',
          COL_NUM,
        )}
      >
        #{order.number}
      </span>

      {/* Produkter — 2-linjers (navn + count) */}
      <div role="cell" className={cn('flex flex-col gap-px', COL_PRODUCTS)}>
        <span
          className={cn(
            'truncate text-body-xs',
            isMuted ? 'text-ink-muted' : 'text-ink',
          )}
        >
          {order.firstItemName ?? '—'}
        </span>
        <span className="truncate text-muted-sm text-ink-muted">
          {subLine}
        </span>
      </div>

      {/* Dato — `--text-date` (11px) muted. Egen token for å kunne tune
          dato-tekst uten å påvirke andre `text-body-xs`-bruk. */}
      <span
        role="cell"
        style={{
          fontSize: 'var(--text-date)',
          lineHeight: 'var(--text-date--line-height)',
        }}
        className={cn('text-ink-muted', COL_DATE)}
      >
        {formatDate(order.createdAt)}
      </span>

      {/* Status — bordered pill */}
      <span role="cell" className={COL_STATUS}>
        <Tag variant={status.variant}>
          {status.label}
        </Tag>
      </span>

      {/* Total — 2-linjers (pris + Se detaljer →), right-aligned */}
      <div
        role="cell"
        className={cn('flex flex-col items-end gap-px', COL_TOTAL)}
      >
        <span
          className={cn(
            'text-body-sm font-bold',
            isMuted ? 'text-ink-muted line-through' : 'text-ink',
          )}
        >
          {formatPrice(order.total)}
        </span>
        <span
          style={{
            fontSize: 'var(--text-pill)',
            lineHeight: 'var(--text-pill--line-height)',
          }}
          className="text-ink-muted"
        >
          {ORDERS_SEE_DETAILS_LABEL}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Date — Paper-format "20. apr 2026" (kort norsk, månedsforkortelse)
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}
