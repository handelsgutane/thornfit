/**
 * WooCommerce auth-klient — bruker custom `chef-auth`-pluginen som er
 * installert på `www.skarpekniver.com` (ADR-0003).
 *
 * Pluginen registrerer ruter under `/wp-json/chef/v1/*`:
 *   - `POST /chef/v1/login`   — email + password → `wp_signon()` → WP-cookies
 *   - `GET  /chef/v1/me`      — returnerer current user via WP-cookie
 *   - `POST /chef/v1/logout`  — `wp_logout()`
 *
 * I motsetning til JWT-pluginen returnerer chef-auth ekte WP-auth-cookies
 * (`wordpress_logged_in_*`, `wordpress_sec_*`). Vi leser disse av respons-
 * headeren i route-handleren, normaliserer dem (strip `Domain=`, force
 * `Path=/`) og setter dem på frontend-host-et. Browser sender dem auto
 * tilbake på alle våre /api-kall, og vi forwarder til WP ved behov.
 *
 * Server-only. Importer aldri fra klient-komponenter.
 *
 * Se `docs/integrations.md` > "WooCommerce — Autentisering" + ADR-0003.
 */

import 'server-only';

import { serverEnv } from '@/lib/env';
import { logger, serializeError } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Kategoriserte feil-koder. API-routen mapper disse til norske feilmeldinger
 * — klienten ser aldri den rå WP-statusen.
 */
export type WooAuthErrorCode =
  | 'invalid_credentials'  // Feil e-post/passord (401)
  | 'missing_fields'       // email eller password mangler (400)
  | 'rate_limited'         // 429 fra WP
  | 'network_error'        // Kunne ikke nå WP i det hele tatt
  | 'plugin_missing'       // chef-auth-pluginen er ikke installert/aktivert (404 / rest_no_route)
  | 'unknown';             // 5xx eller uventet response-shape

export class WooAuthError extends Error {
  readonly status: number;
  readonly code: WooAuthErrorCode;
  readonly details: unknown;

