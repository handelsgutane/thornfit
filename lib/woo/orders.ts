/**
 * WooCommerce orders — kunde-fasade for Profile-area (Paper 6B7-0).
 *
 * Henter ordrer for én kunde fra WC REST. WC autentisering bruker
 * consumer_key + consumer_secret som er server-side hemmeligheter (se
 * `lib/woo/client.ts` -> `wooFetch`). Vi scoper kallet med `customer=<id>`
 * der id-en kommer fra `getSessionUser()`.
 *
 * Server-only.
 *
 * Status (2026-04-25):
 *   Implementasjonen er bevisst minimal — vi henter kun de feltene Paper
 *   6B7-0 / 7UR-0 viser i ordrelisten:
 *     - id (number)
 *     - date_created
 *     - status
 *     - total
 *     - line_items (kun count + førsteproduktets navn for "Produkter"-kolonnen)
 *
 *   Detalj-siden (`/konto/ordrer/[id]`) blir egen iterasjon — for nå
 *   linker vi tilbake til WooCommerce my-account hvis brukeren klikker rad.
 */

import 'server-only';

import { wooFetch, WooError } from './client';
import { logger, serializeError } from '@/lib/logger';
import type { Address } from '@/types/user';
import type { OrderStatus } from '@/types/order';

// ---------------------------------------------------------------------------
// Public types — det subsetet UI faktisk trenger
// ---------------------------------------------------------------------------

export interface OrderListRow {
  readonly id: number;
  readonly number: string;
  readonly status: OrderStatus | string;
  readonly createdAt: string;
  readonly total: number;
  readonly currency: string;
  /** Antall vare-linjer på ordren (Paper viser "3 produkter" e.l.). */
  readonly itemCount: number;
  /** Førsteproduktets navn — brukes i "Produkter"-kolonnen sammen med count. */
  readonly firstItemName: string | null;
  /** Førsteproduktets bilde — brukes som thumbnail i tabell + cards. */
  readonly firstItemImageUrl: string | null;
}

export interface FetchOrdersOptions {
  /** Default 20 — Paper 6B7-0 viser ~10 rader, vi henter litt ekstra slik at
   *  klient-side søk har innhold å filtrere på uten et nytt round-trip. */
  readonly perPage?: number;
  readonly page?: number;
}

// ---------------------------------------------------------------------------
// Order detail — Paper 6GT-0 desktop / 7UX-0 mobile
// ---------------------------------------------------------------------------

/**
 * En vare-linje på en ordre, normalisert til camelCase. Brukes i
 * Ordredetalj-tabell (desktop) og produkt-card-stack (mobile).
 */
export interface OrderDetailLineItem {
  readonly id: number;
  readonly productId: number;
  readonly variationId: number | null;
  readonly name: string;
  readonly sku: string | null;
  /** Variant-tekst hvis noe — f.eks. "Størrelse: 240mm". */
  readonly variation: string | null;
  readonly quantity: number;
  /** Enhetspris (inkl. mva). */
  readonly price: number;
  /** Linje-subtotal før rabatter (inkl. mva). */
  readonly subtotal: number;
  /** Linje-total etter rabatter (inkl. mva). */
  readonly total: number;
  /** Linje-mva. */
  readonly tax: number;
  readonly imageUrl: string | null;
}

/** Totals-blokk — Paper 6GT-0 781-0 viser disse 5 linjene. */
export interface OrderDetailTotals {
  readonly subtotal: number;
  readonly shipping: number;
  /** Rabatt (positivt tall, men presenteres som negativt i UI). */
  readonly discount: number;
  /** Beløp som er mva (av total). */
  readonly vatAmount: number;
  readonly total: number;
}

/** Adresse-blokk — vi holder en flat shape som matcher det Paper viser. */
export interface OrderDetailAddress {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  readonly phone: string | null;
  readonly email: string | null;
}

/** En timeline-event på desktop-detaljsiden (Paper 79R-0). */
export interface OrderDetailTimelineEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly at: string;
  /** "System" eller bruker-navn — vises etter bullet på datolinjen. */
  readonly actor: string;
  readonly kind:
    | 'created'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | 'note';
}

export interface OrderDetail {
  readonly id: number;
  readonly number: string;
  readonly status: OrderStatus | string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly completedAt: string | null;
  readonly currency: string;

  readonly lineItems: ReadonlyArray<OrderDetailLineItem>;
  readonly totals: OrderDetailTotals;

  readonly billing: OrderDetailAddress;
  readonly shipping: OrderDetailAddress;

  readonly paymentMethod: string | null;
  readonly paymentMethodTitle: string | null;
  readonly transactionId: string | null;

  readonly shippingMethod: string | null;
  readonly couponCodes: ReadonlyArray<string>;
  readonly customerNote: string | null;

