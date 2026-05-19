/**
 * OrderDetailView — Ordredetalj for én ordre (Paper 6GT-0 desktop / 7UX-0 mobile).
 *
 * Implementasjonen er Paper-eksakt verifisert mot:
 *   - Header        76Q-0
 *   - Bestilte varer 773-0
 *   - Ordreoppsumm. 781-0
 *   - Adresser      78O-0
 *   - Betaling+merknad 797-0
 *   - Ordrehistorikk 79R-0
 *
 * Card-stiler — to varianter:
 *   - **Title-card** (Bestilte varer / Ordreoppsummering / Ordrehistorikk):
 *     `py-sp-3 px-sp-4` header med 15px bold `text-body-md`, divider under.
 *   - **Label-card** (Adresser / Betaling / Merknad): `py-3.5 px-5` header
 *     med 13px UPPERCASE bold `tracking-[0.04em]`, divider under.
 *
 * Layout:
 *
 *   Desktop (≥lg) — Paper 6GT-0:
 *     [Header]
 *     [Bestilte varer — full width]
 *     [Ordreoppsummering 50%][Adresser-kolonne 50%: Faktur stacked Lever]
 *     [Betalingsinfo 50%][Kundens merknad 50%]    ← merknad-card vises kun
 *                                                   hvis customerNote finnes;
 *                                                   ellers fyller betaling
 *                                                   full bredde
 *     [Ordrehistorikk — full width]
 *
 *   Mobile (<lg) — Paper 7UX-0:
 *     - Egen mobile-header med chevron + "Ordre #1234" + status-pill
 *     - Stack alt single-column. Ingen Ordrehistorikk på mobile (Paper-spec).
 *
 * Server-komponent — order kommer ferdig-mappet fra `fetchUserOrder()`.
 */

import Image from 'next/image';
import Link from 'next/link';

import {
  ORDER_DETAIL_BACK_LABEL,
  ORDER_DETAIL_BACK_LABEL_MOBILE,
  ORDER_DETAIL_BILLING_TITLE,
  ORDER_DETAIL_DATE_CANCELLED_LABEL,
  ORDER_DETAIL_DATE_COMPLETED_LABEL,
  ORDER_DETAIL_DATE_PAID_LABEL,
  ORDER_DETAIL_DATE_PLACED_LABEL,
  ORDER_DETAIL_FREE_SHIPPING_LABEL,
  ORDER_DETAIL_ITEMS_HEADERS,
  ORDER_DETAIL_ITEMS_TITLE,
  ORDER_DETAIL_NO_ITEMS,
  ORDER_DETAIL_NOTE_EMPTY,
  ORDER_DETAIL_NOTE_TITLE,
  ORDER_DETAIL_PAYMENT_FALLBACK,
  ORDER_DETAIL_PAYMENT_METHOD_LABEL,
  ORDER_DETAIL_PAYMENT_STATUS_LABEL,
  ORDER_DETAIL_PAYMENT_STATUS_PAID,
  ORDER_DETAIL_PAYMENT_STATUS_REFUNDED,
  ORDER_DETAIL_PAYMENT_STATUS_UNPAID,
  ORDER_DETAIL_PAYMENT_TITLE,
  ORDER_DETAIL_PAYMENT_TRANSACTION_LABEL,
  ORDER_DETAIL_SHIPPING_TITLE,
  ORDER_DETAIL_TIMELINE_TITLE,
  ORDER_DETAIL_TITLE_PREFIX,
  ORDER_DETAIL_TOTALS_LABELS,
  ORDER_DETAIL_TOTALS_TITLE,
  getOrderStatus,
} from '@/lib/account/info';
import { cn } from '@/lib/utils/cn';
import { formatPrice } from '@/lib/utils/format-price';
import type {
  OrderDetail,
  OrderDetailAddress,
  OrderDetailLineItem,
  OrderDetailTimelineEntry,
  OrderDetailTotals,
} from '@/lib/woo/orders';

import { Pill } from '@/components/ui/Pill';
import { Tag } from '@/components/ui/Tag';

interface OrderDetailViewProps {
  readonly order: OrderDetail;
}

