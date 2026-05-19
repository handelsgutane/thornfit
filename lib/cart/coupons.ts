/**
 * Coupon-validering og rabatt-beregning. Pure logic — ingen IO. Lar oss
 * kjøre samme algoritme i `/api/cart/coupon/validate`-route som i checkout-
 * orchestratoren slik at klient og server alltid ser samme rabatt-beløp.
 *
 * Per `docs/discount-engine.md`:
 *
 *   **Støttede `discount_type`-er:** `percent`, `fixed_cart`
 *
 *   **Filter-kjede for hvilke items som teller i rabatt-base:**
 *     1. Bulk-eksklusjon — items i `bulkAppliedItemKeys` ekskluderes alltid
 *        (eksklusiv-stabling-policy: hver vare maks én rabatt).
 *     2. Sale-eksklusjon — hvis `coupon.excludeSaleItems === true`, items hvor
 *        `unitPriceInclVat < regularPriceInclVat` ekskluderes.
 *     3. Produkt-restriksjoner — `productIds`/`excludedProductIds` matcher mot
 *        `item.productId`. `productCategories`/`excludedProductCategories`
 *        matcher mot `item.categoryIds[]`. Items som ikke passerer filtrene
 *        ekskluderes.
 *
 *     Items som passerer alle filtre danner `eligibleSubtotalInclVat`. Rabatt
 *     beregnes mot denne basen.
 *
 *   **`individual_use`:** hvis ny kupong har individual_use OG
 *     `existingActiveCouponCodes` ikke er tom → reject. Hvis ikke-individual
 *     OG cart har en eksisterende individual_use-kupong → reject (caller
 *     må sende existingIndividualUseFlag-info; for MVP forenklet til "hvis
 *     en eksisterende kode finnes og ny er individual_use, så reject").
 *
 *   **Avvist (UNSUPPORTED_TYPE):** `free_shipping`, `email_restrictions`,
 *     `usage_limit_per_user`, `limit_usage_to_x_items`, `smart_coupon`-typen.
 *     Skipper med eksplisitt error så admin oppdager begrensningen.
 *
 * MVA-konvensjon: vi opererer på inkl-MVA-tall hele veien.
 */

import type { WooCouponDefinition } from '@/lib/woo/coupons';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AppliedCoupon {
  /** Original-kupong-koden (case-bevart fra Woo). */
  readonly code: string;
  /** Discount-type vi støtter — caller kan ikke få annet enn disse. */
  readonly discountType: 'percent' | 'fixed_cart';
  /** Råverdi fra Woo (10 = 10%, 100 = 100 kr). For UI-visning. */
  readonly rawAmount: number;
  /** Beregnet rabatt for nåværende cart, i NOK inkl. MVA. */
  readonly discountInclVat: number;
  /** Bruker-vennlig sammendrag, f.eks. "10 % rabatt" eller "100 kr avslag". */
  readonly summary: string;
  /** Cart-item-keys som rabatten gjelder for — brukes av orchestrator når
   *  rabatten distribueres per linje (proporsjonalt på `eligibleSubtotal`). */
  readonly eligibleItemKeys: ReadonlyArray<string>;
  /** True hvis kupongen har `individual_use` — caller bruker dette til å
   *  hindre kombinasjon med andre kuponger på cart-nivå. */
  readonly individualUse: boolean;
}

export type CouponValidationError =
  | { readonly code: 'NOT_FOUND' }
  | { readonly code: 'EXPIRED' }
  | { readonly code: 'USAGE_LIMIT_REACHED' }
  | {
      readonly code: 'MIN_AMOUNT_NOT_MET';
      readonly required: number;
      readonly current: number;
    }
  | {
      readonly code: 'MAX_AMOUNT_EXCEEDED';
      readonly maximum: number;
      readonly current: number;
    }
  | { readonly code: 'UNSUPPORTED_TYPE'; readonly reason: string }
  | { readonly code: 'INDIVIDUAL_USE_CONFLICT' }
  | { readonly code: 'NO_ELIGIBLE_ITEMS' }
  | { readonly code: 'INVALID' };

export interface CartItemForCoupon {
  /** Stable cart-item-key — brukes til matching mot bulkAppliedItemKeys og
   *  til å bygge `eligibleItemKeys` i resultat. */
  readonly key: string;
  readonly productId: number;
  readonly quantity: number;
  /** Pris per stk inkl. MVA (vanligvis sale-pris hvis på salg). */
  readonly unitPriceInclVat: number;
  /** Original-pris per stk inkl. MVA. Hvis `regularPriceInclVat > unitPriceInclVat`,
   *  regnes linjen som "salgsvare" og ekskluderes hvis kupongen har
   *  `excludeSaleItems`. Sett lik `unitPriceInclVat` hvis produktet ikke
   *  har sale-pris. */
  readonly regularPriceInclVat: number;
  /** WC category-IDer linjen tilhører. Brukes til product_categories-
   *  matching. Tom array hvis ukjent (caller må fylle ut). */
  readonly categoryIds: ReadonlyArray<number>;
}

