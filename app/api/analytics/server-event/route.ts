/**
 * Server-side analytics fan-out — Meta CAPI + TikTok Events API + GA4 MP.
 *
 * Mottar events fra klientens emitter (`lib/analytics/emitter.ts`) via
 * `sendBeacon`/fetch, og dupliserer dem server-side mot alle konfigurerte
 * plattformer. Samme `event_id` som pixel-eventet → plattformen deduplicater.
 *
 * Designprinsipper:
 *   - **Returner alltid 204.** Analytics skal aldri ta ned en bruker-flow.
 *     Selv med dårlig JSON svarer vi 204 — vi logger feilen og går videre.
 *   - **Alle adaptere kjører parallelt i Promise.allSettled.** Én nede =
 *     de andre leverer fortsatt. Ingen sekvensiell venting.
 *   - **ID-gate.** Hvis en plattform mangler pixel-ID + access-token er den
 *     no-op. Lokal dev og preview-deploys fungerer uten konfig.
 *   - **Consent-mode.** Klienten kan sende `consent: { analytics, marketing }`
 *     — vi honorerer det ved å skippe adapterne det gjelder. (Plattformene
 *     har sine egne consent-mode signaler, men denne sjekken er vår.)
 *
 * Rate-limiting: ikke implementert enda. Trafikken skaleres med brukere,
 * ikke angripere. Hvis vi ser misbruk (faux purchase-events), legg Upstash-
 * rate-limit per IP/event i `middleware.ts`.
 */

import { NextResponse } from 'next/server';

import { logger, serializeError } from '@/lib/logger';

import type { AnalyticsEvent, AnalyticsEventName } from '@/lib/analytics/events';
import {
  sendMetaCapi,
  type MetaCapiContext,
  type MetaCapiUserData,
} from '@/lib/analytics/server/meta-capi';
import {
  sendTikTokEvent,
  type TikTokEventsContext,
  type TikTokUserData,
} from '@/lib/analytics/server/tiktok-events';
import { sendGa4MpEvent, type Ga4MpContext } from '@/lib/analytics/server/ga4-mp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// ---------------------------------------------------------------------------
// Payload-kontrakt fra klienten
// ---------------------------------------------------------------------------

interface ClientEventBody {
  eventId: string;
  name: AnalyticsEventName;
  payload: unknown;
  url?: string;
  referrer?: string;
  userAgent?: string;
  timestamp?: number;
  /** Klient-sidens consent-snapshot. Vi respekterer den. */
  consent?: { analytics?: boolean; marketing?: boolean };
  /** Identifiserer fra klient — aldri lekke til klient-bundle. */
  user?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    externalId?: string | number;
    /** Meta fbp/fbc cookies hvis klienten har lest dem. */
    fbp?: string;
    fbc?: string;
    /** GA4 client_id fra `_ga`-cookie. Må settes for at GA4 MP skal matche. */
    ga4ClientId?: string;
    /** TikTok ttclid fra URL. */
    ttclid?: string;
    /** TikTok ttp cookie. */
    ttp?: string;
  };
}

// ---------------------------------------------------------------------------
// Env — server-only. Alle optional; hvis fraværende → adapter no-op.
// ---------------------------------------------------------------------------

function readEnv() {
  return {
    metaPixelId: process.env.META_PIXEL_ID,
    metaToken: process.env.META_CAPI_ACCESS_TOKEN,
    metaTestCode: process.env.META_CAPI_TEST_EVENT_CODE,
    tiktokPixelId: process.env.TIKTOK_PIXEL_ID,
    tiktokToken: process.env.TIKTOK_EVENTS_ACCESS_TOKEN,
    tiktokTestCode: process.env.TIKTOK_EVENTS_TEST_CODE,
    ga4Id: process.env.GA4_MEASUREMENT_ID,
    ga4Secret: process.env.GA4_API_SECRET,
    ga4Debug: process.env.GA4_MP_DEBUG === 'true',
  };
}

