/**
 * `getPrimaryNav()` — fetch-helper for primær-navigasjonen.
 *
 * Fallback-kjede (første som lykkes vinner):
 *   1. Upstash Redis         (cache-hit — resolved NavPrimary)
 *   2. Resolver( wp_menus-snapshots + site_config-overlay )
 *   3. `null`                (Header rendrer uten nav-items)
 *
 * Merk: Tidligere hadde denne fila en `DEFAULT_NAV_PRIMARY`-fallback som
 * rendret en hardkodet meny hvis wp_menus var tom eller fetch kastet. Det er
 * bevisst fjernet fordi fallbacken maskerte reelle sync-feil — live-siden kunne
 * vise en stale, hardkodet meny mens man trodde alt funket. Nå: hvis sync er
 * broken, blir det synlig umiddelbart (header uten nav-items + loud log).
 *
 * Architecture (v2):
 *   - Katalog (items + groups + links) kommer fra `wp_menus`-tabellen. Synket
 *     daglig av `/api/cron/sync-wp-menus` + invalidert via Woo-webhooks
 *     (menu.updated). Én rad per WP-meny, `items` som jsonb-array.
 *   - Editorial content (redaksjonelle kort, overview-lead, utility-messages,
 *     virtuelle items som "Tilbud") kommer fra `site_config.nav_primary` som
 *     en `NavOverlay`-blob.
 *   - `lib/nav/resolve.ts` gjør den PURE sammenslåingen. Denne filen håndterer
 *     kun IO + cache + null-fallback.
 *
 * Invalidering: `invalidateNavPrimary()` sletter Redis-nøkkelen. Kall det
 * fra sync-cron etter upsert av wp_menus, og fra redaksjonelle endpoints
 * som skriver til site_config.
 */

import { cacheGet, cacheInvalidate } from '@/lib/redis/client';
import { logger, serializeError } from '@/lib/logger';
import { fetchCategoryPathMap } from '@/lib/supabase/catalog';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sanitizeMenuTitle, type MenuSnapshot } from '@/lib/wp/menus';

import { DEFAULT_NAV_OVERLAY } from './default';
import { resolvePrimaryNav } from './resolve';
import { NavOverlaySchema, type NavOverlay, type NavPrimary } from './schema';

// ---------- Constants ------------------------------------------------------

/**
 * Cache-key-versjon. Bumpes når resolver-output endrer form slik at gammel
 * cache (24t TTL) ikke kan deserialiseres feilaktig som ny shape.
 *   - v1: resolved blob fra site_config
 *   - v2: wp_menus-snapshot + overlay
 *   - v3: 2026-04-23 — sidebar-overview promoterer nå `rawGroups[0]` med
 *         gruppens egen tittel som lead (ikke lenger "Alle [kategori]").
 *         Uten bump ville live-siden holdt den forrige shape-en i 24 timer.
 *   - v4: 2026-04-24 — resolver sanitizer WP-titler ved read-time (stripper
 *         inline HTML fra f.eks. "Se alle 30 kategorier"-lenker med
 *         ikon-span). Bump så gamle, urene blobs i Redis byttes ut umiddelbart.
 *   - v5: 2026-04-29 — fjerner hardkodet overview for /knivtyper fra
 *         site_config; overview auto-bygges nå fra wp_menus-data. Bump
 *         invaliderer v4-nøkkelen så gammel blob ikke serveres fra cache.
 */
const KEY_VERSION = 'v9'; // v9: seeAll faller alltid tilbake til første link så kolonne-overskrifter er klikkbare
const NAV_KEY_PRIMARY = `nav:${KEY_VERSION}:primary`;
const NAV_TTL_SECONDS = 60 * 60 * 24; // 24 timer — menyen endrer seg sjeldent

/** WP menu-IDs (lives in WP admin). Hvis disse endres, oppdater også cron. */
export const MENU_ID_DESKTOP = 194; // thornfit-WP desktop-hovedmeny
export const MENU_ID_MOBILE = 589; // "Mobilmeny"
export const MENU_ID_FOOTER = 1035; // "Footer-meny"

const FOOTER_KEY = `nav:${KEY_VERSION}:footer`;

const UNDEFINED_TABLE = '42P01'; // Postgres: relation does not exist

// ---------- Public API ------------------------------------------------------

/**
 * Returnerer den resolverte navigasjonen, eller `null` hvis ingenting kan
 * bygges (begge WP-meny-snapshots mangler, eller en uventet exception). Null
 * betyr "vis header uten nav-items" — se `components/layout/Header.tsx`.
 */
