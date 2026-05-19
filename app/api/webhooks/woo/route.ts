/**
 * WooCommerce → Supabase webhook-handler.
 *
 * Mottar `product.*` og `product_category.*`-webhooks fra Woo og propagerer
 * endringen til Supabase-speilet i nær sanntid. Reconciliation-cronen er
 * fortsatt sikkerhetsnett (tapte webhooks, downtime).
 *
 * Flyt:
 *   1. Les `rawBody = request.text()` — signaturen beregnes på bytes, ikke
 *      på re-serialisert JSON.
 *   2. Verifiser `X-WC-Webhook-Signature` med HMAC-SHA256 og `WC_WEBHOOK_SECRET`.
 *   3. Håndter "ping" (test-delivery fra wp-admin).
 *   4. Parse topic `<resource>.<event>`.
 *   5. Switch: product/product_category × created/updated/restored/deleted.
 *   6. Logg + returner 200/202. Non-2xx → Woo retry-er i eksponentiell backoff.
 *
 * Cache-invalidering:
 *   `invalidateCatalogCache()` er en no-op nå. Når Redis lander, kalles det
 *   her for å purge `catalog:slug:<slug>` + relaterte nøkler. Hook-punkt i
 *   `finally`-tilsvarende posisjon holder Redis-integrasjonen lokalisert.
 *
 * Sikkerhet:
 *   - Fail-closed: uten WC_WEBHOOK_SECRET settes → alt avvises.
 *   - Signaturen sjekkes før JSON.parse (angrips-overflate minimeres).
 *   - Vi stoler ikke på topic-headeren alene — payload-formen må matche.
 *
 * Registrer webhooken i wp-admin:
 *   WooCommerce → Settings → Advanced → Webhooks → Add webhook
 *   - Delivery URL: https://<host>/api/webhooks/woo
 *   - Secret: <samme som WC_WEBHOOK_SECRET i Vercel>
 *   - Topics: en per event (Woo tillater ikke flere topics per webhook,
 *     så vi må registrere minst: product.created, product.updated,
 *     product.deleted, product_category.created, product_category.updated,
 *     product_category.deleted).
 */

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import {
  invalidateBothBySlug,
  invalidateCategorySlug,
  invalidateOnCreate,
  invalidateProductSlug,
} from '@/lib/cache/catalog';
import { invalidateNavPrimary } from '@/lib/nav/fetch';
import { logger, serializeError } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  mapCategory,
  mapProduct,
  type WooCategory,
  type WooProduct,
} from '@/lib/woo/mappers';
import {
  isWooPing,
  parseWooTopic,
  verifyWooSignature,
  type WooWebhookTopic,
} from '@/lib/woo/webhook';
import type { TablesInsert } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Webhook-operasjoner er raske; 30s er mer enn nok.

type HandledResult =
  | {
      action: 'upserted';
      table: 'products' | 'categories';
      id: number;
      slug: string;
      /**
       * Ved `created`-events må vi også invalidere evt. negative-cache-
       * entries for samme slug i motsatt tabell (hvis noen tidligere traff
       * slugen og fikk 404). `isCreate` styrer dette i `invalidateCatalogCache`.
       */
      isCreate: boolean;
    }
  | {
      action: 'deleted';
      table: 'products' | 'categories';
      id: number;
      /** Slugen som ble slettet — null hvis raden ikke fantes. */
      slug: string | null;
    }
  | { action: 'skipped'; reason: string }
  | { action: 'ignored'; reason: string };

