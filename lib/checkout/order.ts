/**
 * Server-side checkout-orchestrator.
 *
 * Orkestrerer flyten "klient klikker Bekreft ordre" → "Woo-ordre opprettet":
 *
 *   1. Validerer input-shape (zod).
 *   2. Tar lock i Redis på `idempotencyKey` (10-min cache for retries).
 *   3. Slår opp produkter fra Supabase-speilet — vi stoler ALDRI på priser
 *      som kommer fra klient.
 *   4. Recomputer rabatter via samme `evaluateBulkRules` som klienten bruker.
 *      Dette eliminerer drift mellom UI og server.
 *   5. Sammenligner mot klient-vist total (`expectedTotal`) — avvik > 1 kr
 *      = `409 PRICE_DRIFT` (priser endret mellom cart-hydration og bekreft).
 *   6. Bygger Woo-payload via `buildWooOrderPayload`.
 *   7. POSTer mot Woo via `createWooOrder`.
 *   8. Cacher resultatet under idempotency-key + frigir lock'en.
 *
 * Server-only.
 */

import 'server-only';

import { z } from 'zod';

import { fetchActiveBulkRules } from '@/lib/cart/discounts/fetch';
import { evaluateBulkRules } from '@/lib/cart/discounts/bulk';
import type {
  AppliedDiscount,
  DiscountCartItem,
} from '@/lib/cart/discounts/types';
import { logger, serializeError } from '@/lib/logger';
import { getProductById } from '@/lib/supabase/catalog';
import { WooError } from '@/lib/woo/client';
import {
  buildWooOrderPayload,
  createWooOrder,
  type OrderAddressInput,
  type OrderLineInput,
  type OrderShippingLineInput,
} from '@/lib/woo/order-create';
import { updateWooOrderStatus } from '@/lib/woo/order-status';
import { VAT_RATE } from '@/types/cart';
import {
  claimIdempotencyKey,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
  storeIdempotencyResult,
  type CachedOrderResult,
} from './idempotency';
import { SHIPPING_METHODS, type ShippingMethod } from './shipping';

// ---------------------------------------------------------------------------
// Input schema (klient → server)
// ---------------------------------------------------------------------------

const AddressSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).default(''),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(''),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Postnummer må være 4 siffer (kun Norge støttes).'),
  city: z.string().trim().min(1).max(120),
  country: z
    .literal('NO')
    .describe('Kun Norge er støttet (ADR-0005).'),
  phone: z.string().trim().max(40).default(''),
});

const LineItemSchema = z.object({
  productId: z.number().int().positive(),
  variationId: z.number().int().positive().nullable().default(null),
  quantity: z.number().int().min(1).max(99),
});

export const CheckoutOrderInputSchema = z.object({
  idempotencyKey: z.string().refine(isValidIdempotencyKey, {
    message: 'idempotencyKey må være en UUID.',
  }),
  contact: z.object({
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().min(1).max(40),
  }),
  deliveryMode: z.enum(['send', 'pickup']),
  /** Ignorert hvis deliveryMode = 'pickup'. */
  shippingMethodId: z.string().nullable(),
  shippingAddress: AddressSchema,
  /** Tom = bruk shippingAddress også som fakturaadresse. */
  billingAddress: AddressSchema.nullable(),
  paymentMethodId: z.enum(['card', 'invoice']),
  customerNote: z.string().trim().max(2000).default(''),
  items: z.array(LineItemSchema).min(1, 'Kurven må ha minst én vare.'),
  couponCodes: z.array(z.string().trim().min(1)).default([]),
  /** Klient-vist total — server avviser 409 hvis vi recomputer noe annet. */
  expectedTotal: z.number().nonnegative(),
});

export type CheckoutOrderInput = z.infer<typeof CheckoutOrderInputSchema>;

// ---------------------------------------------------------------------------
// Output / error shapes
// ---------------------------------------------------------------------------