export async function getPrimaryNav(): Promise<NavPrimary | null> {
  try {
    return await cacheGet(NAV_KEY_PRIMARY, buildNavOrThrow, NAV_TTL_SECONDS);
  } catch (err) {
    // Ingen stille fallback-meny lenger. Null bobler opp til Header som
    // rendrer uten nav — tydelig signal om at noe er galt.
    logger.error('nav fetch failed — rendering header without items', serializeError(err));
    return null;
  }
}

export async function invalidateNavPrimary(): Promise<void> {
  // Bust både primary og footer — begge er avledet av wp_menus og deler
  // sync-cron, så de invalideres alltid sammen.
  await cacheInvalidate([NAV_KEY_PRIMARY, FOOTER_KEY]);
}

// ---------- Footer-meny -----------------------------------------------------

/**
 * En kolonne i footer-menyen. Top-level WP-meny-item blir kolonne-overskrift,
 * og level-1-barn blir lenker under. Dypere nivåer ignoreres (footer har
 * bare 2 nivåer per design).
 */
export interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

/**
 * Returnerer footer-kolonnene fra WP menu 1035, eller `null` hvis snapshot
 * mangler. Cachet 24t i Redis (samme TTL som primary) — invalideres sammen
 * med primary-nav når sync-cron har kjørt.
 */
export async function getFooterNav(): Promise<FooterColumn[] | null> {
  try {
    return await cacheGet(FOOTER_KEY, buildFooterOrNull, NAV_TTL_SECONDS);
  } catch (err) {
    logger.error('footer nav fetch failed', serializeError(err));
    return null;
  }
}

async function buildFooterOrNull(): Promise<FooterColumn[] | null> {
  const supabase = createServiceRoleClient();
  const snap = await fetchMenuSnapshot(supabase, MENU_ID_FOOTER);
  if (!snap) return null;

  // Bygg id → item-map for å resolve parent-relasjoner. WP-snapshot er
  // flat liste; level 0 (parent === 0) er kolonner, level 1+ er lenker.
  const items = snap.items;

  type Item = (typeof items)[number];
  const byId = new Map<number, Item>();
  for (const item of items) byId.set(item.id, item);

  const columns: FooterColumn[] = [];
  for (const item of items) {
    if (item.parent !== 0) continue; // kun top-level som kolonner

    const links: FooterColumn['links'] = [];
    for (const child of items) {
      if (child.parent !== item.id) continue;
      links.push({
        label: sanitizeMenuTitle(child.title),
        href: child.path || '#',
      });
    }

    columns.push({
      heading: sanitizeMenuTitle(item.title),
      links,
    });
  }

  return columns.length > 0 ? columns : null;
}

// ---------- Build pipeline --------------------------------------------------

/**
 * Henter wp_menus-snapshots + overlay fra Supabase parallelt og kjører
 * resolveren. Kaster hvis begge menyene er utilgjengelige — vi caller ikke
 * `cacheGet` med en tom/null verdi fordi det ville poisone cachen.
 */
async function buildNavOrThrow(): Promise<NavPrimary> {
  const supabase = createServiceRoleClient();

  // Merge-lag (lavest → høyest prioritet):
  //   1. DEFAULT_NAV_OVERLAY                — kode-default, kanji + fallback editorial
  //   2. site_config.nav_primary (DB)       — manuelt redigerbart i Supabase Studio
  //   3. WP-driven overlay fra mega_post_id — settes redaksjonelt i WP wp-admin
  // WP-driven har høyest prioritet siden det er det redaktørene faktisk
  // forventer å se rendret når de sjekker live-siden etter en endring.
  const [desktopMenu, mobileMenu, dbOverlay, wpOverlay] = await Promise.all([
    fetchMenuSnapshot(supabase, MENU_ID_DESKTOP),
    fetchMenuSnapshot(supabase, MENU_ID_MOBILE),
    fetchOverlay(supabase),
    fetchWpDrivenOverlay(supabase),
  ]);

  if (!desktopMenu && !mobileMenu) {
    // Ikke en "soft failure" lenger — kaster så getPrimaryNav logger det som
    // feil og returnerer null. Header rendrer da tom nav, og den manglende
    // menyen er umiddelbart synlig.
    throw new Error(
      'wp_menus is empty for both desktop and mobile — run /api/cron/sync-wp-menus',
    );
  }

  // dbOverlay er allerede merget med DEFAULT_NAV_OVERLAY i fetchOverlay().
  // Vi merger så WP-overlay over det resultatet — WP vinner per path.
  const overlay = mergeOverlay(dbOverlay, wpOverlay);

  return resolvePrimaryNav({ desktopMenu, mobileMenu, overlay });
}

