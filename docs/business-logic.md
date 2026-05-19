# Forretningslogikk

Dette dokumentet beskriver _regler_ — ikke implementasjon. Implementasjon ligger i koden, regler ligger her. Hvis koden og dette dokumentet er uenige, er det en bug enten i koden eller her.

## Produkt og katalog

### Produkt-tilstand

Et produkt i Supabase har en av disse tilstandene (synket fra Woo):

- `published` — synlig i butikken, kan kjøpes
- `private` — synlig kun for admin (ikke synket? — TBD)
- `draft` — ikke synlig, ikke synket
- `trash` — slettet fra Supabase ved neste reconciliation

### Varianter

Et produkt kan ha varianter (f.eks. blad-lengde på kniv). Logikk:

- Hovedproduktet (`parent_product`) bærer navn, beskrivelse, bilder, kategori.
- Variant (`product_variation`) bærer pris, SKU, lager, variantspesifikke bilder.
- Frontend viser hovedproduktet, med variant-selector. Ved "Legg i handlekurv" velges en spesifikk variant.

> ⚠️ WIP: Eksakt datamodell bekreftes i Fase 2 når vi skriver Supabase-skjemaet.

## Pris

### Visning

- Priser i Supabase er inkl. MVA (norsk standard).
- Frontend viser alltid pris inkl. MVA.
- Kampanjepris (`sale_price`) vises som overstrøket pris i tillegg til kampanje-pris når den er aktiv.

### Beregning ved checkout

- Kunden ser pris fra Supabase i handlekurv (rask).
- Ved `POST /api/checkout/order` recomputerer server priser fra Supabase-
  speilet — klient-supplerte priser ignoreres for å hindre manipulasjon.
  Implementasjon: `lib/checkout/order.ts > submitCheckoutOrder` slår opp
  hver `productId` via `getProductById` og bruker enhetspris fra DB.
- Bulk-rabatt-evaluatoren (`lib/cart/discounts/bulk.ts`) kjører server-side
  med samme regler som klienten brukte i UI — dette eliminerer drift
  mellom det kunden så og det vi sender til Woo.
- **MVA — eksplisitt breakdown per linje:** Vi sender `subtotal`,
  `subtotal_tax`, `total`, `total_tax` per `line_item` (alle som ex-MVA-
  prinsipal + MVA-andel) til Woo, og `prices_include_tax: false` på selve
  ordre-payloaden. Når alle fire feltene er gitt, recalculerer Woo IKKE
  noe — verdiene lagres verbatim. Dette er kritisk fordi vi har custom
  rabatt-logikk (bulk-discount, fremtidige kuponger, fremtidige medlems-
  rabatter, gavekort) som Woo ikke har innsyn i; lot vi Woo recalculere
  på kun produkt-pris × antall, ville rabattene blitt slettet og kunden
  belastet for mye. Helper `splitVat()` i `lib/checkout/order.ts` gjør
  konverteringen fra inkl-MVA-tall til ex-MVA + MVA-andel og bevarer
  summen ned til run-2-precision.
