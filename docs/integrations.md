# Integrasjoner

Denne filen lister alle eksterne systemer butikken snakker med, hvor integrasjonen er konfigurert i koden, og hvilke miljøvariabler som trengs.

## Oversikt

| System | Rolle | Retning | Kode-plassering |
|---|---|---|---|
| WooCommerce | Katalog- og ordre-kilde, kundekontoer | Begge veier | `lib/woo/` |
| Supabase | Katalog-speil + webhook-logg | Skrive (via sync), lese (på request) | `lib/supabase/` |
| Upstash Redis | Cache-lag, rate limiting | Begge veier | `lib/redis/` |
| Vipps | Betalings-provider | Klient-redirect + webhook | `lib/payments/vipps/` |
| Stripe | Betalings-provider | Klient-redirect + webhook | `lib/payments/stripe/` |
| Vercel | Hosting + cron | Deploy + runtime | `vercel.json`, CI |
| Tripletex | Regnskap | TBD — via Woo eller eget integrasjonslag | TBD |
| GA4 | Analytics | Klient (gtag) + Server (MP) | `lib/analytics/` |
| Meta Pixel + CAPI | Ads / conversion tracking | Klient (fbq) + Server (CAPI) | `lib/analytics/` |
| TikTok Pixel + Events API | Ads / conversion tracking | Klient (ttq) + Server (Events API) | `lib/analytics/` |
| Cookiebot (CMP) | Consent management | Klient → `window.Cookiebot` | `lib/analytics/consent.ts` |
| Klaviyo | E-post / abandoned cart | Webhook → Klaviyo | TBD |

## WooCommerce

**Base URL:** `WC_API_URL` (domenet, f.eks. `https://admin.skarpekniver.no` — uten `/wp-json`-path).

### REST API

To auth-modi brukes avhengig av endpoint:

- **Woo REST (`/wp-json/wc/v3/*`)** — basic auth med `WC_CONSUMER_KEY:WC_CONSUMER_SECRET`.
  Gir tilgang til produkter, kategorier, ordre, kunder.
- **WP Core REST (`/wp-json/wp/v2/*`)** — basic auth med `WP_ADMIN_USERNAME:WP_ADMIN_APP_PASSWORD`.
  Application Password (ikke vanlig kontopassord). Gir tilgang til pages, media, users
  og andre ikke-Woo-endepunkter. Opprettes under wp-admin → Users → Profile → Application Passwords.

Klient: `lib/woo/client.ts` — tynn wrapper rundt `fetch` med auth, rate-limit retry, error-mapping.

Brukes til:

- Opprette kunder (`POST /wp-json/wc/v3/customers`) — via server proxy.
- Opprette ordre (`POST /wp-json/wc/v3/orders`) — ved checkout. Wrapping-
  primitivet ligger i `lib/woo/order-create.ts`; orchestrator-flyten med
  pris-recompute, idempotens og rabatt-evaluator i `lib/checkout/order.ts`.
  HTTP-endepunkt: `POST /api/checkout/order` (se "Checkout-API" lenger ned).
- Oppdatere ordre-status (`PUT /wp-json/wc/v3/orders/{id}`) — eksponert via
  `PATCH /api/wc/orders/[id]/status` for admin-flow, og senere kalt fra
  NEXI-webhook ved godkjent betaling. Primitiv: `lib/woo/order-status.ts`.
- Hente kunde-profil, ordrehistorikk, ønskeliste — direkte på `/konto`-sider.
- Reconciliation-cron henter hele produktlisten hver natt.

### Checkout-API

`POST /api/checkout/order` — kalles fra `<CheckoutClient>` når brukeren
klikker "Bekreft ordre". Tar imot et JSON-payload med:

- `idempotencyKey` (UUID, klient-generert via `crypto.randomUUID()`)
- `contact.{email, phone}`
- `deliveryMode: 'send' | 'pickup'`
- `shippingMethodId` (når `deliveryMode = 'send'`)
- `shippingAddress`, `billingAddress` (sistnevnte er `null` hvis lik shipping)
- `paymentMethodId: 'card' | 'invoice'` (`'card'` mappes internt til Woo
  payment-method `nexi`; selve NEXI-betalingen wires senere)
- `items: [{ productId, variationId, quantity }]`
- `couponCodes: string[]` (passes pass-through til Woo — empty-list-OK)
- `expectedTotal` (klient-vist total — server avviser med 409 hvis recompute
  avviker mer enn 1 kr)

Server-flyt:

