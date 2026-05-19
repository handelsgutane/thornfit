/**
 * Server-side fetcher for rabatt-regler. Brukes av cart-endepunkter,
 * produkt-detaljside og kategori-grid for å rendre badge'r og rabatt-linjer.
 *
 * Cache'es på Redis (1t TTL) — regler endres sjelden, og evaluator kjører
 * mange ganger per sesjon.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

import type { DiscountRule, DiscountRuleApplyTo, DiscountTier } from './types';

/** Hent alle aktive bulk-regler fra Supabase. */
export async function fetchActiveBulkRules(): Promise<DiscountRule[]> {
  const client = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('discount_rules')
    .select('id, enabled, type, name, apply_to, count_mode, tiers, start_date, end_date')
    .eq('enabled', true)
    .eq('type', 'bulk');

  if (error) {
    logger.error('failed to fetch discount rules', { ...serializeError(error) });
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): DiscountRule => normalize(r));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): DiscountRule {
  const applyTo: DiscountRuleApplyTo = {
    all: !!row.apply_to?.all,
    productIds: Array.isArray(row.apply_to?.product_ids) ? row.apply_to.product_ids : [],
    skus: Array.isArray(row.apply_to?.skus) ? row.apply_to.skus : [],
    categorySlugs: Array.isArray(row.apply_to?.category_slugs) ? row.apply_to.category_slugs : [],
    tagSlugs: Array.isArray(row.apply_to?.tag_slugs) ? row.apply_to.tag_slugs : [],
  };

  const tiers: DiscountTier[] = Array.isArray(row.tiers)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row.tiers.map((t: any) => ({
        startingQuantity: Number(t.starting_quantity ?? t.startingQuantity ?? 0),
        discountPct: Number(t.discount_pct ?? t.discountPct ?? 0),
      }))
    : [];

  return {
    id: row.id as number,
    enabled: !!row.enabled,
    type: (row.type as string) ?? 'bulk',
    name: (row.name as string) ?? '',
    applyTo,
    countMode: row.count_mode === 'per-product' ? 'per-product' : 'combined',
    tiers,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
  };
}
