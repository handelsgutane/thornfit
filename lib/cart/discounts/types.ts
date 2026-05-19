/**
 * Type-definisjoner for rabatt-evaluatoren.
 *
 * Holdes adskilt fra `bulk.ts` så client- og server-kode kan importere
 * typene uten å dra inn evaluator-implementasjonen.
 */

export interface DiscountTier {
  /** Antall som må til for at tier'en aktiveres. Inkluderende. */
  startingQuantity: number;
  /** Prosent rabatt (0–100). 20 = 20 % avslag. */
  discountPct: number;
}

export interface DiscountRuleApplyTo {
  /** true = regelen gjelder ALLE produkter. Ignorerer listene under. */
  all: boolean;
  /** Spesifikke Woo-product-IDs. */
  productIds: number[];
  /** Eksakte SKU-matcher. */
  skus: string[];
  /** product_cat-slugs (kategori-slug). */
  categorySlugs: string[];
  /** product_tag-slugs (tag-slug). */
  tagSlugs: string[];
}

export interface DiscountRule {
  id: number;
  enabled: boolean;
  type: 'bulk' | string;
  name: string;
  applyTo: DiscountRuleApplyTo;
  /** combined = tell qty på tvers av eligible produkter.
   *  per-product = tell qty per produkt separat. */
  countMode: 'combined' | 'per-product';
  tiers: DiscountTier[];
  startDate: string | null;
  endDate: string | null;
}

/**
 * Minimum cart-data evaluator trenger. Bygges i cart-store fra CartItem +
 * produkt-meta. Holdes som egen interface så evaluator kan testes uten å
 * importere hele cart-store'n.
 */
export interface DiscountCartItem {
  /** CartItem.key — unik identifikator brukt i AppliedDiscount. */
  key: string;
  productId: number;
  sku: string | null;
  quantity: number;
  /** Pris per stk (etter mva, slik DB lagrer den). */
  unitPrice: number;
  /** Slugs for kategoriene produktet ligger i. */
  categorySlugs: string[];
  tagSlugs: string[];
}

export interface AppliedDiscount {
  /** Cart-item-key som rabatten gjelder. */
  itemKey: string;
  /** Hvilken regel som ga rabatten. */
  ruleId: number;
  ruleName: string;
  /** Prosent rabatt på linjen (0–100). */
  discountPct: number;
  /** Beløp i kr (positivt tall) — pre-beregnet for praktisk UI-visning. */
  discountAmount: number;
}
