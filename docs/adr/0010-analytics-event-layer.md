# ADR-0010 — Analytics event layer (intern vokabular + adaptere)

**Dato:** 2026-04-24
**Status:** Vedtatt
**Besluttet av:** Alexander + Claude

## Kontekst

Skarpekniver.no trenger konverterings-sporing mot minst tre plattformer fra
lansering: **Google Analytics 4**, **Meta (Facebook/Instagram) Pixel + CAPI**,
og **TikTok Pixel + Events API**. Klaviyo, Google Ads (indirekte via GA4),
og potensielt fremtidige leverandører kan komme til.

Naivt mønster — strø `gtag(...)`, `fbq(...)` og `ttq.track(...)` direkte inne
i produktkort, handlekurv, checkout-sider, login-handlere — har to
forutsigbare konsekvenser:

1. **Lekkasje av plattform-koblinger i domenekode.** En React-komponent som
   vet at "Meta heter dette eventet `AddToCart` og forventer `content_ids` som
   array av strenger mens GA4 forventer `items` som array av objekter" blir
   umulig å endre uten å røre alle tre plattformer samtidig.
2. **Ingen enhetlig kontrakt.** `add_to_cart` fra tre forskjellige steder
   ender opp med tre forskjellige payload-former. Attribusjons-kvaliteten i
   Ads-plattformene blir dårlig fordi event-skjema-et drifter.

I tillegg krever EU-lovgivning (ePrivacy + GDPR) consent-gate på alle
markedsførings-pixler og gir krav om server-side duplisering for Meta og
TikTok (CAPI / Events API) når browser-tracking blokkeres av iOS 17 ATT,
Safari ITP, Firefox ETP og ad-blockers. Meta rapporterer typisk 15–30% løft
i attribuert konvertering ved dual-track (pixel + CAPI med felles event_id
for dedupe).

Til slutt: vi eier ikke CMP-en (consent management platform) selv — butikken
bruker Cookiebot / lignende CMP som allerede implementerer
`window.CookieConsent` og fyrer `CookieConsentDeclaration`-events. Analytics-
laget må lytte på den, ikke bygge egen.

## Vurderte alternativer

1. **Inline `gtag`/`fbq`/`ttq`-kall i komponenter.** Enkel å skrive, men
   dårlig å vedlikeholde (se over). Forkastet.

2. **Segment (eller lignende CDP).** Segment.io gir enkelt-SDK + konfigurerbar
   fan-out til GA4/Meta/TikTok. Trade-off: $120+/måned fra ~10k MTUs,
   tredjepart mellom oss og plattform-APIene, mindre kontroll over PII-
   hashing for CAPI. For en spesialist-butikk med <50k unike besøkende/måned
   er prisen ikke forsvarlig og abstraksjonen er grunne (Segment selv maps
   til plattform-SDKene sine adaptere vi ellers ville skrevet selv).
   Forkastet.

3. **Egen event-abstraksjon + adapter-pattern (valgt).** Ett typescript-
   definert event-vokabular (`AnalyticsEvent` union), én `track()`-funksjon,
   og N adaptere som maps internt event → plattform-SDK. Ingen runtime-
   avhengighet utover plattformenes egne SDKer.

## Beslutning

**Bygg en intern event-abstraksjon i `lib/analytics/`** med tre lag:

```
lib/analytics/
  events.ts              — TypeScript union av alle events + payload-typer
  emitter.ts             — track(event) + pre-consent queue + event_id dedupe
  consent.ts             — CMP-agnostisk consent-API, integrert mot window.CookieConsent
  adapters/
    ga4.ts               — maps → gtag('event', ...)
    meta.ts              — maps → fbq('track', ..., { eventID })
    tiktok.ts            — maps → ttq.track(..., { event_id })
  server/
    capi.ts              — server-side fan-out til Meta CAPI + TikTok Events API + GA4 MP
```

### Event-vokabular (første versjon)

```ts
type AnalyticsEvent =
  | { name: 'page_view';        payload: { path: string; title?: string } }
  | { name: 'view_item';        payload: { item: CatalogItem } }
  | { name: 'add_to_cart';      payload: { item: CatalogItem; quantity: number } }
  | { name: 'remove_from_cart'; payload: { item: CatalogItem; quantity: number } }
  | { name: 'add_to_wishlist';  payload: { item: CatalogItem } }
  | { name: 'view_cart';        payload: { items: CartLine[]; value: number } }
  | { name: 'begin_checkout';   payload: { items: CartLine[]; value: number } }
  | { name: 'purchase';         payload: { order_id: string; items: CartLine[]; value: number; tax?: number; shipping?: number } }
  | { name: 'login';            payload: { method: 'vipps' | 'email' | 'sso' } }
  | { name: 'logout';           payload: {} };
```

Priser er alltid i NOK (én valuta, ADR-0005). Alle payloads er TypeScript-
tvunget — feil felt = compile error, ikke runtime-støy i GA4.

### Dedupe mellom pixel og CAPI

Hver `track()` genererer et `event_id` (ULID, tid-sorterbart, unik).
Samme ID sendes til både:

- Meta Pixel (`fbq('track', name, payload, { eventID: id })`)
- Meta CAPI (`data.event_id = id`)
- TikTok Pixel (`ttq.track(name, payload, { event_id: id })`)
- TikTok Events API (`event_id: id`)
- GA4 klient (gtag henter automatisk `client_id` fra cookie)
- GA4 Measurement Protocol (sender samme `client_id` + egen `event_id` via `debug_mode`-felt)

Pixlene sender klient-side når consent finnes og tracker ikke er blokkert.
CAPI sender fra serveren uansett. Plattformen dedupliserer på `event_id` og
får kanskje én kopi, kanskje begge — men aldri dobbelttelling.

