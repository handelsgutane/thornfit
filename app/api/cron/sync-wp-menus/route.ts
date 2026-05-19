/**
 * WP → Supabase menu sync cron.
 *
 * Henter alle relevante WP-menyer (main menu 536, Mobilmeny 589, topbar 539)
 * og upserter dem til `wp_menus`-tabellen. Etter hver vellykket run
 * invalideres Redis-cachen for `nav:v2:primary` slik at neste request
 * re-bygger menyen fra ferske snapshots.
 *
 * Autorisasjon: Vercel sender `x-vercel-cron: 1`. Manuelle kall krever
 * `CRON_SECRET` som Bearer-token eller `?secret=…`-param.
 *
 * Schedule: `0 6 * * *` (06:00 UTC daglig) — se `vercel.json`.
 *
 * Idempotent: kan kjøres fritt uten å dobbel-opprette noe (upsert on
 * menu_id-pk). Delvis feil (én meny feiler, de andre lykkes) logges og
 * rapporteres i response, men returnerer 200 så lenge minst én meny ble
 * oppdatert — Woo skal aldri retry-e hele jobben på grunn av én flaky
 * meny.
 *
 * Manuelt kall:
 * ```bash
 * CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)
 * curl -sS --max-time 120 \
 *   "https://<host>/api/cron/sync-wp-menus?secret=$CRON_SECRET" | jq
 * ```
 */

import { NextResponse } from 'next/server';

import { authorizeCron } from '@/lib/cron/auth';
import { logger, serializeError } from '@/lib/logger';
import {
  invalidateNavPrimary,
  MENU_ID_DESKTOP,
  MENU_ID_FOOTER,
  MENU_ID_MOBILE,
} from '@/lib/nav/fetch';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchMenuSnapshot, WpMenuError, type MenuSnapshot } from '@/lib/wp/menus';
import type { Json } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 min — pagineres opp til 2 000 items/meny, som går raskt.

/**
 * WP-menyene vi synker. Topbar (539) tas med for senere bruk selv om nav-
 * komponenten foreløpig kun leser 536/589 — vi vil ha snapshot-et klart den
 * dagen topbar-menyen skal rendres. Footer-menyen (1035) leses av
 * `getFooterNav()` og rendres i `<Footer>`.
 */
const MENU_IDS_TO_SYNC = [
  MENU_ID_DESKTOP,
  MENU_ID_MOBILE,
  MENU_ID_FOOTER,
  539,
] as const;

interface SyncResult {
  status: 'ok' | 'partial' | 'error';
  duration_ms: number;
  menus: Array<{
    menu_id: number;
    status: 'ok' | 'error';
    items?: number;
    error?: string;
  }>;
  cache_invalidated: boolean;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const started = Date.now();
  const result: SyncResult = {
    status: 'ok',
    duration_ms: 0,
    menus: [],
    cache_invalidated: false,
  };

  try {
    const supabase = createServiceRoleClient();

    // Fetch alle menyene parallelt. Feil på én meny er ikke-fatal for de
    // andre — vi vil fortsatt upserte de som lyktes.
    const snapshots = await Promise.allSettled(
      MENU_IDS_TO_SYNC.map((id) => fetchMenuSnapshot(id)),
    );

    let upsertedCount = 0;

    for (let i = 0; i < MENU_IDS_TO_SYNC.length; i += 1) {
      const menuId = MENU_IDS_TO_SYNC[i];
      const snap = snapshots[i];

      if (snap.status === 'rejected') {
        const err = snap.reason;
        const msg = err instanceof WpMenuError ? err.message : String(err);
        result.menus.push({ menu_id: menuId, status: 'error', error: msg });
        logger.error('wp menu fetch failed', {
          menu_id: menuId,
          ...serializeError(err),
        });
        continue;
      }

      try {
        await upsertMenuSnapshot(supabase, snap.value);
        result.menus.push({
          menu_id: menuId,
          status: 'ok',
          items: snap.value.items.length,
        });
        upsertedCount += 1;
      } catch (err) {
        result.menus.push({
          menu_id: menuId,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        logger.error('wp menu upsert failed', {
          menu_id: menuId,
          ...serializeError(err),
        });
      }
    }

    // Vi inva­liderer cachen så lenge minst én meny ble oppdatert. Gamle
    // snapshot-er blir stående i Supabase hvis sync feilet, men cachen vil
    // uansett re-bygge fra det vi har.
    if (upsertedCount > 0) {
      await invalidateNavPrimary();
      result.cache_invalidated = true;
    }

    // Klassifiser status:
    //   ok       — alle menyer ok
    //   partial  — minst én ok, minst én feilet
    //   error    — alle feilet (500, så Vercel retry-er)
    const errors = result.menus.filter((m) => m.status === 'error').length;
    if (errors === 0) result.status = 'ok';
    else if (upsertedCount > 0) result.status = 'partial';
    else result.status = 'error';

    result.duration_ms = Date.now() - started;

    if (result.status === 'error') {
      logger.error('wp menu sync failed', { ...result });
      return NextResponse.json(result, { status: 500 });
    }

    logger.info('wp menu sync completed', { ...result });
    return NextResponse.json(result);
  } catch (err) {
    result.status = 'error';
    result.duration_ms = Date.now() - started;
    logger.error('wp menu sync crashed', {
      ...result,
      ...serializeError(err),
    });
    return NextResponse.json(
      { ...result, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ---------- Supabase upsert ------------------------------------------------

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

async function upsertMenuSnapshot(
  supabase: ServiceClient,
  snapshot: MenuSnapshot,
): Promise<void> {
  const { error } = await supabase.from('wp_menus').upsert(
    {
      menu_id: snapshot.menu_id,
      // `name` er ikke inkludert i snapshot-et — cron setter den fra en
      // eventuell senere tilleggsforespørsel. For nå la den stå null/uendret.
      // Cast til `Json` — `MenuItem` mangler [key: string]: Json string-
      // indeks-signaturen som Supabase-typen krever. Strukturen er faktisk
      // JSON-serialiserbar, så casten er trygg.
      items: snapshot.items as unknown as Json,
      synced_at: snapshot.fetched_at,
    },
    { onConflict: 'menu_id' },
  );

  if (error) {
    throw new Error(`wp_menus upsert failed: ${error.message}`);
  }
}
