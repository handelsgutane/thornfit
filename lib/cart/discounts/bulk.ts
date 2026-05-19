/**
 * Bulk-rabatt evaluator (Quantity discounts i Studio Wombat-plugin).
 *
 * Algoritme:
 *   1. For hver enabled regel, sjekk dato-vindu (start/end).
 *   2. Filtrer cart-items til de som er "eligible" for regelen
 *      (matcher MINST én av apply_to.product_ids/skus/categorySlugs/tagSlugs).
 *   3. Summér quantity i henhold til count_mode:
 *      - combined: total på tvers av alle eligible items
 *      - per-product: separat per produkt-id
 *   4. Velg høyeste tier hvis totalQty oppfyller startingQuantity.
 *   5. Lag én AppliedDiscount per eligible cart-item med tier'ens %.
 *
 * Hvis flere regler gjelder for samme item, vinner den med høyest discount_pct
 * (ikke kumulativt — én rabatt per linje).
 */

import type {
  AppliedDiscount,
  DiscountCartItem,
  DiscountRule,
  DiscountTier,
} from './types';

/**
 * Matcher én cart-item mot regelens apply_to. OR-semantikk: én treff = match.
 */
function isEligible(
  item: DiscountCartItem,
  rule: DiscountRule,
): boolean {
  const a = rule.applyTo;
  if (a.all) return true;

  if (a.productIds.length > 0 && a.productIds.includes(item.productId)) return true;
  if (item.sku && a.skus.length > 0 && a.skus.includes(item.sku)) return true;
  if (a.categorySlugs.length > 0 && a.categorySlugs.some((s) => item.categorySlugs.includes(s))) return true;
  if (a.tagSlugs.length > 0 && a.tagSlugs.some((s) => item.tagSlugs.includes(s))) return true;

  return false;
}

/** Velg høyeste tier hvor totalQty >= startingQuantity. */
function pickTier(tiers: DiscountTier[], totalQty: number): DiscountTier | null {
  // Antar tiers er sortert stigende på startingQuantity (mu-pluginen sorterer).
  let winner: DiscountTier | null = null;
  for (const tier of tiers) {
    if (totalQty >= tier.startingQuantity) winner = tier;
  }
  return winner;
}

/** Sjekker om regelen er aktiv på `now` basert på start/end-dato. */
function isInWindow(rule: DiscountRule, now: Date): boolean {
  if (rule.startDate) {
    const start = new Date(rule.startDate);
    if (Number.isFinite(start.getTime()) && start > now) return false;
  }
  if (rule.endDate) {
    const end = new Date(rule.endDate);
    if (Number.isFinite(end.getTime()) && end < now) return false;
  }
  return true;
}

export interface EvaluateBulkOptions {
  /** Brukes til testing og start/end-dato-filter. Default = new Date(). */
  now?: Date;
}

/**
 * Hovedinngang: evaluerer alle gitte bulk-regler mot cart og returnerer
 * en AppliedDiscount per (item, regel)-par. Hvis flere regler gjelder samme
 * item, vinner den med høyest discount_pct.
 */
export function evaluateBulkRules(
  rules: DiscountRule[],
  items: DiscountCartItem[],
  options: EvaluateBulkOptions = {},
): AppliedDiscount[] {
  const now = options.now ?? new Date();

  // Per-key beste rabatt (hvis flere regler matcher).
  const bestByKey = new Map<string, AppliedDiscount>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type !== 'bulk') continue;
    if (!isInWindow(rule, now)) continue;
    if (rule.tiers.length === 0) continue;

    const eligible = items.filter((i) => isEligible(i, rule));
    if (eligible.length === 0) continue;

    if (rule.countMode === 'combined') {
      const totalQty = eligible.reduce((sum, i) => sum + i.quantity, 0);
      const tier = pickTier(rule.tiers, totalQty);
      if (!tier) continue;

      for (const item of eligible) {
        const applied: AppliedDiscount = {
          itemKey: item.key,
          ruleId: rule.id,
          ruleName: rule.name,
          discountPct: tier.discountPct,
          discountAmount: roundKr(item.unitPrice * item.quantity * (tier.discountPct / 100)),
        };
        const existing = bestByKey.get(item.key);
        if (!existing || applied.discountPct > existing.discountPct) {
          bestByKey.set(item.key, applied);
        }
      }
    } else {
      // per-product: behandle hvert produkt separat.
      const byProductId = new Map<number, DiscountCartItem[]>();
      for (const i of eligible) {
        const list = byProductId.get(i.productId) ?? [];
        list.push(i);
        byProductId.set(i.productId, list);
      }
      for (const productItems of byProductId.values()) {
        const totalQty = productItems.reduce((sum, i) => sum + i.quantity, 0);
        const tier = pickTier(rule.tiers, totalQty);
        if (!tier) continue;
        for (const item of productItems) {
          const applied: AppliedDiscount = {
            itemKey: item.key,
            ruleId: rule.id,
            ruleName: rule.name,
            discountPct: tier.discountPct,
            discountAmount: roundKr(item.unitPrice * item.quantity * (tier.discountPct / 100)),
          };
          const existing = bestByKey.get(item.key);
          if (!existing || applied.discountPct > existing.discountPct) {
            bestByKey.set(item.key, applied);
          }
        }
      }
    }
  }

  return Array.from(bestByKey.values());
}

/**
 * Sjekker om et enkeltprodukt vil få rabatt om brukeren legger N stk i kurv,
 * gitt en eksisterende kurv-state. Brukes til å vise "−20 % ved 2+"-badge på
 * produktkort uten å duplikere evaluator-logikk.
 *
 * Returnerer det laveste qty-tallet som trigger ANY rabatt på dette produktet
 * (uavhengig av om produktet allerede er i kurv eller ikke), eller null hvis
 * ingen regel kan gjelde.
 */
export function nextTierForProduct(
  rules: DiscountRule[],
  product: DiscountCartItem,
  existingItems: DiscountCartItem[],
  options: EvaluateBulkOptions = {},
): { atQuantity: number; discountPct: number; ruleName: string } | null {
  const now = options.now ?? new Date();
  let best: { atQuantity: number; discountPct: number; ruleName: string } | null = null;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type !== 'bulk') continue;
    if (!isInWindow(rule, now)) continue;
    if (rule.tiers.length === 0) continue;
    if (!isEligible(product, rule)) continue;

    // Beregn hvor mange eligible som allerede er i kurv (ekskl. dette produktet
    // hvis det allerede er der — vi simulerer "neste tier" fra ren tilstand).
    let baseQty = 0;
    if (rule.countMode === 'combined') {
      for (const i of existingItems) {
        if (i.key === product.key) continue;
        if (isEligible(i, rule)) baseQty += i.quantity;
      }
    } else {
      // per-product: bare tell andre i samme produkt
      for (const i of existingItems) {
        if (i.key === product.key) continue;
        if (i.productId === product.productId && isEligible(i, rule)) {
          baseQty += i.quantity;
        }
      }
    }

    // Finn laveste tier som ikke ennå er nådd.
    for (const tier of rule.tiers) {
      const needed = Math.max(1, tier.startingQuantity - baseQty);
      if (
        !best ||
        needed < best.atQuantity ||
        (needed === best.atQuantity && tier.discountPct > best.discountPct)
      ) {
        best = {
          atQuantity: needed,
          discountPct: tier.discountPct,
          ruleName: rule.name,
        };
      }
    }
  }

  return best;
}

function roundKr(amount: number): number {
  return Math.round(amount * 100) / 100;
}
