/**
 * Woo → Supabase reconciliation cron.
 *
 * Kjører nattlig og henter hele Woo-katalogen (kategorier + tags + brands +
 * produkter) og upserter inn i Supabase-speilet. Fungerer både som initial
 * backfill og som sikkerhetsnett for webhooks som måtte mislykkes.
 *
 * Autorisasjon: Vercel sender `x-vercel-cron: 1`. Manuelle kall krever
 * `CRON_SECRET` som Bearer-token eller `?secret=…`-param.
 *
 * Schedule: `0 3 * * *` (03:00 UTC nattlig) — se `vercel.json`.
 *
 * Selektiv kjøring via `?parts=…` (kommaseparert):
 *   - `all` (default) — alt
 *   - `categories` | `tags` | `brands` | `products`
 *
 * Eksempler:
 * ```bash
 * # Alt:
 * curl -sS --max-time 600 \
 *   "https://<host>/api/cron/woo-reconciliation?secret=$CRON_SECRET" | jq
 *
 * # Bare brands (raskt — ~64 entries):
 * curl "https://<host>/api/cron/woo-reconciliation?secret=$CRON_SECRET&parts=brands" | jq
 *
 * # Bare brands + produkter (etter brand-meta-endring i WP):
 * curl "https://<host>/api/cron/woo-reconciliation?secret=$CRON_SECRET&parts=brands,products" | jq
 * ```
 *
 * Vercel cron-trigger sender ingen `parts`-param og kjører alt.
 *
 * TODO: Fase 2 — diff Woo-IDs mot Supabase-IDs og markér slettede produkter.
 * TODO: Fase 2 — synk variasjoner for `type=variable`-produkter.
 */

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import {
  invalidateCategorySlug,
  invalidateProductSlug,
} from '@/lib/cache/catalog';
import {
  invalidateBrandCache,
  invalidateCategoryPathMapCache,
} from '@/lib/supabase/catalog';
import { invalidateNavPrimary } from '@/lib/nav/fetch';
import { authorizeCron } from '@/lib/cron/auth';
import { serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { wooFetch } from '@/lib/woo/client';
import {
  mapBrand,
  mapCategory,
  mapProduct,
  mapStorePrices,
  mapTag,
  type StoreApiProductPrices,
  type WooBrand,
  type WooCategory,
  type WooProduct,
  type WooTag,
} from '@/lib/woo/mappers';
import { wpFetch } from '@/lib/wp/client';
import {
  mapAuthor as mapBlogAuthor,
  mapCategory as mapBlogCategory,
  mapPost as mapBlogPost,
  mapTag as mapBlogTag,
  type WpCategory,
  type WpPost,
  type WpTag,
  type WpUser,
} from '@/lib/wp/mappers';
import type { TablesInsert } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — Woo kan være treg på store kataloger.

const PER_PAGE = 100;
const UPSERT_CHUNK_SIZE = 500;

type SyncPart =
  | 'categories'
  | 'tags'
  | 'brands'
  | 'products'
  | 'blog_authors'
  | 'blog_categories'
  | 'blog_tags'
  | 'posts'
  | 'discounts';

const ALL_PARTS: SyncPart[] = [
  'categories',
  'tags',
  'brands',
  'products',
  'blog_authors',
  'blog_categories',
  'blog_tags',
  'posts',
  'discounts',
];

interface ReconciliationResult {
  status: 'ok' | 'error';
  duration_ms: number;
  /** Hvilke deler ble faktisk kjørt i denne invokeringen. */
  ran: SyncPart[];
  categories: { fetched: number; upserted: number; skipped: boolean };
  tags: { fetched: number; upserted: number; skipped: boolean };
  brands: { fetched: number; upserted: number; skipped: boolean };
  products: {
    fetched: number;
    upserted: number;
    skipped: boolean;
    skippedRows: number;
    dedupedSlugCollisions: number;
  };
  blog_authors: { fetched: number; upserted: number; skipped: boolean };
  blog_categories: { fetched: number; upserted: number; skipped: boolean };
  blog_tags: { fetched: number; upserted: number; skipped: boolean };
  posts: { fetched: number; upserted: number; skipped: boolean; skippedRows: number };
  discounts: { fetched: number; upserted: number; skipped: boolean };
  error?: string;
}

/**
 * Parser ?parts=…-param og returnerer settet av deler som skal kjøres.
 * Default (ingen param eller `all`) = alle deler.
 * Ukjente verdier ignoreres stille.
 */
function parsePartsParam(url: URL): Set<SyncPart> {
  const raw = url.searchParams.get('parts');
  if (!raw || raw.trim() === '' || raw.toLowerCase() === 'all') {
    return new Set(ALL_PARTS);
  }
  const tokens = raw.split(',').map((s) => s.trim().toLowerCase());
  const valid = ALL_PARTS.filter((p) => tokens.includes(p));
  // Fall tilbake til alle hvis brukeren skrev ingen gyldige tokens —
  // tryggere enn å bare ikke gjøre noe.
  return valid.length > 0 ? new Set(valid) : new Set(ALL_PARTS);
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const parts = parsePartsParam(url);

  const started = Date.now();
  const result: ReconciliationResult = {
    status: 'ok',
    duration_ms: 0,
    ran: ALL_PARTS.filter((p) => parts.has(p)),
    categories: { fetched: 0, upserted: 0, skipped: !parts.has('categories') },
    tags: { fetched: 0, upserted: 0, skipped: !parts.has('tags') },
    brands: { fetched: 0, upserted: 0, skipped: !parts.has('brands') },
    products: {
      fetched: 0,
      upserted: 0,
      skipped: !parts.has('products'),
      skippedRows: 0,
      dedupedSlugCollisions: 0,
    },
    blog_authors: { fetched: 0, upserted: 0, skipped: !parts.has('blog_authors') },
    blog_categories: { fetched: 0, upserted: 0, skipped: !parts.has('blog_categories') },
    blog_tags: { fetched: 0, upserted: 0, skipped: !parts.has('blog_tags') },
    posts: {
      fetched: 0,
      upserted: 0,
      skipped: !parts.has('posts'),
      skippedRows: 0,
    },
    discounts: { fetched: 0, upserted: 0, skipped: !parts.has('discounts') },
  };

  try {
    const supabase = createServiceRoleClient();

    // --- Kategorier ---------------------------------------------------------
    if (parts.has('categories')) {
      const categories = await fetchAllPages<WooCategory>('/wc/v3/products/categories');
      result.categories.fetched = categories.length;

      if (categories.length > 0) {
        const rows = categories.map(mapCategory);
        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('categories').upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`categories upsert failed: ${error.message}`);
          result.categories.upserted += chunk.length;
        }

        // Cache-bust — samme grunn som for produkter. Uten dette ville
        // section_tag_slugs-endringer ta opp til 1 time før de slo igjennom.
        const catSlugs = rows.map((r) => r.slug);
        for (const slugChunk of chunked(catSlugs, 100)) {
          await Promise.all(slugChunk.map((s) => invalidateCategorySlug(s)));
        }

        // Path-map er hentet fra hele kategoritabellen. Den må bustes
        // når kategorier endrer slug eller parent_id.
        await invalidateCategoryPathMapCache();

        // Nav-cache må også invalideres siden mega-meny editorial trekker
        // fra categories.mega_post_id + categories.mega_buttons. Uten dette
        // ville nye `mega_post_id`-endringer i WP ta opp til 24t å slå
        // igjennom (nav-TTL).
        await invalidateNavPrimary();
      }
    }

    // --- Produkttagger ------------------------------------------------------
    // Hent alle tagger med beskrivelse — brukes som seksjonstittel/-beskrivelse
    // på kategori-landingssider (section_tag_slugs på categories).
    if (parts.has('tags')) {
      const tags = await fetchAllPages<WooTag>('/wc/v3/products/tags');
      result.tags.fetched = tags.length;

      if (tags.length > 0) {
        const tagRows = tags.map(mapTag);
        for (const chunk of chunked(tagRows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from('product_tags').upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`product_tags upsert failed: ${error.message}`);
          result.tags.upserted += chunk.length;
        }
      }
    }

    // --- Brands -------------------------------------------------------------
    // Må synkes FØR produkter pga. FK products.brand_id → brands.id.
    // NB: Hvis du kjører `parts=products` uten `brands`, og en brand er ny i
    // Woo som ikke finnes i Supabase, vil products-upsert feile på FK. Fix:
    // kjør `parts=brands,products` eller `parts=all` etter å ha lagt til
    // nye brands i Woo.
    if (parts.has('brands')) {
      const brands = await fetchAllPages<WooBrand>('/wc/v3/products/brands');
      result.brands.fetched = brands.length;

      if (brands.length > 0) {
        const brandRows = brands.map(mapBrand);
        for (const chunk of chunked(brandRows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from('brands').upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`brands upsert failed: ${error.message}`);
          result.brands.upserted += chunk.length;
        }

        // Cache-bust per brand-id. Uten dette serveres gammel
        // brand-payload (description, hero, stats) i opp til 1 time
        // etter en sync.
        for (const chunk of chunked(brandRows, 100)) {
          await Promise.all(chunk.map((b) => invalidateBrandCache(b.id)));
        }
      }
    }

    // --- Produkter ----------------------------------------------------------
    if (parts.has('products')) {
    // Vi henter to dataset i parallell:
    //   1. /wc/v3/products            — full produktdata (admin-kontekst).
    //                                   Returnerer EX-mva priser pga. WC-konfig.
    //   2. /wc/store/v1/products      — display-data (frontend-kontekst).
    //                                   Returnerer priser ferdig beregnet INKL
    //                                   mva, i minor-units (cents).
    // Vi bruker (1) for alt unntatt pris, og (2) for å overstyre
    // price/regular_price/sale_price før upsert. Det holder DB-en i sync med
    // det Woo selv ville vist på sin frontend.
    const [products, storePrices] = await Promise.all([
      fetchAllPages<WooProduct>('/wc/v3/products'),
      fetchAllStorePrices(),
    ]);
    result.products.fetched = products.length;

    if (products.length > 0) {
      const mapped = products
        .map((p) => {
          const row = mapProduct(p);
          if (!row) result.products.skippedRows += 1;
          return row;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      // Override prices med Store API verdier — kilden Woo bruker selv.
      // Hvis en produkt-id mangler i Store API (sjelden — typisk hvis
      // produktet er hidden i shop-katalog), beholder vi mapper-prisen.
      let pricedFromStoreApi = 0;
      const priceMap = new Map<number, StoreApiProductPrices>();
      for (const sp of storePrices) priceMap.set(sp.id, sp);

      for (const row of mapped) {
        const sp = priceMap.get(row.id);
        if (sp) {
          row.price = sp.price;
          row.regular_price = sp.regular_price;
          row.sale_price = sp.sale_price;
          pricedFromStoreApi += 1;
        }
      }
      logger.info('store-api price override', {
        total: mapped.length,
        priced_from_store_api: pricedFromStoreApi,
        missing: mapped.length - pricedFromStoreApi,
      });

      const { rows, droppedCollisions } = dedupeBySlug(mapped);
      result.products.dedupedSlugCollisions = droppedCollisions;

      // DB-side slug-kollisjoner: hvis incoming-rad har slug 'X' med id=B, men
      // DB har en annen rad med slug 'X' og id=A, så feiler upsert(onConflict:id)
      // på UNIQUE(slug). Slett gamle rader først så upsert kan kjøre clean.
      const incomingSlugs = rows.map((r) => r.slug);
      const incomingSlugToId = new Map(rows.map((r) => [r.slug, r.id]));
      const idsToDelete: number[] = [];

      for (const slugChunk of chunked(incomingSlugs, 500)) {
        const { data: existing, error: selErr } = await supabase
          .from('products')
          .select('id, slug')
          .in('slug', slugChunk);
        if (selErr) {
          throw new Error(`products slug-conflict probe failed: ${selErr.message}`);
        }
        for (const row of existing ?? []) {
          const incomingId = incomingSlugToId.get(row.slug);
          if (incomingId !== undefined && incomingId !== row.id) {
            idsToDelete.push(row.id);
            logger.warn('deleting DB row to resolve slug collision', {
              slug: row.slug,
              old_db_id: row.id,
              new_woo_id: incomingId,
            });
          }
        }
      }

      if (idsToDelete.length > 0) {
        for (const chunk of chunked(idsToDelete, 500)) {
          const { error } = await supabase.from('products').delete().in('id', chunk);
          if (error) {
            throw new Error(`products collision-delete failed: ${error.message}`);
          }
        }
      }

      for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
        const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`products upsert failed: ${error.message}`);
        result.products.upserted += chunk.length;
      }

      // Invalider Redis-cache for alle upsertede slugs så frontend-prop'er
      // (inkludert brand_id, tag_slugs etc.) plukker opp friske rader umiddelbart.
      // Uten dette ville endringer ta opp til POSITIVE_TTL_SECONDS (1 time)
      // før de slo gjennom på sider folk faktisk besøker.
      const allSlugs = rows.map((r) => r.slug);
      for (const slugChunk of chunked(allSlugs, 100)) {
        await Promise.all(slugChunk.map((s) => invalidateProductSlug(s)));
      }
    }
    } // end if (parts.has('products'))

    // --- Blog authors -------------------------------------------------------
    // Må synkes før posts pga. FK blog_posts.author_id → blog_authors.id.
    // WP /wp/v2/users returnerer kun brukere som har publiserte poster i
    // public-mode. Med App Password får vi alle.
    if (parts.has('blog_authors')) {
      const users = await fetchAllWpPages<WpUser>('/wp/v2/users', {
        context: 'edit',
      });
      result.blog_authors.fetched = users.length;

      if (users.length > 0) {
        const rows = users.map(mapBlogAuthor);
        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('blog_authors')
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`blog_authors upsert failed: ${error.message}`);
          result.blog_authors.upserted += chunk.length;
        }
      }
    }

    // --- Blog categories ----------------------------------------------------
    if (parts.has('blog_categories')) {
      const cats = await fetchAllWpPages<WpCategory>('/wp/v2/categories');
      result.blog_categories.fetched = cats.length;

      if (cats.length > 0) {
        const rows = cats.map(mapBlogCategory);
        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('blog_categories')
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`blog_categories upsert failed: ${error.message}`);
          result.blog_categories.upserted += chunk.length;
        }
      }
    }

    // --- Blog tags ----------------------------------------------------------
    if (parts.has('blog_tags')) {
      const tags = await fetchAllWpPages<WpTag>('/wp/v2/tags');
      result.blog_tags.fetched = tags.length;

      if (tags.length > 0) {
        const rows = tags.map(mapBlogTag);
        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('blog_tags')
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`blog_tags upsert failed: ${error.message}`);
          result.blog_tags.upserted += chunk.length;
        }
      }
    }

    // --- Discount rules ------------------------------------------------------
    // Speiler wp_wdp_discounts (Studio Wombat WC Discounts plugin) via vår
    // custom endepunkt /wp-json/skn/v1/discount-rules. Krever at
    // skn-discount-rules-rest.php er lagt inn i WP (mu-plugin eller chef-plugin).
    if (parts.has('discounts')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rules = await wpFetch<any[]>('/skn/v1/discount-rules');
      result.discounts.fetched = Array.isArray(rules) ? rules.length : 0;

      if (Array.isArray(rules) && rules.length > 0) {
        const rows = rules.map((r) => ({
          id: r.id as number,
          enabled: !!r.enabled,
          type: r.type as string,
          name: r.name as string,
          apply_to: r.apply_to ?? {},
          count_mode: r.count_mode === 'per-product' ? 'per-product' : 'combined',
          tiers: r.tiers ?? [],
          start_date: r.start_date ?? null,
          end_date: r.end_date ?? null,
          source_payload: r,
          synced_at: new Date().toISOString(),
        }));

        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('discount_rules')
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`discount_rules upsert failed: ${error.message}`);
          result.discounts.upserted += chunk.length;
        }
      }
    }

    // --- Blog posts ---------------------------------------------------------
    // _embed inkluderer featured-bilde og forfatter-data i samme respons —
    // sparer N+1 og holder mapper synkron uten ekstra fetch.
    if (parts.has('posts')) {
      const posts = await fetchAllWpPages<WpPost>('/wp/v2/posts', {
        _embed: 'wp:featuredmedia,author',
        status: 'publish',
      });
      result.posts.fetched = posts.length;

      if (posts.length > 0) {
        const rows = posts
          .map((p) => {
            const r = mapBlogPost(p);
            if (!r) result.posts.skippedRows += 1;
            return r;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        for (const chunk of chunked(rows, UPSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('blog_posts')
            .upsert(chunk, { onConflict: 'id' });
          if (error) throw new Error(`blog_posts upsert failed: ${error.message}`);
          result.posts.upserted += chunk.length;
        }
      }
    }

    // Bust Next.js ISR-cachen for catch-all-ruta. Etter bulk-sync av
    // hundrevis av produkter er det billigere å invalidere hele
    // [...slug]-segmentet enn å beregne hver påvirket nested path
    // individuelt. Neste request regenererer på demand med fersk data.
    if (
      result.products.upserted > 0 ||
      result.categories.upserted > 0 ||
      result.brands.upserted > 0
    ) {
      try {
        revalidatePath('/[...slug]', 'page');
      } catch (err) {
        logger.warn('revalidatePath failed in cron — ISR busts via TTL i stedet', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result.duration_ms = Date.now() - started;
    logger.info('woo reconciliation completed', { ...result });
    return NextResponse.json(result);
  } catch (err) {
    result.status = 'error';
    result.duration_ms = Date.now() - started;
    result.error = err instanceof Error ? err.message : String(err);
    logger.error('woo reconciliation failed', {
      ...result,
      ...serializeError(err),
    });
    return NextResponse.json(result, { status: 500 });
  }
}

/**
 * Dedupliserer produkter på `slug` før upsert. Woo kan ha flere rader med
 * samme slug (f.eks. en gammel draft som "okkuperer" slug for et publisert
 * produkt). Supabase har UNIQUE på `products.slug`, så vi må velge en vinner
 * per slug. Prioritering:
 *   1. `status='published'` > `'private'` > `'draft'`
 *   2. Høyere `id` vinner (nyere produkt i Woo)
 *
 * Logger hver kollisjon slik at vi kan rydde opp i Woo-katalogen.
 */
function dedupeBySlug(
  rows: TablesInsert<'products'>[],
): { rows: TablesInsert<'products'>[]; droppedCollisions: number } {
  const bySlug = new Map<string, TablesInsert<'products'>>();
  let dropped = 0;

  for (const row of rows) {
    const existing = bySlug.get(row.slug);
    if (!existing) {
      bySlug.set(row.slug, row);
      continue;
    }

    const winner = compareProducts(existing, row);
    if (winner === row) {
      logger.warn('slug collision — replacing existing winner', {
        slug: row.slug,
        kept: { id: row.id, status: row.status },
        dropped: { id: existing.id, status: existing.status },
      });
      bySlug.set(row.slug, row);
    } else {
      logger.warn('slug collision — keeping existing winner', {
        slug: row.slug,
        kept: { id: existing.id, status: existing.status },
        dropped: { id: row.id, status: row.status },
      });
    }
    dropped += 1;
  }

  return { rows: Array.from(bySlug.values()), droppedCollisions: dropped };
}

const STATUS_RANK: Record<string, number> = {
  published: 3,
  private: 2,
  draft: 1,
};

function compareProducts(
  a: TablesInsert<'products'>,
  b: TablesInsert<'products'>,
): TablesInsert<'products'> {
  const rankA = STATUS_RANK[a.status] ?? 0;
  const rankB = STATUS_RANK[b.status] ?? 0;
  if (rankA !== rankB) return rankA > rankB ? a : b;
  return a.id > b.id ? a : b;
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}

/**
 * Fetch alle sider fra WC Store API (`/wc/store/v1/products`) — public,
 * ingen auth. Returnerer ferdig-beregnede priser inkl mva i minor units.
 *
 * Store API har samme pagineringsmønster som /wc/v3, men skjemaet er
 * annerledes (kun "display"-felt). Vi tar bare prisene her — alt annet
 * fra /wc/v3-kallet.
 */
async function fetchAllStorePrices(): Promise<StoreApiProductPrices[]> {
  const base = serverEnv.WC_API_URL.replace(/\/$/, '');
  const all: StoreApiProductPrices[] = [];
  let page = 1;

  while (true) {
    const url = `${base}/wp-json/wc/store/v1/products?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        `store-api fetch failed on page ${page}: ${res.status} ${res.statusText}`,
      );
    }
    const batch = (await res.json()) as Array<{
      id: number;
      prices?: {
        price?: string | number;
        regular_price?: string | number;
        sale_price?: string | number;
        currency_minor_unit?: number;
      };
    }>;
    if (!Array.isArray(batch)) {
      throw new Error(`store-api page ${page} returned non-array`);
    }
    for (const row of batch) {
      all.push(mapStorePrices(row));
    }
    if (batch.length < PER_PAGE) break;
    page += 1;
    if (page > 200) {
      throw new Error('store-api pagination exceeded safety limit (200 pages)');
    }
  }

  return all;
}

/**
 * Fetch alle sider fra et WP REST-endpoint. Bruker WP App Password-auth.
 * Tar ekstra query-params (typisk `_embed`, `status`, etc.).
 */
async function fetchAllWpPages<T>(
  path: string,
  extraQuery: Record<string, string | number | boolean | undefined> = {},
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const batch = await wpFetch<T[]>(path, {
      query: { per_page: PER_PAGE, page, orderby: 'id', order: 'asc', ...extraQuery },
      cache: 'no-store',
    });

    if (!Array.isArray(batch)) {
      throw new Error(`WP ${path} returned non-array on page ${page}`);
    }

    all.push(...batch);
    if (batch.length < PER_PAGE) break;
    page += 1;
    if (page > 200) {
      throw new Error(`WP ${path} pagination exceeded safety limit (200 pages)`);
    }
  }

  return all;
}

/**
 * Fetch alle sider av en Woo-liste-endpoint. Stopper når siste batch er
 * mindre enn `PER_PAGE` (Woo returnerer også `X-WP-TotalPages`-headeren, men
 * vi trenger den ikke så lenge vi stopper på partial page).
 */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const batch = await wooFetch<T[]>(path, {
      query: { per_page: PER_PAGE, page, orderby: 'id', order: 'asc' },
      cache: 'no-store',
    });

    if (!Array.isArray(batch)) {
      throw new Error(`Woo ${path} returned non-array on page ${page}`);
    }

    all.push(...batch);

    if (batch.length < PER_PAGE) break;
    page += 1;

    // Safety — Woo-kataloger bør ikke overstige dette. Hever vi grensen,
    // bør jobben uansett splittes i chunks.
    if (page > 200) {
      throw new Error(`Woo ${path} pagination exceeded safety limit (200 pages)`);
    }
  }

  return all;
}
