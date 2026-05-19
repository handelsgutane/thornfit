/**
 * POST /api/auth/profile
 *
 * Lar innlogget bruker oppdatere navn / e-post / telefon på sin egen kunde.
 *
 * Bakgrunn: chef-auth-pluginen (`/wp-json/chef/v1/*`) eksponerer ikke en
 * mutate-route for profil ennå. Inntil pluginen får en `/chef/v1/profile`-
 * endpoint bruker vi WCs admin-REST (`PUT /wc/v3/customers/{id}`) med
 * consumer-key/secret. Sikkerhets-vinduet lukkes ved at vi:
 *
 *   1. Krever en gyldig `skn_user`-cookie (UI-state) — gir oss customerId.
 *   2. Verifiserer at WP-auth-cookien fortsatt validerer mot `wooMe()` —
 *      hindrer at en utløpt session får skrive.
 *   3. Sender PUT med customerId fra session — aldri fra request-body.
 *
 * Ved suksess oppdateres `skn_user`-cookien så Header / sidebar viser nytt
 * navn umiddelbart uten reload.
 *
 * Payload:
 *   {
 *     firstName?: string,
 *     lastName?: string,
 *     email?: string,
 *     phone?: string,
 *   }
 *
 * Respons:
 *   { ok: true, user: { id, email, displayName, roles } }   200
 *   { ok: false, error: string }                            4xx/5xx
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getSessionUser,
  getWpCookieHeader,
  setAuthUserCookie,
} from '@/lib/auth/session';
import { wooMe } from '@/lib/woo/auth';
import {
  wooUpdateCustomer,
  WooCustomerError,
} from '@/lib/woo/customers';
import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// ---------------------------------------------------------------------------
// Payload-kontrakt
// ---------------------------------------------------------------------------

const ProfileSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'Fornavn er påkrevd.')
      .max(60, 'Fornavn er for langt.')
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(1, 'Etternavn er påkrevd.')
      .max(60, 'Etternavn er for langt.')
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Ugyldig e-postadresse.' })
      .optional(),
    phone: z
      .string()
      .trim()
      .max(40, 'Telefonnummer er for langt.')
      // Tillat tom streng — bruker kan rydde feltet.
      .optional(),
  })
  .refine(
    (v) =>
      v.firstName !== undefined ||
      v.lastName !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined,
    { message: 'Ingen felt å oppdatere.' },
  );

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Session-sjekk — vi må vite hvilken customerId vi skriver til.
  const session = await getSessionUser();
  if (!session) {
    return jsonError('Du må være logget inn.', 401);
  }

  // 2. Verifiser at WP-cookien fortsatt er gyldig. Hvis bruker har vært
  //    inaktiv lenge kan WP-cookien være utløpt selv om skn_user-cookien
  //    er der ennå. Vi nekter da å skrive.
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
    logger.warn('profile update — wooMe verification failed', {
      userId: session.id,
      ...serializeError(err),
    });
    return jsonError('Kunne ikke verifisere sesjonen. Prøv igjen.', 503);
  }

  // 3. Parse body.
  let parsed: z.infer<typeof ProfileSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = ProfileSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig forespørsel.', 400);
  }

  // 4. Skriv til WC.
  try {
    const updated = await wooUpdateCustomer(session.id, {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
    });

    // Bygg ny displayName slik chef-auth ville gjort: "Fornavn Etternavn"
    // om begge finnes, ellers fallback til e-post. Holder UI-state
    // konsistent uten å måtte gå tilbake til WP.
    const displayName =
      [updated.firstName, updated.lastName].filter(Boolean).join(' ') ||
      updated.email;

    await setAuthUserCookie({
      id: updated.id,
      email: updated.email,
      displayName,
      roles: session.roles,
    });

    logger.info('auth profile update success', {
      userId: updated.id,
      changedFields: Object.keys(parsed),
    });

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: updated.id,
          email: updated.email,
          displayName,
          roles: session.roles,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof WooCustomerError) {
      const { status, message } = mapCustomerErrorToResponse(err);
      return jsonError(message, status);
    }

    logger.error('auth profile update unexpected error', {
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

function mapCustomerErrorToResponse(err: WooCustomerError): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case 'email_taken':
      return {
        status: 409,
        message: 'E-postadressen er allerede i bruk av en annen konto.',
      };
    case 'invalid_email':
      return { status: 400, message: 'Ugyldig e-postadresse.' };
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
    case 'weak_password':
    case 'unknown':
    default:
      return { status: 500, message: 'Noe gikk galt. Prøv igjen om litt.' };
  }
}
