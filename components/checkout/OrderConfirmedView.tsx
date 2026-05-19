/**
 * OrderConfirmedView — bekreftelse-siden etter fullført ordre.
 *
 * Paper 5U2-0 (desktop) / 5Y8-0 (mobile). Layout:
 *
 *   Desktop (1440):
 *     - 2-kolonne grid med 32px gap
 *     - Venstre 900px: success-header card + ordered-items card
 *     - Høyre 380px: summary card + delivery-info card + CTA-stack
 *
 *   Mobile (390):
 *     - Single stack alle kort full-bredde med 16px mellomrom
 *     - CTA-stack på bunn full-bredde
 *
 * Felles kort-pattern: bg shiro, border 1 sakai, radius 2.
 * Eyebrow-headers: 11/14 bold haiiro 0.1em uppercase.
 *
 * **Datakilde**: ephemeral klient-state (sessionStorage). CheckoutClient
 * skriver full ordre-snapshot ved Nexi-success. Vi henter den her, validerer
 * at URL-orderId matcher sessionStorage-orderId (forhindrer cross-tab-
 * forveksling og at en gjettebar `/ordre-bekreftet/<id>`-URL viser andres
 * ordre), og rendrer rik view. Hvis sessionStorage er tom (direkte URL-
 * tilgang, refresh etter tab-close, eller annen ordre-id), viser vi en
 * generisk fallback uten å eksponere data.
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ClearCartOnMount } from '@/components/checkout/ClearCartOnMount';
import { readCheckoutConfirmation } from '@/lib/checkout/confirmation-storage';
import type { CheckoutOrderConfirmation } from '@/lib/checkout/confirmation-types';

interface OrderConfirmedViewProps {
  /** orderId fra URL-segmentet (`/ordre-bekreftet/[id]`). Brukes til å validere
   *  at sessionStorage-entry'en hører til denne siden. */
  orderId: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
};

