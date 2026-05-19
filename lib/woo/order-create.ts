/**
 * WooCommerce order creation primitiver.
 *
 * Server-only. Tar et FERDIG-VALIDERT, server-recomputed payload-objekt og
 * sender det til `POST /wp-json/wc/v3/orders` via `wooFetch`. Validering,
 * pris-beregning, idempotens-cache osv. lever i `lib/checkout/order.ts` —
 * denne fila er bevisst tynn.
 *
 * Designvalg:
 *   - Ingen `any`-typer. Inputs er typed via `BuildOrderPayloadInput`.
 *   - Ingen `Cart`-avhengighet — denne fila vet ikke om Zustand. Den tar inn
 *     ferdig-mappede `OrderLineInput`-rader fra orchestratoren.
 *   - **MVA-håndtering — eksplisitt brut MVA-breakdown per linje:**
 *     Vi sender ALLE fire pris-feltene Woo støtter per line item:
 *       - `subtotal` = ex-MVA prinsipal FØR rabatt
 *       - `subtotal_tax` = MVA-andel av `subtotal`
 *       - `total` = ex-MVA prinsipal ETTER rabatt
 *       - `total_tax` = MVA-andel av `total`
 *     Når alle fire er gitt, recalculerer Woo IKKE noe — verdiene lagres
 *     verbatim. Dette er kritisk fordi vi har custom rabatt-logikk
 *     (bulk-discount-engine, fremtidige kuponger, medlemsrabatter) som Woo
 *     ikke kjenner. Hvis Woo fikk recalculere, ville den brukt produkt-pris
 *     × antall og ignorert rabattene våre — og order-totalen ville ikke
 *     matche det kunden så på "Bekreft"-knappen.
 *
 *     I tillegg sender vi `prices_include_tax: false` på ordre-payloaden.
 *     Dette feltet er ikke offisielt dokumentert i Woo REST-spec, men er
 *     en de-facto-konvensjon for å fortelle ordre-prosessoren "alle priser
 *     i denne payloaden er ex-tax — ikke prøv å trekke MVA ut av dem".
 *     Sammen med eksplisitt `*_tax`-felter er det belt-and-suspenders.
 *
 *     Orchestratoren (`lib/checkout/order.ts`) verifiserer Woos returnerte
 *     `total` mot vår beregnede `orderTotal` etter create — hvis Woo likevel
 *     skulle recalculere (gammel versjon, custom plugin), fanges drift
 *     runtime og ordren kanselleres før kunden belastes.
 *   - Status hardkodet til `pending` (svar på avklaring 2026-05-06): når NEXI
 *     wires senere, går statusen til `processing` via webhook ved godkjent
 *     betaling.
 *   - meta_data brukes til å feste audit-info: `_source`, `_idempotency_key`,
 *     `_app_version`. `_source` lar admin filtrere "fra-nye-frontend"-ordre i
 *     wp-admin og er nyttig hvis vi senere kjører A/B mot legacy-checkouten.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { wooFetch, WooError } from './client';

// ---------------------------------------------------------------------------
// Public types — orchestrator-input
// ---------------------------------------------------------------------------

/**
 * En linje i ordren. Priser er allerede recomputet server-side fra Supabase
 * og splittet i ex-MVA-prinsipal + eksplisitt MVA-andel slik at Woo ikke
 * recalculerer noe.
 *
 * Sammenheng:
 *   subtotalExVat + subtotalTax = inkl-MVA-subtotal (pre-discount)
 *   totalExVat    + totalTax    = inkl-MVA-total    (post-discount)
 */
export interface OrderLineInput {
  readonly productId: number;
  readonly variationId: number | null;
  readonly quantity: number;
  /** Enhetspris inkl. MVA. Brukes kun for logging/sanity-check, ikke sendt
   *  direkte til Woo. */
  readonly unitPriceInclVat: number;
  /** Linje-subtotal FØR rabatt, EX MVA. */
  readonly subtotalExVat: number;
  /** MVA-andel av `subtotalExVat`. */
  readonly subtotalTax: number;
  /** Linje-total ETTER rabatt, EX MVA. Like `subtotalExVat` hvis ingen rabatt. */
  readonly totalExVat: number;
  /** MVA-andel av `totalExVat`. */
  readonly totalTax: number;
}

/** Adresse-input — flat shape som matcher CheckoutClient. */
export interface OrderAddressInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  /** ISO-2 country-code. Forventet 'NO' (validert i orchestrator). */
  readonly country: string;
  readonly phone: string;
  /** Kun på billing — `null` på shipping. */
  readonly email: string | null;
}

