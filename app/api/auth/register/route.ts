/**
 * POST /api/auth/register
 *
 * To-stegs flyt:
 *   1. Opprett kunde i WooCommerce via `/wc/v3/customers` (REST med basic
 *      auth, håndtert av `wooFetch`).
 *   2. Auto-login med samme credentials via `wooLogin()` (chef-auth-
 *      pluginen). Vi forwarder resulterende WP-auth-cookies + setter
 *      `skn_user` UI-state-cookien som login-routen gjør.
 *
 * Hvorfor auto-login: brukeropplevelsen er bedre når registreringen lander
 * rett på /konto. Alternativet — "konto opprettet, vennligst logg inn" —
 * gir et ekstra steg uten gevinst (vi har akkurat verifisert passordet).
 *
 * Sikkerhet:
 *   - **Rate limit** 5 forsøk / 60s per IP+e-post via Upstash. Delt nøkkel-
 *     prefiks med login så samme e-post ikke kan hamres fra begge routene.
 *   - **Aldri returner rå WC/WP-error-body.** Vi mapper `WooCustomerError`
 *     og `WooAuthError` til norske feilmeldinger.
 *   - **Passord logges aldri.** Samme pattern som login.
 *   - Hvis kunde-opprettelse lykkes men auto-login feiler, logger vi det
 *     som error (bør ikke skje) og returnerer en nøytral melding som ber
 *     brukeren logge inn manuelt.
 *
 * Ved suksess: `{ ok: true, user: { id, email, displayName, roles } }`
 * Ved feil:    `{ ok: false, error: string }` + passende HTTP-status.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AUTH_ERROR_EMAIL_TAKEN,
  AUTH_ERROR_GENERIC,
  AUTH_ERROR_INVALID_EMAIL,
  AUTH_ERROR_PASSWORD_MISMATCH,
  AUTH_ERROR_RATE_LIMITED,
  AUTH_ERROR_TERMS_REQUIRED,
  AUTH_ERROR_WEAK_PASSWORD,
} from '@/lib/auth/info';
import { normalizeWpCookies, setAuthUserCookie } from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';
import { authRateLimit } from '@/lib/redis/client';
import { wooLogin, WooAuthError } from '@/lib/woo/auth';
import {
  wooCreateCustomer,
  WooCustomerError,
} from '@/lib/woo/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Register kjører to WC/WP-kall i serie (customers + login). 15s dekker
// slowe round-trips uten å blokkere for lenge.
export const maxDuration = 15;

// ---------------------------------------------------------------------------
// Payload-kontrakt
// ---------------------------------------------------------------------------

const RegisterSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'Fornavn er påkrevd.')
      .max(80, 'Fornavn er for langt.'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Etternavn er påkrevd.')
      .max(80, 'Etternavn er for langt.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: AUTH_ERROR_INVALID_EMAIL }),
    password: z
      .string()
      .min(8, 'Passordet må være minst 8 tegn.')
      .max(512, 'Passordet er for langt.'),
    confirmPassword: z
      .string()
      .min(1, 'Bekreft passord er påkrevd.'),
    consent: z.boolean(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: AUTH_ERROR_PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  })
  .refine((d) => d.consent === true, {
    message: AUTH_ERROR_TERMS_REQUIRED,
    path: ['consent'],
  });

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Parse body defensivt.
  let parsed: z.infer<typeof RegisterSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = RegisterSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig forespørsel.', 400);
  }

  // 2. Rate limit — samme key-shape som login, prefiks skiller på route.
  const ip = clientIpFromHeaders(req.headers);
  if (authRateLimit) {
    const key = `register:${ip}:${parsed.email}`;
    try {
      const { success } = await authRateLimit.limit(key);
      if (!success) {
        return jsonError(AUTH_ERROR_RATE_LIMITED, 429);
      }
    } catch (err) {
      logger.warn('auth rate limit error — allowing request', {
        route: 'register',
        ...serializeError(err),
      });
    }
  }

  // 3. Opprett kunde i WooCommerce.
  try {
    await wooCreateCustomer({
      email: parsed.email,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      password: parsed.password,
    });
  } catch (err) {
    if (err instanceof WooCustomerError) {
      const { status, message } = mapCustomerErrorToResponse(err);
      return jsonError(message, status);
    }

    logger.error('auth register unexpected error (customer step)', {
      email: maskEmail(parsed.email),
      ...serializeError(err),
    });
    return jsonError(AUTH_ERROR_GENERIC, 500);
  }

  // 4. Auto-login. Hvis dette feiler har vi en konto uten session — brukeren
  //    kan fortsatt logge inn manuelt, men vi vil gi en nyttig melding.
  try {
    const { user, cookies: wpCookies } = await wooLogin(
      parsed.email,
      parsed.password,
    );

    await setAuthUserCookie(user);

    logger.info('auth register success', {
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
      { status: 201 },
    );

    const isProd = process.env.NODE_ENV === 'production';
    for (const c of normalizeWpCookies(wpCookies, isProd)) {
      res.headers.append('set-cookie', c);
    }

    return res;
  } catch (err) {
    if (err instanceof WooAuthError) {
      // Kundeopprettelse lyktes, men auto-login feilet. Dette skal
      // ikke skje i normal drift — logg hardt og be brukeren logge inn.
      logger.error('auto-login after register failed', {
        email: maskEmail(parsed.email),
        code: err.code,
        status: err.status,
      });
    } else {
      logger.error('auth register unexpected error (login step)', {
        email: maskEmail(parsed.email),
        ...serializeError(err),
      });
    }

    return jsonError(
      'Kontoen ble opprettet, men vi klarte ikke å logge deg inn automatisk. Prøv å logge inn.',
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mapCustomerErrorToResponse(err: WooCustomerError): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case 'email_taken':
      return { status: 409, message: AUTH_ERROR_EMAIL_TAKEN };
    case 'invalid_email':
      return { status: 400, message: AUTH_ERROR_INVALID_EMAIL };
    case 'weak_password':
      return { status: 400, message: AUTH_ERROR_WEAK_PASSWORD };
    case 'rate_limited':
      return { status: 429, message: AUTH_ERROR_RATE_LIMITED };
    case 'network_error':
      return {
        status: 503,
        message:
          'Kunne ikke koble til serveren. Sjekk nettverket og prøv igjen.',
      };
    case 'unknown':
    default:
      return { status: 500, message: AUTH_ERROR_GENERIC };
  }
}

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
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