  /** Avledet timeline brukt på desktop "Ordrehistorikk"-card. */
  readonly timeline: ReadonlyArray<OrderDetailTimelineEntry>;
}

// ---------------------------------------------------------------------------
// WC REST raw shape (kun felt vi bruker)
// ---------------------------------------------------------------------------

interface WcOrderRaw {
  readonly id?: number;
  readonly number?: string;
  readonly status?: string;
  readonly currency?: string;
  readonly date_created?: string;
  readonly date_created_gmt?: string;
  readonly total?: string;
  readonly line_items?: ReadonlyArray<{
    readonly id?: number;
    readonly name?: string;
    readonly quantity?: number;
    readonly image?: { readonly src?: string };
  }>;
}

/**
 * Full WC-ordreshape — kun feltene vi mapper til OrderDetail. Alt er
 * `readonly`/optional siden vi ikke kontrollerer Woo-API-en og må tåle at
 * felter mangler i edge-cases (gamle ordrer, gjest-checkout, manuell
 * order-import, …).
 */
interface WcOrderDetailRaw {
  readonly id?: number;
  readonly number?: string;
  readonly status?: string;
  readonly currency?: string;
  readonly customer_id?: number;

  readonly date_created?: string;
  readonly date_created_gmt?: string;
  readonly date_paid?: string | null;
  readonly date_paid_gmt?: string | null;
  readonly date_completed?: string | null;
  readonly date_completed_gmt?: string | null;
  readonly date_modified?: string | null;
  readonly date_modified_gmt?: string | null;

  readonly discount_total?: string;
  readonly shipping_total?: string;
  readonly total?: string;
  readonly total_tax?: string;

  readonly payment_method?: string;
  readonly payment_method_title?: string;
  readonly transaction_id?: string;
  readonly customer_note?: string;

  readonly billing?: WcAddressRaw;
  readonly shipping?: WcAddressRaw;

  readonly line_items?: ReadonlyArray<WcLineItemRaw>;
  readonly shipping_lines?: ReadonlyArray<{
    readonly method_title?: string;
    readonly method_id?: string;
  }>;
  readonly coupon_lines?: ReadonlyArray<{
    readonly code?: string;
  }>;
}

interface WcAddressRaw {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly company?: string;
  readonly address_1?: string;
  readonly address_2?: string;
  readonly postcode?: string;
  readonly city?: string;
  readonly country?: string;
  readonly phone?: string;
  readonly email?: string;
}