export interface ApplyCouponInput {
  readonly coupon: WooCouponDefinition;
  readonly items: ReadonlyArray<CartItemForCoupon>;
  /** Cart-item-keys som allerede har bulk-rabatt anvendt. Disse linjene
   *  ekskluderes ALLTID fra kupong-base (eksklusiv-stabling-policy). */
  readonly bulkAppliedItemKeys: ReadonlySet<string>;
  /** Allerede aktive kupong-koder på cart-en. Brukes til individual_use-
   *  konflikt-sjekk. Tom array hvis ingen andre kuponger er aktive. */
  readonly existingActiveCouponCodes: ReadonlyArray<string>;
  /** Brukes til å validere `expiry`. Caller sender vanligvis `new Date()`. */
  readonly now: Date;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validerer kupongen mot cart og beregner rabatt-beløp.
 *
 * Returnerer enten en `AppliedCoupon` eller en `CouponValidationError`.
 * Caller bruker discriminated union (sjekk `'discountInclVat' in result`)
 * for å plukke ut suksess vs feil.
 */
export function applyCoupon(
  input: ApplyCouponInput,
): AppliedCoupon | CouponValidationError {
  const { coupon, items, bulkAppliedItemKeys, existingActiveCouponCodes, now } =
    input;

  // 1. Discount-type — kun percent og fixed_cart støttes.
  if (
    coupon.discountType !== 'percent' &&
    coupon.discountType !== 'fixed_cart'
  ) {
    return {
      code: 'UNSUPPORTED_TYPE',
      reason: `discount_type "${coupon.discountType}" støttes ikke i ny checkout`,
    };
  }

  // 2. Avvis kuponger med deferred-felter (UNSUPPORTED). Disse må håndteres
  //    av admin via en alternativ kupong-konfigurasjon, eller vi utvider
  //    evaluator senere.
  if (coupon.freeShipping) {
    // TODO(free-shipping): når vi støtter dette, må evaluator returnere et
    // ekstra `freeShipping`-flagg, og orchestrator må sette shippingCost = 0.
    return {
      code: 'UNSUPPORTED_TYPE',
      reason: 'Kuponger med gratis frakt er ikke wired enda',
    };
  }
  if (coupon.emailRestrictions.length > 0) {
    return {
      code: 'UNSUPPORTED_TYPE',
      reason: 'Kuponger med e-post-restriksjoner er ikke wired',
    };
  }
  if (coupon.usageLimitPerUser !== null && coupon.usageLimitPerUser > 0) {
    return {
      code: 'UNSUPPORTED_TYPE',
      reason: 'Kuponger med per-bruker-grense er ikke wired',
    };
  }
  if (coupon.limitUsageToXItems !== null && coupon.limitUsageToXItems > 0) {
    return {
      code: 'UNSUPPORTED_TYPE',
      reason: 'Kuponger med "limit usage to X items" er ikke wired',
    };
  }

  // 3. Individual-use-konflikt.
  //
  //    Per spec: hvis ny kupong har individual_use OG cart har eksisterende
  //    aktive kuponger → reject.
  //    Vi har ikke per-kupong individual_use-info for de eksisterende på cart
  //    her, så hvis NY ikke er individual_use men cart har eksisterende, må
  //    den callerens ansvar håndtere konflikten (f.eks. ved å bare hindre
  //    flere aktive samtidig). For MVP er denne ene retningen tilstrekkelig.
  if (coupon.individualUse && existingActiveCouponCodes.length > 0) {
    return { code: 'INDIVIDUAL_USE_CONFLICT' };
  }

  // 4. Expiry.
  if (coupon.dateExpires) {
    const expires = new Date(coupon.dateExpires);
    if (Number.isFinite(expires.getTime()) && expires < now) {
      return { code: 'EXPIRED' };
    }
  }

  // 5. Total usage_limit.
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { code: 'USAGE_LIMIT_REACHED' };
  }

  // 6. Min/max amount sjekkes mot total cart-subtotal (ikke filtrert).
  const totalSubtotal = items.reduce(
    (sum, i) => sum + i.unitPriceInclVat * i.quantity,
    0,
  );
  if (coupon.minimumAmount > 0 && totalSubtotal < coupon.minimumAmount) {
    return {
      code: 'MIN_AMOUNT_NOT_MET',
      required: coupon.minimumAmount,
      current: round2(totalSubtotal),
    };
  }
  if (coupon.maximumAmount > 0 && totalSubtotal > coupon.maximumAmount) {
    return {
      code: 'MAX_AMOUNT_EXCEEDED',
      maximum: coupon.maximumAmount,
      current: round2(totalSubtotal),
    };
  }

