/**
 * WordPress menu fetcher.
 *
 * Henter `wp-json/wp/v2/menu-items?menus=<id>` med Basic-auth (WP application
 * password for admin-brukeren). Returnerer en flat, typet liste som
 * `lib/nav/resolve.ts` senere bygger til et tre via `parent`-feltet.
 *
 * Hvorfor ikke gjenbruke `wooFetch`:
 *   - `wooFetch` bruker Woo consumer-key/secret. Woo-nøkler gir ikke tilgang
 *     til `/wp/v2/*` (WP core REST). Denne fila bruker WP application password
 *     (WP_ADMIN_USERNAME + WP_ADMIN_APP_PASSWORD).
 *   - Auth-mekanismen er forskjellig, så en egen tynn klient er ryddigere enn
 *     å forgrene `wooFetch` på auth-type.
 *
 * Auth: https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/
 *
 * Skal aldri kastes fra siden — feil logges og bubblet opp som `WpMenuError`
 * slik at cron-jobben kan svare 500 med strukturert feilmelding.
 */
import { serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';

/** Rå form fra `/wp/v2/menu-items` — kun feltene vi bryr oss om. */
export interface RawMenuItem {
  id: number;
  title: { rendered: string } | string;
  url: string;
  parent: number;
  menu_order: number;
  /** 'post_type' (page/post), 'taxonomy' (kategori/tag), 'custom' (manuell link) */
  type: 'post_type' | 'taxonomy' | 'custom' | string;
  /** Post-type-navn (page, post, product) eller taxonomy-navn (product_cat). */
  object: string;
  object_id: number;
  description: string;
  /** CSS-klasser lagt til i WP admin. Brukes for overlay-triggere (e.g. 'accent'). */
  classes: string[];
  target: string;
}

/**
 * Normalisert form brukt av resolver. `title` er unwrappet, `url` er strippet
 * for domene (kun pathname), og tomme strenger er konvertert til `null` der
 * relevant.
 */
export interface MenuItem {
  id: number;
  title: string;
  /** Pathname uten domene. F.eks. `/knivtyper` eller `/` for rotlenken. */
  path: string;
  parent: number;
  order: number;
  type: string;
  object: string;
  object_id: number;
  description: string;
  classes: string[];
  target: string;
}

export interface MenuSnapshot {
  menu_id: number;
  items: MenuItem[];
  /** Når snapshot-et ble hentet fra WP. */
  fetched_at: string;
}

export class WpMenuError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'WpMenuError';
  }
}

const PER_PAGE = 100;
const MAX_PAGES = 20; // 2 000 items — langt over noen realistisk meny.

/**
 * Hent alle items for én WP-meny. Pagineres automatisk. Returnerer normalisert
 * `MenuSnapshot`.
 */
export async function fetchMenuSnapshot(menuId: number): Promise<MenuSnapshot> {
  const items: MenuItem[] = [];
  let page = 1;

  while (true) {
    const batch = await fetchMenuItemsPage(menuId, page);
    for (const raw of batch) items.push(normalize(raw));

    if (batch.length < PER_PAGE) break;
    page += 1;
    if (page > MAX_PAGES) {
      throw new WpMenuError(
        `WP menu ${menuId} pagination exceeded safety limit (${MAX_PAGES} pages)`,
        null,
        null,
      );
    }
  }

  // Sorter stabilt før vi returnerer. Resolveren stoler på dette.
  items.sort((a, b) => a.parent - b.parent || a.order - b.order || a.id - b.id);

  return {
    menu_id: menuId,
    items,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Fetch én side med `per_page=100`. Kastes kastes som `WpMenuError` med
 * strukturert body hvis WP svarer ikke-2xx.
 */
async function fetchMenuItemsPage(menuId: number, page: number): Promise<RawMenuItem[]> {
  const base = serverEnv.WC_API_URL.replace(/\/$/, '');
  const url = new URL(`${base}/wp-json/wp/v2/menu-items`);
  url.searchParams.set('menus', String(menuId));
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('orderby', 'menu_order');
  url.searchParams.set('order', 'asc');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: basicAuth(),
      Accept: 'application/json',
    },
    // Cron-jobben kjører force-dynamic; men hvis denne fetcheren brukes fra
    // andre paths vil vi eksplisitt ikke cache resultatet.
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await safeReadJson(res);
    throw new WpMenuError(
      `WP /wp/v2/menu-items (menu=${menuId}, page=${page}) failed with ${res.status}`,
      res.status,
      body,
    );
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new WpMenuError(
      `WP /wp/v2/menu-items returned non-array for menu=${menuId} page=${page}`,
      res.status,
      data,
    );
  }
  return data as RawMenuItem[];
}