/** Frakt-linje for Woo `shipping_lines`. */
export interface OrderShippingLineInput {
  /** Woo method-id, f.eks. `flat_rate` eller `local_pickup`. */
  readonly methodId: string;
  /** Bruker-vist tittel — Woo bruker dette i e-post/admin. */
  readonly methodTitle: string;
  /** Frakt-kostnad ex MVA i NOK. `0` for pickup/gratis. */
  readonly totalExVat: number;
  /** MVA-andel av `totalExVat`. */
  readonly totalTax: number;
}

/** Coupon-linje. Tom liste hvis ingen kuponger er anvendt. */
export interface OrderCouponLineInput {
  readonly code: string;
}

/**
 * Split-payment-breakdown — hvor mye som er betalt med hver metode.
 *
 * Sum av `amounts` skal være lik ordrens totale beløp inkl. MVA. Dette er
 * single-source-of-truth for split-payment (gavekort + kort), og brukes av
 * regnskap (Tripletex) og refund-logikken til å avgjøre hvor refund skal
 * tilbake til. Selv ren-kort-ordre lagrer dette (kun ett entry) så down-
 * stream-konsumenter slipper å spesialcase singleton.
 *
 * Persisteres som `_payment_accepted_per_payement_type` (chef-storefront's
 * navngiving — beholdt for kompatibilitet med eksisterende Tripletex-
 * mappere).
 */
export interface PaymentBreakdownEntry {
  /** Method-id matcher Woo gateway-id'en, f.eks. `'card'` eller `'giftcard'`. */
  readonly method: string;
  /** Beløp inkl. MVA i NOK. */
  readonly amount: number;
}

/** Komplett input til `buildWooOrderPayload`. */
export interface BuildOrderPayloadInput {
  /** Innlogget kunde-id, eller `0` for gjest. */
  readonly customerId: number;
  /** Linje-items. Minst én. */
  readonly lineItems: ReadonlyArray<OrderLineInput>;
  readonly shippingAddress: OrderAddressInput;
  readonly billingAddress: OrderAddressInput;
  readonly shippingLine: OrderShippingLineInput;
  /** Woo payment method id — typisk `nexi` (når NEXI wires) eller `bacs`. */
  readonly paymentMethodId: string;
  readonly paymentMethodTitle: string;
  readonly customerNote: string;
  readonly couponLines: ReadonlyArray<OrderCouponLineInput>;
  /** Idempotency key fra klient. Persistert i meta_data for audit. */
  readonly idempotencyKey: string;
  /** Git SHA / app-versjon. Persistert i meta_data for forensics. */
  readonly appVersion: string;
  /**
   * Split-payment-breakdown. Sum av `amount` skal være lik ordre-total inkl.
   * MVA. For ren-kort: `[{ method: 'card', amount: 1675.00 }]`. For
   * gavekort + kort: to entries.
   */
  readonly paymentBreakdown: ReadonlyArray<PaymentBreakdownEntry>;
  /** Kontakt-telefon (separat fra billing.phone — checkout-skjemaet har én
   *  felles telefon i kontakt-seksjonen og en valgfri på adresse). */
  readonly contactPhone: string;
  /** Frakt-metode-id som brukeren valgte (f.eks. `'posten-sporing'`). Vi
   *  lagrer denne som meta så support kan se det opprinnelige UI-valget,
   *  selv etter at admin endrer shipping-line i wp-admin. */
  readonly shippingMethodId: string | null;
  /** Lokasjons-id hvis kunden valgte pickup. Kun ett utsalgssted i dag,
   *  men datamodellen forbereder for flere. */
  readonly pickupLocation: PickupLocation | null;
  /** Ønsket leveringsdato hvis kunde har valgt det. Null hvis ikke pickup
   *  og ingen valgt dato. */
  readonly deliveryDate: string | null;
}

/** Detaljer om butikk-pickup som lagres på ordren. */
export interface PickupLocation {
  /** Stabil id, f.eks. `'butikk-grunerlokka'`. */
  readonly id: string;
  /** Visningsnavn — vises i admin og kunde-e-post. */
  readonly name: string;
  /** Full adresse — én streng. */
  readonly address: string;
}

// ---------------------------------------------------------------------------
// Woo REST payload types — det subsetet vi faktisk sender
// ---------------------------------------------------------------------------

interface WcMetaDataItem {
  readonly key: string;
  readonly value: string | number | boolean;
}

interface WcAddressPayload {
  readonly first_name: string;
  readonly last_name: string;
  readonly company: string;
  readonly address_1: string;
  readonly address_2: string;
  readonly city: string;
  readonly postcode: string;
  readonly country: string;
  readonly phone: string;
  readonly email?: string;
}