export function OrderDetailView({ order }: OrderDetailViewProps) {
  const status = getOrderStatus(order.status);
  const isCancelled = status.variant === 'danger';

  // Avled betalings-status fra Woo-status — vises som pill i Betalingsinformasjon.
  const paymentStatus = derivePaymentStatus(order);

  return (
    <div className="flex w-full min-w-0 flex-col gap-sp-4">
      <OrderDetailHeader
        number={order.number}
        statusLabel={status.label}
        statusVariant={status.variant}
        createdAt={order.createdAt}
        paidAt={order.paidAt}
        completedAt={order.completedAt}
        isCancelled={isCancelled}
      />

      <ItemsCard items={order.lineItems} muted={isCancelled} />

      {/* Ordreoppsummering (50%) + Adresser-kolonne (50%) */}
      <div className="flex flex-col gap-sp-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-sp-4">
        <TotalsCard
          totals={order.totals}
          shippingMethod={order.shippingMethod}
          couponCodes={order.couponCodes}
        />
        <div className="flex flex-col gap-sp-4">
          <AddressCard
            title={ORDER_DETAIL_BILLING_TITLE}
            address={order.billing}
            showContact
          />
          <AddressCard
            title={ORDER_DETAIL_SHIPPING_TITLE}
            address={order.shipping}
          />
        </div>
      </div>

      {/* Betaling + Merknad — alltid 2-kolonne på desktop. */}
      <div className="flex flex-col gap-sp-4 lg:grid lg:grid-cols-2 lg:items-start">
        <PaymentCard order={order} paymentStatus={paymentStatus} />
        <NoteCard note={order.customerNote ?? null} />
      </div>

      {/* Ordrehistorikk — kun desktop (Paper 7UX-0 mobile har ikke denne). */}
      {order.timeline.length > 0 && (
        <div className="hidden lg:block">
          <TimelineCard entries={order.timeline} />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Header — Paper 76Q-0 desktop / 888-0 mobile
// ===========================================================================

interface OrderDetailHeaderProps {
  readonly number: string;
  readonly statusLabel: string;
  readonly statusVariant: 'success' | 'warning' | 'neutral' | 'danger';
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly completedAt: string | null;
  readonly isCancelled: boolean;
}

function OrderDetailHeader({
  number,
  statusLabel,
  statusVariant,
  createdAt,
  paidAt,
  completedAt,
  isCancelled,
}: OrderDetailHeaderProps) {
  const dates: Array<{ label: string; iso: string }> = [
    { label: ORDER_DETAIL_DATE_PLACED_LABEL, iso: createdAt },
  ];
  if (paidAt) dates.push({ label: ORDER_DETAIL_DATE_PAID_LABEL, iso: paidAt });
  if (completedAt) {
    dates.push({
      label: isCancelled
        ? ORDER_DETAIL_DATE_CANCELLED_LABEL
        : ORDER_DETAIL_DATE_COMPLETED_LABEL,
      iso: completedAt,
    });
  }

  return (
    <>
      {/* Mobile sub-header (Paper 883-0): 52px hvit bar, chevron + "Mine ordrer".
          Kun navigasjon her — tittel/tag/datoer lever i content-området under. */}
      <header className="-mx-sp-3 -mt-sp-5 flex h-13 shrink-0 items-center gap-3 border-b border-divider bg-surface px-sp-3 md:-mx-sp-7 md:px-sp-7 lg:hidden">
        <Link
          href="/konto/ordrer"
          className="inline-flex items-center gap-3 text-body-xs text-ink-muted hover:text-ink"
          aria-label={ORDER_DETAIL_BACK_LABEL}
        >
          <BackChevron className="size-5" />
          {ORDER_DETAIL_BACK_LABEL_MOBILE}
        </Link>
      </header>

      {/* Mobile tittel-blokk (Paper 888-0): på canvas-bakgrunn, ingen hvit boks.
          Ordre #nr + tag + dato-stamps i content-flyten. */}
      <div className="flex flex-col gap-sp-2 lg:hidden">
        <div className="flex flex-wrap items-center gap-sp-2">
          <h1 className="text-h3 font-bold text-ink">
            {ORDER_DETAIL_TITLE_PREFIX} #{number}
          </h1>
          <Tag variant={statusVariant}>{statusLabel}</Tag>
        </div>
        <DateStamps dates={dates} mobile />
      </div>

      {/* Desktop-header (Paper 76Q-0): tilbake-link + tittel-rad + dato-stamps */}
      <header className="hidden flex-col gap-sp-3 lg:flex">
        <Link
          href="/konto/ordrer"
          className="inline-flex w-fit items-center gap-sp-1 text-body-xs font-medium text-ink-muted hover:text-ink"
        >
          <BackChevron className="size-3.5" />
          {ORDER_DETAIL_BACK_LABEL}
        </Link>

        <div className="flex flex-wrap items-center gap-sp-3">
          <h1 className="text-h2 font-bold text-ink">
            {ORDER_DETAIL_TITLE_PREFIX} #{number}
          </h1>
          <Tag variant={statusVariant}>{statusLabel}</Tag>
        </div>

        <DateStamps dates={dates} />
      </header>
    </>
  );
}

function DateStamps({
  dates,
  mobile = false,
}: {
  dates: ReadonlyArray<{ label: string; iso: string }>;
  /** Mobil-layout: 12px regular, datoer separert med · på kompakt vis. */
  mobile?: boolean;
}) {
  if (mobile) {
    // Paper 88E-0/88F-0: 12px regular ink-muted, to linjer med dot-separator
    return (
      <p className="text-muted-sm text-ink-muted">
        {dates.map((d, idx) => (
          <span key={idx}>
            {idx > 0 && <span className="mx-1">·</span>}
            {d.label} {formatDateLong(d.iso)}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-sp-4 gap-y-sp-1 text-body-xs text-ink-muted">
      {dates.map((d, idx) => (
        <span key={idx}>
          {d.label} {formatDateLong(d.iso)}
        </span>
      ))}
    </div>
  );
}

// ===========================================================================
// Bestilte varer — Paper 773-0
// ===========================================================================

interface ItemsCardProps {
  readonly items: ReadonlyArray<OrderDetailLineItem>;
  readonly muted: boolean;
}

function ItemsCard({ items, muted }: ItemsCardProps) {
  if (items.length === 0) {
    return (
      <TitleCard title={ORDER_DETAIL_ITEMS_TITLE}>
        <p className="text-body-sm text-ink-muted">
          {ORDER_DETAIL_NO_ITEMS}
        </p>
      </TitleCard>
    );
  }

  return (
    <TitleCard title={ORDER_DETAIL_ITEMS_TITLE} noBodyPadding>
      {/* Desktop tabell — Paper 773-0 */}
      <div role="table" aria-label={ORDER_DETAIL_ITEMS_TITLE} className="hidden w-full lg:block">
        <div
          role="row"
          className="flex w-full items-center gap-sp-3 bg-canvas py-2.5 px-sp-4"
        >
          <ColHeader className="grow shrink basis-0">
            {ORDER_DETAIL_ITEMS_HEADERS.product}
          </ColHeader>
          <ColHeader className="w-20 text-center">
            {ORDER_DETAIL_ITEMS_HEADERS.quantity}
          </ColHeader>
          <ColHeader className="w-27.5 text-right">
            {ORDER_DETAIL_ITEMS_HEADERS.unitPrice}
          </ColHeader>
          <ColHeader className="w-20 text-right">
            {ORDER_DETAIL_ITEMS_HEADERS.vat}
          </ColHeader>
          <ColHeader className="w-27.5 text-right">
            {ORDER_DETAIL_ITEMS_HEADERS.total}
          </ColHeader>
        </div>

        {items.map((item, idx) => (
          <DesktopItemRow
            key={`${item.id}-${idx}`}
            item={item}
            isLast={idx === items.length - 1}
            muted={muted}
          />
        ))}
      </div>

      {/* Mobile stack — Paper 88G-0 */}
      <ul className="flex flex-col lg:hidden">
        {items.map((item, idx) => (
          <li
            key={`${item.id}-${idx}`}
            className={cn(
              'flex items-start gap-sp-3 px-sp-3 py-sp-3',
              idx < items.length - 1 && 'border-b border-canvas',
            )}
          >
            <ItemImage url={item.imageUrl} name={item.name} size={56} />
            <div className="flex min-w-0 grow flex-col gap-px">
              <p
                className={cn(
                  'text-body-sm font-bold',
                  muted ? 'text-ink-muted line-through' : 'text-ink',
                )}
              >
                {item.name}
              </p>
              {(item.sku || item.variation) && (
                <p className="truncate text-muted-sm text-ink-muted">
                  {[
                    item.sku ? `SKU: ${item.sku}` : null,
                    item.variation,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-px text-muted-sm text-ink-muted">
                Ant: {item.quantity}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 text-body-sm font-bold',
                muted ? 'text-ink-muted line-through' : 'text-ink',
              )}
            >
              {formatPrice(item.total)}
            </span>
          </li>
        ))}
      </ul>
    </TitleCard>
  );
}

function DesktopItemRow({
  item,
  isLast,
  muted,
}: {
  item: OrderDetailLineItem;
  isLast: boolean;
  muted: boolean;
}) {
  return (
    <div
      role="row"
      className={cn(
        'flex items-center gap-sp-3 px-sp-4 py-sp-3',
        !isLast && 'border-b border-canvas',
      )}
    >
      {/* PRODUKT — bilde + navn + sku/variant */}
      <div role="cell" className="flex min-w-0 grow shrink basis-0 items-center gap-3.5">
        <ItemImage url={item.imageUrl} name={item.name} size={52} />
        <div className="flex min-w-0 flex-col gap-0.75">
          <p
            className={cn(
              'truncate text-body-sm font-bold',
              muted ? 'text-ink-muted line-through' : 'text-ink',
            )}
          >
            {item.name}
          </p>
          {(item.sku || item.variation) && (
            <p className="truncate text-muted-sm text-ink-muted">
              {[
                item.sku ? `SKU: ${item.sku}` : null,
                item.variation,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* ANT. */}
      <span
        role="cell"
        className={cn(
          'w-20 text-center text-body-sm tabular-nums',
          muted ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {item.quantity}
      </span>

      {/* ENHETSPRIS */}
      <span
        role="cell"
        className={cn(
          'w-27.5 text-right text-body-sm tabular-nums',
          muted ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {formatPrice(item.price)}
      </span>

      {/* MVA — alltid muted (Paper-spec) */}
      <span
        role="cell"
        className="w-20 text-right text-body-sm tabular-nums text-ink-muted"
      >
        {formatPrice(item.tax)}
      </span>

      {/* TOTAL — bold */}
      <span
        role="cell"
        className={cn(
          'w-27.5 text-right text-body-sm font-bold tabular-nums',
          muted ? 'text-ink-muted line-through' : 'text-ink',
        )}
      >
        {formatPrice(item.total)}
      </span>
    </div>
  );
}

function ItemImage({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="shrink-0 rounded-1 border border-divider bg-canvas"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="relative shrink-0 overflow-hidden rounded-1 border border-divider bg-canvas"
    >
      <Image
        src={url}
        alt={name}
        fill
        sizes={`${size}px`}
        className="object-cover"
      />
    </div>
  );
}

// ===========================================================================
// Ordreoppsummering — Paper 781-0
// ===========================================================================

interface TotalsCardProps {
  readonly totals: OrderDetailTotals;
  readonly shippingMethod: string | null;
  readonly couponCodes: ReadonlyArray<string>;
}

function TotalsCard({ totals, shippingMethod, couponCodes }: TotalsCardProps) {
  return (
    <TitleCard title={ORDER_DETAIL_TOTALS_TITLE} noBodyPadding>
      {/* Delsum */}
      <SummaryRow
        label={ORDER_DETAIL_TOTALS_LABELS.subtotal}
        value={formatPrice(totals.subtotal)}
      />

      {/* Frakt — kan ha sub-tekst med fraktmetode */}
      <SummaryRow
        label={ORDER_DETAIL_TOTALS_LABELS.shipping}
        sublabel={shippingMethod ?? undefined}
        value={
          totals.shipping > 0
            ? formatPrice(totals.shipping)
            : ORDER_DETAIL_FREE_SHIPPING_LABEL
        }
      />

      {/* Rabattkode — kun hvis discount > 0 */}
      {totals.discount > 0 && (
        <div className="flex items-center justify-between border-b border-canvas px-sp-4 py-sp-3">
          <div className="flex items-center gap-sp-2">
            <span className="text-ink-muted">
              {ORDER_DETAIL_TOTALS_LABELS.discount}
            </span>
            {couponCodes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {couponCodes.map((code) => (
                  <Pill key={code} variant="success" bordered>{code}</Pill>
                ))}
              </div>
            )}
          </div>
          <span className="tabular-nums text-aka">
            −{formatPrice(totals.discount)}
          </span>
        </div>
      )}

      {/* MVA — muted label + muted value (Paper 781-0) */}
      <SummaryRow
        label={ORDER_DETAIL_TOTALS_LABELS.vat}
        value={formatPrice(totals.vatAmount)}
        valueMuted
      />

      {/* Totalt betalt — siste rad uten border, label 15px bold, value text-h3 bold */}
      <div className="flex items-center justify-between px-sp-4 py-sp-4">
        <span className="font-bold text-ink">
          {ORDER_DETAIL_TOTALS_LABELS.total}
        </span>
        <span className="text-h3 font-bold tabular-nums text-ink">
          {formatPrice(totals.total)}
        </span>
      </div>
    </TitleCard>
  );
}

function SummaryRow({
  label,
  sublabel,
  value,
  valueMuted = false,
}: {
  label: string;
  sublabel?: string;
  value: string;
  valueMuted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-sp-3 border-b border-canvas px-sp-4 py-sp-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-ink-muted">{label}</span>
        {sublabel && (
          <span className="text-body-xs text-ink-muted">{sublabel}</span>
        )}
      </div>
      <span
        className={cn(
          'tabular-nums',
          valueMuted ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ===========================================================================
// Adresse-card — Paper 78O-0 (label-style header)
// ===========================================================================

function AddressCard({
  title,
  address,
  showContact = false,
}: {
  title: string;
  address: OrderDetailAddress;
  showContact?: boolean;
}) {
  const fullName = [address.firstName, address.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <LabelCard title={title}>
      <div className="flex flex-col gap-0.5">
        {fullName && (
          <p className="font-bold text-ink">{fullName}</p>
        )}
        {address.company && (
          <p className="text-ink-muted">{address.company}</p>
        )}
        {address.addressLine1 && (
          <p className="text-ink-muted">{address.addressLine1}</p>
        )}
        {address.addressLine2 && (
          <p className="text-ink-muted">{address.addressLine2}</p>
        )}
        {(address.postalCode || address.city) && (
          <p className="text-ink-muted">
            {[address.postalCode, address.city, formatCountry(address.country)]
              .filter(Boolean)
              .join(', ')}
          </p>
        )}

        {showContact && (address.email || address.phone) && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {address.email && (
              <p className="text-ink-muted">{address.email}</p>
            )}
            {address.phone && (
              <p className="text-ink-muted">{address.phone}</p>
            )}
          </div>
        )}
      </div>
    </LabelCard>
  );
}

// ===========================================================================
// Betalingsinformasjon — Paper 797-0 (label-style header)
// ===========================================================================

interface PaymentCardProps {
  readonly order: OrderDetail;
  readonly paymentStatus: PaymentStatus;
}

function PaymentCard({ order, paymentStatus }: PaymentCardProps) {
  const methodLabel =
    order.paymentMethodTitle ?? order.paymentMethod ?? ORDER_DETAIL_PAYMENT_FALLBACK;

  return (
    <LabelCard title={ORDER_DETAIL_PAYMENT_TITLE}>
      <dl className="flex flex-col gap-sp-2">
        <div className="flex justify-between gap-sp-3">
          <dt className="text-ink-muted">
            {ORDER_DETAIL_PAYMENT_METHOD_LABEL}
          </dt>
          <dd className="font-bold text-ink">{methodLabel}</dd>
        </div>

        {order.transactionId && (
          <div className="flex justify-between gap-sp-3">
            <dt className="text-ink-muted">
              {ORDER_DETAIL_PAYMENT_TRANSACTION_LABEL}
            </dt>
            <dd className="break-all font-mono text-ink-muted">
              {order.transactionId}
            </dd>
          </div>
        )}

        {paymentStatus !== 'unknown' && (
          <div className="flex items-center justify-between gap-sp-3">
            <dt className="text-ink-muted">
              {ORDER_DETAIL_PAYMENT_STATUS_LABEL}
            </dt>
            <dd>
              <Tag variant={paymentStatusVariant(paymentStatus)}>
                {paymentStatusLabel(paymentStatus)}
              </Tag>
            </dd>
          </div>
        )}
      </dl>
    </LabelCard>
  );
}

// ===========================================================================
// Kundens merknad — Paper 797-0 (label-style header)
// ===========================================================================

function NoteCard({ note }: { note: string | null }) {
  return (
    <LabelCard title={ORDER_DETAIL_NOTE_TITLE}>
      {note ? (
        <p className="whitespace-pre-line leading-[160%] text-ink" /* paper-exact: 797-0 line-height 160% (note-tekst) */>
          {note}
        </p>
      ) : (
        <p className="text-ink-subtle">{ORDER_DETAIL_NOTE_EMPTY}</p>
      )}
    </LabelCard>
  );
}

// ===========================================================================
// Ordrehistorikk — Paper 79R-0 (desktop only, title-style header)
// ===========================================================================

function TimelineCard({
  entries,
}: {
  entries: ReadonlyArray<OrderDetailTimelineEntry>;
}) {
  return (
    <TitleCard title={ORDER_DETAIL_TIMELINE_TITLE} noBodyPadding bodyClassName="py-sp-2">
      <ol className="flex flex-col">
        {entries.map((entry, idx) => (
          <TimelineRow
            key={entry.id}
            entry={entry}
            isFirst={idx === 0}
            isLast={idx === entries.length - 1}
          />
        ))}
      </ol>
    </TitleCard>
  );
}

function TimelineRow({
  entry,
  isFirst,
  isLast,
}: {
  entry: OrderDetailTimelineEntry;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <li
      className={cn(
        'relative flex gap-sp-3 px-sp-4',
        isFirst && 'pt-sp-3',
      )}
    >
      {/* Dot + connector — Paper 79R-0: dot 10×10, mt-0.75 (3px); connector 1px grow */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            'mt-0.75 size-2.5 shrink-0 rounded-full',
            timelineKindColor(entry.kind),
          )}
          aria-hidden
        />
        {!isLast && (
          <span
            className="mt-1 w-px grow shrink basis-0 bg-divider"
            aria-hidden
          />
        )}
      </div>

      <div
        className={cn(
          'flex flex-col gap-0.5',
          isLast ? 'pb-sp-2' : 'pb-sp-3',
        )}
      >
        <p className="font-bold text-ink">{entry.title}</p>
        {entry.description && (
          <p className="text-ink-muted">{entry.description}</p>
        )}
        <p className="mt-0.5 text-table-header text-ink-muted">
          {formatDateTimeLong(entry.at)} · {entry.actor}
        </p>
      </div>
    </li>
  );
}

function timelineKindColor(kind: OrderDetailTimelineEntry['kind']): string {
  switch (kind) {
    case 'completed':
      return 'bg-status-success-fg';
    case 'shipped':
    case 'processing':
      return 'bg-status-warning-fg';
    case 'paid':
      return 'bg-ink';
    case 'cancelled':
    case 'refunded':
      return 'bg-status-danger-fg';
    case 'created':
    case 'note':
    default:
      return 'bg-ink-muted';
  }
}

// ===========================================================================
// Card-primitiver
// ===========================================================================

/**
 * Title-card — Paper 773-0/781-0/79R-0. 15px bold mixed case header med
 * divider underneath. Brukes for "primær"-cards: Bestilte varer,
 * Ordreoppsummering, Ordrehistorikk.
 */
function TitleCard({
  title,
  children,
  bodyClassName,
  noBodyPadding = false,
}: {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
  /**
   * Når true droppes default `p-sp-4` på body-divet — brukes når innholdet
   * skal gå helt ut til card-kantene (f.eks. tabell-strip, summary-rader).
   *
   * Hvorfor en eksplisitt prop og ikke bare `bodyClassName="p-0"`?
   * `tailwind-merge` gjenkjenner ikke `p-sp-4` som padding-utility (custom
   * spacing-token), så `cn('p-sp-4', 'p-0')` returnerer begge klassene og
   * source-orden i CSS avgjør hvem som vinner — som er upålitelig.
   */
  noBodyPadding?: boolean;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-1 border border-divider bg-surface">
      <header className="border-b border-divider px-sp-4 py-sp-3">
        <h2 className="font-bold tracking-[-0.01em] text-ink" /* paper-exact: 76V-0 letter-spacing -0.01em (title-card-header) */>
          {title}
        </h2>
      </header>
      <div className={cn(!noBodyPadding && 'p-sp-4', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * Label-card — Paper 78O-0/797-0. 13px UPPERCASE bold tracking-[0.04em]
 * header. Brukes for sekundær-cards: Adresser, Betaling, Merknad.
 */
function LabelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-1 border border-divider bg-surface">
      <header className="border-b border-divider py-3.5 px-5">
        <h2 className="font-bold tracking-[-0.01em] text-ink">{title}</h2>
      </header>
      <div className="py-sp-3 px-5">{children}</div>
    </section>
  );
}

function ColHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      role="columnheader"
      style={{
        fontSize: 'var(--text-table-header)',
        lineHeight: 'var(--text-table-header--line-height)',
        letterSpacing: '0.08em',
      }}
      className={cn('font-bold uppercase text-ink-muted', className)}
    >
      {children}
    </span>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

type PaymentStatus = 'paid' | 'unpaid' | 'refunded' | 'unknown';

function derivePaymentStatus(order: OrderDetail): PaymentStatus {
  if (order.status === 'refunded') return 'refunded';
  if (order.paidAt) return 'paid';
  if (
    order.status === 'pending' ||
    order.status === 'on-hold' ||
    order.status === 'failed'
  ) {
    return 'unpaid';
  }
  // For processing/completed uten date_paid — uvanlig, men anta betalt.
  if (order.status === 'processing' || order.status === 'completed') {
    return 'paid';
  }
  return 'unknown';
}

function paymentStatusLabel(s: PaymentStatus): string {
  switch (s) {
    case 'paid':
      return ORDER_DETAIL_PAYMENT_STATUS_PAID;
    case 'refunded':
      return ORDER_DETAIL_PAYMENT_STATUS_REFUNDED;
    case 'unpaid':
      return ORDER_DETAIL_PAYMENT_STATUS_UNPAID;
    default:
      return '';
  }
}

function paymentStatusVariant(
  s: PaymentStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (s) {
    case 'paid':
      return 'success';
    case 'unpaid':
      return 'warning';
    case 'refunded':
      return 'danger';
    default:
      return 'neutral';
  }
}

function BackChevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('size-3.5', className)}
    >
      <path d="M8 3L4 7l4 4" />
    </svg>
  );
}

/**
 * "12. mars 2026" — kort norsk dato uten tid. Brukes i header-stamps og
 * adresser. Tåler invalid input (returnerer "—").
 */
function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * "12. mars 2026 kl. 16:48" — dato + tid (Paper 79R-0 timeline). Bruker
 * Europe/Oslo for tid slik at "kl." stemmer med butikkens hjemme-tidssone.
 */
function formatDateTimeLong(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const date = new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Oslo',
    }).format(d);
    const time = new Intl.DateTimeFormat('nb-NO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Oslo',
    }).format(d);
    return `${date} kl. ${time}`;
  } catch {
    return '—';
  }
}

function formatCountry(code: string): string {
  if (!code) return '';
  if (code === 'NO') return 'Norge';
  return code;
}
