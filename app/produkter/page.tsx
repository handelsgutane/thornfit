/**
 * Produkt-liste — første bevis end-to-end at Woo → Supabase → RSC virker.
 *
 * RSC som leser fra Supabase via service-role (katalog er offentlig, ikke
 * bruker-spesifikk — ingen cookies å håndtere her).
 *
 * Styling er bevisst minimal. Designsystemet kommer i Fase 3 når Paper-tokens
 * er låst. Målet med denne siden er å se dataen, ikke å se pen ut.
 */

import type { Metadata } from 'next';

import { CategoryListViewTracker } from '@/components/analytics/CategoryListViewTracker';
import { ProductGrid } from '@/components/ProductGrid';
import { listPublishedProducts } from '@/lib/supabase/catalog';

// Dynamic rendering inntil vi har Redis-cache-laget (TBD per CLAUDE.md).
// Static prerender ville kreve at Supabase-env er tilgjengelig ved build —
// enklere å render per request nå.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alle produkter',
  description: 'Alle kokkekniver, slipeutstyr og kniv-tilbehør i sortimentet.',
  alternates: { canonical: '/produkter' },
};

export default async function ProduktListePage() {
  const products = await listPublishedProducts({ limit: 200 });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Alle produkter</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {products.length} produkter · viser nyeste først
        </p>
      </header>

      <ProductGrid products={products} listId="catalog:all" />

      {/* Analytics — 'alle produkter' telles som én stor liste-impresjon.
          `listId` på `ProductGrid` over og `CategoryListViewTracker` under
          deler samme verdi ('catalog:all') slik at `select_item.listId`
          matcher den foregående `view_item_list`-impresjonen. */}
      <CategoryListViewTracker
        listId="catalog:all"
        listName="Alle produkter"
        products={products}
      />
    </main>
  );
}
