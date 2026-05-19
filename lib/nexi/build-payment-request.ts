/**
 * Bygger Nexi `POST /v1/payments`-payload fra en eksisterende Woo-ordre.
 *
 * Pure function. Ingen IO. Lar oss teste payload-formen uten å mocke noe.
 *
 * Designvalg:
 *
 *   - **Alle beløp i øre/minor units (× 100).** Nexi forventer integer-øre.
 *   - **`taxRate` i basis-points × 100.** For 25 % MVA er verdien `2500`.
 *     Format-valget er Nexi-spesifikt; må IKKE forveksles med vår Woo-
 *     orchestrator som bruker desimal-fraksjon (0.25).
 *   - **B2C-only.** `consumerType.supportedTypes = ['B2C']`. Ingen B2B-grener.
 *     Ingen `company`-objekt på `consumer`. (Avklart 2026-05-06.)
 *   - **Embedded integration-type.** Vi bruker Nexi sitt embedded-checkout-
 *     bibliotek inne i `<CardPaymentModal>`-iframe-mount. `checkout.url` er
 *     vår checkout-side (må matche eksakt fordi Nexi rate-limiter på den).
 *   - **`merchantHandlesConsumerData: true`.** Vi prefyller all kunde-info
 *     fra Woo-ordren slik at brukeren ikke må skrive inn adresse-data på
 *     nytt. (Hadde det vært `false`, ville Nexi vist sitt eget skjema.)
 *   - **Webhook-config.** Vi setter én webhook med
 *     `Authorization: <NEXI_WEBHOOK_AUTH>`. Nexi sender denne tilbake som
 *     `Authorization`-header på callback-en. `eventName` settes til
 *     `payment.checkout.completed` for hovedflyten — andre events
 *     (capture, refund, cancel) registrerer vi separat hvis Nexi støtter
 *     flere webhook-entries (gjør de fra plugin-en's logg).
 *
 * Server-only (importerer fra wooFetch-typer som er server-only).
 */

import 'server-only';

