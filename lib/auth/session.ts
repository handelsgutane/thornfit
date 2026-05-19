/**
 * Auth-session helpers — WP-auth-cookies + `skn_user` UI-state-cookie.
 *
 * Session-modellen følger chef-storefront-pluginens pattern (ADR-0003):
 *
 * 1. WP-pluginen `chef-auth` setter ekte WordPress-auth-cookies
 *    (`wordpress_logged_in_*`, `wordpress_sec_*`). Vi normaliserer dem
 *    (strip `Domain=`, force `Path=/`) i `/api/auth/login` så de bor på
 *    frontend-domenet og følger med på alle /api-kall automatisk.
 *
 * 2. I tillegg setter vi en egen `skn_user`-cookie som er readable fra
 *    klient-JS (httpOnly=false). Den inneholder kun display-info (navn,
 *    e-post) og lar RSC + klient gjengi "Hei, Ola" uten et ekstra
 *    `/api/auth/me`-rundturn. Denne kan ikke brukes til auth-avgjørelser
 *    — kun UI-state.
 *
 * 3. Kilde til sannhet for "er brukeren logget inn?" er:
 *    - Proxy-check: finnes `wordpress_logged_in_*` i cookie-jaren? (rask)
 *    - Verifiser: `wooMe()` mot `/chef/v1/me` (gyldig pålogget?)
 *
 * Server-only.
 */

import 'server-only';

import { cookies } from 'next/headers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prefikser WP setter på auth-cookies. Navnet er `wordpress_logged_in_<hash>`
 * og `wordpress_sec_<hash>`, der hash-en er site-URL-hash-et. Vi sjekker
 * kun prefiks.
 */
export const WP_AUTH_COOKIE_PREFIX = 'wordpress_logged_in_';
export const WP_SEC_COOKIE_PREFIX = 'wordpress_sec_';

/** UI-state-cookie — readable fra klient. Ikke sannhet for auth. */
export const AUTH_USER_COOKIE_NAME = 'skn_user';

/** 7 dager. Matcher WPs default auth-cookie-expiry når `remember=true`. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface AuthUser {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

// ---------------------------------------------------------------------------
// Cookie-normalisering — brukes av login-route-handleren
// ---------------------------------------------------------------------------

/**
 * Strip `Domain=...`-attributtet så cookien blir host-only på frontend-
 * hosten (der WP-responsen ble mottatt — ikke der WP kjører).
 */
function stripDomain(setCookie: string): string {
  return setCookie.replace(/;\s*domain=[^;]+/i, '');
}

/**
 * Tving `Path=<path>` — ellers setter WP noen cookies med `Path=/wp-admin`
 * eller `/wp-content/plugins/...` som gjør at browseren ikke sender dem
 * med vanlige /api-kall.
 */
function forcePath(setCookie: string, path: string): string {
  const hasPath = /;\s*path=[^;]+/i.test(setCookie);
  if (hasPath) {
    return setCookie.replace(/;\s*path=[^;]+/i, `; Path=${path}`);
  }
  return `${setCookie}; Path=${path}`;
}

/**
 * Legg til `Secure`-attributt hvis det mangler. WP setter det kun når
 * `is_ssl()` er sant på sin side, og selv da kan noen proxies strippe
 * det. Vi vil alltid ha Secure i prod.
 */
function ensureSecure(setCookie: string, prod: boolean): string {
  if (!prod) return setCookie;
  if (/;\s*secure(?:;|$)/i.test(setCookie)) return setCookie;
  return `${setCookie}; Secure`;
}

/**
 * Normaliser én `Set-Cookie`-streng fra WP til noe som kan settes host-only
 * på frontend-domenet. Håndterer både `wordpress_logged_in_*`,
 * `wordpress_sec_*` og eventuelle andre WP-cookies (f.eks. `wp-settings-*`).
 */