export function OrderConfirmedView({ orderId }: OrderConfirmedViewProps) {
  const [hydrated, setHydrated] = useState(false);
  const [confirmation, setConfirmation] =
    useState<CheckoutOrderConfirmation | null>(null);

  // Mount-sync med sessionStorage. Legitim "synkroniser med ekstern kilde"-
  // effekt: browser-storage er utenfor React, vi leser én gang etter
  // hydrering. Disabler `set-state-in-effect` på samme måte som
  // ThemeToggle/FilterDrawer. Vi validerer at sessionStorage-entry'en hører
  // til denne URL-en — hvis ikke, behandler vi det som direkte-URL-tilgang
  // og viser fallback (matchedConfirmation = null).
  useEffect(() => {
    const stored = readCheckoutConfirmation();
    const matchedConfirmation =
      stored && String(stored.orderId) === String(orderId) ? stored : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmation(matchedConfirmation);
    setHydrated(true);
  }, [orderId]);

  if (!hydrated) {
    // Skeleton — match første-render-layouten ish så det ikke hopper.
    return (
      <main className="bg-canvas pb-20 pt-5 md:pt-10 lg:pt-16">
        <div className="mx-auto max-w-[1320px] px-sp-3 md:px-sp-7 lg:px-16" /* paper-exact: 5VL-0 (1320 content width) */>
          <div className="h-40" aria-hidden />
        </div>
      </main>
    );
  }

  if (!confirmation) {
    return <FallbackView orderIdFromUrl={orderId} />;
  }

  return (
    <main className="bg-canvas pb-20 pt-5 md:pt-10 lg:pt-16">
      {/* Tøm cart-state ved mount — brukeren har akkurat fullført checkout. */}
      <ClearCartOnMount />

      {/* 1440px content container — Paper 5VL-0 padding 64/64. Vi bruker
          1320 (matcher resten av siden) med px-3 mobil / px-7 md / px-16 lg. */}
      <div className="mx-auto max-w-[1320px] px-sp-3 md:px-sp-7 lg:px-16" /* paper-exact: 5VL-0 */>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-sp-5" /* paper-exact: 5VL-0 (gap 32) */>
          {/* Venstre kolonne — success-header + ordered-items */}
          <div className="flex flex-1 flex-col gap-4" /* paper-exact: 5VM-0 (gap 16) */>
            <SuccessHeaderCard confirmation={confirmation} />
            <OrderedItemsCard items={confirmation.items} />
          </div>

          {/* Høyre kolonne — summary + delivery + CTAs */}
          <aside className="flex w-full flex-col gap-3 lg:w-[380px] lg:shrink-0" /* paper-exact: 5X1-0 (380 wide, gap 12) */>
            <SummaryCard confirmation={confirmation} />
            <DeliveryInfoCard confirmation={confirmation} />
            <CtaStack orderId={confirmation.orderId} />
          </aside>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Fallback — vises ved direkte URL-tilgang uten sessionStorage              */
/* -------------------------------------------------------------------------- */
function FallbackView({ orderIdFromUrl }: { orderIdFromUrl: string }) {
  const orderIdNum = Number(orderIdFromUrl);
  const orderIdValid = Number.isInteger(orderIdNum) && orderIdNum > 0;
  return (
    <main className="bg-canvas px-sp-3 pb-20 pt-14 md:px-sp-7 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <p className="text-body-xs uppercase tracking-wide text-ink-muted">
          Bekreftelse
        </p>
        <h1 className="mt-sp-2 font-bold text-ink text-h1 lg:text-display">
          Ordre bekreftet
        </h1>
        <p className="mt-sp-5 text-body-md text-ink">
          {orderIdValid ? (
            <>
              Hvis du nettopp fullførte et kjøp, er ordren registrert. Sjekk
              e-posten din for bekreftelse, eller logg inn for å se ordrene
              dine.
            </>
          ) : (
            <>
              Vi fant ingen ordre-referanse i lenken. Sjekk e-posten din for
              bekreftelse hvis du nettopp fullførte et kjøp.
            </>
          )}
        </p>
        <div className="mt-sp-7 flex flex-col gap-sp-3 sm:flex-row">
          <Link
            href="/konto/ordrer"
            className="inline-flex items-center justify-center rounded-1 bg-aka px-sp-5 py-3 font-bold text-shiro hover:opacity-90"
          >
            Se mine ordrer
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-1 border border-divider bg-surface px-sp-5 py-3 font-medium text-ink hover:border-ink"
          >
            Tilbake til butikken
          </Link>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Success header — Paper 5VN-0                                                */
/* -------------------------------------------------------------------------- */
function SuccessHeaderCard({
  confirmation,
}: {
  confirmation: CheckoutOrderConfirmation;
}) {
  const greetingName = confirmation.customerFirstName || 'kunde';
  return (
    <section className="rounded-1 border border-divider bg-surface px-5 py-7 md:px-8 md:py-10" /* paper-exact: 5VN-0 (py 40 px 32 desktop) */>
      {/* Top: ikon + heading */}
      <div className="flex flex-col items-start gap-4 md:flex-row md:gap-5" /* paper-exact: 5VO-0 (gap 20) */>
        <span
          aria-hidden
          className="flex size-13 shrink-0 items-center justify-center rounded-full bg-midori text-shiro" /* paper-exact: 5VP-0 (52×52 success-circle — bytt fra kuro til midori for å matche success-state-semantikk) */
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path d="M5 11L9 15L17 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex flex-col gap-1.5" /* paper-exact: 5VS-0 (gap 6) */>
          <h1
            className="font-bold text-ink"
            style={{ fontSize: '32px', lineHeight: '38px', letterSpacing: '-0.02em' }} /* paper-exact: 5VT-0 ("Ordre bekreftet" 32/38 -0.02em) */
          >
            Ordre bekreftet
          </h1>
          <p className="text-ink-muted" style={{ fontSize: '14px', lineHeight: '21px' }} /* paper-exact: 5VU-0 (14/21 haiiro) */>
            Takk, {greetingName}. Vi har mottatt bestillingen din og sender
            bekreftelse til {confirmation.customerEmail}.
          </p>
        </div>
      </div>

      {/* Meta-rad — 4 kolonner desktop, 2x2 grid mobile (Paper 5VV-0).
          Bordered container med vertikale dividers mellom kolonnene. */}
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-1 border border-divider md:mt-8 md:grid-cols-4" /* paper-exact: 5VV-0 (mt 32 desktop, border 1, radius 2) */>
        <MetaCell label="Ordrenummer" value={`#${confirmation.orderNumber}`} />
        <MetaCell label="Bestillingsdato" value={fmtDate(confirmation.createdAt)} />
        <MetaCell label="Betaling" value={confirmation.paymentMethodTitle} />
        <MetaCell label="Status" value={statusLabel(confirmation.status)} isLast />
      </div>
    </section>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Venter på betaling';
    case 'processing':
      return 'Behandles';
    case 'on-hold':
      return 'På vent';
    case 'completed':
      return 'Fullført';
    case 'cancelled':
      return 'Kansellert';
    case 'refunded':
      return 'Refundert';
    case 'failed':
      return 'Feilet';
    default:
      return status;
  }
}

function MetaCell({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col gap-1.5 px-4 py-4 md:px-5 md:py-4', /* paper-exact: 5VW-0 (py 16 px 20) */
        'border-divider',
        // Right border on every cell except last — `last:` doesn't work
        // because grid wraps to two rows on mobile.
        isLast ? '' : 'border-r',
        // Bottom border for top row on mobile (2x2 grid).
        'md:border-b-0 max-md:[&:nth-child(-n+2)]:border-b',
      ].join(' ')}
    >
      <span
        className="font-bold uppercase text-ink-muted"
        style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5VX-0 (label 11/14 bold haiiro 0.1em) */
      >
        {label}
      </span>
      <span
        className="font-bold text-ink"
        style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: 5VY-0 (value 15/18 bold) */
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ordered items — Paper 5W8-0                                                 */
/* -------------------------------------------------------------------------- */
function OrderedItemsCard({
  items,
}: {
  items: CheckoutOrderConfirmation['items'];
}) {
  return (
    <section className="rounded-1 border border-divider bg-surface px-5 pt-6 md:px-7 md:pt-7" /* paper-exact: 5W8-0 (pt 28 px 28) */>
      <span
        className="block font-bold uppercase text-ink-muted"
        style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5W9-0 */
      >
        Produkter i bestillingen
      </span>
      <ul className="mt-4">
        {items.map((item, idx) => (
          <li
            key={`${item.sku ?? item.name}-${idx}`}
            className={[
              'flex items-center gap-4 border-divider py-5', /* paper-exact: 5WA-0 (py 20, gap 16) */
              'border-t',
            ].join(' ')}
          >
            {/* Thumb 56×56 — produktbilde med canvas-fallback hvis null. */}
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Bildene kommer fra Supabase-speilet/CDN, ikke optimalisert via next/image i confirmation-flyten
              <img
                src={item.imageUrl}
                alt=""
                className="block size-14 shrink-0 rounded-1 bg-canvas object-cover" /* paper-exact: 5WB-0 (56×56) */
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span
                aria-hidden
                className="block size-14 shrink-0 rounded-1 bg-canvas" /* paper-exact: 5WB-0 (56×56 canvas placeholder) */
              />
            )}
            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {item.brand && (
                <span
                  className="font-bold uppercase text-ink-muted"
                  style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5WD-0 (brand 11/14 0.1em) */
                >
                  {item.brand}
                </span>
              )}
              <span className="truncate font-bold text-ink" style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: 5WE-0 (15/18 bold) */>
                {item.name}
              </span>
              {(item.sku || item.specLine) && (
                <span className="text-ink-muted" style={{ fontSize: '12px', lineHeight: '14px' }} /* paper-exact: 5WF-0 */>
                  {item.sku ? `SKU: ${item.sku}` : ''}
                  {item.sku && item.specLine ? ' · ' : ''}
                  {item.specLine ?? ''}
                </span>
              )}
            </div>
            {/* Qty + line total */}
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <span className="text-ink-muted" style={{ fontSize: '12px', lineHeight: '14px' }} /* paper-exact: 5WH-0 */>
                {item.quantity} stk × {fmt(item.unitPrice)}
              </span>
              <span className="font-bold tabular-nums text-ink" style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: 5WI-0 (15/18 bold) */>
                {fmt(item.lineTotal)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {/* Bottom padding — Paper 5W8-0 har ikke pb spesifisert; bruk standard 28 */}
      <div aria-hidden className="pb-7" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary — Paper 5X2-0                                                       */
/* -------------------------------------------------------------------------- */
function SummaryCard({
  confirmation,
}: {
  confirmation: CheckoutOrderConfirmation;
}) {
  const hasSavings = confirmation.savings > 0;
  return (
    <section className="rounded-1 border border-divider bg-surface px-6 py-6" /* paper-exact: 5X2-0 (py 24 px 24) */>
      <span
        className="mb-4 block font-bold uppercase text-ink-muted"
        style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5X3-0 (mb 16) */
      >
        Oppsummering
      </span>
      <dl className="flex flex-col gap-2.5" /* paper-exact: 5X4-0 (gap 10) */>
        <SummaryRow label="Delsum (eks. MVA)" value={fmt(confirmation.subtotalExVat)} />
        <SummaryRow
          label="Frakt"
          value={confirmation.shippingCost === 0 ? 'Gratis' : fmt(confirmation.shippingCost)}
          valueClass={confirmation.shippingCost === 0 ? 'text-midori' : ''}
        />
        {hasSavings && (
          <SummaryRow label="Du spart" value={`−${fmt(confirmation.savings)}`} valueClass="text-aka" />
        )}
        <SummaryRow label="MVA (25%)" value={fmt(confirmation.vat)} />
      </dl>
      {/* Divider */}
      <div className="mt-4 h-px bg-divider" /* paper-exact: 5XH-0 */ aria-hidden />
      {/* Total row — Paper 5XI-0 */}
      <div className="mt-4 flex items-baseline justify-between" /* paper-exact: 5XI-0 */>
        <span className="font-bold text-ink" style={{ fontSize: '17px', lineHeight: '22px' }} /* paper-exact: 5XJ-0 ("Totalt betalt" 17/22 bold) */>
          Totalt betalt
        </span>
        <div className="text-right">
          <p className="font-bold tabular-nums text-ink" style={{ fontSize: '20px', lineHeight: '24px' }} /* paper-exact: 5XL-0 (20/24 bold) */>
            {fmt(confirmation.total)}
          </p>
          <p className="text-ink-muted" style={{ fontSize: '11px', lineHeight: '14px' }} /* paper-exact: 5XM-0 */>
            inkl. MVA
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  valueClass = 'text-ink',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted" style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: 5X6-0 */>
        {label}
      </dt>
      <dd className={`tabular-nums ${valueClass}`} style={{ fontSize: '14px', lineHeight: '18px', fontWeight: 500 }} /* paper-exact: 5X7-0 */>
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Delivery info — Paper 5XN-0                                                 */
/* -------------------------------------------------------------------------- */
function DeliveryInfoCard({
  confirmation,
}: {
  confirmation: CheckoutOrderConfirmation;
}) {
  const addr = confirmation.shippingAddress;
  const fullName = [addr.firstName, addr.lastName].filter(Boolean).join(' ');
  return (
    <section className="rounded-1 border border-divider bg-surface px-6 py-6" /* paper-exact: 5XN-0 (py 24 px 24) */>
      <span
        className="mb-4 block font-bold uppercase text-ink-muted"
        style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5XO-0 (mb 16) */
      >
        Leveringsdetaljer
      </span>
      {/* Adresse-blokk */}
      <div className="flex flex-col gap-1" /* paper-exact: 5XQ-0 */>
        <span
          className="font-bold uppercase text-ink-muted"
          style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5XR-0 (Leveringsadresse-eyebrow) */
        >
          Leveringsadresse
        </span>
        <p className="text-ink" style={{ fontSize: '14px', lineHeight: '20px' }} /* paper-exact: 5XS-0 (14/20 ink) */>
          {addr.company && <>{addr.company}<br /></>}
          {fullName && <>{fullName}<br /></>}
          {addr.addressLine1}
          {addr.addressLine2 && <>, {addr.addressLine2}</>}
          {(addr.postalCode || addr.city) && (
            <>, {addr.postalCode} {addr.city}</>
          )}
        </p>
      </div>
      {/* Divider */}
      <div className="my-4 h-px bg-divider" /* paper-exact: 5XV-0 */ aria-hidden />
      {/* Fraktmetode-rad */}
      <div className="flex items-baseline justify-between" /* paper-exact: 5XW-0 */>
        <span className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 5XX-0 */>
          Fraktmetode
        </span>
        <span className="font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 5XY-0 */>
          {confirmation.shippingMethod}
        </span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* CTAs — Paper 5Y2-0                                                          */
/* -------------------------------------------------------------------------- */
function CtaStack({ orderId }: { orderId: number }) {
  return (
    <div className="flex flex-col gap-2" /* paper-exact: 5Y2-0 (gap 8) */>
      <Link
        href={`/konto/ordrer/${orderId}`}
        className="flex items-center justify-center rounded-1 bg-aka px-6 py-4 font-bold text-shiro transition-opacity hover:opacity-90" /* paper-exact: 5Y3-0 (py 15 px 24 — bytt til aka for primary-CTA-konsistens) */
        style={{ fontSize: '15px', lineHeight: '18px', letterSpacing: '-0.01em' }} /* paper-exact: 5Y4-0 (15/18 bold shiro -0.01em) */
      >
        Se ordredetaljer
      </Link>
      <Link
        href="/produkter"
        className="flex items-center justify-center rounded-1 border border-ink bg-surface px-6 py-4 font-bold text-ink transition-colors hover:bg-canvas" /* paper-exact: 5Y5-0 (py 15 px 24 border ink) */
        style={{ fontSize: '15px', lineHeight: '18px', letterSpacing: '-0.01em' }} /* paper-exact: 5Y6-0 */
      >
        Fortsett å handle →
      </Link>
    </div>
  );
}