1. Rate-limit per IP (10 req / 10s via `checkoutRateLimit`).
2. Validerer payload med zod-schema i `lib/checkout/order.ts`.
3. Tar idempotency-lock i Redis (`SET NX EX 30s`).
   - Cache hit → returner cached `orderId`.
   - In-flight (sentinel) → 409 `IN_FLIGHT`.
   - Ny → fortsett.
4. Slår opp produkter via `getProductById` fra Supabase-speilet og recomputer
   priser. Vi stoler ALDRI på pris-data fra klient.
5. Kjører bulk-rabatt-evaluator (`evaluateBulkRules`) mot recomputed items.
6. Splitter hver linje i ex-MVA-prinsipal + eksplisitt MVA-andel via
   `splitVat()`. Beregner `orderTotal` (incl-MVA) og sammenligner mot
   `expectedTotal` — overcharge > 1 kr = 409 `PRICE_DRIFT`. Server-total
   lavere enn klient-vist OK (bulk-rabatt-overraskelse).
7. Bygger payload via `buildWooOrderPayload` (status `pending`, `set_paid:
   false`, `prices_include_tax: false` + eksplisitte `subtotal`/`subtotal_tax`/
   `total`/`total_tax` per linje for å sikre at Woo lagrer verbatim uten
   å recalculere).
8. POSTer mot `wc/v3/orders` via `wooFetch` med `retries: 0` (idempotens
   håndteres lengre opp).
9. **Post-create-verifisering:** sammenligner Woos returnerte `total` mot
   `orderTotal` (toleranse 2 kr). Mismatch → kansellerer ordren via
   `updateWooOrderStatus(id, 'cancelled')` og returnerer 502 `PRICE_DRIFT`.
   Logges som `error` for synlighet.
10. Lagrer cached resultat under idempotency-key (TTL 10 min).

Feilkoder klienten må håndtere:

| HTTP | Code | Klient-action |
|---|---|---|
| 400 | `INVALID_INPUT` | Vis melding, brukeren må rette skjema. |
| 400 | `INVALID_PRODUCT` | Et produkt er fjernet — fjern fra cart, vis toast. |
| 400 | `OUT_OF_STOCK` | Vis utsolgt-melding for produkt-IDene i `details`. |
| 400 | `INVALID_SHIPPING` | Ber bruker velge frakt-metode. |
| 409 | `PRICE_DRIFT` | Be bruker laste på nytt — bump idempotency-key. |
| 409 | `IN_FLIGHT` | Annen tab/request behandler — vis "behandler", retry kort. |
| 429 | `RATE_LIMITED` | Vis "for mange forespørsel", deaktiver knapp 10s. |
| 502 | `WOO_FAILED` | Toast "kunne ikke opprette ordre" — bruker kan retrye. |
| 500 | `INTERNAL` | Toast generisk feil — bruker kan retrye. |

`PATCH /api/wc/orders/[id]/status` — admin-flow for status-overgang. Krever
session med rolle `administrator` eller `shop_manager`. Body: `{ "status": "<new>" }`
hvor status er en av `pending` / `processing` / `on-hold` / `completed` /
`cancelled` / `refunded` / `failed`. Returnerer 401 (utlogget), 403 (uten
admin), 400 (ugyldig status), 404 (ordren finnes ikke), 502 (Woo-feil),
200 ved suksess. Dette samme endepunktet vil bli kalt fra `/api/webhooks/nexi`
når NEXI-integrasjonen lander, for å flytte ordrer fra `pending` →
`processing` ved godkjent betaling.

### Webhooks

Konfigureres i Woo admin → WooCommerce → Settings → Advanced → Webhooks.
Woo tillater kun én topic per webhook-oppføring, så hver event må registreres
separat med samme delivery-URL og secret.

| Topic | Endpoint | Action |
|---|---|---|
| `product.created` | `/api/webhooks/woo` | `mapProduct` + upsert i `products` |
| `product.updated` | `/api/webhooks/woo` | `mapProduct` + upsert i `products` |
| `product.restored` | `/api/webhooks/woo` | `mapProduct` + upsert i `products` |
| `product.deleted` | `/api/webhooks/woo` | `DELETE FROM products WHERE id = ?` |
| `product_category.created` | `/api/webhooks/woo` | `mapCategory` + upsert i `categories` |
| `product_category.updated` | `/api/webhooks/woo` | `mapCategory` + upsert i `categories` |
| `product_category.deleted` | `/api/webhooks/woo` | `DELETE FROM categories WHERE id = ?` |
| `product_variation.*` | TBD | Ikke wired opp enda — se reconciliation-cron |
| `order.*` | _ikke wired_ | Ordre opprettes direkte fra `POST /api/checkout/order` (se Checkout-API). Webhook-mottak for status-endringer fra Woo-admin/Tripletex kan legges til senere; foreløpig leser vi ordre fra Woo REST på request-tid i `/konto/ordrer/*`. |