import { serverEnv, clientEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Subset av Woo-ordre-shape som payload-byggeren leser. */
export interface WooOrderForNexi {
  readonly id: number;
  readonly number: string;
  readonly currency: string;
  readonly total: string;
  readonly shipping_total: string;
  readonly shipping_tax: string;
  readonly billing: WooOrderAddress;
  readonly shipping: WooOrderAddress;
  readonly line_items: ReadonlyArray<WooLineItem>;
  readonly shipping_lines: ReadonlyArray<WooShippingLine>;
  readonly fee_lines: ReadonlyArray<WooFeeLine>;
}

interface WooOrderAddress {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly address_1?: string;
  readonly address_2?: string;
  readonly postcode?: string;
  readonly city?: string;
  readonly country?: string;
  readonly phone?: string;
  readonly email?: string;
}

interface WooLineItem {
  readonly id: number;
  readonly name: string;
  readonly product_id: number;
  readonly variation_id?: number;
  readonly sku?: string;
  readonly quantity: number;
  /** Pre-discount line subtotal, ex MVA, som streng. */
  readonly subtotal: string;
  /** Eksplisitt tax-andel av subtotal. */
  readonly subtotal_tax?: string;
  /** Post-discount line total, ex MVA. */
  readonly total: string;
  /** Eksplisitt tax-andel av total. */
  readonly total_tax?: string;
}

interface WooShippingLine {
  readonly method_id?: string;
  readonly method_title?: string;
  readonly total: string;
  readonly total_tax?: string;
}

interface WooFeeLine {
  readonly id: number;
  readonly name: string;
  readonly total: string;
  readonly total_tax?: string;
  readonly tax_status?: string;
}

export interface BuildNexiPaymentRequestInput {
  readonly wcOrder: WooOrderForNexi;
  /** Vår checkout-URL — må matche eksakt domene + path som checkout-siden
   *  serveres på, ellers refuserer Nexi å laste embedded-iframen. */
  readonly checkoutUrl: string;
  /** Webhook-URL som mottar `payment.checkout.completed` mfl. */
  readonly webhookUrl: string;
}

// ---------------------------------------------------------------------------
// Nexi payload types — det subsetet vi sender
// ---------------------------------------------------------------------------

interface NexiOrderItem {
  reference: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  grossTotalAmount: number;
  netTotalAmount: number;
}

interface NexiConsumerAddress {
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country: string;
}

interface NexiConsumerPhone {
  prefix: string;
  number: string;
}

interface NexiConsumerPrivatePerson {
  firstName: string;
  lastName: string;
}

interface NexiConsumer {
  email?: string;
  shippingAddress?: NexiConsumerAddress;
  phoneNumber?: NexiConsumerPhone;
  privatePerson?: NexiConsumerPrivatePerson;
}

interface NexiPaymentCreatePayload {
  order: {
    items: NexiOrderItem[];
    amount: number;
    currency: string;
    reference: string;
  };
  /**
   * `checkout`-blokken: kun feltene som er gyldige for `EmbeddedCheckout`.
   * `returnUrl` og `cancelUrl` STØTTES IKKE av embedded mode (Nexi avviser
   * payloaden med 400). Cancel/complete-håndtering skjer via klient-side
   * JS-events (`payment-completed`, `payment-cancelled`, `payment-failed`)
   * som vi fanger i CardPaymentModal.
   */
  checkout: {
    url: string;
    termsUrl: string;
    integrationType: 'EmbeddedCheckout';
    merchantHandlesConsumerData: true;
    consumer: NexiConsumer;
    consumerType: {
      supportedTypes: ['B2C'];
    };
  };
  notifications?: {
    webHooks: Array<{
      eventName: string;
      url: string;
      authorization: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bygg payloaden vi POSTer til `/v1/payments`. Pure function.
 */
export function buildNexiPaymentRequest(
  input: BuildNexiPaymentRequestInput,
): NexiPaymentCreatePayload {
  const items = buildOrderItems(input.wcOrder);
  const amount = sumGrossTotalAmount(items);

  const payload: NexiPaymentCreatePayload = {
    order: {
      items,
      amount,
      currency: input.wcOrder.currency,
      reference: input.wcOrder.number,
    },
    checkout: {
      url: input.checkoutUrl,
      termsUrl: `${clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/vilkar-og-personvern`,
      integrationType: 'EmbeddedCheckout',
      merchantHandlesConsumerData: true,
      consumer: buildConsumer(input.wcOrder.billing),
      consumerType: { supportedTypes: ['B2C'] },
    },
  };

  // Webhook-config: kun når både URL og auth er satt. På preview-deploys
  // uten Nexi-konfigurasjon hopper vi over hele webhooks-blokken. Da kjører
  // ikke Nexi-callbacks heller — useful for lokal-dev.
  //
  // Event-navngiving fra Nexi-spec'en:
  //   - `payment.checkout.completed` — kunde har bekreftet betaling
  //   - `payment.charge.created.v2`  — capture (v2 er nyere format)
  //   - `payment.charge.failed`      — capture feilet
  //   - `payment.cancel.created`     — kun v1 finnes (ingen .v2)
  //   - `payment.cancel.failed`
  //   - `payment.refund.completed`   — refund prosessert
  //   - `payment.refund.failed`
  if (serverEnv.NEXI_WEBHOOK_AUTH && isPublicHttpsUrl(input.webhookUrl)) {
    const eventNames = [
      'payment.checkout.completed',
      'payment.charge.created.v2',
      'payment.charge.failed',
      'payment.cancel.created',
      'payment.cancel.failed',
      'payment.refund.completed',
      'payment.refund.failed',
    ];
    payload.notifications = {
      webHooks: eventNames.map((eventName) => ({
        eventName,
        url: input.webhookUrl,
        authorization: serverEnv.NEXI_WEBHOOK_AUTH!,
      })),
    };
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Item-mapping
// ---------------------------------------------------------------------------

/**
 * Mapper Woo line_items + shipping + fees til Nexi `order.items`-array.
 *
 * Hver Nexi-item må ha:
 *   - `unitPrice` (ex MVA, øre)
 *   - `taxRate` (basis-points × 100, f.eks. 2500 for 25 %)
 *   - `taxAmount` (øre)
 *   - `netTotalAmount` (ex MVA, øre — etter discount)
 *   - `grossTotalAmount` (incl MVA, øre — etter discount)
 *
 * Vi bruker `total` + `total_tax` fra Woo-ordren (post-discount), ikke
 * `subtotal` (pre-discount). Nexi viser dette beløpet til kunden i sitt
 * iframe og charger på kort.
 */
function buildOrderItems(order: WooOrderForNexi): NexiOrderItem[] {
  const items: NexiOrderItem[] = [];

  for (const line of order.line_items) {
    const netTotal = nokToOre(line.total);
    const taxAmount = nokToOre(line.total_tax ?? '0');
    const grossTotal = netTotal + taxAmount;
    const unitPrice = line.quantity > 0 ? Math.round(netTotal / line.quantity) : 0;
    const taxRate = computeTaxRate(netTotal, taxAmount);

    items.push({
      reference: clipReference(line.sku || `product-${line.product_id}`),
      name: cleanName(line.name),
      quantity: line.quantity,
      unit: 'pcs',
      unitPrice,
      taxRate,
      taxAmount,
      netTotalAmount: netTotal,
      grossTotalAmount: grossTotal,
    });
  }

  for (const shipping of order.shipping_lines) {
    const netTotal = nokToOre(shipping.total);
    if (netTotal <= 0) continue; // Gratis frakt — ikke send som linje
    const taxAmount = nokToOre(shipping.total_tax ?? '0');
    const grossTotal = netTotal + taxAmount;
    const taxRate = computeTaxRate(netTotal, taxAmount);

    items.push({
      reference: clipReference(`shipping|${shipping.method_id ?? 'flat_rate'}`),
      name: cleanName(shipping.method_title ?? 'Frakt'),
      quantity: 1,
      unit: 'pcs',
      unitPrice: netTotal,
      taxRate,
      taxAmount,
      netTotalAmount: netTotal,
      grossTotalAmount: grossTotal,
    });
  }

  // Fee-lines (gavekort kommer hit som negative fees i fase 2).
  for (const fee of order.fee_lines) {
    const netTotal = nokToOre(fee.total);
    if (netTotal === 0) continue;
    const taxAmount = nokToOre(fee.total_tax ?? '0');
    const grossTotal = netTotal + taxAmount;
    const taxRate =
      fee.tax_status === 'none' || taxAmount === 0
        ? 0
        : computeTaxRate(netTotal, taxAmount);

    items.push({
      reference: clipReference(`fee|${fee.id}`),
      name: cleanName(fee.name),
      quantity: 1,
      unit: 'pcs',
      unitPrice: netTotal,
      taxRate,
      taxAmount,
      netTotalAmount: netTotal,
      grossTotalAmount: grossTotal,
    });
  }

  return items;
}

/**
 * MVA-rate i Nexi-format: basis-points × 100. F.eks. 25 % → 2500.
 *
 * Hvis taxAmount eller netTotal er 0 (eller om de er negative — fee-lines),
 * returnerer 0. For positive amounts: `round((tax / net) × 10000)`.
 */
function computeTaxRate(netOre: number, taxOre: number): number {
  if (netOre <= 0 || taxOre <= 0) return 0;
  return Math.round((taxOre / netOre) * 10000);
}

function sumGrossTotalAmount(items: NexiOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.grossTotalAmount, 0);
}

/** Konverter NOK-streng (`"1234.56"`) til øre (`123456`). */
function nokToOre(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Nexi tillater `reference` opp til 128 tegn — vi clipper til 32 for
 *  god skikk (matcher Krokedil-plugin-en). */
function clipReference(value: string): string {
  return value.slice(0, 32);
}

/** Nexi tillater ikke `<`, `>`, `\`, `"`, `&` i `name`-feltet og
 *  begrenser til 128 tegn. */
function cleanName(value: string): string {
  return value.replace(/[<>\\"&]/g, '').slice(0, 128);
}

// ---------------------------------------------------------------------------
// Consumer-mapping
// ---------------------------------------------------------------------------

function buildConsumer(billing: WooOrderAddress): NexiConsumer {
  const consumer: NexiConsumer = {};
  if (billing.email) consumer.email = billing.email;

  const shippingAddress: NexiConsumerAddress = {
    country: countryToIso3(billing.country ?? 'NO'),
  };
  if (billing.address_1) shippingAddress.addressLine1 = billing.address_1;
  if (billing.address_2) shippingAddress.addressLine2 = billing.address_2;
  if (billing.postcode) {
    shippingAddress.postalCode = billing.postcode.replace(/\s/g, '');
  }
  if (billing.city) shippingAddress.city = billing.city;
  consumer.shippingAddress = shippingAddress;

  if (billing.phone) {
    const phone = parsePhone(billing.phone, billing.country ?? 'NO');
    if (phone) consumer.phoneNumber = phone;
  }

  if (billing.first_name || billing.last_name) {
    consumer.privatePerson = {
      firstName: billing.first_name ?? '',
      lastName: billing.last_name ?? '',
    };
  }

  return consumer;
}

/** Nexi forventer ISO-3 country-codes (`NOR`, ikke `NO`). Vi støtter kun
 *  Norge (ADR-0005), så mappingen er trivielt. */
function countryToIso3(iso2: string): string {
  if (iso2.toUpperCase() === 'NO') return 'NOR';
  // Defensiv fallback — burde ikke skje i praksis siden orchestrator
  // hardkoder NO. Returner uppercased input så Nexi gir tydelig feil i
  // stedet for at vi sender noe ugyldig stille.
  return iso2.toUpperCase();
}

/** Splitter telefon i `prefix` + `number` slik Nexi krever. Norske default
 *  er +47 hvis ingen prefix er gitt. */
function parsePhone(
  raw: string,
  countryIso2: string,
): NexiConsumerPhone | null {
  const trimmed = raw.replace(/[\s-]/g, '');
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    // +47XXXXXXXX → prefix `+47`, number resten
    const prefix = trimmed.slice(0, 3);
    const number = trimmed.slice(3);
    if (!number) return null;
    return { prefix, number };
  }

  // Ingen prefix — anta default for landet.
  const defaultPrefix = countryIso2.toUpperCase() === 'NO' ? '+47' : '+47';
  return { prefix: defaultPrefix, number: trimmed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPublicHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname !== 'localhost' &&
      !u.hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}
