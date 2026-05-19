/**
 * Kategori-oversikt — lister alle topp-nivå-kategorier.
 *
 * Sub-kategorier vises på den respektive foreldrekategoriens detaljside.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { listTopLevelCategories } from '@/lib/supabase/catalog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kategorier',
  description: 'Bla gjennom sortimentet etter kategori.',
  alternates: { canonical: '/kategori' },
};

export default async function KategoriOversiktPage() {
  const categories = await listTopLevelCategories();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Kategorier</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {categories.length} hovedkategorier
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-6 text-neutral-600">
          Ingen kategorier funnet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${c.slug}`}
                className="block rounded-md border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
              >
                <h2 className="text-base font-medium text-neutral-900">{c.name}</h2>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-600">
                    {c.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