  constructor(
    message: string,
    code: WooAuthErrorCode,
    status: number,
    details: unknown = null,
  ) {
    super(message);
    this.name = 'WooAuthError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Brukerinfo returnert fra chef-auth-pluginen.
 */
export interface WooAuthUser {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

/**
 * Success-shape fra `POST /chef/v1/login`.
 *
 * `cookies` er rå `Set-Cookie`-headers vi fikk tilbake fra WP — route-
 * handleren normaliserer dem og sender dem videre til klienten.
 */
export interface WooAuthLoginResult {
  readonly user: WooAuthUser;
  readonly cookies: readonly string[];
  readonly restNonce: string | null;
}

interface ChefLoginSuccess {
  readonly ok?: boolean;
  readonly user?: {
    readonly id?: number;
    readonly email?: string;
    readonly name?: string;
    readonly roles?: readonly string[];
  };
  readonly restNonce?: string;
}

interface ChefErrorBody {
  readonly error?: string;
  readonly code?: string;
  readonly message?: string;
  readonly data?: { readonly status?: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Logg inn mot WP via chef-auth-pluginen. Returnerer brukerinfo + rå
 * `Set-Cookie`-headers. Kaster `WooAuthError` ved feil.
 *
 * Pluginens `/chef/v1/login` kaller `wp_signon()` som aksepterer e-post
 * som `user_login` (WP resolver selv). Vi sender derfor e-posten rett
 * gjennom i `email`-feltet.
 */
export async function wooLogin(
  email: string,
  password: string,
): Promise<WooAuthLoginResult> {
  const url = buildAuthUrl('/chef/v1/login');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('woo auth network error', {
      url,
      email: maskEmail(email),
      ...serializeError(err),
    });
    throw new WooAuthError(
      'Network error reaching WooCommerce',
      'network_error',
      0,
      null,
    );
  }

  const raw = (await safeReadJson(res)) as
    | ChefLoginSuccess
    | ChefErrorBody
    | null;

  if (!res.ok) {
    const code = mapErrorCode(res.status, raw);
    logger.warn('woo auth failed', {
      email: maskEmail(email),
      status: res.status,
      url,
      wpError: isErrorBody(raw) ? raw.error ?? raw.code ?? null : null,
      mappedCode: code,
    });

    if (code === 'plugin_missing') {
      logger.error('chef-auth plugin not reachable on WP', {
        url,
        status: res.status,
        hint:
          'Sørg for at chef-auth-pluginen er aktivert på WPen pekt på av WC_API_URL ' +
          'og at /wp-json/chef/v1/login svarer.',
      });
    }

    throw new WooAuthError(
      `Auth failed (${res.status})`,
      code,
      res.status,
      raw,
    );
  }

  // Success path — narrow rå-shapen.
  if (!isLoginSuccess(raw)) {
    logger.error('chef-auth success response missing expected fields', {
      email: maskEmail(email),
    });
    throw new WooAuthError(
      'Malformed chef-auth response',
      'unknown',
      502,
      null,
    );
  }

  const cookies = readSetCookie(res);
  if (cookies.length === 0) {
    // Hvis WP svarte 200 OK men ikke satte auth-cookies er noe galt med
    // pluginens config eller en proxy strippet headerne. Uten cookies kan
    // vi ikke holde en session, så vi feiler hardt.
    logger.error('chef-auth returned 200 without Set-Cookie headers', {
      email: maskEmail(email),
    });
    throw new WooAuthError(
      'Auth succeeded but no cookies returned',
      'unknown',
      502,
      null,
    );
  }

  const user = raw.user!;
  return {
    user: {
      id: user.id as number,
      email: user.email ?? email,
      displayName: user.name ?? email,
      roles: user.roles ?? [],
    },
    cookies,
    restNonce: raw.restNonce ?? null,
  };
}

/**
 * Hent current user via WP-cookie. `cookieHeader` er cookien slik den ser
 * ut i en request til oss (bruk `req.headers.get('cookie') ?? ''`).
 *
 * Returnerer `null` hvis ikke logget inn (401). Kaster `WooAuthError` på
 * 5xx, nettverksfeil eller 404 (plugin mangler).
 */
export async function wooMe(
  cookieHeader: string,
): Promise<WooAuthUser | null> {
  const url = buildAuthUrl('/chef/v1/me');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Forward kun WP-relevante cookies. I praksis gir vi bare hele
        // strengen — WP bryr seg kun om `wordpress_logged_in_*` og
        // `wordpress_sec_*`.
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('woo /me network error', {
      url,
      ...serializeError(err),
    });
    throw new WooAuthError(
      'Network error reaching WooCommerce',
      'network_error',
      0,
      null,
    );
  }

  if (res.status === 401) return null;
  if (res.status === 404) {
    throw new WooAuthError(
      'chef-auth /me endpoint not found',
      'plugin_missing',
      404,
      null,
    );
  }
  if (!res.ok) {
    throw new WooAuthError(`/me failed (${res.status})`, 'unknown', res.status, null);
  }

  const raw = (await safeReadJson(res)) as
    | { loggedIn?: boolean; user?: ChefLoginSuccess['user'] }
    | null;

  if (
    !raw ||
    raw.loggedIn !== true ||
    !raw.user ||
    typeof raw.user.id !== 'number'
  ) {
    return null;
  }

  return {
    id: raw.user.id,
    email: raw.user.email ?? '',
    displayName: raw.user.name ?? raw.user.email ?? '',
    roles: raw.user.roles ?? [],
  };
}

/**
 * Logg ut mot WP. Best-effort — hvis WP ikke er nåelig, returnerer vi
 * stille `false` så klienten ikke får en feilmelding (vi tømmer
 * cookies lokalt uansett).
 */
export async function wooLogout(cookieHeader: string): Promise<boolean> {
  const url = buildAuthUrl('/chef/v1/logout');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch (err) {
    logger.warn('woo logout network error — clearing local cookies only', {
      ...serializeError(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuthUrl(path: string): string {
  const base = serverEnv.WC_API_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/wp-json${cleanPath}`;
}

/**
 * Les alle `Set-Cookie`-headers fra en `Response`. Node/undici eksponerer
 * `getSetCookie()` som returnerer én streng per cookie; `headers.get()`
 * ville slått dem sammen med komma (som er feil for cookies fordi
 * `Expires=...`-feltet inneholder komma).
 */
function readSetCookie(res: Response): string[] {
  type WithGetSetCookie = { getSetCookie?: () => string[] };
  const hdrs = res.headers as unknown as WithGetSetCookie;
  if (typeof hdrs.getSetCookie === 'function') {
    return hdrs.getSetCookie();
  }
  // Fallback: eldre runtime uten getSetCookie. Vi tar da kun én, som er
  // bedre enn ingenting men vil tape multi-cookie-svar. Skal i praksis
  // ikke skje på Node 20+ / Next 16.
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function mapErrorCode(
  status: number,
  raw: ChefLoginSuccess | ChefErrorBody | null,
): WooAuthErrorCode {
  if (status === 429) return 'rate_limited';

  if (isErrorBody(raw)) {
    const err = (raw.error ?? '').toLowerCase();
    const code = (raw.code ?? '').toLowerCase();

    if (code === 'rest_no_route') return 'plugin_missing';
    if (
      err.includes('missing email') ||
      err.includes('missing password') ||
      err.includes('missing email/password')
    ) {
      return 'missing_fields';
    }
    if (err.includes('invalid credentials')) return 'invalid_credentials';
  }

  if (status === 404) return 'plugin_missing';
  if (status === 400) return 'missing_fields';
  if (status === 401 || status === 403) return 'invalid_credentials';
  if (status >= 500) return 'unknown';
  return 'unknown';
}

function isLoginSuccess(
  raw: ChefLoginSuccess | ChefErrorBody | null,
): raw is ChefLoginSuccess {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      'user' in raw &&
      raw.user &&
      typeof raw.user === 'object' &&
      typeof (raw.user as { id?: unknown }).id === 'number',
  );
}

function isErrorBody(
  raw: ChefLoginSuccess | ChefErrorBody | null,
): raw is ChefErrorBody {
  if (!raw || typeof raw !== 'object') return false;
  return 'error' in raw || 'code' in raw || 'message' in raw;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Logg-safe masking av e-post — beholder domenet for debugging. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local?.slice(0, 2) ?? '';
  return `${head}***@${domain}`;
}