// ---------- Supabase fetchers ----------------------------------------------

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Hent én wp_menus-rad. Returnerer null ved hvilken som helst feil (tabellen
 * mangler, raden mangler, parse-feil). Logger ikke-trivielle feil.
 */
async function fetchMenuSnapshot(
  supabase: ServiceClient,
  menuId: number,
): Promise<MenuSnapshot | null> {
  const { data, error } = await supabase
    .from('wp_menus')
    .select('menu_id, items, synced_at')
    .eq('menu_id', menuId)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      logger.warn('wp_menus table missing — run supabase db push', {
        hint: 'apply 20260423100000_wp_menus.sql',
      });
      return null;
    }
    logger.warn('nav fetch: wp_menus supabase error', {
      menu_id: menuId,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;

  // `items` er Json fra Supabase-typen. Vi stoler på at cron-jobben har
  // skrevet noe vi kan bruke. Resolveren håndterer manglende felter defensivt,
  // men hvis strukturen er fullstendig ødelagt bør vi heller returnere null.
  if (!Array.isArray(data.items)) {
    logger.warn('wp_menus.items is not an array — skipping menu', {
      menu_id: menuId,
    });
    return null;
  }

  return {
    menu_id: data.menu_id,
    // Cast via `unknown` — Json og MenuItem[] har ikke kompatible index-
    // signaturer, men strukturen er faktisk MenuItem[] (cron-jobben skrev den).
    // Resolveren håndterer manglende felter defensivt.
    items: data.items as unknown as MenuSnapshot['items'],
    fetched_at: data.synced_at,
  };
}

/**
 * Hent + parse editorial overlay. Faller tilbake til `DEFAULT_NAV_OVERLAY`
 * ved feil — resolveren trenger en gyldig overlay, og det er ingen grunn til
 * å feile bare fordi site_config mangler. Overlay er redaksjonelt innhold og
 * ikke katalog-data, så det er trygt å ha en default her.
 *
 * Merge-strategi (v7+): DB-overlay slås OVER default-overlay per-felt.
 * Konkret: `itemOverrides` deep-merges på path-nivå — hvis default har
 * editorial for /bryner-og-knivsliping og DB ikke har det, beholder vi
 * default-en. Hvis DB har en verdi for samme path, vinner DB. Dette gjør at
 * vi kan utvide kode-default-en uten at en gammel DB-rad maskerer endringene.
 */
async function fetchOverlay(supabase: ServiceClient): Promise<NavOverlay> {
  const { data, error } = await supabase
    .from('site_config')
    .select('value')
    .eq('key', 'nav_primary')
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return DEFAULT_NAV_OVERLAY;
    }
    logger.warn('nav fetch: site_config supabase error — using default overlay', {
      code: error.code,
      message: error.message,
    });
    return DEFAULT_NAV_OVERLAY;
  }

  if (!data) return DEFAULT_NAV_OVERLAY;

  const parsed = NavOverlaySchema.safeParse(data.value);
  if (!parsed.success) {
    logger.warn('nav overlay failed schema validation — using default overlay', {
      issues: parsed.error.issues.slice(0, 5),
    });
    return DEFAULT_NAV_OVERLAY;
  }

  return mergeOverlay(DEFAULT_NAV_OVERLAY, parsed.data);
}

/**
 * Slå sammen DB-overlay over default. DB vinner på top-level felter (utility,
 * version, virtualItems). For `itemOverrides`: merge per path — DB-verdier
 * overstyrer default-verdier for samme path, men paths som BARE finnes i
 * default beholdes.
 *
 * Editorial-merging: når BEGGE har editorial for samme path, deep-merger vi
 * `card` så top kan endre title/body/cta uten å miste `decorative` (kanji)
 * fra default. `services` erstattes som-er hvis top har den (knapper er en
 * holistisk gruppe — ingen mening i å bevare delvis liste).
 */
