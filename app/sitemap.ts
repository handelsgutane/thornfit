import type { MetadataRoute } from 'next';

import {
  listCategoryUrls,
  listPublishedProductUrls,
} from '@/lib/supabase/catalog';

export const dynamic = 'force-dynamic';

/**
 * Genererer /sitemap.xml.
 *
 * Strukturen følger docs/seo.md:
 * - Statiske sider (landing, guider-indeks, statiske salgssider)
 * - Alle kategori-URL-er
 * - Alle publiserte produkt-URL-er
 *
 * Sider som er `noindex` (handlekurv, kasse, konto, søk) inkluderes ikke.
 *
 * Next.js regenererer sitemap ved hvert request i dev, og cacher i prod.
 * Revaliderings-strategi: siden Supabase oppdateres via webhook + cron, kan
 * vi revalidere sitemap via `revalidatePath('/sitemap.xml')` når katalogen
 * endres. Implementeres i webhook-handler (TBD).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

// Statisk innhold som finnes uavhengig av Supabase-data.
const STATIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/guider', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/kontakt-oss', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/vilkar-og-personvern', changeFrequency: 'monthly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: `${SITE_URL}${s.path}`,
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  const [categoryUrls, productUrls] = await Promise.all([
    listCategoryUrls(),
    listPublishedProductUrls(),
  ]);

  // Kategorier: full nested path (`/foreldre/barn`). Se revidert ADR-0007
  // (2026-04-23). `path` er allerede uten leading slash.
  const categoryEntries: MetadataRoute.Sitemap = categoryUrls.map((cat) => ({
    url: `${SITE_URL}/${cat.path}`,
    lastModified: new Date(cat.updatedAt),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Produkter: prepend primær-kategoris nested path (`/kat-path/product-slug`).
  // Fallback til flat path hvis produktet mangler primær-kategori (skal ikke
  // skje for publiserte produkter, men vi er defensive mot data-drift).
  const productEntries: MetadataRoute.Sitemap = productUrls.map((p) => ({
    url: `${SITE_URL}/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
