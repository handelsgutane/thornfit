/**
 * POST /api/auth/login
 *
 * Proxy mellom klient-login-skjemaet og WPs `chef-auth`-plugin (ADR-0003).
 * Klienten sender `{ email, password }`. Vi bytter det mot WP-auth-cookies
 * (via `wp_signon()` inne i pluginen) og forwarder dem normaliserte til
 * browseren som host-only cookies på frontend-domenet. I tillegg setter
 * vi `skn_user` — en readable cookie med display-info (navn, e-post) for
 * UI-state.
 *
 * Sikkerhet:
 *   - **Rate limit** 5 forsøk / 60s per IP+e-post via Upstash. Returnerer
 *     429 når truffet.
 *   - **Aldri returner rå WP-error-body.** Vi mapper `WooAuthError.code`
 *     til en norsk feilmelding. WP-kode + message logges kun server-side.
 *   - **Passord logges aldri.** `wooLogin` tar imot passord uten å røre
 *     loggeren; vi logger bare maskert e-post.
 *   - **Consent-uavhengig**: auth-cookies er strictly necessary — GDPR-
 *     konsent-banneret (ADR-0010) gjelder ikke dem.
 *
 * Ved suksess: `{ ok: true, user: { id, email, displayName, roles } }`
 * Ved feil:    `{ ok: false, error: string }` + passende HTTP-status.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { wooLogin, WooAuthError } from '@/lib/woo/auth';
import { normalizeWpCookies, setAuthUserCookie } from '@/lib/auth/session';
import { authRateLimit } from '@/lib/redis/client';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Login skal være rask — 10s er rikelig inkl. WP round-trip.
export const maxDuration = 10;

// ---------------------------------------------------------------------------
// Payload-kontrakt
// ---------------------------------------------------------------------------

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email({
    message: 'Ugyldig e-postadresse.',
  }),
  password: z
    .string()
    .min(1, 'Passord er påkrevd.')
    .max(512, 'Passord er for langt.'),
  // Hint fra klient — faktisk cookie-expiry er WPs ansvar. Vi tar imot det
  // for fremtidig bruk (chef-auth-plugin kan få et `remember`-flagg), men
  // holder det optional så eksisterende kall uten feltet fortsetter å virke.
  remember: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Parse body defensivt — en tom/tukla body skal ikke ta ned routen.
  let parsed: z.infer<typeof LoginSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = LoginSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig forespørsel.', 400);
  }

  // 2. Rate limit — kombinerer IP + e-post så en angriper ikke kan
  //    hamre ulike e-poster gjennom én IP og slippe unna.
  const ip = clientIpFromHeaders(req.headers);
  if (authRateLimit) {
    const key = `${ip}:${parsed.email}`;
    try {
      const { success } = await authRateLimit.limit(key);
      if (!success) {
        return jsonError(
          'For mange innloggingsforsøk. Prøv igjen om et minutt.',
          429,
        );
      }
    } catch (err) {
      // Rate-limit-feil skal ikke blokkere login — logg og gå videre.
      logger.warn('auth rate limit error — allowing request', {
        ...serializeError(err),
      });
    }
  }

  // 3. Proxy til chef-auth.
  try {
    const { user, cookies: wpCookies } = await wooLogin(parsed.email, parsed.password);

    // Skriv skn_user-cookien (UI-state, readable fra klient).
    await setAuthUserCookie(user);

    logger.info('auth login success', {
      email: maskEmail(parsed.email),
      userId: user.id,
    });

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: user.roles,
        },
      },
      { status: 200 },
    );

    // Forward de normaliserte WP-cookies. Vi bruker `append` (ikke `set`)
    // slik at flere Set-Cookie-headers kan side-by-side — både
    // wordpress_logged_in_* og wordpress_sec_* må gjennom.
    const isProd = process.env.NODE_ENV === 'production';
    for (const c of normalizeWpCookies(wpCookies, isProd)) {
      res.headers.append('set-cookie', c);
    }

    return res;
  } catch (err) {
    if (err instanceof WooAuthError) {
      const { status, message } = mapAuthErrorToResponse(err);
      return jsonError(message, status);
    }

    logger.error('auth login unexpected error', {
      email: maskEmail(parsed.email),
      ...serializeError(err),
    });
    return jsonError('Noe gikk galt. Prøv igjen om litt.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mapAuthErrorToResponse(err: WooAuthError): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case 'invalid_credentials':
      return {
        status: 401,
        message: 'Feil e-post eller passord.',
      };
    case 'missing_fields':
      return {
        status: 400,
        message: 'E-post og passord er påkrevd.',
      };
    case 'rate_limited':
      return {
        status: 429,
        message: 'For mange forsøk. Prøv igjen om et minutt.',
      };
    case 'network_error':
      return {
        status: 503,
        message:
          'Kunne ikke koble til serveren. Sjekk nettverket og prøv igjen.',
      };
    case 'plugin_missing':
      // Server-side konfigurasjonsfeil. I dev gir vi en tydelig melding
      // så utvikleren skjønner hvor problemet ligger; i prod en nøytral
      // melding fordi den peker mot intern infrastruktur.
      if (process.env.NODE_ENV !== 'production') {
        return {
          status: 503,
          message:
            'Innlogging er ikke konfigurert: chef-auth-pluginen er ikke aktiv ' +
            'på WPen pekt på av WC_API_URL.',
        };
      }
      return {
        status: 503,
        message:
          'Innlogging er midlertidig utilgjengelig. Vi jobber med saken — prøv igjen om litt.',
      };
    case 'unknown':
    default:
      return {
        status: 500,
        message: 'Noe gikk galt. Prøv igjen om litt.',
      };
  }
}

function clientIpFromHeaders(headers: Headers): string {
  // Vercel eksponerer klient-IP i x-forwarded-for. Fallback til "unknown"
  // hvis ingen header — da er det enten lokal dev eller en preview uten
  // proxy. Rate-limit-nøkkelen blir mindre presis men fortsatt ikke åpen.
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    // "client, proxy1, proxy2" — første er original klient.
    return fwd.split(',')[0]?.trim() || 'unknown';
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local?.slice(0, 2) ?? '';
  return `${head}***@${domain}`;
}