**Implementasjon:** `app/api/webhooks/woo/route.ts`.

**Signering:** HMAC-SHA256 over rå request-body, base64-encoded i
`X-WC-Webhook-Signature`. Hemmeligheten bor i `WC_WEBHOOK_SECRET`. Env-variabelen
er markert optional i `lib/env.ts` så appen booter uten den, men `verifyWooSignature()`
fail-closer og handleren svarer **401** på alle webhooks til secret er satt. Legg inn
i Vercel før første webhook-test.

**Svar-koder:**
- `200` — ping fra wp-admin eller prosessert payload.
- `401` — ugyldig eller manglende signatur.
- `400` — ugyldig/manglende topic eller JSON-parse-feil.
- `500` — intern feil under Supabase-skriving. Woo retry-er i eksponentiell backoff.

**Idempotens:** Upsert-et er basert på `id` (primary key). Re-leveringer fra Woo
resulterer i samme rad, så duplikate deliveries er trygge.

**Sikkerhetsnett:** Nattlig reconciliation-cron henter hele katalogen og retter
evt. drift fra tapte webhooks eller downtime.

**Cache-invalidering:** Handleren kaller `invalidateCatalogCache(topic, result)`
etter vellykket Supabase-skrive. Funksjonen er implementert og lever i
`app/api/webhooks/woo/route.ts`, men delegerer til helpers i `lib/cache/catalog.ts`:

- `upserted` (update) → invaliderer riktig nøkkel (`cat:v1:product:<slug>` eller
  `cat:v1:category:<slug>`).
- `upserted` (create, `isCreate=true`) → invaliderer BÅDE produkt- og kategori-
  nøkkelen for slugen. Grunn: en tidligere 404-forespørsel kan ha cachet et
  negativ-sentinel som må ryddes.
- `deleted` → invaliderer begge nøkler konservativt (billig, og dekker tilfellet
  der en slug har byttet eier mellom produkt og kategori).
- `skipped`/`ignored` → ingen DB-endring, ingen invalidering.

Webhook er den primære invalideringsbanen. TTL (1 time på positive, samme på
negative inntil videre) er backstop hvis en leveranse går tapt.

### JWT Authentication

Plugin: `JWT Authentication for WP REST API` (eller tilsvarende).

Endpoints:

- `POST {WC_API_URL}/wp-json/jwt-auth/v1/token` — login, returnerer JWT.
- `POST {WC_API_URL}/wp-json/jwt-auth/v1/token/validate` — validere token.

Vi bruker JWT kun server-side. Token caches i HTTP-only cookie, aldri eksponert til klient-JS.
`WC_JWT_SECRET` er optional i schema — auth-endpoints svarer 503 hvis den ikke er satt.

### Env-variabler

```env
# Påkrevde
WC_API_URL=https://admin.skarpekniver.no
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
WP_ADMIN_USERNAME=admin
WP_ADMIN_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# Optional — legg til når webhook/JWT-auth er live
WC_WEBHOOK_SECRET=whsec_...
WC_JWT_SECRET=shared-with-plugin
```

## Supabase

**Prosjekt:** `skarpekniverv3` (EU-region).

### Klienter

- `lib/supabase/server.ts` — server-side (service role for writes, anon for reads).
- `lib/supabase/client.ts` — client-side (anon, for brukere — kun ved behov, mesteparten av katalog leses server-side).

Bruk `@supabase/ssr` for Next.js App Router for riktig cookie-håndtering.

### Branching

- Prod-branch: `main`.
- Per-PR preview-branch opprettes via Supabase GitHub-integrasjon (TBD).
- Migrasjoner i `supabase/migrations/` kjøres automatisk på branch-oppretting.

### Env-variabler

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Service-role-nøkkelen — ikke-forhandlingsbare regler

Service-role-nøkkelen (`SUPABASE_SERVICE_ROLE_KEY`) er en JWT med `role: service_role` som **bypasser RLS** og gir full lese/skrive-tilgang til hele databasen. Hvis den lekker til klient-bundlen eller en utgående response, kan en hvilken som helst bruker lese, endre eller slette hele katalogen.