export async function POST(request: Request) {
  const started = Date.now();

  // 1. Les rå body først — vi trenger bytes for signaturen.
  const rawBody = await request.text();

  const signature = request.headers.get('x-wc-webhook-signature');
  const topicHeader = request.headers.get('x-wc-webhook-topic');
  const deliveryId = request.headers.get('x-wc-webhook-delivery-id');
  const webhookId = request.headers.get('x-wc-webhook-id');

  // 2. Signatur-verifisering. Alltid først.
  if (!verifyWooSignature(rawBody, signature)) {
    logger.warn('woo webhook rejected: invalid signature', {
      deliveryId,
      webhookId,
      topic: topicHeader,
      hasSignature: Boolean(signature),
    });
    return new Response('Invalid signature', { status: 401 });
  }

  // 3. Ping fra wp-admin når webhooken opprettes.
  if (isWooPing(rawBody)) {
    logger.info('woo webhook ping received', { webhookId, deliveryId });
    return NextResponse.json({ status: 'ok', type: 'ping' });
  }

  // 4. Parse topic.
  const topic = parseWooTopic(topicHeader);
  if (!topic) {
    logger.warn('woo webhook rejected: missing/invalid topic', {
      deliveryId,
      webhookId,
      topicHeader,
    });
    return new Response('Missing topic', { status: 400 });
  }

  // 5. Parse body.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    logger.warn('woo webhook rejected: invalid JSON', {
      deliveryId,
      webhookId,
      topic: topic.raw,
      ...serializeError(err),
    });
    return new Response('Invalid JSON', { status: 400 });
  }

  // 6. Dispatch.
  try {
    const result = await handle(topic, payload);
    const duration_ms = Date.now() - started;

    logger.info('woo webhook processed', {
      deliveryId,
      webhookId,
      topic: topic.raw,
      duration_ms,
      ...result,
    });

    // Hook-punkt for fremtidig Redis-invalidering. Se doc-kommentar i toppen.
    await invalidateCatalogCache(topic, result);

    return NextResponse.json({ status: 'ok', ...result, duration_ms });
  } catch (err) {
    const duration_ms = Date.now() - started;
    logger.error('woo webhook handler failed', {
      deliveryId,
      webhookId,
      topic: topic.raw,
      duration_ms,
      ...serializeError(err),
    });
    // Returner 500 så Woo retry-er. Ikke 200 — da mister vi denne leveransen.
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        duration_ms,
      },
      { status: 500 },
    );
  }
}

// ---------- Dispatch -------------------------------------------------------

async function handle(
  topic: WooWebhookTopic,
  payload: unknown,
): Promise<HandledResult> {
  switch (topic.resource) {
    case 'product':
      return handleProduct(topic.event, payload);
    case 'product_category':
      return handleCategory(topic.event, payload);
    default:
      // Andre ressurser (order, customer, coupon) er utenfor scope for
      // katalog-speil. De kan få egne handlers senere.
      return { action: 'ignored', reason: `unsupported resource: ${topic.resource}` };
  }
}

async function handleProduct(
  event: string,
  payload: unknown,
): Promise<HandledResult> {
  const body = payload as Partial<WooProduct>;
  const id = typeof body.id === 'number' ? body.id : null;
  if (id === null) {
    return { action: 'skipped', reason: 'payload missing numeric id' };
  }

  if (event === 'deleted' || event === 'trashed') {
    // Woo sender {id} ved delete/trash. Vi fjerner raden; ordrehistorikk
    // bor uansett i Woo, ikke i vår products-tabell.
    return deleteRow('products', id);
  }

  if (event === 'created' || event === 'updated' || event === 'restored') {
    // Full payload med alle felter.
    const row = mapProduct(body as WooProduct);
    if (!row) {
      // mapProduct returnerer null for typer/statuser vi ikke speiler.
      return { action: 'skipped', reason: `product ${id} not mirrorable (type/status)` };
    }
    return upsertProductRow(row, event === 'created');
  }

  return { action: 'ignored', reason: `unsupported product event: ${event}` };
}

async function handleCategory(
  event: string,
  payload: unknown,
): Promise<HandledResult> {
  const body = payload as Partial<WooCategory>;
  const id = typeof body.id === 'number' ? body.id : null;
  if (id === null) {
    return { action: 'skipped', reason: 'payload missing numeric id' };
  }

  if (event === 'deleted') {
    return deleteRow('categories', id);
  }

  if (event === 'created' || event === 'updated') {
    const row = mapCategory(body as WooCategory);
    return upsertCategoryRow(row, event === 'created');
  }

  return { action: 'ignored', reason: `unsupported category event: ${event}` };
}

// ---------- Supabase ops ---------------------------------------------------

async function upsertProductRow(
  row: TablesInsert<'products'>,
  isCreate: boolean,
): Promise<HandledResult> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
  if (error) {
    throw new Error(`products upsert failed: ${error.message}`);
  }
  return { action: 'upserted', table: 'products', id: row.id, slug: row.slug, isCreate };
}