interface WcLineItemPayload {
  readonly product_id: number;
  readonly variation_id?: number;
  readonly quantity: number;
  /** Pre-discount subtotal EX MVA, som streng (Woo-konvensjon). */
  readonly subtotal: string;
  /** Eksplisitt MVA-andel av subtotal. Når denne er gitt, recalculerer
   *  Woo IKKE MVA fra tax-class. */
  readonly subtotal_tax: string;
  /** Post-discount total EX MVA, som streng. */
  readonly total: string;
  /** Eksplisitt MVA-andel av total. */
  readonly total_tax: string;
}

interface WcShippingLinePayload {
  readonly method_id: string;
  readonly method_title: string;
  /** Frakt-kost EX MVA. */
  readonly total: string;
  /** Eksplisitt MVA-andel av frakt-total. */
  readonly total_tax: string;
}

interface WcCouponLinePayload {
  readonly code: string;
}

/** Det vi faktisk POSTer til `/wc/v3/orders`. */
export interface WcOrderCreatePayload {
  readonly status: 'pending';
  readonly currency: 'NOK';
  readonly customer_id: number;
  readonly payment_method: string;
  readonly payment_method_title: string;
  readonly billing: WcAddressPayload;
  readonly shipping: WcAddressPayload;
  readonly line_items: ReadonlyArray<WcLineItemPayload>;
  readonly shipping_lines: ReadonlyArray<WcShippingLinePayload>;
  readonly coupon_lines: ReadonlyArray<WcCouponLinePayload>;
  readonly customer_note: string;
  readonly meta_data: ReadonlyArray<WcMetaDataItem>;
  /** Sett til false: vi sender priser EX MVA + eksplisitte `*_tax`-felter.
   *  Sammen med per-linje tax-feltene gir dette Woo all info uten å
   *  recalculere noe. Feltet er ikke offisielt dokumentert på order-
   *  endepunktet, men er en utbredt konvensjon. */
  readonly prices_include_tax: false;
  /** Sett til false så Woo ikke trigger automatisk e-post før betaling
   *  bekreftes. New-order-mail sendes ved status-overgang til `processing`. */
  readonly set_paid: false;
}

// ---------------------------------------------------------------------------
// Build payload
// ---------------------------------------------------------------------------

/**
 * Konstruer Woo-order-payload fra normalisert input. Pure function — ingen IO.
 *
 * Numeriske felter formateres med 2 desimaler som streng (Woos REST forventer
 * `"123.45"`, ikke `123.45`).
 */
export function buildWooOrderPayload(
  input: BuildOrderPayloadInput,
): WcOrderCreatePayload {
  return {
    status: 'pending',
    currency: 'NOK',
    customer_id: input.customerId,
    payment_method: input.paymentMethodId,
    payment_method_title: input.paymentMethodTitle,
    billing: toWcAddress(input.billingAddress),
    shipping: toWcAddress({ ...input.shippingAddress, email: null }),
    line_items: input.lineItems.map(toWcLineItem),
    shipping_lines: [toWcShippingLine(input.shippingLine)],
    coupon_lines: input.couponLines.map((c) => ({ code: c.code })),
    customer_note: input.customerNote,
    meta_data: buildMetaData(input),
    prices_include_tax: false,
    set_paid: false,
  };
}

/**
 * Bygger meta_data-arrayet. Sentralisert her så det er enkelt å se hva
 * Woo-ordren får festet på seg, og hva ned-strøms (Tripletex, regnskap,
 * Slack, support) kan stole på.
 */