export function normalizeWpCookie(setCookie: string, prod: boolean): string {
  let c = stripDomain(setCookie);

  const head = c.split('=')[0]?.trim() ?? '';
  const isWpAuth =
    head.startsWith(WP_AUTH_COOKIE_PREFIX) ||
    head.startsWith(WP_SEC_COOKIE_PREFIX);
  if (isWpAuth) {
    c = forcePath(c, '/');
  }

  c = ensureSecure(c, prod);
  return c;
}

/**
 * Helper for login-route: normaliser en array med rå Set-Cookie-strings.
 */
export function normalizeWpCookies(
  cookies: readonly string[],
  prod: boolean,
): string[] {
  return cookies.map((c) => normalizeWpCookie(c, prod));
}

// ---------------------------------------------------------------------------
// UI-state-cookie (skn_user)
// ---------------------------------------------------------------------------

/**
 * Sett `skn_user`-cookien — ikke-sensitiv, readable fra klient-JS. Brukes
 * kun for å vise navn/e-post i Header uten et ekstra API-kall.
 */
export async function setAuthUserCookie(user: AuthUser): Promise<void> {
  const jar = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  jar.set(
    AUTH_USER_COOKIE_NAME,
    encodeURIComponent(JSON.stringify(user)),
    {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    },
  );
}

export async function clearAuthUserCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_USER_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returnerer alle WP-auth-cookies i request-jaren som én header-verdi
 * klar til å sendes til WP. `null` hvis ingen WP-cookies finnes.
 */
export async function getWpCookieHeader(): Promise<string | null> {
  const jar = await cookies();
  const all = jar.getAll();
  const relevant = all.filter(
    (c) =>
      c.name.startsWith(WP_AUTH_COOKIE_PREFIX) ||
      c.name.startsWith(WP_SEC_COOKIE_PREFIX) ||
      c.name === 'wp-settings' ||
      c.name.startsWith('wp-settings-'),
  );
  if (relevant.length === 0) return null;
  return relevant.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Rask helper — sann hvis en `wordpress_logged_in_*`-cookie finnes i
 * jaren. Ikke en sannhetsbasert auth-sjekk (cookien kan være utløpt eller
 * tukla), men bra nok for å avgjøre UI-state og middleware-redirects.
 *
 * Bruk `wooMe()` for å verifisere faktisk status.
 */
export async function hasWpAuthCookie(): Promise<boolean> {
  const jar = await cookies();
  const all = jar.getAll();
  return all.some((c) => c.name.startsWith(WP_AUTH_COOKIE_PREFIX));
}

/**
 * Hent decoded user-info fra `skn_user`-cookien. Parser defensivt.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const v = jar.get(AUTH_USER_COOKIE_NAME);
  if (!v) return null;

  try {
    const decoded = decodeURIComponent(v.value);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.id !== 'number' ||
      typeof p.email !== 'string' ||
      typeof p.displayName !== 'string'
    ) {
      return null;
    }
    const roles = Array.isArray(p.roles)
      ? p.roles.filter((r): r is string => typeof r === 'string')
      : [];
    return {
      id: p.id,
      email: p.email,
      displayName: p.displayName,
      roles,
    };
  } catch {
    return null;
  }
}

/**
 * Full clear — fjerner `skn_user` + setter tom-verdi / Max-Age=0 på alle
 * WP-cookies i jaren. Brukes av logout-route.
 *
 * NB: Vi må ikke bare kalle `jar.delete(name)` — det sletter kun på den
 * default-path-en Next setter. Vi må matche Path=/ som vi satte i login.
 */
export async function clearAllAuthCookies(): Promise<void> {
  const jar = await cookies();
  const isProd = process.env.NODE_ENV === 'production';

  // UI-state
  jar.delete(AUTH_USER_COOKIE_NAME);

  // WP-cookies — iterer over alt i jaren og slett det som matcher.
  for (const c of jar.getAll()) {
    const matches =
      c.name.startsWith(WP_AUTH_COOKIE_PREFIX) ||
      c.name.startsWith(WP_SEC_COOKIE_PREFIX) ||
      c.name === 'wp-settings' ||
      c.name.startsWith('wp-settings-');
    if (!matches) continue;
    jar.set(c.name, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
