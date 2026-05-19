/**
 * POST /api/auth/addresses
 *
 * Oppdaterer billing eller shipping adresse for innlogget bruker.
 *
 * Payload:
 *   {
 *     type: 'billing' | 'shipping',
 *     address: {
 *       firstName, lastName, company, addressLine1, addressLine2,
 *       city, postcode, country, phone, email (kun billing)
 *     }
 *   }
 *
 * Respons:
 *   { ok: true }         200
 *   { ok: false, error } 4xx/5xx
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionUser, getWpCookieHeader } from '@/lib/auth/session';
import { logger, serializeError } from '@/lib/logger';
import { wooMe } from '@/lib/woo/auth';
import { wooUpdateAddress, WooCustomerError } from '@/lib/woo/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const AddressSchema = z.object({
  firstName:    z.string().trim().max(60),
  lastName:     z.string().trim().max(60),
  company:      z.string().trim().max(100),
  addressLine1: z.string().trim().min(1, 'Gateadresse er påkrevd.').max(200),
  addressLine2: z.string().trim().max(200),
  city:         z.string().trim().min(1, 'By er påkrevd.').max(100),
  postcode:     z.string().trim().min(1, 'Postnummer er påkrevd.').max(20),
  country:      z.string().trim().length(2).default('NO'),
  phone:        z.string().trim().max(40),
  email:        z.string().trim().email().or(z.literal('')).default(''),
});

const RequestSchema = z.object({
  type:    z.enum(['billing', 'shipping']),
  address: AddressSchema,
});

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError('Du må være logget inn.', 401);

  const wpCookie = await getWpCookieHeader();
  if (!wpCookie) return jsonError('Sesjonen din er utløpt. Logg inn på nytt.', 401);

  try {
    const wpUser = await wooMe(wpCookie);
    if (!wpUser || wpUser.id !== session.id)
      return jsonError('Sesjonen din er utløpt. Logg inn på nytt.', 401);
  } catch {
    return jsonError('Kunne ikke verifisere sesjonen. Prøv igjen.', 503);
  }

  let parsed: z.infer<typeof RequestSchema>;
  try {
    const raw = (await req.json()) as unknown;
    const result = RequestSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return jsonError(first?.message ?? 'Ugyldig forespørsel.', 400);
    }
    parsed = result.data;
  } catch {
    return jsonError('Ugyldig forespørsel.', 400);
  }

  try {
    await wooUpdateAddress(session.id, {
      type: parsed.type,
      address: parsed.address,
    });

    logger.info('address update success', {
      userId: session.id,
      type: parsed.type,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof WooCustomerError) {
      return jsonError('Kunne ikke lagre adressen. Prøv igjen.', 500);
    }
    logger.error('address update unexpected error', {
      userId: session.id,
      ...serializeError(err),
    });
    return jsonError('Noe gikk galt. Prøv igjen om litt.', 500);
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