function buildMetaData(
  input: BuildOrderPayloadInput,
): ReadonlyArray<WcMetaDataItem> {
  const meta: WcMetaDataItem[] = [
    // Audit / forensics
    { key: '_source', value: 'skarpekniver-frontend' },
    { key: '_idempotency_key', value: input.idempotencyKey },
    { key: '_app_version', value: input.appVersion },

    // MVA-flagg — eksplisitt for å unngå at en plugin/cron senere antar
    // fritak. Vi selger kun B2C i Norge, alltid med MVA.
    { key: 'is_vat_exempt', value: 'no' },

    // Split-payment-breakdown — chef-storefront's mønster, single source
    // of truth for hvor mye som ble betalt med hver metode.
    {
      key: '_payment_accepted_per_payement_type',
      value: JSON.stringify(
        input.paymentBreakdown.reduce<Record<string, number>>((acc, e) => {
          acc[e.method] = round2(e.amount);
          return acc;
        }, {}),
      ),
    },

    // Frakt-metadata — admin/Tripletex bruker dette for tracking-system-
    // mapping. `_nets_shipping_reference` matcher plugin-ens forventning.
    { key: '_shipping_method', value: input.shippingLine.methodTitle },
    {
      key: '_shipping_cost',
      value: formatMoney(input.shippingLine.totalExVat + input.shippingLine.totalTax),
    },
    {
      key: '_nets_shipping_reference',
      value: input.shippingMethodId
        ? `shipping|${input.shippingMethodId}`
        : `shipping|${input.shippingLine.methodId}`,
    },

    // Kontakt-telefon (separat fra billing.phone i UI)
    { key: '_contact_phone', value: input.contactPhone },
  ];

  // Pickup-detaljer (kun når relevant)
  if (input.pickupLocation) {
    meta.push(
      { key: '_pickup_location_id', value: input.pickupLocation.id },
      { key: '_pickup_location_name', value: input.pickupLocation.name },
      { key: '_pickup_location_address', value: input.pickupLocation.address },
    );
  }

  // Leveringsdato (kun når kunde valgte det og ikke pickup)
  if (input.deliveryDate && !input.pickupLocation) {
    meta.push({ key: '_delivery_date', value: input.deliveryDate });
  }

  return meta;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toWcAddress(addr: OrderAddressInput): WcAddressPayload {
  const base: WcAddressPayload = {
    first_name: addr.firstName,
    last_name: addr.lastName,
    company: addr.company,
    address_1: addr.addressLine1,
    address_2: addr.addressLine2,
    city: addr.city,
    postcode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
  };
  // E-post bare på billing. Woo aksepterer `email` på shipping også men ignorerer
  // det. Holder payload smal.
  return addr.email ? { ...base, email: addr.email } : base;
}

function toWcLineItem(line: OrderLineInput): WcLineItemPayload {
  const base: WcLineItemPayload = {
    product_id: line.productId,
    quantity: line.quantity,
    subtotal: formatMoney(line.subtotalExVat),
    subtotal_tax: formatMoney(line.subtotalTax),
    total: formatMoney(line.totalExVat),
    total_tax: formatMoney(line.totalTax),
  };
  return line.variationId !== null
    ? { ...base, variation_id: line.variationId }
    : base;
}

function toWcShippingLine(line: OrderShippingLineInput): WcShippingLinePayload {
  return {
    method_id: line.methodId,
    method_title: line.methodTitle,
    total: formatMoney(line.totalExVat),
    total_tax: formatMoney(line.totalTax),
  };
}

/** Woo REST forventer prisene som strenger med 2 desimaler. */
function formatMoney(value: number): string {
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// Create order
// ---------------------------------------------------------------------------

/** Det subsetet vi leser fra Woo-svaret etter create. */
export interface CreatedWooOrder {
  readonly id: number;
  readonly number: string;
  readonly status: string;
  readonly total: number;
  readonly currency: string;
  readonly orderKey: string;
  readonly createdAt: string;
}

/** Subset av Woo-responseens shape — alt optional fordi vi ikke kontrollerer
 *  Woo-API'et og må tåle at felter mangler i edge-cases. */
interface WcCreatedOrderRaw {
  readonly id?: number;
  readonly number?: string;
  readonly status?: string;
  readonly currency?: string;
  readonly total?: string;
  readonly order_key?: string;
  readonly date_created?: string;
  readonly date_created_gmt?: string;
}

/**
 * Send payload til Woo og normaliser responset. Kaster `WooError` på 4xx/5xx.
 * Caller (orchestrator) ansvarlig for retry-/idempotency-håndtering.
 */
export async function createWooOrder(
  payload: WcOrderCreatePayload,
): Promise<CreatedWooOrder> {
  try {
    const raw = await wooFetch<WcCreatedOrderRaw>('/wc/v3/orders', {
      method: 'POST',
      body: payload,
      // POST er ikke cachable — wooFetch setter ikke `next` på non-GET.
      // `retries: 0` for å unngå at en retry oppretter en duplikat-ordre
      // hvis Woo svarte langsomt men faktisk lagret. Idempotency er
      // håndtert lengre opp i call-stacken.
      retries: 0,
    });

    if (typeof raw.id !== 'number' || raw.id <= 0) {
      throw new WooError(
        'Woo order create succeeded but response had no order id',
        500,
        raw,
      );
    }

    return {
      id: raw.id,
      number: raw.number ?? String(raw.id),
      status: raw.status ?? 'pending',
      total: raw.total !== undefined ? Number(raw.total) : 0,
      currency: raw.currency ?? 'NOK',
      orderKey: raw.order_key ?? '',
      createdAt: raw.date_created_gmt
        ? `${raw.date_created_gmt}Z`
        : raw.date_created ?? new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof WooError) {
      logger.error('createWooOrder failed', {
        status: err.status,
        body: err.body,
        idempotencyKey: payload.meta_data.find((m) => m.key === '_idempotency_key')?.value,
      });
      throw err;
    }
    logger.error('createWooOrder unexpected error', {
      ...serializeError(err),
    });
    throw err;
  }
}