async function upsertCategoryRow(
  row: TablesInsert<'categories'>,
  isCreate: boolean,
): Promise<HandledResult> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('categories').upsert(row, { onConflict: 'id' });
  if (error) {
    throw new Error(`categories upsert failed: ${error.message}`);
  }
  return { action: 'upserted', table: 'categories', id: row.id, slug: row.slug, isCreate };
}

/**
 * Slett + hent slug tilbake via `.delete().select('slug')`. Slug trengs for å
 * kunne invalidere cache etterpå. Hvis raden ikke fantes returneres slug=null.
 */
async function deleteRow(
  table: 'products' | 'categories',
  id: number,
): Promise<HandledResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .select('slug');

  if (error) {
    throw new Error(`${table} delete failed: ${error.message}`);
  }

  const slug = Array.isArray(data) && data.length > 0 ? data[0].slug : null;
  return { action: 'deleted', table, id, slug };
}

// ---------- Cache invalidation --------------------------------------------

/**
 * Invaliderer Redis-cache for berørte slugs. Kalles etter vellykket Supabase-
 * skrive, slik at neste lesing henter fersk data. Feil her logges men feiler
 * ikke webhooken — Woo skal ikke retry-e fordi cache-invalidering tryntet;
 * TTL vil rette det opp uansett.
 *
 * Per action:
 *   - `upserted`: invalider slugen i sin egen tabell. Ved `isCreate` invaliderer
 *     vi også negativ-cache i motsatt tabell (noen kan ha 404-et på samme slug
 *     før).
 *   - `deleted`: invalider slugen hvis vi fikk den tilbake fra DELETE-querien.
 *   - `skipped`/`ignored`: ingen DB-endring → ingen invalidering.
 *
 * TODO(redis): kategori-listing (`listProductsByCategory`) og sitemap er ikke
 * cached enda. Når de blir det, må også de invalideres her.
 */
async function invalidateCatalogCache(
  _topic: WooWebhookTopic,
  result: HandledResult,
): Promise<void> {
  // Hvis kategorien endres, kan også mega-meny editorial (mega_post_id +
  // mega_buttons) være endret — bust nav-cachen så endringen vises umiddelbart.
  // `skipped`-varianten har ikke `.table`, så vi diskriminerer først.
  const isCategoryChange =
    (result.action === 'upserted' || result.action === 'deleted') &&
    result.table === 'categories';

  if (result.action === 'upserted') {
    if (result.isCreate) {
      // Rydder også i motsatt tabells negativ-cache-entry for denne slugen.
      await invalidateOnCreate(result.slug);
    } else if (result.table === 'products') {
      await invalidateProductSlug(result.slug);
    } else {
      await invalidateCategorySlug(result.slug);
    }
  } else if (result.action === 'deleted' && result.slug) {
    // Konservativt: invalider begge nøkler for slugen. Billig, og dekker
    // tilfellet der en slug har "byttet eier" (product → category eller vice versa).
    await invalidateBothBySlug(result.slug);
  } else {
    return;
  }

  // Bust også Next.js sin egen ISR-cache for catch-all-ruta. Uten dette
  // ville Vercel servere stale HTML/RSC i opp til `revalidate`-vinduet
  // (60s) etter en webhook. revalidatePath på selve dynamiske segment-
  // mønsteret invaliderer alle ISR-entries under [...slug] i ett kall —
  // billigere enn å beregne den nøyaktige nested-pathen ut fra slug
  // alene (vi har ikke kategori-parents her).
  try {
    revalidatePath('/[...slug]', 'page');
  } catch (err) {
    logger.warn('revalidatePath failed — ISR-cache busts seg likevel ved TTL', {
      slug: result.slug,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Mega-meny editorial trekker fra categories.mega_post_id + mega_buttons.
  // Når kategori-data endres må nav-cachen invalideres så live-headeren
  // viser ny editorial uten å vente på 24t TTL.
  if (isCategoryChange) {
    try {
      await invalidateNavPrimary();
    } catch (err) {
      logger.warn('invalidateNavPrimary failed — mega-editorial busts via TTL', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
