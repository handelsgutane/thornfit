/**
 * Newsletter-subscribe stub-endpoint.
 *
 * Aksepterer { email } og returnerer 200. Persisterer ingenting ennå —
 * frontend gir success-toast så vi kan teste UX-flyten. Når Mailchimp/
 * Klaviyo-integrasjon kommer, byttes implementasjonen her uten å røre
 * frontend.
 *
 * TODO: integrer mot Mailchimp via /lists/{list_id}/members.
 * TODO: legg til honeypot/recaptcha mot bot-spam.
 */

import { NextResponse } from 'next/server';

import { logger, serializeError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    // Veldig løs validering — frontend håndterer streng validering med
    // type=email + required. Server-side beskytter mot åpenbar støy.
    if (!email || !email.includes('@') || email.length > 254) {
      return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
    }

    logger.info('newsletter subscribe (stub)', { email });

    // Stub: ingen faktisk subscription — bare bekreft mottak.
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('newsletter subscribe failed', { ...serializeError(err) });
    return NextResponse.json({ ok: false, error: 'unknown' }, { status: 500 });
  }
}
