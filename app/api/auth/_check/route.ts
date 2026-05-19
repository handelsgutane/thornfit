/**
 * GET /api/auth/_check
 *
 * Diagnose-endpoint. Treffer `/wp-json/chef/v1/me` uten cookies og
 * rapporterer hva WP svarer, slik at vi kan bekrefte at chef-auth-
 * pluginen er installert og eksponerer de forventede rutene — uten
 * å logge inn som noen.
 *
 * Returnerer alltid 200 med et diagnostisk JSON-objekt (ikke 4xx/5xx).
 * Cowork/CI kan hit-testes mot dette. Body-en inneholder:
 *   - `pluginInstalled`: boolean (true hvis WP svarer 401 — dvs. ruten
 *     finnes og pluginen er aktiv)
 *   - `wpStatus`: nummeret fra WP (forventet 401 for "ikke pålogget")
 *   - `hint`: fritekst-instruksjon til admin hvis noe er galt
 *
 * **Ikke hemmelig** — men returner ikke fra prod-frontend. Lav-profil
 * URL (`_check`, underscore-prefix) så den ikke dukker opp i sitemap.
 */

import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  const base = serverEnv.WC_API_URL.replace(/\/$/, '');
  const url = `${base}/wp-json/chef/v1/me`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    const body = (await safeReadJson(res)) as
      | { code?: string; message?: string }
      | null;

    // 401 = ruten finnes, pluginen er aktiv, bruker bare ikke pålogget (forventet)
    // 404 + rest_no_route = pluginen ikke installert/aktivert
    const pluginInstalled =
      res.status !== 404 && body?.code !== 'rest_no_route';

    return NextResponse.json({
      ok: pluginInstalled,
      pluginInstalled,
      wpStatus: res.status,
      wpCode: body?.code ?? null,
      wpMessage: body?.message ?? null,
      checkedUrl: url,
      hint: buildHint({ pluginInstalled, status: res.status }),
    });
  } catch (err) {
    logger.error('auth _check network error', { url, ...serializeError(err) });
    return NextResponse.json({
      ok: false,
      pluginInstalled: false,
      wpStatus: 0,
      wpCode: null,
      wpMessage: null,
      checkedUrl: url,
      hint: 'Kunne ikke nå WP i det hele tatt. Sjekk WC_API_URL og at WP-siden svarer.',
    });
  }
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildHint(s: { pluginInstalled: boolean; status: number }): string {
  if (!s.pluginInstalled) {
    return (
      'chef-auth-pluginen er ikke installert/aktiv på WPen. Aktiver den på ' +
      'wp-admin → Plugins. Pluginen skal registrere ruter under /wp-json/chef/v1/*.'
    );
  }
  if (s.status === 401) {
    return 'chef-auth er live og responderer som forventet (401 uten cookie). Login skal fungere.';
  }
  return `chef-auth responderer med uventet status ${s.status}. Sjekk WP-logger.`;
}