**Hva som hindrer lekkasje i dag:**

1. **Zod-skjema-separasjon i `lib/env.ts`** — `SUPABASE_SERVICE_ROLE_KEY` står i `serverSchema`, ikke `clientSchema`. Klient-komponenter kan kun lese `clientEnv`.
2. **Runtime-tripwire i `lib/env.ts`** — `serverEnv` er en IIFE som kaster `Error` hvis `typeof window !== 'undefined'`. Fanger bug-er i dev der en server-fil feilaktig importeres fra klient.
3. **Build-time-tripwire i `lib/supabase/server.ts`** — `import 'server-only'` gjør at Next.js feiler bygget hvis noen klient-komponent importerer modulen (direkte eller transitivt).
4. **Separate klient/server-kall** — `createServerClient()` bruker anon-key + bruker-cookie. `createServiceRoleClient()` bruker service-role. Aldri bland dem i samme call-path.

**Regler for fremtidige endringer:**

- Nøkkelen skal aldri eksponeres i response-body, header, cookie, URL-param eller log-output.
- Prefix-regel: hvis den noen gang får `NEXT_PUBLIC_`-prefix, er det en bug — Next.js inlines den i klient-bundlen på build-tid.
- Ved utvidelse av `lib/supabase/` — behold `import 'server-only'` på alle filer som leser `serverEnv.SUPABASE_SERVICE_ROLE_KEY`.
- Webhook-handlere, cron-jobber og admin-endpoints som trenger service-role skal ligge under `app/api/`, aldri under `app/` (som kan RSC-rendres).

**Ved mistanke om lekkasje:**

1. Roter nøkkelen i Supabase-dashboardet: Settings → API → Reset `service_role` key.
2. Oppdater `.env.local` (dev), Vercel Production + Preview env-grupper.
3. Deploy, verifiser at nye deploys har ny nøkkel før gamle invalideres.
4. Sjekk audit-log i Supabase for mistenkelig aktivitet siden lekkasje kan ha skjedd.

**Åpent forbedringspunkt:** `lib/env.ts` eksporterer både `clientEnv` og `serverEnv` fra samme fil, kun separert av runtime-guard. Vurder å splitte til `lib/env/client.ts` (ingen `server-only`) + `lib/env/server.ts` (med `import 'server-only'`) for belt-and-suspenders. Ikke kritisk gitt eksisterende forsvar, men renere.

## Upstash Redis

**Database:** `handy-hedgehog-91084` (EU-region, TLS REST).

### Bruksområder

- **Katalog-cache**: `cachedCategoryBySlug` og `cachedProductBySlug` i
  `lib/cache/catalog.ts`. TTL 3600s. Webhook-drevet invalidering — TTL er kun
  backstop. Bruker negativ-sentinel-pattern for å unngå at repeterte 404-er
  hamrer Supabase.
- **Rate limiting**: `@upstash/ratelimit` via `checkoutRateLimit` og
  `authRateLimit` i `lib/redis/client.ts` — bindes til `/api/checkout/*` og
  `/api/auth/*` når endpoints lander.
- **Pris-snapshot**: kort TTL (30-60s) på høy-frekvens produktsider — TBD.
- **Session storage** for gjeste-handlekurv? TBD — foreløpig kun cookie.

### Nøkkel-konvensjoner

- Katalog-cache: `cat:v1:category:<slug>`, `cat:v1:product:<slug>`.
- Rate limit: `rl:checkout:*`, `rl:auth:*` (håndteres av `@upstash/ratelimit`).
- Versjons-prefix (`v1`) bumpes ved schema-endring på cached shape; gamle
  nøkler utløper naturlig via TTL.
- Negativ-cache: same nøkkel som positiv, verdi = `"__NULL__"`-sentinel.

### Klient og helpers

`lib/redis/client.ts` eksponerer:

- `getRedis()` / `isRedisConfigured()` — lav-nivå tilgang.
- `cacheGet<T>(key, fetcher, ttlSeconds)` — cache-aside. Hvis Upstash-env ikke
  er satt, eller Redis feiler, kalles `fetcher` direkte. Applikasjonen bryter
  aldri på cache-feil.
- `cacheInvalidate(key | key[])` — DEL. No-op hvis Redis ikke konfigurert.
- `checkoutRateLimit` / `authRateLimit` — `Ratelimit`-instanser, `null` hvis
  Redis ikke konfigurert.