export interface CheckoutOrderSuccess {
  readonly ok: true;
  readonly orderId: number;
  readonly orderNumber: string;
  /** Woos `order_key` — soft-auth-token vi gir klienten slik at den kan
   *  kalle `/api/payments/nexi/init` uten å kreve session. Ikke gjettebar. */
  readonly orderKey: string;
  readonly status: string;
  readonly total: number;
  readonly currency: string;
  /** Hvor klienten skal sende brukeren videre. */
  readonly redirectUrl: string;
  /** True hvis vi traff cache (idempotency-retry). */
  readonly cached: boolean;
}

export type CheckoutOrderErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PRODUCT'
  | 'OUT_OF_STOCK'
  | 'INVALID_SHIPPING'
  | 'PRICE_DRIFT'
  | 'IN_FLIGHT'
  | 'WOO_FAILED'
  | 'INTERNAL';

export interface CheckoutOrderError {
  readonly ok: false;
  readonly code: CheckoutOrderErrorCode;
  /** Brukervennlig melding på norsk. */
  readonly message: string;
  /** HTTP-status caller skal returnere. */
  readonly status: number;
  /** Ekstra strukturert data (f.eks. liste over manglende produkter). */
  readonly details?: Record<string, unknown>;
}

export type CheckoutOrderResult = CheckoutOrderSuccess | CheckoutOrderError;

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

/** Tillatt drift mellom klient-total og server-recompute, i kroner. Tar høyde
 *  for IEEE-754-runde-fluktuasjoner på cart-summary; større avvik betyr at
 *  noe har endret seg (pris-oppdatering på et produkt mens cart sto åpen). */
const PRICE_DRIFT_TOLERANCE_KR = 1;

/** Tillatt avvik mellom server-beregnet `orderTotal` og det Woo returnerer
 *  etter create. Hvis avviket er større, har Woo tolket prisene annerledes
 *  enn vi forventet (typisk: store-innstillingen `prices_include_tax = no`
 *  som gir 25 % MVA-på-toppen). Vi kansellerer ordren og returnerer feil
 *  i stedet for å la kunden bli belastet feil beløp. Toleransen er romslig
 *  så små runde-forskjeller i Woos egen MVA-beregning ikke trigger kansell. */
const WOO_TOTAL_VERIFY_TOLERANCE_KR = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SubmitCheckoutOrderContext {
  /** Innlogget bruker, eller null for gjest. Settes av API-route fra session. */
  readonly customerId: number | null;
  /** Site URL for redirect. */
  readonly siteUrl: string;
  /** App-versjon (git SHA o.l.) — flettes inn i ordrens meta_data. */
  readonly appVersion: string;
}

/**
 * Hovedinngang. Validerer, recomputer, kaller Woo, cacher.
 *
 * Throws aldri for forventede feil (manglende produkt, drift, osv.) — alle
 * konverteres til `CheckoutOrderError` så API-route kan svare en konsistent
 * JSON-shape. Throws kun ved totalt uventet feil (programming bug).
 */
