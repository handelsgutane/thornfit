/**
 * POST /api/auth/password
 *
 * Lar innlogget bruker bytte passord. Pre-pluginstøtte: chef-auth har ingen
 * `/chef/v1/password`-endpoint ennå, så vi gjør det i to ledd:
 *
 *   1. Verifiser at oppgitt nåværende passord er korrekt ved å kalle
 *      `wooLogin(email, currentPassword)`. Hvis det går igjennom betyr det
 *      at passordet stemmer.  Vi forkaster cookies fra det kallet — vi vil
 *      ikke rotere browser-sessionen ved en passord-bytte.
 *   2. Sett nytt passord via `wooUpdateCustomer(id, { password })` (WC
 *      admin REST). WP roterer auth-cookien for andre sessions automatisk
 *      (men bevarer denne, siden vi fortsatt har den i jaren).
 *
 * Sikkerhet:
 *   - Krever `skn_user`-cookien (UI-state) + verifisert WP-cookie via
 *     `wooMe()`. Hindrer skriving fra utløpte sesjoner.
 *   - Rate-limit 5 forsøk / 60s per IP+user-id via Upstash. Beskytter mot
 *     brute-force på `currentPassword`-feltet.
 *   - Logger maskert e-post + user-id; aldri passord.
 *
 * Payload:
 *   { current: string, next: string }
 *
 * Respons:
 *   { ok: true }                              200
 *   { ok: false, error: string }              4xx/5xx
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getSessionUser,
  getWpCookieHeader,
} from '@/lib/auth/session';
import { wooLogin, wooMe, WooAuthError } from '@/lib/woo/auth';
import {
  wooUpdateCustomer,
  WooCustomerError,
} from '@/lib/woo/customers';
import { authRateLimit } from '@/lib/redis/client';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// ---------------------------------------------------------------------------
// Payload-kontrakt
// ---------------------------------------------------------------------------

const PasswordSchema = z.object({
  current: z
    .string()
    .min(1, 'Nåværende passord er påkrevd.')
    .max(512, 'Passord er for langt.'),
  next: z
    .string()
    .min(8, 'Nytt passord må være minst 8 tegn.')
    .max(512, 'Passord er for langt.'),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Session-sjekk.
  const session = await getSessionUser();
  if (!session) {
    return jsonError('Du må være logget inn.', 401);
  }

  // 2. WP-cookie-verifikasjon.
  const wpCookie = await getWpCookieHeader();
  if (!wpCookie) {
    return jsonError('Sesjonen din er utløpt. Logg inn på nytt.', 401);
  }
  try {
    const wpUser = await wooMe(wpCookie);
    if (!wpUser || wpUser.id !== session.id) {
      return jsonError('Sesjonen din er utløpt. Logg inn på nytt.', 401);
    }
  } catch (err) {
    logger.warn('password update — wooMe verification failed', {
      userId: session.id,
      ...serializeError(err),
    });
    return jsonError('Kunne ikke verifisere sesjonen. Prøv igjen.', 503);
  }

  // 3. Rate-limit på IP+userId.
  const ip = clientIpFromHeaders(req.headers);
  if (authRateLimit) {
    const key = `${ip}:pwd:${session.id}`;
    try {
      const { success } = await authRateLimit.limit(key);
      if (!success) {
        return jsonError(
          'For mange forsøk. Prøv igjen om et minutt.',
          429,
        );
      }
    } catch (err) {
      logger.warn('password rate limit error — allowing request', {
        ...serializeError(err),
      });
    }
  }

  // 4. Parse body.
  let parsed: z.infer<typeof PasswordSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = PasswordSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig forespørsel.', 400);
  }

  if (parsed.current === parsed.next) {
    return jsonError(
      'Nytt passord kan ikke være likt det gamle.',
      400,
    );
  }

  // 5. Verifiser current via wooLogin. Vi forkaster cookies fra responsen —
  //    vi vil ikke rotere browser-sessionen.
  try {
    await wooLogin(session.email, parsed.current);
  } catch (err) {
    if (err instanceof WooAuthError && err.code === 'invalid_credentials') {
      logger.info('password update — wrong current password', {
        userId: session.id,
      });
      return jsonError('Nåværende passord er feil.', 401);
    }
    if (err instanceof WooAuthError && err.code === 'rate_limited') {
      return jsonError(
        'For mange forsøk. Prøv igjen om et minutt.',
        429,
      );
    }
    logger.error('password update — current-pwd verify failed', {
      userId: session.id,
      ...serializeError(err),
    });
    return jsonError('Kunne ikke verifisere passordet. Prøv igjen.', 503);
  }

  // 6. Sett nytt passord via WC admin REST.
  try {
    await wooUpdateCustomer(session.id, { password: parsed.next });

    logger.info('auth password update success', { userId: session.id });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof WooCustomerError) {
      const { status, message } = mapCustomerErrorToResponse(err);
      return jsonError(message, status);
    }

    logger.error('auth password update unexpected error', {
      userId: session.id,
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

function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}

function mapCustomerErrorToResponse(err: WooCustomerError): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case 'weak_password':
      return {
        status: 400,
        message: 'Passordet er for svakt. Velg et sterkere passord.',
      };
    case 'not_found':
      return {
        status: 404,
        message: 'Fant ikke kontoen din. Logg inn på nytt og prøv igjen.',
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
    case 'email_taken':
    case 'invalid_email':
    case 'unknown':
    default:
      return { status: 500, message: 'Noe gikk galt. Prøv igjen om litt.' };
  }
}