function basicAuth(): string {
  const token = Buffer.from(
    `${serverEnv.WP_ADMIN_USERNAME}:${serverEnv.WP_ADMIN_APP_PASSWORD}`,
  ).toString('base64');
  return `Basic ${token}`;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Normaliser ett item. `title.rendered` unwrappes, URL strippes til pathname,
 * HTML-entities i tittel decodes.
 *
 * Path bevares hierarkisk fra WP — f.eks. `/bryner-og-knivsliping/slipekurs/`.
 * Vår App Router har `app/[...slug]/page.tsx` (catch-all) som resolver
 * nested paths mot `categories` og `products`, så vi speiler Woo sin URL-
 * struktur 1:1.
 */
function normalize(raw: RawMenuItem): MenuItem {
  const rawTitle = typeof raw.title === 'string' ? raw.title : raw.title?.rendered ?? '';
  // WP lar redaktører legge inn inline HTML i meny-titler (typisk et ikon-
  // `<span class="razzi-svg-icon"><svg>…</svg></span>` foran "Se alle …").
  // Det passer ikke inn i vår komponent-drevne MegaMenu, så vi stripper alt
  // markup her før HTML-entities decodes — da slipper vi å renderes
  // `<svg xmlns=…>` som ren tekst i menyen.
  const title = decodeHtmlEntities(stripHtmlTags(rawTitle));

  return {
    id: raw.id,
    title,
    path: toPathname(raw.url),
    parent: raw.parent ?? 0,
    order: raw.menu_order ?? 0,
    type: raw.type,
    object: raw.object,
    object_id: raw.object_id,
    description: raw.description ?? '',
    classes: Array.isArray(raw.classes) ? raw.classes.filter((c) => c !== '') : [],
    target: raw.target ?? '',
  };
}

/**
 * Strip domene og normaliser pathname. Tåler både absolutte URL-er
 * ("https://www.skarpekniver.com/knivtyper/") og relative paths ("/knivtyper").
 *
 * Fjerner trailing slash (bortsett fra for ren rot "/"). Beholder querystring
 * hvis den finnes (noen WP-menyer bruker ?tag=... for filter-lenker).
 */
export function toPathname(raw: string): string {
  if (!raw) return '/';
  const trimmed = raw.trim();

  try {
    // Hvis absolutt URL — parse og ta pathname + search.
    const u = new URL(trimmed);
    return stripTrailingSlash(u.pathname + u.search);
  } catch {
    // Relative path.
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return stripTrailingSlash(withSlash);
  }
}

function stripTrailingSlash(p: string): string {
  if (p === '/') return p;
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Fjern all inline HTML fra meny-titler. WP-redaktører legger noen ganger
 * ikon-spans + svg-er rett i tittelen (f.eks. `<span class="razzi-svg-icon">
 * <svg …></svg></span> Se alle …`). Vi vil ha rene tekst-titler som
 * MegaMenu-komponentene kan style uniformt.
 *
 * Strategi: fjern alt mellom `<` og `>` (inkludert self-closing tags og
 * attributter), deretter kollapse multiple whitespace til én space. Dette er
 * bevisst ikke full HTML-parsing — WP-menyer er enkle nok til at en regex
 * holder, og et fullt DOMPurify-innslag er overkill for denne flaten.
 *
 * Eksempel:
 *   input:  '<span class="x"><svg>…</svg></span> Se alle 30 kategorier'
 *   output: 'Se alle 30 kategorier'
 */
function stripHtmlTags(s: string): string {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Offentlig helper som kombinerer HTML-strip + entity-decode. Brukes av
 * resolveren som defense-in-depth på eksisterende wp_menus-rader — gamle
 * snapshots som ble lagret før `normalize()` stripte tags inneholder fortsatt
 * inline HTML, og vi vil ikke vente på at cron-en kjører på nytt før
 * brukerne ser rene labels.
 */
export function sanitizeMenuTitle(raw: string): string {
  return decodeHtmlEntities(stripHtmlTags(raw));
}

/**
 * Veldig lett HTML-entity-decode for WP-title-felter. `title.rendered` kommer
 * som `"Kj&oslash;kkenutstyr"` for æøå. Full decode krever en lib; vi dekker
 * de vanligste for norsk + engelsk.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&oslash;/g, 'ø')
    .replace(/&Oslash;/g, 'Ø')
    .replace(/&aelig;/g, 'æ')
    .replace(/&AElig;/g, 'Æ')
    .replace(/&aring;/g, 'å')
    .replace(/&Aring;/g, 'Å')
    .replace(/&ndash;/g, '–')
    .replace(/&#8211;/g, '–')   // en-dash (numerisk)
    .replace(/&mdash;/g, '—')
    .replace(/&#8212;/g, '—')   // em-dash (numerisk)
    .replace(/&rarr;/g, '→')
    .replace(/&#8594;/g, '→')   // pil høyre (numerisk)
    .replace(/&hellip;/g, '…')
    .replace(/&#8230;/g, '…')   // ellipsis (numerisk)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')    // non-breaking space (numerisk)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); // generisk fallback
}

/**
 * Henter flere menyer i parallell. Feil på én meny er ikke-fatalt for de
 * andre — kalleren får `{ menuId: null | snapshot }`.
 */
export async function fetchMenuSnapshots(
  menuIds: readonly number[],
): Promise<Record<number, MenuSnapshot | null>> {
  const out: Record<number, MenuSnapshot | null> = {};

  const results = await Promise.allSettled(menuIds.map((id) => fetchMenuSnapshot(id)));
  results.forEach((r, i) => {
    const id = menuIds[i];
    if (r.status === 'fulfilled') {
      out[id] = r.value;
    } else {
      out[id] = null;
      logger.error('wp menu fetch failed', {
        menu_id: id,
        ...serializeError(r.reason),
      });
    }
  });

  return out;
}