  // 7. Filter-kjede — finn eligible items.
  const eligibleItems = items.filter((item) =>
    isItemEligible(item, coupon, bulkAppliedItemKeys),
  );
  const eligibleSubtotal = eligibleItems.reduce(
    (sum, i) => sum + i.unitPriceInclVat * i.quantity,
    0,
  );

  if (eligibleItems.length === 0 || eligibleSubtotal <= 0) {
    return { code: 'NO_ELIGIBLE_ITEMS' };
  }

  // 8. Beregn rabatt mot eligible subtotal.
  let discountInclVat = 0;
  let summary = '';

  if (coupon.discountType === 'percent') {
    discountInclVat = round2(eligibleSubtotal * (coupon.amount / 100));
    summary = `${formatPercent(coupon.amount)} rabatt`;
  } else {
    // fixed_cart — capet til eligibleSubtotal
    discountInclVat = round2(Math.min(coupon.amount, eligibleSubtotal));
    summary = `${formatNok(discountInclVat)} avslag`;
  }

  if (discountInclVat <= 0) {
    return { code: 'INVALID' };
  }

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    rawAmount: coupon.amount,
    discountInclVat,
    summary,
    eligibleItemKeys: eligibleItems.map((i) => i.key),
    individualUse: coupon.individualUse,
  };
}

/**
 * Bruker-vennlig melding for validation-error.
 */
export function couponErrorMessage(error: CouponValidationError): string {
  switch (error.code) {
    case 'NOT_FOUND':
      return 'Rabattkoden finnes ikke.';
    case 'EXPIRED':
      return 'Rabattkoden er utløpt.';
    case 'USAGE_LIMIT_REACHED':
      return 'Rabattkoden er brukt opp.';
    case 'MIN_AMOUNT_NOT_MET':
      return `Krever minimum ${formatNok(error.required)} i handlekurv (du har ${formatNok(error.current)}).`;
    case 'MAX_AMOUNT_EXCEEDED':
      return `Gjelder kun for handlekurver under ${formatNok(error.maximum)}.`;
    case 'UNSUPPORTED_TYPE':
      return `Denne rabattkoden støttes ikke i checkout. Kontakt support.`;
    case 'INDIVIDUAL_USE_CONFLICT':
      return 'Denne rabattkoden kan ikke kombineres med andre rabattkoder.';
    case 'NO_ELIGIBLE_ITEMS':
      return 'Rabattkoden gjelder ikke for varene i handlekurven din.';
    case 'INVALID':
    default:
      return 'Rabattkoden kan ikke brukes på din handlekurv.';
  }
}

// ---------------------------------------------------------------------------
// Filter-helper
// ---------------------------------------------------------------------------

function isItemEligible(
  item: CartItemForCoupon,
  coupon: WooCouponDefinition,
  bulkAppliedItemKeys: ReadonlySet<string>,
): boolean {
  // 1. Bulk-eksklusjon — alltid.
  if (bulkAppliedItemKeys.has(item.key)) return false;

  // 2. Sale-eksklusjon — hvis kupongen har excludeSaleItems.
  if (coupon.excludeSaleItems && item.unitPriceInclVat < item.regularPriceInclVat) {
    return false;
  }

  // 3. Excluded product_ids — koden gjelder IKKE disse produktene.
  if (
    coupon.excludedProductIds.length > 0 &&
    coupon.excludedProductIds.includes(item.productId)
  ) {
    return false;
  }

  // 4. Excluded product_categories — koden gjelder IKKE disse kategoriene.
  if (
    coupon.excludedProductCategories.length > 0 &&
    item.categoryIds.some((cid) =>
      coupon.excludedProductCategories.includes(cid),
    )
  ) {
    return false;
  }

  // 5. Allowed product_ids (whitelist) — koden gjelder KUN disse hvis listen
  //    ikke er tom.
  if (
    coupon.productIds.length > 0 &&
    !coupon.productIds.includes(item.productId)
  ) {
    return false;
  }

  // 6. Allowed product_categories (whitelist) — minst én av items kategorier
  //    må være i listen.
  if (coupon.productCategories.length > 0) {
    const hasMatchingCategory = item.categoryIds.some((cid) =>
      coupon.productCategories.includes(cid),
    );
    if (!hasMatchingCategory) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatNok(value: number): string {
  return (
    new Intl.NumberFormat('nb-NO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value)) + ' kr'
  );
}

function formatPercent(value: number): string {
  const formatted = new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} %`;
}