`lib/cache/catalog.ts` bygger på dette og eksponerer slug-resolverne +
invalideringshelpers som webhook-handleren kaller.

### Graceful degradation

Redis er **optional**. Uten `UPSTASH_REDIS_REST_URL` / `_TOKEN` kjører appen
fullt funksjonelt uten cache-lag og uten rate limiting. Dette lar preview-deploys
fungere uten egne Upstash-databaser.

### Env-variabler

```env
UPSTASH_REDIS_REST_URL=https://<db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Hemmeligheter ligger i Vercel (Production + Preview scope) og `.env.local`
for dev. Aldri commit.

## Vipps

**Miljø:** `api.vipps.no` (prod), `apitest.vipps.no` (test).

### Flyt

1. Server: `POST /epayment/v1/payments` → får `redirectUrl` + `reference`.
2. Klient: redirect til `redirectUrl`.
3. Kunde betaler i Vipps-app eller web.
4. Vipps webhook: `POST /api/webhooks/vipps` → bekrefter betaling.
5. Vi oppdaterer Woo-ordre.

### Env-variabler

```env
VIPPS_CLIENT_ID=...
VIPPS_CLIENT_SECRET=...
VIPPS_SUBSCRIPTION_KEY=...
VIPPS_MERCHANT_SERIAL_NUMBER=...
VIPPS_ENVIRONMENT=test | prod
VIPPS_WEBHOOK_SECRET=...
```

### Referanse-docs

https://developer.vippsmobilepay.com/

## Stripe

**Miljø:** test (`sk_test_...`) / prod (`sk_live_...`).

### Flyt

1. Server: `stripe.checkout.sessions.create()` → får `session.url`.
2. Klient: redirect til `session.url`.
3. Kunde betaler på Stripe Checkout.
4. Stripe webhook (`checkout.session.completed`) → `/api/webhooks/stripe`.
5. Vi oppdaterer Woo-ordre.

### Env-variabler

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

## Vercel

**Prosjekt:** `skarpekniver/skarpekniverv3`.

### Cron-jobber

Konfigurert i `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/woo-reconciliation", "schedule": "0 3 * * *" }
  ]
}
```

Cron-logging: reuse mønster fra internal-web (`lib/cron-logger.ts`). Se `data-model.md` > `cron_job_runs`.

### Preview-deploys

Hver PR gir en preview-URL + egen Supabase-branch (TBD oppsett).

### Env-grupper

- Production — prod-secrets.
- Preview — test-secrets (Woo staging, Vipps/Stripe test).
- Development — lokale overrides via `.env.local`.

## Tripletex

> ⚠️ TBD: Tripletex-kobling for regnskap er åpent spørsmål. Alternativer:

1. Eksisterende integrasjon i Woo via plugin (hvis finnes) — vi gjør ingenting.
2. Eget integrasjonslag i denne app-en som pusher completed orders til Tripletex.
3. Integrasjon i internal-web (separat cron-jobb som leser fra Woo og pusher til Tripletex).

Avklares med Alexander + regnskapsfører.

## Analytics

Se **ADR-0010** for beslutningsgrunnlaget. Kort versjon: én intern event-
abstraksjon i `lib/analytics/`, tre klient-adaptere (GA4 / Meta / TikTok),
én server-side fan-out-route (`/api/analytics/server-event`) som dupliserer
via CAPI + Events API + Measurement Protocol.

### Hvordan fyre et event

```tsx
import { track, catalogListItemToAnalyticsItem } from '@/lib/analytics';