### CAPI fra dag én

Server-side fan-out lever i `/app/api/analytics/server-event/route.ts`:

- Endepunktet er ikke rate-limited på klient-IP (trafikk skaleres med brukere,
  ikke angripere — rate-limiting gjøres på plattformen-siden hvis nødvendig).
- Payload inneholder: `event_id`, `name`, `payload`, `user`-fingeravtrykk
  (hashet e-post + IP + user-agent, gjort server-side for å ikke lekke PII
  til klient). Klienten sender `event_id`, event, og evt. innlogget bruker-
  email i klartekst — hashing skjer på serveren.
- Henter hemmeligheter fra `serverEnv`: `META_CAPI_ACCESS_TOKEN`,
  `META_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_PIXEL_ID`,
  `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`.
- Swallowe-fail: én plattform som er nede skal ikke blokkere de andre.
  Hver adapter kjører i `Promise.allSettled` og logger feil til
  `lib/logger.ts`, men returnerer 204 til klient uansett.

### Consent-gate

`consent.ts` eksporterer:

```ts
getConsent(): { analytics: boolean; marketing: boolean }
onConsentChange(cb: (c: Consent) => void): () => void
```

Implementasjonen leser `window.CookieConsent.consent` (Cookiebot) og lytter
på `CookieConsentDeclaration`-event. Hvis CMP-en ikke er lastet (f.eks.
SSR eller før Cookiebot-script er kjørt), returneres `{ analytics: false,
marketing: false }` — vi starter fra deny og venter på grant.

Emitteren queuer opp events før consent; ved consent change fyres hele køen
mot de adaptere som har fått grønt lys (analytics → GA4, marketing → Meta +
TikTok). Events før consent er fortsatt tilgjengelig som 1P-data server-side
(CAPI med `consent: denied`), men plattformenes egne consent-modes
bestemmer bruken — dvs. Meta vil bruke modelled conversions og GA4 bruker
consent-mode v2 signaler.

### Adapter-kontrakt

```ts
interface AnalyticsAdapter {
  name: 'ga4' | 'meta' | 'tiktok';
  consentRequired: 'analytics' | 'marketing';
  track(event: AnalyticsEvent, eventId: string): void | Promise<void>;
  isAvailable(): boolean; // script lastet + ID konfigurert
}
```

Adaptere som mangler ID (ikke-konfigurert) returnerer `isAvailable() = false`
og er no-op — det gjør lokal utvikling og preview-deployer trygge.

## Konsekvenser

### Positive

- **Domenekode vet ingenting om plattformer.** `<AddToCartButton>` kaller
  `track({ name: 'add_to_cart', payload: { item, quantity } })`. Det er alt.
- **Ny plattform = én fil.** Legg til `lib/analytics/adapters/pinterest.ts`,
  register den i adapter-listen, ferdig.
- **Typesikkerhet fra første linje.** Union-discriminated events fanger feil
  payload-former i compile-time — dette er langt bedre enn å oppdage i
  GA4 DebugView tre uker senere.
- **Dedupe gratis.** `event_id` flyter fra klient til server uten at
  komponent-koden trenger å vite.
- **Consent-compliance uten å duplisere logikk per plattform.**
  En consent-change, tre adapters oppdaterer samtidig.
- **Attribusjons-kvalitet.** CAPI + Events API fra dag én betyr at iOS 17 ATT-
  blokkering og Safari ITP ikke gjør Ads-kampanjene blinde.

### Negative / trade-offs

- **Vi eier vedlikehold av adapterne.** Når Meta endrer `ContentType` eller
  TikTok legger til et påbudt felt, må vi patche. For tre plattformer er
  dette overkommelig (~1–2 timer/år per plattform basert på chef-storefront-
  erfaring). Ved 7+ plattformer ville vi revurdert CDP-løsning.
- **event_id-dedupe forutsetter at server og klient sender samme ID.**
  Hvis en komponent fyrer pixel men API-rutingen feiler, får vi bare
  klient-siden. Denne risikoen aksepteres — verste utfall er "normal"
  pixel-tracking.
- **Server CAPI-route er en ny angrepsflate.** Ikke en transaksjonell
  endepunkt (svarer alltid 204), men brukere kan fyre falske events.
  Mitigasjon: rate-limit per IP i Upstash (Fase 2 hvis vi ser misbruk),
  ignorer events uten matchende fingeravtrykk på serveren, og rapporter
  anomale spikes via GA4 DebugView.

### Hvordan revidere

- Hvis antall plattformer vokser forbi 5–6 og vi finner oss selv i
  vedlikeholdsarbeid hver kvartal: vurder Segment eller RudderStack.
- Hvis attribusjons-kvaliteten fortsatt er dårlig etter fullt dual-track
  (pixel + CAPI): vurder server-container (sGTM på Cloudflare Workers)
  for å eliminere ad-blocker-tap på selve eventet.

## Referanser

- Meta Conversions API: https://developers.facebook.com/docs/marketing-api/conversions-api
- TikTok Events API: https://business-api.tiktok.com/portal/docs?id=1771101303285761
- GA4 Measurement Protocol: https://developers.google.com/analytics/devguides/collection/protocol/ga4
- Google Consent Mode v2: https://developers.google.com/tag-platform/security/guides/consent
- ADR-0005 — Kun Norge, én valuta (forenkler currency-parametre)
- ADR-0003 — Kundekontoer i Woo (email er identifier for CAPI user-hashing)
- chef-storefront referanse: `/Users/alexanderaagreen/chef-storefront` — søke-insights samme dedupe-mønster