- Klienten sender med `expectedTotal` (det summen kunden så på "Bekreft
  ordre"-knappen). Server sammenligner mot recomputed total — kun avvik
  hvor server-total er HØYERE enn klient-vist (overcharge) resulterer i
  `409 PRICE_DRIFT`. Avvik hvor server-total er lavere (typisk: bulk-
  rabatt kicker inn server-side, eller en pris er nedjustert i admin)
  prosesseres som normalt — kunden betaler mindre enn forventet, det er
  en god overraskelse.
- **Post-create-verifisering:** etter at Woo har opprettet ordren,
  sammenligner vi Woos returnerte `total` mot vår beregnede `orderTotal`
  (toleranse 2 kr). Hvis Woo likevel skulle ha recalculert (gammel
  versjon, custom plugin, store-config-rar), kanselleres ordren via
  `PATCH /wc/v3/orders/{id}` med status `cancelled` og klienten får
  `502 PRICE_DRIFT`. Dette er belt-and-suspenders mot at kunde belastes
  feil beløp.
- Idempotens: klient genererer en UUID per checkout-attempt og sender den
  som `idempotencyKey`. Server cacher resultatet i Redis i 10 minutter.
  Retries (dobbeltklikk, nettverksfeil, raske refresh) returnerer samme
  ordre-id i stedet for å opprette duplikat. Race-protection via
  `SET key val NX EX 30s` sentinel-pattern.
- Woo er fortsatt ultimate authoritative for lager + kupong-validering —
  hvis vår POST feiler på Woos side, surfacer vi feilen til klient som
  `502 WOO_FAILED`.

### Rabatter (bulk, kupong, gavekort)

Detaljert spec for alle rabatt-spor — bulk-rabatter, kupongkoder og gavekort
— ligger i [`docs/discount-engine.md`](./discount-engine.md). Hovedpunkter:

- **Bulk-rabatter** synkes fra Studio Wombat-plugin og evalueres klient/server-
  side via `lib/cart/discounts/`. Implementert.
- **Kupongkoder** valideres on-demand mot Woo (`/wc/v3/coupons`). Server-skall
  klart, UI + orchestrator-applisering ikke wired enda.
- **Gavekort** er en separat balanse-modell — se `nexi-integration-plan.md`.

Kombinasjons- og rekkefølge-regler er ikke endelig avklart — se
"Åpne policy-spørsmål" i `discount-engine.md`.

## Lager

### Visning

Supabase har følgende lager-felter per variant:

- `stock_quantity` (int) — antall på lager
- `stock_status` (`in_stock` | `out_of_stock` | `on_backorder`)

Frontend viser:

- "På lager" hvis `stock_quantity >= 5`
- "Få igjen ({n})" hvis `1 <= stock_quantity <= 4`
- "Utsolgt" hvis `stock_quantity = 0` og ikke backorder
- "Leveres på forespørsel" hvis `on_backorder`

Disse terskler kan justeres i `lib/stock/display.ts` (TBD).

### Reservasjon ved checkout

- Lager-reservasjon skjer **kun i Woo** (kilde for sannhet).
- Flyt: `POST /api/checkout/order` → Woo REST oppretter `pending` ordre →
  Woo reserverer lager automatisk.
- Server pre-sjekker `stock_status` fra Supabase-speilet og avviser med
  `400 OUT_OF_STOCK` før vi når Woo. Dette er en hurtig-rejecter, ikke en
  garanti — Supabase-speilet kan være litt utdatert mellom webhooks.
- Hvis Woo selv returnerer "out of stock" på POST'en, surfacer vi den
  som `502 WOO_FAILED` — klienten viser feilmelding og brukeren kan rette
  handlekurven.

### Oversalg-risiko

- Supabase viser "på lager" fordi webhook sist sa det, men Woo sier nå "utsolgt".
- Aksepteres som sjelden hendelse. Hvis det blir problem: legg til real-time lager-endpoint mot Woo, kall den på "Legg i kurv"-klikk.

## Ordre

### Ordre-flyt (happy path)

1. Kunde klikker "Til kassen" → lastes til `/checkout`.
2. Kunde fyller ut leveringsadresse, velger fraktmetode og betalingsmetode.
3. Klient genererer `idempotencyKey` (UUID) og kaller
   `POST /api/checkout/order` med items, addresser og `expectedTotal`.
4. Server: rate-limit + zod-validering → idempotency-claim →
   pris-recompute fra Supabase → bulk-rabatt-evaluator → drift-check mot
   `expectedTotal` → `POST /wp-json/wc/v3/orders` (status `pending`,
   `set_paid: false`).
5. Server: cacher idempotency-key med ordre-id (10 min) og returnerer
   `{ orderId, orderNumber, status, total, currency, redirectUrl }` til
   klient. `redirectUrl` peker til `/takk-for-handelen` (uten query-id —
   se neste punkt).
6. Klient skriver ordre-bekreftelsen til `sessionStorage` (via
   `lib/checkout/confirmation-storage.ts`) og redirecter til
   `/takk-for-handelen`. **Vi inkluderer ikke ordre-id i URL-en** — den
   ville vært gjettebar (`?id=12345`) og en server-fetch på den params'en
   ville eksponert andres ordre. Takk-siden er en `'use client'`-komponent
   som kun leser fra sessionStorage; direkte URL-tilgang faller tilbake
   til en generisk "ordre bekreftet"-melding uten å eksponere noe.
   Full ordre-detalj med auth-gate bor på `/konto/ordrer/[id]`.
7. **NEXI-trinn (kommer senere — venter på integrasjon):** klient åpner
   NEXI-iframe med `orderId`, NEXI prosesserer betaling, sender webhook
   til `/api/webhooks/nexi`.
8. Webhook-handler verifiserer signatur og kaller
   `PATCH /api/wc/orders/{id}/status` med `processing` (eller `failed`/
   `cancelled` ved avslag). Woo trigger ordre-bekreftelse-e-post på
   `processing`-overgangen.
9. (Future) Status-endring fra Woo (Tripletex/admin) speiler til Supabase
   `orders`-tabell via `order.updated`-webhook — ikke wired enda.

### Ordre-status

| Status i Woo | Betydning | Når settes |
|---|---|---|
| `pending` | Venter på betaling | Ordre opprettet, betaling ikke fullført |
| `processing` | Betalt, skal pakkes | Betalings-webhook bekrefter |
| `completed` | Sendt til kunde | Satt manuelt eller av fulfillment-integrasjon |
| `cancelled` | Kansellert | Betaling feilet/tidsavbrudd |
| `refunded` | Refundert | Manuell refund |

### Feilede betalinger

- Hvis Vipps/Stripe-webhook sier "failed" → Woo-ordre settes til `cancelled`.
- Kunden ser feilmelding ved retur fra Vipps/Stripe.
- Ingen e-post sendes ved feilet betaling.

## Frakt

### Fraktmetoder (forventet — bekreftes i Fase 2)

- Posten pakke i postkasse (< 2 kg)
- Posten pakke (> 2 kg)
- Bring (tyngre / større)
- Henting i butikk (hvis aktuelt)

### Fraktkostnad

- Generelle satser speiles til Supabase for visning på produktside ("Frakt fra 79 kr").
- Eksakt kostnad beregnes av Woo ved checkout basert på vekt + adresse + volum.
- Gratis frakt over beløp X (TBD) — konfigureres i Woo, speiles ikke (Woo kan endre regler hvor som helst).

## MVA

- Norsk standard 25 % for de fleste produkter.
- Priser i katalog er **inkl. MVA**.
- Ved checkout vises MVA separert ("Hvorav MVA 25 %: X kr") på kvittering.
- Utenlandsk kunde? Ikke relevant — vi selger kun i Norge.

## Kundekontoer (Woo-basert)

Se `adr/0003-customer-accounts-in-woo.md` for begrunnelse.

### Registrering

- Kunde fyller ut skjema på `/registrer`.
- Klient kaller Woo REST `POST /wp-json/wc/v3/customers` via server-proxy.
- Ved suksess: JWT-token fra Woo (krever JWT Authentication for WP REST API-plugin) settes som HTTP-only cookie.

### Innlogging

- `/logg-inn` skjema → `POST /api/auth/login` → kaller Woo JWT-endpoint.
- JWT-cookie settes. Utløper etter X dager (TBD).

### Passord-glemt

- Standard Woo flow — sender e-post med reset-lenke.
- Reset-siden kan enten være Woo's egen (redirect) eller vår custom (TBD).

### Gjest-checkout

- Støttes. Ingen krav om konto for å kjøpe.
- Ordre opprettes uten `customer_id` i Woo, kun med `billing_email`.

## Analyse og sporing

> ⚠️ TBD i Fase 1: avklare Google Analytics 4, Meta Pixel, Klaviyo, andre. Se `integrations.md`.

## Grensetilfeller og kjente problemer

| Situasjon | Hva som skjer | Om akseptabelt |
|---|---|---|
| Webhook fra Woo faller ut | Reconciliation-cron fanger det neste dag | Ja (max 24t stale) |
| Kunden har kurv med utdaterte priser | Woo avviser ved checkout, kurv re-lastes med ny pris | Ja (sjeldent, UX-håndteres) |
| Produkt slettes i Woo mens noen har det i kurv | Kurv-item markeres "ikke tilgjengelig", kan ikke checkes ut | Ja |
| Supabase nede | Butikken er nede (kritisk avhengighet) | Uakseptabelt — overvåking + Vercel fail-over må på plass |
| Vipps nede | Bare Stripe tilgjengelig, feilmelding hvis Vipps valgt | Ja |

Denne listen vokser etter hvert som vi oppdager edge-cases.