interface WcLineItemRaw {
  readonly id?: number;
  readonly product_id?: number;
  readonly variation_id?: number;
  readonly name?: string;
  readonly sku?: string | null;
  readonly quantity?: number;
  readonly price?: number;
  readonly subtotal?: string;
  readonly total?: string;
  readonly total_tax?: string;
  readonly image?: { readonly src?: string };
  readonly meta_data?: ReadonlyArray<{
    readonly key?: string;
    readonly display_key?: string;
    readonly display_value?: string;
    readonly value?: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hent ordrer for én kunde. Returnerer tom array på feil — Profile-siden
 * skal aldri 500e bare fordi WC midlertidig er nede; vi viser "ingen ordrer
 * ennå"-state i stedet og logger feilen.
 */
export async function fetchUserOrders(
  customerId: number,
  options: FetchOrdersOptions = {},
): Promise<OrderListRow[]> {
  const perPage = options.perPage ?? 20;
  const page = options.page ?? 1;

  try {
    const raw = await wooFetch<readonly WcOrderRaw[]>('/wc/v3/orders', {
      query: {
        customer: customerId,
        per_page: perPage,
        page,
        orderby: 'date',
        order: 'desc',
      },
      // Konto-siden er per-bruker og endrer seg hver gang en ordre legges
      // inn — ikke cache mellom requests.
      cache: 'no-store',
    });

    return raw.map(toOrderRow).filter((r): r is OrderListRow => r !== null);
  } catch (err) {
    if (err instanceof WooError && err.status === 401) {
      // 401 betyr at consumer_key/secret er feil — det er en infra-bug, ikke
      // en bruker-feil. Logg som error og returner tom liste.
      logger.error('fetchUserOrders: WC auth failed (consumer key/secret)', {
        customerId,
        ...serializeError(err),
      });
      return [];
    }

    logger.warn('fetchUserOrders: failed — returning empty list', {
      customerId,
      ...serializeError(err),
    });
    return [];
  }
}

/**
 * Hent én enkelt ordre med full detalj. Verifiserer at ordren tilhører
 * `customerId` — alle andre ordrer returnerer null så ruten kan 404'e.
 *
 * Samme feil-policy som listen: 401 = infra-bug (logg error), andre =
 * forbigående/ukjent (logg warn). Begge returnerer null så Ordredetalj-ruten
 * kan vise 404 i stedet for å 500e.
 */
export async function fetchUserOrder(
  customerId: number,
  orderId: number,
): Promise<OrderDetail | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  try {
    const raw = await wooFetch<WcOrderDetailRaw>(`/wc/v3/orders/${orderId}`, {
      cache: 'no-store',
    });

    // Hvis Woo ikke returnerer customer_id (gjest-checkout) eller den ikke
    // matcher denne brukeren — behandle som ikke-funnet. Vi vil ikke at en
    // tilfeldig customer skal kunne lese andres ordre med ID-gjetting.
    if (typeof raw.customer_id !== 'number' || raw.customer_id !== customerId) {
      return null;
    }

    return toOrderDetail(raw);
  } catch (err) {
    if (err instanceof WooError && err.status === 404) {
      // Ordren finnes ikke i Woo — ruten skal bare vise 404.
      return null;
    }

    if (err instanceof WooError && err.status === 401) {
      logger.error('fetchUserOrder: WC auth failed (consumer key/secret)', {
        customerId,
        orderId,
        ...serializeError(err),
      });
      return null;
    }

    logger.warn('fetchUserOrder: failed — returning null', {
      customerId,
      orderId,
      ...serializeError(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toOrderRow(raw: WcOrderRaw): OrderListRow | null {
  if (typeof raw.id !== 'number') return null;

  const items = raw.line_items ?? [];
  const itemCount = items.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
  const first = items[0];

  const total = Number(raw.total ?? '0');

  return {
    id: raw.id,
    number: raw.number ?? String(raw.id),
    status: raw.status ?? 'pending',
    createdAt: raw.date_created_gmt ?? raw.date_created ?? new Date().toISOString(),
    total: Number.isFinite(total) ? total : 0,
    currency: raw.currency ?? 'NOK',
    itemCount,
    firstItemName: first?.name ?? null,
    firstItemImageUrl: first?.image?.src ?? null,
  };
}

// ---------------------------------------------------------------------------
// Order detail — mappers
// ---------------------------------------------------------------------------

function toOrderDetail(raw: WcOrderDetailRaw): OrderDetail {
  const id = typeof raw.id === 'number' ? raw.id : 0;
  const lineItems = (raw.line_items ?? []).map(toLineItem);

  // Subtotal = sum av line-subtotals (før rabatt). Woo returnerer
  // `discount_total` separat — vi viser det som negativt i UI.
  const subtotal = lineItems.reduce((acc, li) => acc + li.subtotal, 0);
  const shipping = parseDecimal(raw.shipping_total);
  const discount = parseDecimal(raw.discount_total);
  const vatAmount = parseDecimal(raw.total_tax);
  const total = parseDecimal(raw.total);

  const createdAt =
    raw.date_created_gmt ?? raw.date_created ?? new Date().toISOString();
  const paidAt = raw.date_paid_gmt ?? raw.date_paid ?? null;
  const completedAt = raw.date_completed_gmt ?? raw.date_completed ?? null;

  return {
    id,
    number: raw.number ?? String(id),
    status: raw.status ?? 'pending',
    createdAt,
    paidAt,
    completedAt,
    currency: raw.currency ?? 'NOK',

    lineItems,
    totals: { subtotal, shipping, discount, vatAmount, total },

    billing: toAddress(raw.billing),
    shipping: toAddress(raw.shipping),

    paymentMethod: nonEmpty(raw.payment_method),
    paymentMethodTitle: nonEmpty(raw.payment_method_title),
    transactionId: nonEmpty(raw.transaction_id),

    shippingMethod: nonEmpty(raw.shipping_lines?.[0]?.method_title),
    couponCodes: (raw.coupon_lines ?? [])
      .map((c) => nonEmpty(c.code))
      .filter((c): c is string => c !== null),
    customerNote: nonEmpty(raw.customer_note),

    timeline: buildTimeline(raw, { createdAt, paidAt, completedAt }),
  };
}

function toLineItem(raw: WcLineItemRaw): OrderDetailLineItem {
  const id = typeof raw.id === 'number' ? raw.id : 0;
  const productId = typeof raw.product_id === 'number' ? raw.product_id : 0;
  const variationId =
    typeof raw.variation_id === 'number' && raw.variation_id > 0
      ? raw.variation_id
      : null;

  const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
  const subtotal = parseDecimal(raw.subtotal);
  const total = parseDecimal(raw.total);
  const tax = parseDecimal(raw.total_tax);

  // `price` på line-item er en number i Woo, men er per stykk EX mva. Vi vil
  // helst vise inkl. mva på Ordredetalj — bruk subtotal/quantity hvis vi har
  // begge, ellers fallback til raw.price.
  const unitPrice =
    quantity > 0 && subtotal > 0
      ? subtotal / quantity
      : typeof raw.price === 'number'
        ? raw.price
        : 0;

  return {
    id,
    productId,
    variationId,
    name: raw.name ?? '',
    sku: nonEmpty(raw.sku ?? undefined),
    variation: extractVariationLabel(raw.meta_data),
    quantity,
    price: unitPrice,
    subtotal,
    total,
    tax,
    imageUrl: nonEmpty(raw.image?.src),
  };
}

function toAddress(raw?: WcAddressRaw): OrderDetailAddress {
  return {
    firstName: raw?.first_name ?? '',
    lastName: raw?.last_name ?? '',
    company: nonEmpty(raw?.company),
    addressLine1: raw?.address_1 ?? '',
    addressLine2: nonEmpty(raw?.address_2),
    postalCode: raw?.postcode ?? '',
    city: raw?.city ?? '',
    country: raw?.country ?? 'NO',
    phone: nonEmpty(raw?.phone),
    email: nonEmpty(raw?.email),
  };
}

/**
 * Bygg timeline for desktop "Ordrehistorikk"-card (Paper 79R-0).
 *
 * Vi har ikke event-historikk i Woo-API-en — så vi syntetiserer en enkel
 * timeline ut fra status + dato-stempler vi vet om. Det dekker 80% av
 * tilfellene og er bra nok til at brukeren forstår "hvor er ordren min".
 *
 * Returnerer reverse-chronological (nyeste øverst) for å matche Paper 79R-0.
 *
 * Actor-feltet defaulter til "System". Kun "Ordre plassert" får kunde-navn,
 * fordi det er den eneste hendelsen vi vet kunden trigget direkte.
 */
function buildTimeline(
  raw: WcOrderDetailRaw,
  dates: {
    readonly createdAt: string;
    readonly paidAt: string | null;
    readonly completedAt: string | null;
  },
): ReadonlyArray<OrderDetailTimelineEntry> {
  const out: OrderDetailTimelineEntry[] = [];
  const orderNumber = raw.number ?? String(raw.id ?? '');
  const customerName = [raw.billing?.first_name, raw.billing?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const actorSystem = 'System';

  out.push({
    id: 'created',
    title: 'Ordre plassert',
    description: `Ordre #${orderNumber} opprettet og sendt til behandling.`,
    at: dates.createdAt,
    actor: customerName || actorSystem,
    kind: 'created',
  });

  if (dates.paidAt) {
    out.push({
      id: 'paid',
      title: 'Betaling bekreftet',
      description: 'Betaling registrert mot ordren.',
      at: dates.paidAt,
      actor: actorSystem,
      kind: 'paid',
    });
  }

  if (raw.status === 'processing' || raw.status === 'completed') {
    out.push({
      id: 'processing',
      title: 'Pakkes hos oss',
      description: 'Ordren er under behandling og pakkes for sending.',
      at: dates.paidAt ?? dates.createdAt,
      actor: actorSystem,
      kind: 'processing',
    });
  }

  if (dates.completedAt) {
    out.push({
      id: 'completed',
      title: 'Ordre levert',
      description: 'Ordren er fullført og levert.',
      at: dates.completedAt,
      actor: actorSystem,
      kind: 'completed',
    });
  } else if (raw.status === 'cancelled') {
    out.push({
      id: 'cancelled',
      title: 'Ordre kansellert',
      description: 'Ordren ble kansellert.',
      at: raw.date_modified_gmt ?? raw.date_modified ?? dates.createdAt,
      actor: actorSystem,
      kind: 'cancelled',
    });
  } else if (raw.status === 'refunded') {
    out.push({
      id: 'refunded',
      title: 'Ordre refundert',
      description: 'Beløpet er refundert til opprinnelig betalingsmåte.',
      at: raw.date_modified_gmt ?? raw.date_modified ?? dates.createdAt,
      actor: actorSystem,
      kind: 'refunded',
    });
  }

  // Reverse — nyeste først (Paper 79R-0).
  return out.reverse();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDecimal(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(s: string | null | undefined): string | null {
  if (s == null) return null;
  const trimmed = s.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Variant-meta i Woo line-items kommer som array of `{ display_key, display_value }`.
 * Vi plukker ut det første "synlige" feltet (uten leading underscore i key) og
 * formaterer det som "Key: Value". Returnerer null hvis ingen.
 */
function extractVariationLabel(
  meta: WcLineItemRaw['meta_data'],
): string | null {
  if (!meta || meta.length === 0) return null;
  const visible = meta.find(
    (m) =>
      typeof m.key === 'string' &&
      !m.key.startsWith('_') &&
      typeof m.display_value === 'string' &&
      m.display_value !== '',
  );
  if (!visible) return null;
  const key = visible.display_key ?? visible.key ?? '';
  return key ? `${key}: ${visible.display_value}` : (visible.display_value ?? null);
}

// Re-export for konsumenter som ikke vil dra inn `@/types/user`.
export type { Address };
