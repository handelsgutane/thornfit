/**
 * WooCommerce coupon REST-helper.
 *
 * Henter kupong-definisjon via `GET /wc/v3/coupons?code=<code>`. Returnerer
 * typet objekt med camelCase-felter. Vi speiler IKKE kuponger til Supabase
 * (per docs/business-logic.md > Kuponger): kupong-logikk er for kompleks å
 * holde synkronisert, og det er sjeldne kall — ett per checkout-validering.
 *
 * Server-only.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { wooFetch, WooError } from './client';

/**
 * Mulige discount-typer i Woo. `smart_coupon` kommer fra Smart Coupons-
 * pluginen og fungerer som store-credit/gift-card. Vi støtter foreløpig
 * `percent` og `fixed_cart` i checkout-flyten — øvrige typer returneres
 * unchanged så caller kan velge å avvise med UNSUPPORTED_TYPE.
 */
export type WooCouponDiscountType =
  | 'percent'
  | 'fixed_cart'
  | 'fixed_product'
  | 'percent_product'
  | 'smart_coupon'
  | string;

export interface WooCouponDefinition {
  readonly id: number;
  readonly code: string;
  /** Beløp som streng konvertert til number — for `percent` er det 10 → 10%,
   *  for `fixed_cart` er det 100 → 100 kr. */
  readonly amount: number;
  readonly discountType: WooCouponDiscountType;
  /** ISO-streng eller null (ingen utløp). */
  readonly dateExpires: string | null;
  /** Hvis true: kan ikke kombineres med andre kuponger. */
  readonly individualUse: boolean;
  /** Hvis ikke-tom: koden gjelder kun disse Woo product-IDene. */
  readonly productIds: ReadonlyArray<number>;
  readonly excludedProductIds: ReadonlyArray<number>;
  readonly productCategories: ReadonlyArray<number>;
  readonly excludedProductCategories: ReadonlyArray<number>;
  readonly excludeSaleItems: boolean;
  /** Krav til cart-total før koden kan brukes (i NOK). 0 = ingen krav. */
  readonly minimumAmount: number;
  /** Maks cart-total over hvilken koden ikke kan brukes. 0 = intet tak. */
  readonly maximumAmount: number;
  /** Total maks-bruk på tvers av kunder. `null` = ingen grense. */
  readonly usageLimit: number | null;
  readonly usageLimitPerUser: number | null;
  /** Antall items som kan rabateres (begrenser fixed_product/percent_product). */
  readonly limitUsageToXItems: number | null;
  /** Hvis true: gir gratis frakt i tillegg til discount-beløpet. */
  readonly freeShipping: boolean;
  /** Hvis ikke-tom: koden gjelder kun for disse e-postadressene. */
  readonly emailRestrictions: ReadonlyArray<string>;
  /** Hvor mange ganger koden allerede er brukt. */
  readonly usageCount: number;
}

// ---------------------------------------------------------------------------
// Woo REST raw shape
// ---------------------------------------------------------------------------

interface WcCouponRaw {
  readonly id?: number;
  readonly code?: string;
  readonly amount?: string;
  readonly discount_type?: string;
  readonly date_expires?: string | null;
  readonly date_expires_gmt?: string | null;
  readonly individual_use?: boolean;
  readonly product_ids?: ReadonlyArray<number>;
  readonly excluded_product_ids?: ReadonlyArray<number>;
  readonly product_categories?: ReadonlyArray<number>;
  readonly excluded_product_categories?: ReadonlyArray<number>;
  readonly exclude_sale_items?: boolean;
  readonly minimum_amount?: string;
  readonly maximum_amount?: string;
  readonly usage_limit?: number | null;
  readonly usage_limit_per_user?: number | null;
  readonly limit_usage_to_x_items?: number | null;
  readonly free_shipping?: boolean;
  readonly email_restrictions?: ReadonlyArray<string>;
  readonly usage_count?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hent kupong-definisjon basert på kode (case-insensitive). Returnerer null
 * hvis koden ikke finnes. Kaster `WooError` ved 5xx slik at caller kan vise
 * "tjenesten er nede"-melding (vi vil ikke late som koden er ugyldig hvis
 * Woo midlertidig svikter).
 */
export async function fetchCouponByCode(
  code: string,
): Promise<WooCouponDefinition | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  try {
    // WC REST tar `code` som filter — case-insensitive på Woo-siden.
    const raw = await wooFetch<ReadonlyArray<WcCouponRaw>>('/wc/v3/coupons', {
      query: { code: trimmed, per_page: 1 },
      cache: 'no-store',
    });

    if (raw.length === 0) return null;
    return mapCoupon(raw[0]);
  } catch (err) {
    if (err instanceof WooError) {
      // 401/403 fra Woo betyr feil consumer-key/secret — ikke "kupong finnes
      // ikke". Kast videre slik at API-route gir 503.
      logger.error('fetchCouponByCode: Woo error', {
        code: trimmed,
        wooStatus: err.status,
      });
      throw err;
    }
    logger.warn('fetchCouponByCode: unexpected error', {
      code: trimmed,
      ...serializeError(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapCoupon(raw: WcCouponRaw): WooCouponDefinition {
  const expiresGmt = raw.date_expires_gmt ?? raw.date_expires ?? null;
  return {
    id: raw.id ?? 0,
    code: raw.code ?? '',
    amount: parseDecimal(raw.amount),
    discountType: raw.discount_type ?? '',
    dateExpires: expiresGmt
      ? expiresGmt.endsWith('Z')
        ? expiresGmt
        : `${expiresGmt}Z`
      : null,
    individualUse: !!raw.individual_use,
    productIds: raw.product_ids ?? [],
    excludedProductIds: raw.excluded_product_ids ?? [],
    productCategories: raw.product_categories ?? [],
    excludedProductCategories: raw.excluded_product_categories ?? [],
    excludeSaleItems: !!raw.exclude_sale_items,
    minimumAmount: parseDecimal(raw.minimum_amount),
    maximumAmount: parseDecimal(raw.maximum_amount),
    usageLimit: raw.usage_limit ?? null,
    usageLimitPerUser: raw.usage_limit_per_user ?? null,
    limitUsageToXItems: raw.limit_usage_to_x_items ?? null,
    freeShipping: !!raw.free_shipping,
    emailRestrictions: raw.email_restrictions ?? [],
    usageCount: raw.usage_count ?? 0,
  };
}

function parseDecimal(value: string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