function extractClientIp(req: Request): string | undefined {
  return (
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: ClientEventBody;
  try {
    body = (await request.json()) as ClientEventBody;
  } catch (err) {
    logger.warn('analytics server-event: invalid JSON', serializeError(err));
    return new Response(null, { status: 204 });
  }

  if (!body || typeof body !== 'object' || !body.eventId || !body.name) {
    return new Response(null, { status: 204 });
  }

  const env = readEnv();
  const now = Date.now();
  const event = { name: body.name, payload: body.payload } as unknown as AnalyticsEvent;

  const resolvedIp = extractClientIp(request);

  const userAgent = body.userAgent ?? request.headers.get('user-agent') ?? undefined;
  const url = body.url ?? '';
  const referrer = body.referrer;

  const consent = {
    analytics: body.consent?.analytics !== false, // default true — klient-emitter gater allerede
    marketing: body.consent?.marketing !== false,
  };

  // Kjør alle adaptere parallelt; swallow errors per adapter.
  const tasks: Array<Promise<unknown>> = [];

  // ----- Meta CAPI -----
  if (consent.marketing && env.metaPixelId && env.metaToken) {
    const userData: MetaCapiUserData = {
      email: body.user?.email,
      phone: body.user?.phone,
      firstName: body.user?.firstName,
      lastName: body.user?.lastName,
      fbp: body.user?.fbp,
      fbc: body.user?.fbc,
      externalId: body.user?.externalId,
      ip: resolvedIp,
      userAgent,
    };
    const ctx: MetaCapiContext = {
      eventId: body.eventId,
      eventTime: Math.floor((body.timestamp ?? now) / 1000),
      eventSourceUrl: url,
      user: userData,
    };
    tasks.push(
      sendMetaCapi(
        {
          pixelId: env.metaPixelId,
          accessToken: env.metaToken,
          testEventCode: env.metaTestCode,
        },
        event,
        ctx,
      ),
    );
  }

  // ----- TikTok Events API -----
  if (consent.marketing && env.tiktokPixelId && env.tiktokToken) {
    const userData: TikTokUserData = {
      email: body.user?.email,
      phone: body.user?.phone,
      externalId: body.user?.externalId,
      ttclid: body.user?.ttclid,
      ttp: body.user?.ttp,
      ip: resolvedIp,
      userAgent,
      url,
      referrer,
    };
    const ctx: TikTokEventsContext = {
      eventId: body.eventId,
      eventTime: Math.floor((body.timestamp ?? now) / 1000),
      user: userData,
    };
    tasks.push(
      sendTikTokEvent(
        {
          pixelId: env.tiktokPixelId,
          accessToken: env.tiktokToken,
          testEventCode: env.tiktokTestCode,
        },
        event,
        ctx,
      ),
    );
  }

  // ----- GA4 Measurement Protocol -----
  if (consent.analytics && env.ga4Id && env.ga4Secret) {
    const clientId = body.user?.ga4ClientId ?? body.eventId; // fallback: event_id som engangs-klient
    const ctx: Ga4MpContext = {
      clientId,
      userId: body.user?.externalId !== undefined ? String(body.user.externalId) : undefined,
      eventId: body.eventId,
      timestampMicros: (body.timestamp ?? now) * 1000,
    };
    tasks.push(
      sendGa4MpEvent(
        {
          measurementId: env.ga4Id,
          apiSecret: env.ga4Secret,
          debug: env.ga4Debug,
        },
        event,
        ctx,
      ),
    );
  }

  // Fire-and-forget — vent på alle, men svar alltid 204.
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    logger.warn('analytics server-event: some adapters failed', {
      eventId: body.eventId,
      name: body.name,
      failures: failures.length,
    });
  }

  return new Response(null, { status: 204 });
}

/**
 * GET — helsesjekk. Returnerer hvilke adaptere som er konfigurert (ikke
 * selve nøklene). Brukt av `/cronjobs`-speilet i internal-web og for
 * smoke-tests i CI.
 */
export function GET() {
  const env = readEnv();
  return NextResponse.json({
    ok: true,
    adapters: {
      meta: Boolean(env.metaPixelId && env.metaToken),
      tiktok: Boolean(env.tiktokPixelId && env.tiktokToken),
      ga4: Boolean(env.ga4Id && env.ga4Secret),
    },
  });
}