// I en klient-komponent:
track({
  name: 'add_to_cart',
  payload: {
    item: catalogListItemToAnalyticsItem(product),
    quantity: 1,
  },
});
```

`track()` er fire-and-forget og aldri throw. Den:
1. Genererer et `event_id` (tid-sorterbar hex).
2. POST-er til `/api/analytics/server-event` (sendBeacon ⇒ overlever nav).
3. Fyrer mot hver registrert adapter hvis consent er gitt.

### Event-vokabular

`page_view`, `view_item`, `select_item`, `add_to_cart`, `remove_from_cart`,
`add_to_wishlist`, `view_cart`, `begin_checkout`, `add_payment_info`,
`purchase`, `search`, `login`, `sign_up`, `logout`.

Definert i `lib/analytics/events.ts` som discriminated union — payload-typen
håndheves i compile-time. Legg til nytt event der først; tsc guider deg
gjennom adapter-oppdateringen.

### Plattform-mapping

| Intern event      | GA4 event          | Meta standard     | TikTok standard      |
|-------------------|--------------------|-------------------|----------------------|
| page_view         | page_view          | PageView          | (auto)               |
| view_item         | view_item          | ViewContent       | ViewContent          |
| select_item       | select_item        | —                 | —                    |
| add_to_cart       | add_to_cart        | AddToCart         | AddToCart            |
| remove_from_cart  | remove_from_cart   | RemoveFromCart*   | —                    |
| add_to_wishlist   | add_to_wishlist    | AddToWishlist     | AddToWishlist        |
| view_cart         | view_cart          | ViewCart*         | —                    |
| begin_checkout    | begin_checkout     | InitiateCheckout  | InitiateCheckout     |
| add_payment_info  | add_payment_info   | AddPaymentInfo    | AddPaymentInfo       |
| purchase          | purchase           | Purchase          | CompletePayment      |
| search            | search             | Search            | Search               |
| login             | login              | Login*            | —                    |
| sign_up           | sign_up            | CompleteRegistration | CompleteRegistration |
| logout            | logout             | —                 | —                    |

`*` = custom event (trackCustom i Meta).

### Consent

Analytics-laget er CMP-agnostisk — den koples til Cookiebot i dag
(`window.Cookiebot`), men `lib/analytics/consent.ts` kan peke mot en annen
CMP uten å endre resten av laget. Kategorier:

- `analytics` → GA4 klient + GA4 MP server
- `marketing` → Meta Pixel + CAPI, TikTok Pixel + Events API

Events før consent queues (maks 100, 30 min TTL) og flushes ved grant.
`/api/analytics/server-event` respekterer også klient-consent via
`consent`-feltet i body.

Google Consent Mode v2 defaults til denied i `AnalyticsScripts.tsx`.
Når brukeren samtykker, pushes `gtag('consent', 'update', ...)` med
granted/denied per kategori.

### Dedupe (pixel ↔ CAPI)

Samme `event_id` brukes på klient og server. Meta og TikTok dedupliserer
på dette feltet; GA4 bruker `client_id` + tidsvindu. Konsekvens: kjører
begge kanalene parallelt uten dobbelttelling.

### Env-variabler

**Klient (valgfrie — tomme = script ikke lastet):**

| Variabel | Formål |
|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` — GA4-stream |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta pixel-ID |
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | TikTok pixel-ID |

**Server (valgfrie — no-op per adapter uten ID + token):**

| Variabel | Formål |
|---|---|
| `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN` | Meta CAPI fan-out |
| `META_CAPI_TEST_EVENT_CODE` | Meta Events Manager test-mode |
| `TIKTOK_PIXEL_ID` + `TIKTOK_EVENTS_ACCESS_TOKEN` | TikTok Events API |
| `TIKTOK_EVENTS_TEST_CODE` | TikTok Events Manager test-mode |
| `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` | GA4 Measurement Protocol |
| `GA4_MP_DEBUG` | `true` = send til `debug/mp/collect` |

Access-tokens genereres i hver plattforms Events Manager:
- Meta: https://business.facebook.com/events_manager2/ → Settings → Generate Access Token
- TikTok: https://ads.tiktok.com/ → Events → Settings → Access Token
- GA4: Admin → Data Streams → Velg stream → Measurement Protocol API secrets

### Testing

`GET /api/analytics/server-event` returnerer hvilke adaptere som er
konfigurert (ikke tokens). Nyttig i CI og for å verifisere Vercel-env.

Meta: bruk `META_CAPI_TEST_EVENT_CODE` og se events live i Events Manager.
TikTok: samme via `TIKTOK_EVENTS_TEST_CODE`. GA4: `GA4_MP_DEBUG=true` →
payload valideres og debug-info logges (ikke sendt til rapportene).

### Manuell consent-override (dev)

```js
// i DevTools console:
window.__sknConsent = { analytics: true, marketing: true };
window.dispatchEvent(new Event('CookieConsentDeclaration'));
```

Dette unngår behovet for å ha Cookiebot-scriptet i lokal utvikling.

## Klaviyo (TBD)

For:

- Abandoned cart e-post.
- Post-purchase flows.
- Newsletter.

Integrasjon: Woo-plugin eller direkte API-kall fra våre endpoints når kunde-events trigges.

## .env.example

Full liste av env-variabler opprettholdes i `.env.example` i rota. Hvis du legger til en ny variabel — oppdater begge filer (denne docen og `.env.example`).
