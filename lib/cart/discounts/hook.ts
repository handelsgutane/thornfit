'use client';

/**
 * Client-side hook for å kjøre bulk-rabatt-evaluator mot live cart-state.
 *
 * Bruksmønster:
 *   - Server-component fetcher rules via fetchActiveBulkRules()
 *   - Server passer rules som prop til client-component
 *   - Client-component bruker useBulkDiscounts(rules) → AppliedDiscount[]
 *
 * Vi tar ikke fetcher inn i hooken (som ville krevd client-side fetch til
 * Supabase) — server-prefetch + prop-pass er enklere og raskere.
 */

import { useMemo } from 'react';

import { useCartItems } from '@/lib/cart/hooks';
import { evaluateBulkRules } from './bulk';
import type {
  AppliedDiscount,
  DiscountCartItem,
  DiscountRule,
} from './types';

/** Hvor mye totalt rabatt på en cart-item, summert over alle regler. */
export interface DiscountSummary {
  applied: AppliedDiscount[];
  /** Map fra cart-item-key → kr avslag på linjen. */
  byItemKey: Map<string, number>;
  /** Total avslag i kr — sum av alle linje-rabatter. */
  totalAmount: number;
}

/**
 * Kjør evaluator mot nåværende cart-state. Husker resultatet via useMemo så
 * vi ikke re-evaluerer på hver render uten reell cart-endring.
 */
export function useBulkDiscounts(
  rules: DiscountRule[],
  productMeta: Map<number, { categorySlugs: string[]; tagSlugs: string[] }>,
): DiscountSummary {
  const items = useCartItems();

  return useMemo(() => {
    const evalItems: DiscountCartItem[] = items.map((i) => {
      const meta = productMeta.get(i.productId);
      return {
        key: i.key,
        productId: i.productId,
        sku: i.sku ?? null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        categorySlugs: meta?.categorySlugs ?? [],
        tagSlugs: meta?.tagSlugs ?? [],
      };
    });

    const applied = evaluateBulkRules(rules, evalItems);
    const byItemKey = new Map<string, number>();
    let totalAmount = 0;
    for (const a of applied) {
      byItemKey.set(a.itemKey, (byItemKey.get(a.itemKey) ?? 0) + a.discountAmount);
      totalAmount += a.discountAmount;
    }
    return { applied, byItemKey, totalAmount };
  }, [items, rules, productMeta]);
}
