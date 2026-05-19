/**
 * Environment variable validation.
 *
 * Fails fast at import-time (server boot, not request) with a readable error
 * listing every missing or malformed var. Never import this file into client
 * components — server-only.
 *
 * Client-exposed vars (NEXT_PUBLIC_*) are separated into `clientEnv` so they
 * can be imported safely from client components.
 */

import { z } from 'zod';

const serverSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // WooCommerce REST (navn matcher eksisterende Vercel-env).
  // `WC_API_URL` er domenet (f.eks. https://admin.skarpekniver.no). `lib/woo/client.ts`
  // appender `/wp-json/wc/v3/...` selv — ikke inkluder path i denne verdien.
  WC_API_URL: z.string().url(),
  WC_CONSUMER_KEY: z.string().min(1),
  WC_CONSUMER_SECRET: z.string().min(1),

  // WP Application Password — brukes for WP core REST (/wp-json/wp/v2/*) der
  // Woo consumer key/secret ikke gir tilgang (f.eks. pages, media, users).
  WP_ADMIN_USERNAME: z.string().min(1),
  WP_ADMIN_APP_PASSWORD: z.string().min(1),

  // Optional inntil webhook-handler + JWT-auth er live. Handlerne returnerer
  // 503 hvis de mangler, så appen booter uten dem.
  WC_WEBHOOK_SECRET: z.string().min(1).optional(),
  WC_JWT_SECRET: z.string().min(1).optional(),

  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis — optional inntil katalog-cache/rate limiting er wired. Klientene
  // i `lib/redis.ts` (TBD) skal kaste tydelig feil hvis de brukes uten disse.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Vipps — optional inntil checkout-flyten er implementert.
  VIPPS_ENVIRONMENT: z.enum(['test', 'prod']).default('test'),
  VIPPS_CLIENT_ID: z.string().min(1).optional(),
  VIPPS_CLIENT_SECRET: z.string().min(1).optional(),
  VIPPS_SUBSCRIPTION_KEY: z.string().min(1).optional(),
  VIPPS_MERCHANT_SERIAL_NUMBER: z.string().min(1).optional(),
  VIPPS_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Stripe — optional inntil checkout-flyten er implementert.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Nexi (formerly Nets Easy / DIBS Easy) — server-only kort-betaling.
  // Optional inntil Nexi-checkout-flyten er fullt utrullet. Klient-modulen i
  // `lib/nexi/client.ts` kaster tydelig feil hvis den brukes uten nøklene.
  // Se docs/plans/nexi-integration-plan.md.
  NEXI_ENVIRONMENT: z.enum(['test', 'live']).default('test'),
  NEXI_SECRET_KEY: z.string().min(1).optional(),
  /** Fast bearer-token vi setter på `notifications.webHooks[].authorization`
   *  ved POST /payments. Nexi sender den tilbake som `Authorization`-header
   *  på webhook-callbacks. Verifiseres med `timingSafeEqual` for å hindre
   *  timing-attacks. Bruk en lang, tilfeldig streng (≥32 byte). */
  NEXI_WEBHOOK_AUTH: z.string().min(16).optional(),

  // Cron
  CRON_SECRET: z.string().min(16),

  // Analytics — server-side CAPI + Events API + Measurement Protocol.
  // Alle optional; `/api/analytics/server-event` er no-op for plattformer
  // som mangler både pixel-ID og access-token. Se ADR-0010 + docs/integrations.md.
  META_PIXEL_ID: z.string().min(1).optional(),
  META_CAPI_ACCESS_TOKEN: z.string().min(1).optional(),
  META_CAPI_TEST_EVENT_CODE: z.string().min(1).optional(),
  TIKTOK_PIXEL_ID: z.string().min(1).optional(),
  TIKTOK_EVENTS_ACCESS_TOKEN: z.string().min(1).optional(),
  TIKTOK_EVENTS_TEST_CODE: z.string().min(1).optional(),
  GA4_MEASUREMENT_ID: z.string().min(1).optional(),
  GA4_API_SECRET: z.string().min(1).optional(),
  // Send MP-eventene til GA4 debug-endepunktet i stedet for live. Default false.
  GA4_MP_DEBUG: z.enum(['true', 'false']).default('false'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional inntil Stripe-checkout er wired. Stripe-client-modulen kaster
  // tydelig feil hvis den brukes uten nøkkelen.
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  // Nexi "checkout key" (også kalt "frontend key") — public-safe per Nexi-
  // dokumentasjonen. Eksponeres i klient-bundle og brukes til å initialisere
  // Nexi sitt embedded-checkout-bibliotek. Optional inntil Nexi er live.
  NEXT_PUBLIC_NEXI_CHECKOUT_KEY: z.string().min(1).optional(),
  // Analytics — klient-side pixel-IDer. Trygge å eksponere i bundle.
  // Tomme verdier = pixel-script ikke lastet, adapter registreres ikke.
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().min(1).optional(),
});

/**
 * Client-safe env. Safe to import from any component.
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time.
 *
 * NB: Ingen build-phase escape hatch — env-vars MÅ være satt i Vercel for
 * Production og Preview. Manglende verdier skal feile bygget høyt og tydelig,
 * ikke silently gi tomme objekter som får Supabase-klienten til å kaste
 * "supabaseUrl is required" under static prerender (som så stille feiler inni
 * `getPrimaryNav`'s try/catch og baker nav-less HTML).
 */
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_NEXI_CHECKOUT_KEY: process.env.NEXT_PUBLIC_NEXI_CHECKOUT_KEY,
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
});

/**
 * Server-only env. Do NOT import from client components.
 */
export const serverEnv = (() => {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv imported on the client — check import chain.');
  }
  return serverSchema.parse(process.env);
})();

export type ServerEnv = typeof serverEnv;
export type ClientEnv = typeof clientEnv;
