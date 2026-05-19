/**
 * OrdersList — mobile rader-visning av ordrer (Paper B6Q-0).
 *
 * Verifisert mot Paper B6Q-0 (B7K-0 / B7T-0 / B82-0 / B8B-0 / B8K-0):
 *   - Hver rad: padding 16px×20px (`py-sp-3 px-5`), `gap-sp-2` (8px), full
 *     390px bredde, hvit bg.
 *   - Tre logiske linjer per rad:
 *       Linje 1 (16px): #ordrenr (13px bold ink, venstre) | DD. mnd YYYY
 *                        (12px regular muted, høyre)
 *       Linje 2 (32px = 2 tekstlinjer): produktnavn + "+ N produkter til" /
 *                                        "1 produkt" / "N produkter" (13px
 *                                        regular ink — eller muted hvis
 *                                        ordren er kansellert).
 *       Linje 3 (22px): bordered status-pill (venstre) | "kr X →" 13px
 *                        bold ink (høyre)
 *   - Divider mellom rader: 1px i divider-color (#E0E0DC). Implementert med
 *     `divide-y divide-divider` på UL — gir samme effekt som Paper sin
 *     `gap: 1px` på flex-column med background-color #E0E0DC.
 *   - Ingen trailing chevron (>) på slutten av raden — kun `→` etter
 *     totalbeløpet.
 *
 * Synlighet: `lg:hidden`. Hele raden er en `<Link>` til ordredetalj.
 *
 * NB: Ulikt forrige iterasjon (Paper 7UR-0, deprecated) er pillene nå
 * BORDERED på mobil også — samme form-faktor som desktop. Vi sender derfor
 * `bordered` til Pill-primitiv.
 *
 * Bredde-trick: vi bruker `-mx-sp-3 md:-mx-sp-7` for å sprenge ut av
 * AccountShellens horisontale padding (Paper viser radene full-bleed mot
 * 390px viewport). Border-y gir tydelig avgrensning mot canvas-bg.
 */

import Link from 'next/link';

import { Tag } from '@/components/ui/Tag';
import {
  getOrderItemsCountLabel,
  getOrderItemsRemainderLabel,
  getOrderStatus,
} from '@/lib/account/info';
import { cn } from '@/lib/utils/cn';
import { formatPrice } from '@/lib/utils/format-price';
import type { OrderListRow } from '@/lib/woo/orders';

interface OrdersListProps {
  readonly orders: readonly OrderListRow[];
}

export function OrdersList({ orders }: OrdersListProps) {
  return (
    <ul className="-mx-sp-3 flex flex-col divide-y divide-divider border-b border-divider bg-surface md:-mx-sp-7 lg:hidden">
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

function OrderRow({ order }: { order: OrderListRow }) {
  const status = getOrderStatus(order.status);
  const detailHref = `/konto/ordrer/${order.id}`;
  // Kansellerte/refunderte ordrer dempes (matcher desktop-tabellen B7T+B82+...).
  const isMuted = status.variant === 'danger';

  const remainder = getOrderItemsRemainderLabel(order.itemCount);
  const subLine = remainder ?? getOrderItemsCountLabel(order.itemCount);

  return (
    <li>
      <Link
        href={detailHref}
        className="flex flex-col gap-sp-2 px-5 py-sp-3 transition-colors active:bg-surface-hover"
      >
        {/* Linje 1 — #ordrenr + dato */}
        <div className="flex items-start justify-between gap-sp-2">
          <span className="text-body-xs font-bold text-ink">
            #{order.number}
          </span>
          <span
            // `--text-date-mobile` (10px) — egen token for dato i mobil-rad,
            // 1px mindre enn desktop og 2px mindre enn `text-muted-sm` (12px).
            style={{
              fontSize: 'var(--text-date-mobile)',
              lineHeight: 'var(--text-date-mobile--line-height)',
            }}
            className="shrink-0 text-ink-muted"
          >
            {formatDate(order.createdAt)}
          </span>
        </div>

        {/* Linje 2 — produktnavn + count (2 tekstlinjer) */}
        <p
          className={cn(
            'text-body-xs',
            isMuted ? 'text-ink-muted' : 'text-ink',
          )}
        >
          <span className="block truncate">
            {order.firstItemName ?? '—'}
          </span>
          <span className="block truncate text-ink-muted">{subLine}</span>
        </p>

        {/* Linje 3 — status-pill + total + → */}
        <div className="flex items-center justify-between gap-sp-2">
          <Tag variant={status.variant}>
            {status.label}
          </Tag>
          <span
            className={cn(
              'text-body-xs font-bold',
              isMuted ? 'text-ink-muted' : 'text-ink',
            )}
          >
            <span className={cn(isMuted && 'line-through')}>
              {formatPrice(order.total)}
            </span>{' '}
            <span aria-hidden>→</span>
          </span>
        </div>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Date — Paper-format "20. apr 2026" (kort norsk månedsforkortelse, samme som
// desktop-tabellen i B7N-0).
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