export async function submitCheckoutOrder(
  rawInput: unknown,
  context: SubmitCheckoutOrderContext,
): Promise<CheckoutOrderResult> {
  // 1. Validate input
  const parsed = CheckoutOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return invalidInputError(first?.message ?? 'Ugyldig forespørsel.');
  }
  const input = parsed.data;

  // 2. Idempotency claim
  const claim = await claimIdempotencyKey(input.idempotencyKey);
  if (claim.state === 'cached') {
    logger.info('checkout: idempotency cache hit', {
      orderId: claim.result.orderId,
      idempotencyKey: input.idempotencyKey,
    });
    return successFromCache(claim.result, context.siteUrl);
  }
  if (claim.state === 'in-flight') {
    return {
      ok: false,
      code: 'IN_FLIGHT',
      message: 'Ordren behandles allerede. Vent et øyeblikk.',
      status: 409,
    };
  }
  // claim.state === 'new' — vi har lock'en. Husk å frigi den ved feil.

  try {
    return await runCreateFlow(input, context);
  } catch (err) {
    // Uventet feil — slipp lock så bruker kan retrye.
    await releaseIdempotencyKey(input.idempotencyKey);
    logger.error('checkout: unexpected error in submitCheckoutOrder', {
      idempotencyKey: input.idempotencyKey,
      ...serializeError(err),
    });
    if (err instanceof WooError) {
      return {
        ok: false,
        code: 'WOO_FAILED',
        message: 'Vi kunne ikke opprette ordren akkurat nå. Prøv igjen om litt.',
        status: 502,
        details: { wooStatus: err.status },
      };
    }
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'Noe gikk galt. Prøv igjen.',
      status: 500,
    };
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function runCreateFlow(
  input: CheckoutOrderInput,
  context: SubmitCheckoutOrderContext,
): Promise<CheckoutOrderResult> {
  // 3. Resolve shipping
  const shippingResolution = resolveShipping(input);
  if (!shippingResolution.ok) {
    await releaseIdempotencyKey(input.idempotencyKey);
    return shippingResolution;
  }
  const { shipping, deliveryMode } = shippingResolution;

  // 4. Look up products from Supabase
  const productsResolution = await resolveProducts(input.items);
  if (!productsResolution.ok) {
    await releaseIdempotencyKey(input.idempotencyKey);
    return productsResolution;
  }
  const { resolvedItems } = productsResolution;

  // 5. Apply bulk-discount rules
  const discounts = await applyDiscounts(resolvedItems);

  // 6. Compute line totals + order total.
  //
  // Hver linje splittes i ex-MVA-prinsipal + eksplisitt MVA-andel slik at
  // Woo ikke recalculerer. `orderTotal` (det kunden faktisk betaler)
  // beregnes som sum av alle linje-totaler INKL. MVA + frakt INKL. MVA —
  // det er denne vi sammenligner mot klientens `expectedTotal` og senere
  // mot Woos returnerte `total`.
  const lineItems = buildLineItems(resolvedItems, discounts);
  const itemsTotalInclVat = round2(
    lineItems.reduce((s, l) => s + l.totalExVat + l.totalTax, 0),
  );
  const shippingCostInclVat = deliveryMode === 'pickup' ? 0 : shipping.cost;
  const orderTotal = round2(itemsTotalInclVat + shippingCostInclVat);

  // 7. Drift check vs klient.
  //
  // Vi avviser KUN hvis server-recomputed total er HØYERE enn klient viste —
  // da har en pris gått opp mellom cart og submit, og vi vil ikke at kunden
  // skal belastes mer enn det som sto på "Bekreft ordre"-knappen.
  //
  // Hvis server-recomputed total er LAVERE (typisk: bulk-rabatt kickset inn,
  // eller en pris er nedjustert i admin), prosesserer vi ordren som normalt.
  // Kunden betaler mindre enn forventet — det er en god overraskelse, ikke
  // en feilsituasjon. Logg det likevel for synlighet.
  const overcharge = orderTotal - input.expectedTotal;
  if (overcharge > PRICE_DRIFT_TOLERANCE_KR) {
    await releaseIdempotencyKey(input.idempotencyKey);
    logger.warn('checkout: price drift detected (overcharge)', {
      idempotencyKey: input.idempotencyKey,
      clientExpected: input.expectedTotal,
      serverComputed: orderTotal,
      overcharge,
    });
    return {
      ok: false,
      code: 'PRICE_DRIFT',
      message:
        'Prisene har endret seg siden du la varene i kurven. Last siden på nytt og bekreft igjen.',
      status: 409,
      details: {
        expectedTotal: input.expectedTotal,
        actualTotal: orderTotal,
      },
    };
  }
  if (input.expectedTotal - orderTotal > PRICE_DRIFT_TOLERANCE_KR) {
    logger.info('checkout: server total lower than client expected — proceeding', {
      idempotencyKey: input.idempotencyKey,
      clientExpected: input.expectedTotal,
      serverComputed: orderTotal,
      savings: round2(input.expectedTotal - orderTotal),
    });
  }

  // 8. Build Woo payload
  const payload = buildWooOrderPayload({
    customerId: context.customerId ?? 0,
    lineItems,
    shippingAddress: toOrderAddress(input.shippingAddress, null),
    billingAddress: toOrderAddress(
      input.billingAddress ?? input.shippingAddress,
      input.contact.email,
    ),
    shippingLine: buildShippingLine(shipping, deliveryMode),
    paymentMethodId: paymentMethodIdForWoo(input.paymentMethodId),
    paymentMethodTitle: paymentMethodTitleForWoo(input.paymentMethodId),
    customerNote: input.customerNote,
    couponLines: input.couponCodes.map((code) => ({ code })),
    idempotencyKey: input.idempotencyKey,
    appVersion: context.appVersion,
    // Split-payment-breakdown. I dag er det kun ren-betaling (kort eller
    // faktura) — én entry. Når gavekort-flyten lander (fase 2 av Nexi-
    // planen), legges det til en `{ method: 'giftcard', amount: X }`-entry
    // her og `card`-entry justeres til restbeløp.
    paymentBreakdown: [
      { method: input.paymentMethodId, amount: orderTotal },
    ],
    contactPhone: input.contact.phone,
    shippingMethodId: deliveryMode === 'pickup' ? null : input.shippingMethodId,
    // Pickup-lokasjon: ikke wired i UI ennå. Når flere utsalgssteder
    // kommer, lager checkout-skjemaet et locationId-velgervalg og
    // vi maps her. Inntil videre: alltid null på pickup.
    pickupLocation: null,
    // Leveringsdato: ikke i UI ennå. Future-extension.
    deliveryDate: null,
  });

  // 9. POST to Woo
  let created;
  try {
    created = await createWooOrder(payload);
  } catch (err) {
    await releaseIdempotencyKey(input.idempotencyKey);
    if (err instanceof WooError) {
      logger.error('checkout: Woo create failed', {
        idempotencyKey: input.idempotencyKey,
        wooStatus: err.status,
        wooBody: err.body,
      });
      return {
        ok: false,
        code: 'WOO_FAILED',
        message:
          err.status === 400
            ? 'Vi kunne ikke validere ordren mot lager-systemet. Sjekk feltene og prøv igjen.'
            : 'Vi kunne ikke opprette ordren akkurat nå. Prøv igjen om litt.',
        status: 502,
        details: { wooStatus: err.status },
      };
    }
    throw err;
  }

  // 10. Verify Woos returnerte total mot vår beregnede `orderTotal`.
  //
  // Dette fanger MVA-konfigurasjonsmismatch ved runtime: hvis Woo store har
  // `prices_include_tax = no` og vi sendte priser inkl. MVA, vil Woo regne
  // ut total = vår-total × 1.25 og kunden ville blitt belastet 25 % for mye.
  // Vi sammenligner Woos `total` mot vår `orderTotal` (begge skal være inkl.
  // MVA i NOK) og kansellerer ordren hvis avviket er større enn toleransen.
  //
  // Tilsvarende fanger vi tilfeller hvor noe annet uventet skjer i Woo-
  // pipelinen (3rd-party-plugin som modifiserer ordren, kupong som ikke
  // ble validert som forventet, e.l.).
  const wooTotalDelta = Math.abs(created.total - orderTotal);
  if (wooTotalDelta > WOO_TOTAL_VERIFY_TOLERANCE_KR) {
    logger.error('checkout: Woo total mismatch — cancelling order', {
      idempotencyKey: input.idempotencyKey,
      orderId: created.id,
      ourComputedTotal: orderTotal,
      wooReturnedTotal: created.total,
      delta: wooTotalDelta,
      hint:
        'Sjekk WC store-innstilling: WooCommerce → Settings → General → ' +
        'Prices entered with tax. Den må stå på "Yes, I will enter prices ' +
        'inclusive of tax" siden Supabase-speilet har inkl-MVA-priser.',
    });

    // Beste-effort-cancel. Hvis dette feiler, har vi en pending Woo-ordre
    // med feil total, men kunden er ikke belastet (status er pending,
    // set_paid: false). Admin må følge opp manuelt — feilen logges som
    // error og bør trigge alarm.
    try {
      await updateWooOrderStatus(created.id, 'cancelled');
    } catch (cancelErr) {
      logger.error('checkout: failed to cancel mismatched order', {
        orderId: created.id,
        ...serializeError(cancelErr),
      });
    }

    await releaseIdempotencyKey(input.idempotencyKey);
    return {
      ok: false,
      code: 'PRICE_DRIFT',
      message:
        'Vi kunne ikke fullføre ordren på grunn av en pris-konfigurasjon-feil. ' +
        'Vi har varslet teamet — prøv igjen om litt.',
      status: 502,
      details: {
        expectedTotal: orderTotal,
        actualTotal: created.total,
      },
    };
  }

  // 11. Cache result for retries
  const cacheValue: CachedOrderResult = {
    orderId: created.id,
    orderNumber: created.number,
    orderKey: created.orderKey,
    status: created.status,
    total: created.total,
    createdAt: created.createdAt,
  };
  await storeIdempotencyResult(input.idempotencyKey, cacheValue);

  logger.info('checkout: order created', {
    orderId: created.id,
    orderNumber: created.number,
    customerId: context.customerId,
    total: created.total,
    itemCount: input.items.length,
    paymentMethod: input.paymentMethodId,
  });

  return {
    ok: true,
    orderId: created.id,
    orderNumber: created.number,
    orderKey: created.orderKey,
    status: created.status,
    total: created.total,
    currency: created.currency,
    redirectUrl: buildRedirectUrl(context.siteUrl, created.id),
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Shipping resolution
// ---------------------------------------------------------------------------

type ShippingResolution =
  | {
      readonly ok: true;
      readonly shipping: ShippingMethod;
      readonly deliveryMode: 'send' | 'pickup';
    }
  | CheckoutOrderError;

function resolveShipping(input: CheckoutOrderInput): ShippingResolution {
  if (input.deliveryMode === 'pickup') {
    return {
      ok: true,
      deliveryMode: 'pickup',
      // Pseudo-shipping for pickup. Vi trenger en method-id mot Woo, og
      // `local_pickup` er Woos innebygde ID for "henting i butikk".
      shipping: {
        id: 'posten-sporing', // Kun for type-shape; brukes ikke når deliveryMode=pickup
        title: 'Henting i butikk',
        description: '',
        cost: 0,
      },
    };
  }

  if (!input.shippingMethodId) {
    return invalidShippingError('Velg en leveringsmetode.');
  }

  const method = SHIPPING_METHODS.find((m) => m.id === input.shippingMethodId);
  if (!method) {
    return invalidShippingError('Ukjent leveringsmetode.');
  }

  return { ok: true, deliveryMode: 'send', shipping: method };
}

function buildShippingLine(
  method: ShippingMethod,
  deliveryMode: 'send' | 'pickup',
): OrderShippingLineInput {
  if (deliveryMode === 'pickup') {
    return {
      methodId: 'local_pickup',
      methodTitle: 'Henting i butikk',
      totalExVat: 0,
      totalTax: 0,
    };
  }
  // `method.cost` i `lib/checkout/shipping.ts` er definert inkl. MVA.
  // Splitt til ex-MVA + MVA-andel slik at vi sender konsistent format
  // som linje-items til Woo.
  const split = splitVat(method.cost);
  return {
    // Vår frontend-id (`posten-sporing` / `posten-hjem`) mappes til en
    // generic `flat_rate` Woo-method-id med tittelen som disambiguator.
    // Når Woo-shipping-zones senere syncs, kan dette mappes til de
    // faktiske Woo-IDene.
    methodId: 'flat_rate',
    methodTitle: method.title,
    totalExVat: split.exVat,
    totalTax: split.tax,
  };
}

// ---------------------------------------------------------------------------
// Product resolution
// ---------------------------------------------------------------------------

interface ResolvedItem {
  readonly key: string;
  readonly productId: number;
  readonly variationId: number | null;
  readonly sku: string | null;
  readonly quantity: number;
  /** Pris inkl. MVA fra Supabase. */
  readonly unitPrice: number;
  readonly categorySlugs: ReadonlyArray<string>;
  readonly tagSlugs: ReadonlyArray<string>;
}

type ProductResolution =
  | { readonly ok: true; readonly resolvedItems: ReadonlyArray<ResolvedItem> }
  | CheckoutOrderError;

async function resolveProducts(
  items: ReadonlyArray<CheckoutOrderInput['items'][number]>,
): Promise<ProductResolution> {
  const resolved: ResolvedItem[] = [];
  const missing: number[] = [];
  const outOfStock: number[] = [];

  // Sekvensiell — items er typisk få. Hvis det blir varmt punkt, parallelliser
  // med Promise.all.
  for (const item of items) {
    const product = await getProductById(item.productId);
    if (!product) {
      missing.push(item.productId);
      continue;
    }

    if (product.stock_status && product.stock_status === 'outofstock') {
      outOfStock.push(item.productId);
      continue;
    }

    const unitPrice = pickUnitPrice(product);
    if (unitPrice === null) {
      // Produkt uten pris — burde ikke kunne legges i kurv, men defensiv.
      missing.push(item.productId);
      continue;
    }

    resolved.push({
      key: item.variationId
        ? `${item.productId}:${item.variationId}`
        : String(item.productId),
      productId: item.productId,
      variationId: item.variationId,
      sku: product.sku ?? null,
      quantity: item.quantity,
      unitPrice,
      // Slugene brukes av rabatt-evaluatoren. Vi bruker `categories` (id-array)
      // for matching mot productIds; categorySlugs er for slug-baserte regler.
      // For nå: tomt array — slug-mapping kan tas inn senere ved behov.
      categorySlugs: [],
      tagSlugs: Array.isArray(product.tag_slugs) ? product.tag_slugs : [],
    });
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'INVALID_PRODUCT',
      message: 'Ett eller flere produkter er ikke tilgjengelige lenger.',
      status: 400,
      details: { missingProductIds: missing },
    };
  }

  if (outOfStock.length > 0) {
    return {
      ok: false,
      code: 'OUT_OF_STOCK',
      message: 'Ett eller flere produkter er utsolgt.',
      status: 400,
      details: { outOfStockProductIds: outOfStock },
    };
  }

  return { ok: true, resolvedItems: resolved };
}

/**
 * Plukk authoritative enhetspris fra Supabase-raden. `price` kan være
 * sale_price eller regular_price avhengig av om produktet er på salg —
 * Supabase-raden er allerede normalisert av Woo-mapperen.
 */
function pickUnitPrice(product: {
  price: number | null;
  sale_price: number | null;
  regular_price: number | null;
}): number | null {
  if (typeof product.price === 'number' && product.price > 0) return product.price;
  if (typeof product.sale_price === 'number' && product.sale_price > 0) {
    return product.sale_price;
  }
  if (typeof product.regular_price === 'number' && product.regular_price > 0) {
    return product.regular_price;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Discount evaluation
// ---------------------------------------------------------------------------

async function applyDiscounts(
  items: ReadonlyArray<ResolvedItem>,
): Promise<ReadonlyArray<AppliedDiscount>> {
  let rules;
  try {
    rules = await fetchActiveBulkRules();
  } catch (err) {
    // Discount-feil må ikke ta ned checkout — gå videre uten rabatt.
    logger.warn('checkout: bulk rules fetch failed, proceeding without discount', {
      ...serializeError(err),
    });
    return [];
  }

  if (rules.length === 0) return [];

  const discountItems: DiscountCartItem[] = items.map((i) => ({
    key: i.key,
    productId: i.productId,
    sku: i.sku,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    categorySlugs: [...i.categorySlugs],
    tagSlugs: [...i.tagSlugs],
  }));

  return evaluateBulkRules(rules, discountItems);
}

// ---------------------------------------------------------------------------
// Line item builder
// ---------------------------------------------------------------------------

function buildLineItems(
  items: ReadonlyArray<ResolvedItem>,
  discounts: ReadonlyArray<AppliedDiscount>,
): ReadonlyArray<OrderLineInput> {
  const discountByKey = new Map<string, AppliedDiscount>();
  for (const d of discounts) discountByKey.set(d.itemKey, d);

  return items.map((item) => {
    const subtotalInclVat = round2(item.unitPrice * item.quantity);
    const discount = discountByKey.get(item.key);
    const discountInclVat = discount ? round2(discount.discountAmount) : 0;
    const totalInclVat = round2(Math.max(0, subtotalInclVat - discountInclVat));

    const subtotalSplit = splitVat(subtotalInclVat);
    const totalSplit = splitVat(totalInclVat);

    return {
      productId: item.productId,
      variationId: item.variationId,
      quantity: item.quantity,
      unitPriceInclVat: item.unitPrice,
      subtotalExVat: subtotalSplit.exVat,
      subtotalTax: subtotalSplit.tax,
      totalExVat: totalSplit.exVat,
      totalTax: totalSplit.tax,
    } satisfies OrderLineInput;
  });
}

/**
 * Splitt en inkl-MVA-verdi i ex-MVA-prinsipal + MVA-andel. Bevarer summen:
 *   `result.exVat + result.tax === inclVat` (ned til run-2-precisjon).
 *
 * Vi runder `exVat` først og setter `tax = inclVat - exVat` slik at sum
 * matcher inputen eksakt (uten å risikere "kr 999,99 ≠ kr 1 000,00"-glipp).
 */
function splitVat(inclVat: number): { exVat: number; tax: number } {
  if (inclVat <= 0) return { exVat: 0, tax: 0 };
  const exVat = round2(inclVat / (1 + VAT_RATE));
  const tax = round2(inclVat - exVat);
  return { exVat, tax };
}

// ---------------------------------------------------------------------------
// Address mapping
// ---------------------------------------------------------------------------

function toOrderAddress(
  addr: z.infer<typeof AddressSchema>,
  email: string | null,
): OrderAddressInput {
  return {
    firstName: addr.firstName,
    lastName: addr.lastName,
    company: addr.company,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    postalCode: addr.postalCode,
    city: addr.city,
    country: addr.country,
    phone: addr.phone,
    email,
  };
}

// ---------------------------------------------------------------------------
// Payment method mapping
// ---------------------------------------------------------------------------

/**
 * Mapping fra klientens UI-valg til Woos `payment_method`-felt.
 *
 * Vi setter en placeholder-id her ved create — `card` for kort, `invoice` for
 * faktura. Hvis betalingen går via Nexi, overskriver `/api/payments/nexi/init`
 * dette feltet til `dibs_easy` (Krokedil-plugin-ens gateway-id) slik at
 * plugin-ens `woocommerce_order_status_completed`-hook kjenner igjen ordren
 * og kan trigge capture mot Nexi.
 *
 * `_payment_accepted_per_payement_type`-meta JSON bruker simple navn
 * (`card`, `giftcard`, `invoice`) — disse er stabile på tvers av gateway-
 * endringer og brukes av regnskaps-mappere downstream.
 */
function paymentMethodIdForWoo(method: 'card' | 'invoice'): string {
  return method;
}

function paymentMethodTitleForWoo(method: 'card' | 'invoice'): string {
  return method === 'card' ? 'Kort' : 'Faktura';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildRedirectUrl(siteUrl: string, orderId: number): string {
  const trimmed = siteUrl.replace(/\/$/, '');
  // URL-en inkluderer ordre-id for routing/bookmarking, men siden henter
  // ALDRI ordre-data fra serveren basert på den. Den leser kun fra
  // sessionStorage. Direkte-URL-tilgang viser generisk fallback (ingen
  // sensitiv data eksponeres). URL-id-en valideres mot sessionStorage-id
  // før rik render (forhindrer cross-tab-forveksling).
  return `${trimmed}/ordre-bekreftet/${orderId}`;
}

function successFromCache(
  cached: CachedOrderResult,
  siteUrl: string,
): CheckoutOrderSuccess {
  return {
    ok: true,
    orderId: cached.orderId,
    orderNumber: cached.orderNumber,
    orderKey: cached.orderKey,
    status: cached.status,
    total: cached.total,
    currency: 'NOK',
    redirectUrl: buildRedirectUrl(siteUrl, cached.orderId),
    cached: true,
  };
}

function invalidInputError(message: string): CheckoutOrderError {
  return {
    ok: false,
    code: 'INVALID_INPUT',
    message,
    status: 400,
  };
}

function invalidShippingError(message: string): CheckoutOrderError {
  return {
    ok: false,
    code: 'INVALID_SHIPPING',
    message,
    status: 400,
  };
}

