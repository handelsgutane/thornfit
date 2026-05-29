/**
 * /merkevarer/[slug] — landingside per leverandør (product_brand).
 *
 * Speiler URL-mønsteret WordPress allerede bruker (`/merkevarer/<slug>`),
 * slik at eksisterende interne lenker og Yoasts canonicals fortsatt stemmer.
 *
 * Innhold:
 *   - Hero-blokk med brand-navn, region, beskrivelse, evt. hero-bilde.
 *   - Stats-kort (skn_brand_stats — opp til 6).
 *   - Liste av alle produkter knyttet til brand_id, sortert på navn.
 *
 * Datakilde: brands + products i Supabase, synket fra Woo product_brand.
 */

import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo/site-url';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CategoryBrowser } from '@/components/category/CategoryBrowser';
import { CategoryHeaderDefault } from '@/components/category/headers/CategoryHeaderDefault';
import { stripHtml } from '@/lib/utils/html';
import {
  getBrandBySlug,
  listProductsByBrand,
} from '@/lib/supabase/catalog';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SORT_OPTIONS = [
  { value: 'name', label: 'A–Å' },
  { value: 'price-asc', label: 'Pris: lav → høy' },
  { value: 'price-desc', label: 'Pris: høy → lav' },
  { value: 'newest', label: 'Nyeste først' },
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: 'Leverandør ikke funnet' };

  const description =
    brand.description && brand.description.length > 0
      ? stripHtml(brand.description).slice(0, 160)
      : `Alle kniver og produkter fra ${brand.name}${brand.region ? ` — ${brand.region}` : ''}.`;

  return {
    title: `${brand.name} — THORN FIT`,
    description,
    alternates: { canonical: `/merkevarer/${brand.slug}` },
    openGraph: {
      title: brand.name,
      description,
      url: `/merkevarer/${brand.slug}`,
    },
  };
}

export default async function BrandPage({ params }: PageProps) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const products = await listProductsByBrand(brand.id);

  return (
    <main className="w-full">
      {/* Hero — gjenbruker CategoryHeaderDefault for visuell konsistens med
          kategori-landingen, men med brand-tittel og -beskrivelse. */}
      <CategoryHeaderDefault
        title={brand.name}
        description={brand.description}
        productCount={products.length}
        breadcrumb={[
          { label: 'Merkevarer', href: '/merkevarer' },
          { label: brand.name, href: `/merkevarer/${brand.slug}` },
        ]}
      />

      {/* Stats + region under heroen. Kun hvis vi har innhold å vise. */}
      {(brand.region || brand.founded || (brand.stats && brand.stats.length > 0)) && (
        <div className="border-b border-divider bg-canvas px-sp-3 py-10 md:px-sp-7 lg:px-16">
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-end gap-12">
            {brand.region && (
              <div className="flex flex-col gap-1">
                <span
                  style={{ fontSize: 'var(--text-label)', letterSpacing: '0.08em' }}
                  className="font-bold uppercase text-ink-muted"
                >
                  Region
                </span>
                <span className="text-body-md text-ink">{brand.region}</span>
              </div>
            )}
            {brand.founded && (
              <div className="flex flex-col gap-1">
                <span
                  style={{ fontSize: 'var(--text-label)', letterSpacing: '0.08em' }}
                  className="font-bold uppercase text-ink-muted"
                >
                  Grunnlagt
                </span>
                <span className="text-body-md text-ink">{brand.founded}</span>
              </div>
            )}
            {brand.stats?.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <span
                  className="font-bold text-ink"
                  style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: '100%' }}
                >
                  {stat.num}
                </span>
                <span
                  style={{ fontSize: 'var(--text-label)', letterSpacing: '0.08em' }}
                  className="font-bold uppercase text-ink-muted"
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Produkt-grid. Reuse CategoryBrowser uten seksjoner — bare
          standard filter+sort. */}
      <Suspense fallback={null}>
        <CategoryBrowser
          products={products}
          filters={[]}
          sortOptions={SORT_OPTIONS}
          defaultSort="name"
          listId={`brand:${brand.slug}`}
        />
      </Suspense>

      {/* JSON-LD Brand schema for SEO. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Brand',
            name: brand.name,
            description: brand.description ? stripHtml(brand.description) : undefined,
            url: `${SITE_URL}/merkevarer/${brand.slug}`,
            logo: brand.image?.src,
            image: brand.heroImageUrl ?? brand.image?.src,
          }),
        }}
      />

    </main>
  );
}