function mergeOverlay(base: NavOverlay, top: NavOverlay): NavOverlay {
  const mergedItemOverrides: NavOverlay['itemOverrides'] = { ...base.itemOverrides };
  for (const [path, topOverride] of Object.entries(top.itemOverrides)) {
    const baseOverride = base.itemOverrides[path];
    if (!baseOverride) {
      mergedItemOverrides[path] = topOverride;
      continue;
    }
    // Per-felt-merge: top vinner, men editorial.card flettes så vi beholder
    // `decorative`-fallback når top kun overstyrer tekst-feltene.
    const mergedEditorial = topOverride.editorial
      ? {
          ...baseOverride.editorial,
          ...topOverride.editorial,
          card: {
            ...baseOverride.editorial?.card,
            ...topOverride.editorial.card,
          },
        }
      : baseOverride.editorial;
    mergedItemOverrides[path] = {
      ...baseOverride,
      ...topOverride,
      editorial: mergedEditorial,
    };
  }
  return {
    version: top.version,
    utility: top.utility.length > 0 ? top.utility : base.utility,
    virtualItems: top.virtualItems.length > 0 ? top.virtualItems : base.virtualItems,
    itemOverrides: mergedItemOverrides,
  };
}

// ---------- WP-driven overlay (categories.mega_post_id + mega_buttons) -----

/**
 * Bygg en NavOverlay fra WP-data: hver kategori med `mega_post_id` satt får
 * editorial-kortet sitt fra hovedartikkelen, og knapp-array-en blir til
 * `services.links`. Tom overlay returneres ved feil eller hvis ingen
 * kategorier har konfigurert dette.
 *
 * Path-key bygges via `fetchCategoryPathMap` slik at også nestede kategorier
 * (sjeldne i mega-meny i dag, men mulig framover) matcher WP-meny-href-en.
 */
async function fetchWpDrivenOverlay(supabase: ServiceClient): Promise<NavOverlay> {
  const empty: NavOverlay = {
    version: 2,
    utility: [],
    virtualItems: [],
    itemOverrides: {},
  };

  // 1. Kategorier som har mega_post_id satt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cats, error } = await (supabase as any)
    .from('categories')
    .select('id, slug, mega_post_id, mega_buttons')
    .not('mega_post_id', 'is', null);

  if (error) {
    if (error.code === UNDEFINED_TABLE) return empty;
    logger.warn('nav: categories mega-fetch failed — skipping wp overlay', {
      code: error.code,
      message: error.message,
    });
    return empty;
  }

  const rows = (cats ?? []) as Array<{
    id: number;
    slug: string;
    mega_post_id: number | null;
    mega_buttons: Array<{ label: string; url: string }> | null;
  }>;

  if (rows.length === 0) return empty;

  // 2. Slå opp posts (kun publiserte). Filterer ut kategorier hvis post er
  // upublisert/slettet — graceful fallback til default editorial.
  const postIds = rows.map((r) => r.mega_post_id).filter((n): n is number => Boolean(n));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: posts } = await (supabase as any)
    .from('blog_posts')
    .select('id, slug, title, excerpt')
    .eq('status', 'publish')
    .in('id', postIds);

  const postsById = new Map<number, { id: number; slug: string; title: string; excerpt: string | null }>(
    (posts ?? []).map((p: { id: number; slug: string; title: string; excerpt: string | null }) => [p.id, p]),
  );

  // 3. Path-map for å bygge full nested path per kategori. Cachet i Redis
  // (1t TTL) etter forrige perf-runde, så dette er kjapt.
  const pathMap = await fetchCategoryPathMap();

  const overlay: NavOverlay = empty;
  overlay.itemOverrides = {};

  for (const row of rows) {
    if (!row.mega_post_id) continue;
    const post = postsById.get(row.mega_post_id);
    if (!post) continue;

    const info = pathMap.get(row.id);
    const overlayKey = `/${info?.path ?? row.slug}`;

    const buttons = (row.mega_buttons ?? []).filter(
      (b) => typeof b?.label === 'string' && typeof b?.url === 'string' && b.label && b.url,
    );

    overlay.itemOverrides[overlayKey] = {
      editorial: {
        title: 'Redaksjonelt',
        card: {
          // `decorative` settes IKKE her — den faller tilbake til default.ts
          // via mergeOverlay's deep-merge på editorial.card.
          title: post.title,
          body: post.excerpt ?? undefined,
          cta: {
            label: 'Les artikkelen →',
            href: `/kniv-info/${post.slug}`,
          },
        },
        ...(buttons.length > 0
          ? {
              services: {
                title: 'Lenker',
                links: buttons.map((b) => ({ label: b.label, href: b.url })),
              },
            }
          : {}),
      },
    };
  }

  return overlay;
}
