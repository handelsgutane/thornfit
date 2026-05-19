# Nexi (Nets Easy) integrasjons-plan

**Status:** Design — ikke implementert.
**Forfatter:** Alexander + Claude, 2026-05-06.
**Forutsetning:** Denne planen bygger på order-create-flyten som ble landet 2026-05-06 (`POST /api/checkout/order` → Woo med `pending`). NEXI er det neste laget oppå.

## TL;DR

1. Etter `/api/checkout/order` returnerer en pending Woo-ordre, kaller klienten `/api/payments/nexi/init` som oppretter en Nexi-payment-session (`POST /v1/payments`) og returnerer `{ paymentId, checkoutKey }`.
2. CheckoutClient åpner `<CardPaymentModal>` med disse to tokenene og mounter Nexi sin embedded checkout i en iframe (deres `EmbeddedCheckout`-JS-bibliotek).
3. Når kunden har fullført betalingen i iframe-en, fyrer Nexi `payment-completed`-event på vinduet og webhook'en `payment.checkout.completed` på serveren vår (`/api/webhooks/nexi`).
4. Webhook-handler verifiserer signatur, henter Woo-ordren via `_nexi_payment_id`-meta, og kaller `PATCH /api/wc/orders/[id]/status` → `processing`. Skriver `_nexi_charge_id`, `_nexi_payment_method`, `_nexi_date_paid` på ordren.
5. Gavekort-delbeløp sendes som **negative line items** til Nexi — eksakt det offisielle Nexi-mønsteret som dibs-easy-pluginen bruker for YITH/Smart Coupons.
6. Når admin senere flytter ordren til `completed` (fulfillment), trigger en hook `POST /v1/payments/{id}/charges` for å capture pengene fra kort. Gavekort-saldo trekkes fra reservasjon ved samme overgang.

## Arkitektur — overordnet flyt

```
┌────────┐                                 ┌─────────┐
│ Klient │  1. POST /api/checkout/order    │ Server  │
│        │ ──────────────────────────────► │         │
│        │     orderId, total              │         │ ──► WC: opprett pending-ordre
│        │ ◄────────────────────────────── │         │
│        │                                 │         │
│        │  2. POST /api/payments/nexi/init│         │
│        │ ──────────────────────────────► │         │ ──► Nexi: POST /v1/payments
│        │     paymentId, checkoutKey      │         │     (med items inkl. gavekort-linje)
│        │ ◄────────────────────────────── │         │
│        │                                 └─────────┘
│        │  3. Mount Nexi <EmbeddedCheckout>
│        │     i CardPaymentModal-iframe
│        │
│        │  4. Customer betaler
│        │
│        │  5. window-event "payment-completed"
│        │ ◄──────── Nexi JS ──────────
│        │
│        │  6. Lukk modal, redirect til /takk-for-handelen
│        │     (sessionStorage allerede skrevet i steg 1)
└────────┘                                 ┌─────────┐
                                           │ Nexi    │
                                           │         │
                                           │ webhook │ ──► POST /api/webhooks/nexi
                                           │         │     1. Verifiser signatur
                                           │         │     2. Mark Woo-ordren `processing`
                                           │         │     3. Skriv _nexi_charge_id, _nexi_date_paid
                                           └─────────┘
```

## Komponentkart

| Lag | Fil | Ansvar |
|---|---|---|
| API-klient | `lib/nexi/client.ts` | Tynn fetch-wrapper mot Nexi REST. Auth, retries, typed errors. |
| Payload-bygger | `lib/nexi/build-payment-request.ts` | Mapper en Woo-ordre + gavekort-reservasjon til Nexi `POST /payments`-body. |
| Init-route | `app/api/payments/nexi/init/route.ts` | Henter Woo-ordren, bygger payload, kaller Nexi, persisterer `_nexi_payment_id`. |
| Webhook-handler | `app/api/webhooks/nexi/route.ts` | Verifiserer auth-token, mapper event-type til Woo-status-overgang. |
| Capture-handler | `lib/nexi/capture.ts` + hook i `lib/woo/order-status.ts` | Når ordre flyttes til `completed`, kall Nexi `POST /payments/{id}/charges`. |
| Refund/Cancel | `lib/nexi/refund.ts`, `lib/nexi/cancel.ts` | Wrappere over `POST /charges/{id}/refunds` og `POST /payments/{id}/cancels`. |
| Gift-card-system | `lib/giftcard/*` + Supabase `gift_cards` + `gift_card_reservations` | Validering, reservering, frigjøring. |
| Klient-modal | `components/checkout/CardPaymentModal.tsx` | Mounter Nexi sitt JS-bibliotek (`https://test.checkout.dibspayment.eu/v1/checkout.js?v=1`), håndterer success/cancel-events. |

## Detaljer per komponent

### 1. `lib/nexi/client.ts`

Direkte parallell til `lib/woo/client.ts`. Ren `fetch`-wrapper med:

- **Auth**: `Authorization: <secret-key>` header. Nexi bruker rå-key, ikke Bearer. Secret henter vi fra `serverEnv.NEXI_SECRET_KEY` (legg til i `lib/env.ts` med zod-validering, optional inntil utrullet).
- **Endpoints**:
  - `NEXI_LIVE = https://api.dibspayment.eu/v1`
  - `NEXI_TEST = https://test.api.dibspayment.eu/v1`
  - Velg basert på `NEXI_ENVIRONMENT` env-var (default: test).
- **Custom header**: `commercePlatformTag: 'SkarpeknivervNext/1.0'` (god skikk for at Nexi ser hvem som kaller).
- **Retries**: `retries: 0` for POST (idempotens er viktig — vil ikke duplikat-charge), `retries: 2` for GET.
- **Timeouts**: 15s (Nexi er normalt rask, men vi gir margin).
- **Error mapping**: kast `NexiError` (utvider Error med `status`, `body`).

Dette er nesten 1:1 kopi av `lib/woo/client.ts` — kanskje mest hederlig å duplisere over én skarp grenseflate enn å abstraktisere et generisk REST-rammeverk.

### 2. `lib/nexi/build-payment-request.ts`

Bygger payloaden vi sender til `POST /v1/payments`. Inputs:

- `wcOrder`: Det vi trenger fra Woo (id, items med {name, sku, quantity, total ex VAT, total tax}, shipping, billing, totals).
- `giftCardReservation`: `{ code, amountInclVat } | null` — gavekort-reservasjon klienten har bygget opp (se gift-card-seksjonen).
- `idempotencyKey`: brukes som `myReference` i Nexi (max 36 tegn).
- `successUrl`/`cancelUrl`: Nexi callback-URLer.

Utforming av items-array (alle tall i øre/minor units):

```ts
items: [
  {
    reference: 'KN-21C-VG10',          // SKU eller fallback til product_id
    name: 'Yoshimi Kato 210mm chef',
    quantity: 2,
    unit: 'pcs',
    unitPrice: 80000,                  // EX MVA, minor units
    taxRate: 2500,                     // 25% × 100
    taxAmount: 40000,                  // total tax for linjen
    grossTotalAmount: 200000,          // INCL MVA
    netTotalAmount: 160000,            // EX MVA
  },
  {
    reference: 'shipping|flat_rate',
    name: 'Posten Norge inkl. sporing',
    quantity: 1,
    unit: 'pcs',
    unitPrice: 6000,
    taxRate: 2500,
    taxAmount: 1500,
    grossTotalAmount: 7500,
    netTotalAmount: 6000,
  },
  // Gavekort-linje (NEGATIV) — se neste seksjon
  {
    reference: 'giftcard|ABC123',
    name: 'Gavekort: ABC123',
    quantity: 1,
    unit: 'pcs',
    unitPrice: -150000,
    taxRate: 0,                        // Gavekort har ikke MVA — det er bare et rabatt-instrument
    taxAmount: 0,
    grossTotalAmount: -150000,
    netTotalAmount: -150000,
  },
]
```

`order.amount` = sum av `grossTotalAmount` på tvers av alle linjer = det Nexi reserverer/charger på kort.

### 3. Gavekort-håndtering — DET KRITISKE

Strategien er **negative line items i Nexi-payloaden**, kombinert med et eget reservasjons-system i Supabase.

#### 3a. Datamodell

**Viktig invariant:** `gift_cards.balance_ore` er **decrement-only fra checkout-flyten**. Den øker bare når admin (manuelt) utsteder et helt nytt gavekort eller eksplisitt top-upper et eksisterende. Refunds touchar IKKE gavekort-saldo. Dette gjør side-effekt-overflaten minimal og fjerner hele klassen "refund-loopback"-bug-mønstre.

```sql
-- Gavekort-saldo (kilde for sannhet)
CREATE TABLE gift_cards (
  code            text PRIMARY KEY,           -- f.eks. 'ABC123-DEF456'
  balance_ore     bigint NOT NULL,            -- gjenværende beløp i øre
  initial_amount  bigint NOT NULL,
  currency        text NOT NULL DEFAULT 'NOK',
  status          text NOT NULL DEFAULT 'active', -- active, void, expired
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  customer_email  text,                       -- valgfritt — for sporing
  notes           text                        -- intern admin-notat
);

-- Reservasjoner mens checkout er i flight
CREATE TABLE gift_card_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_code  text NOT NULL REFERENCES gift_cards(code),
  amount_ore      bigint NOT NULL,
  wc_order_id     bigint,                     -- null inntil ordren er opprettet i Woo
  idempotency_key text NOT NULL,              -- matchen til /api/checkout/order
  status          text NOT NULL DEFAULT 'reserved', -- reserved, applied, released, expired
  reserved_at     timestamptz NOT NULL DEFAULT now(),
  applied_at      timestamptz,                -- satt av Nexi-success-webhook
  released_at     timestamptz,                -- satt ved cancel/timeout
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX gift_card_reservations_active_idx
  ON gift_card_reservations(gift_card_code)
  WHERE status = 'reserved';
```

**Forklaring av status-overganger:**

```
                ┌─────────┐
                │ active  │ (gavekort-balanse > 0)
                └────┬────┘
                     │
                     │ POST /api/giftcard/reserve
                     ▼
                ┌──────────┐
                │ reserved │ (15 min TTL)
                └────┬─────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       │ Nexi        │ Cancel      │ Timeout
       │ webhook     │ /retry      │
       ▼             ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ applied  │  │ released │  │ expired  │
   │ (saldo   │  │ (saldo   │  │ (saldo   │
   │  trukket)│  │  tilbake)│  │  tilbake)│
   └──────────┘  └──────────┘  └──────────┘
```

#### 3b. API-flyt for gavekort

**`POST /api/giftcard/validate`** — kalles når bruker taster inn kode i CheckoutClient.
- Input: `{ code, idempotencyKey }`
- Returnerer: `{ ok, code, balanceOre, currency }` eller error.
- Server-only: ingen "saldo-lekkasje" — vi sjekker bare at koden finnes og er aktiv. Returnerer balanse kun hvis valideringa passerer.

**`POST /api/giftcard/reserve`** — kalles når bruker bekrefter "Bruk gavekort + velg betaling".
- Input: `{ code, amountOre, idempotencyKey }`
- Server: i én transaksjon mot Supabase:
  - SELECT gavekortet FOR UPDATE
  - Sjekk at `balance_ore - <sum aktive reservasjoner> >= amountOre`
  - Opprett ny rad i `gift_card_reservations` med status `reserved`, expires_at = now + 15 min
- Returnerer: `{ ok, reservationId, amountOre }`.
- Idempotent på `idempotencyKey` — hvis samme key kommer to ganger, returnerer eksisterende reservasjon.

**`POST /api/giftcard/release`** — kalles fra:
- (a) Klient hvis bruker forlater checkout (best-effort)
- (b) Cancel-webhook fra Nexi
- (c) Cron-job hver 5. minutt for å reaper expirede reservasjoner
- Server: setter `status = 'released'`, fyller inn `released_at`. `released`-rader påvirker ikke balansen.

**Apply (intern, ikke API)** — kalles fra Nexi-success-webhook:
- I én transaksjon:
  - UPDATE `gift_cards SET balance_ore = balance_ore - reservation.amount_ore`
  - UPDATE `gift_card_reservations SET status = 'applied', applied_at = now()`
- Logges som `gift_card_applied` event med order_id, code, amount.

#### 3c. Tilbakekobling til Woo — `_payment_accepted_per_payement_type`-mønsteret

Vi skriver gavekort-info som meta på Woo-ordren:
- `_dibs_giftcard_code` = `'ABC123-DEF456'`
- `_dibs_giftcard_amount_ore` = `150000`
- `_dibs_giftcard_reservation_id` = `'<uuid>'`

Den **viktigste** meta-key-en er `_payment_accepted_per_payement_type` — en JSON-string som dokumenterer hvor mye som ble betalt med hver metode. Dette er chef-storefront's mønster og det er den ene kilden til sannhet for split-payment:

```json
{
  "giftcard": 1500.00,
  "card": 500.00
}
```

Sum av verdiene MÅ være lik Woo-ordrens `total`. Dette er invariant. Refund-logikken (fase 3), regnskap (Tripletex), og Slack-notifikasjoner leser denne JSON-en for å avgjøre hvor mye som skal refunderes til hver "kilde".

For ren-kort-ordre er det:
```json
{ "card": 1675.00 }
```

For ren-gavekort (full dekning):
```json
{ "giftcard": 1500.00 }
```

I tillegg legger vi til gavekort som en `fee_line` på Woo-ordren med navn `'Gavekort: ABC123'` og negativt total. Dette er det Woo-admin og Tripletex faktisk ser når de åpner ordren — uten det vil de bli forvirret over hvorfor "total" er lavere enn sum av line items.

**Når gavekort dekker hele ordren:** `amount = 0` for Nexi-payloaden. Vi skal IKKE init Nexi i det hele tatt — vi flytter direkte fra `pending` til `processing` via `/api/payments/giftcard-only-checkout` som apply-er reservasjonen. Dette spar kunden for et unødvendig iframe-steg.

**fee_line-mønster i Woo** (sendt sammen med `POST /wc/v3/orders` i `/api/checkout/order`):

```ts
fee_lines: [{
  name: `Gavekort: ${reservation.maskedCode}`, // f.eks. 'ABC***-DEF456'
  total: '-1500.00',
  total_tax: '0.00',
  tax_status: 'none',
}]
```

Dermed: Woo-ordrens `total` blir `2000 - 1500 = 500`. Nexi capture-amount blir 500. Konsistent.

### 4. `app/api/payments/nexi/init/route.ts`

Forutsetning: Woo-ordren er allerede opprettet med status `pending` av `/api/checkout/order`. Klienten har `orderId` + `orderKey` i sessionStorage.

```ts
POST /api/payments/nexi/init
Body: { orderId: number, orderKey: string }
```

Server:
1. Rate-limit per IP via `checkoutRateLimit`.
2. Slå opp Woo-ordren via `wooFetch('/wc/v3/orders/{id}')`. Verifiser at `order_key` matcher det klienten ga (forhindrer at en angriper init'er Nexi for andres ordre).
3. Hvis `order.meta_data._dibs_payment_id` allerede er satt og payment er fortsatt valid → returner eksisterende `paymentId` (idempotens).
4. Bygg payload via `buildNexiPaymentRequest({ wcOrder, giftCardReservation, idempotencyKey, returnUrl, cancelUrl })`.
5. Kall `POST /v1/payments`. Få `{ paymentId, hostedPaymentPageUrl, checkoutKey? }`.
6. Skriv `_dibs_payment_id` på Woo-ordren via `PUT /wc/v3/orders/{id}` MED `payment_method: 'dibs_easy'` (slik at plugin-ens `nets_easy_all_payment_method_ids()`-sjekk treffer på `completed`-overgangen).
7. Sett `_dibs_init_at` for forensics.
8. Returner til klient: `{ paymentId, checkoutKey, environment }`.

NB: `checkoutKey` (også kalt "frontend key") må være satt i Nexi-portal og lagret i `NEXI_CHECKOUT_KEY` env-var. Det er public-safe (eksponeres på frontend).

**Meta-felter vi forplikter oss til** (basert på (a) Krokedil-plugin-ens krav for capture/refund og (b) chef-storefront's mønster for source-/split-payment-sporing):

| Meta-key | Settes av | Verdi | Hvorfor |
|---|---|---|---|
| `_source` | `/api/checkout/order` (allerede) | `'skarpekniver-frontend'` | Slack/admin-filter — skill ut nye-frontend-ordre vs WooCheckout/legacy. |
| `_payment_method` | nexi-init-route | `'dibs_easy'` | Plugin-en's `nets_easy_all_payment_method_ids()` matcher dette; trigger capture på `completed`-overgangen. |
| `_payment_method_title` | nexi-init-route | `'Nexi Checkout'` | Vises i wp-admin og i kunde-e-post. |
| `_dibs_payment_id` | nexi-init-route | Nexi paymentId | Plugin-en's lookup-key for capture/cancel/refund. |
| `_dibs_init_at` | nexi-init-route | ISO timestamp | Forensics. |
| `_dibs_checkout_flow` | nexi-init-route | `'embedded'` | Plugin-en bruker dette i sin confirm-flow. |
| `is_vat_exempt` | nexi-init-route | `'no'` | Eksplisitt for å hindre at en plugin/cron senere antar fritak. |
| `_dibs_date_paid` | webhook (`payment.checkout.completed`) | ISO timestamp | Plugin-ens capture-handler bailer hvis denne er tom — kritisk gate. |
| `dibs_payment_type` | webhook | `CARD` / `A2A` / `INVOICE` | A2A-typer (Vipps/Swish) skal IKKE captures — plugin-en respekterer dette. |
| `dibs_payment_method` | webhook | `Visa` / `MasterCard` / `Vipps` osv. | Vises i admin og i `_payment_method_title`. |
| `dibs_customer_card` | webhook (kun CARD) | Masked PAN, f.eks. `**** **** **** 1234` | Audit + admin-rapport. Aldri full PAN. |
| `_dibs_charge_id` | webhook (`payment.charge.created.v2`) ELLER plugin-en | Nexi chargeId | Plugin-en's gate for "ikke charge to ganger". Nødvendig for refund-flyten (`/charges/{chargeId}/refunds`). |
| `_dibs_canceled_amount_id` | webhook (`payment.cancel.created.v2`) eller plugin-en | Nexi cancelledAmount | Plugin-en setter også dette — vi matcher. |
| `_nets_shipping_reference` | `/api/checkout/order` | f.eks. `'shipping|flat_rate'` | Plugin-en's refund-helper bruker dette for å re-mappe shipping-line. |
| `_payment_accepted_per_payement_type` | `/api/checkout/order` | JSON: `{"card":500.00,"giftcard":1500.00}` | **Hovednøkkelen for split-payment-sporing.** chef-storefront bruker dette som single source of truth for hvor mye som ble betalt med hver metode. RDS-rapportering (regnskap, Tripletex) leser dette. |
| `_shipping_method` | `/api/checkout/order` | f.eks. `'Posten Norge inkl. sporing'` | Audit — match mot tracking-system. |
| `_shipping_cost` | `/api/checkout/order` | NOK (decimal-streng) | Audit. |
| `_contact_phone` | `/api/checkout/order` | E.164 | Skarpekniver bruker contact-phone separat fra billing-phone i checkout-skjemaet. |
| `_pickup_location_id` / `_pickup_location_name` / `_pickup_location_address` | `/api/checkout/order` (kun pickup) | Strenger | Hvilken butikk kunden velger for henting. Senere når vi har flere fysiske utsalg blir disse essensielle. Inntil da: lagre `'butikk-grunerlokka'` el.l. |
| `_delivery_date` | `/api/checkout/order` (kun send) | ISO date | Eksplisitt leveringsdato hvis kunde valgte sak (default: ikke satt). |

### 5. `<CardPaymentModal>` — klient

Mounter Nexi sitt embedded-checkout-bibliotek:

```tsx
useEffect(() => {
  // Last Nexi sitt JS én gang
  const script = document.createElement('script');
  script.src = environment === 'live'
    ? 'https://checkout.dibspayment.eu/v1/checkout.js?v=1'
    : 'https://test.checkout.dibspayment.eu/v1/checkout.js?v=1';
  script.async = true;
  script.onload = () => {
    const checkoutOptions = {
      checkoutKey,
      paymentId,
      containerId: 'nexi-checkout-container',
      language: 'nb-NO',
    };
    const checkout = new window.Dibs.Checkout(checkoutOptions);
    checkout.on('payment-completed', () => {
      // Nexi sier "ferdig". Vi venter ikke på webhook her — den
      // kjører separat. Klient bare lukker modal og redirecter.
      onSuccess();
    });
    checkout.on('payment-cancelled', () => onCancel());
    checkout.on('payment-error', (err) => onError(err));
  };
  document.body.appendChild(script);
  return () => { document.body.removeChild(script); };
}, [paymentId, checkoutKey]);
```

**Viktig:** `payment-completed`-eventet betyr ikke at pengene er charget — det betyr at **reservasjonen** er bekreftet. Pengene capt'es først når admin flytter ordren til `completed`. Dette er Nordens standard for nettbutikker (kunde reserveres ved kjøp, charges ved sending).

Klient-handler `onSuccess`:
1. Skriver checkout-confirmation til sessionStorage (vi har allerede dataen fra `/api/checkout/order`-responsen).
2. Lukker modal.
3. `router.push('/takk-for-handelen')`.

Webhook'en gjør den faktiske status-flippen til `processing` på serveren — selv om klient-side onSuccess feilet eller bruker lukket browseren midt-i, kommer ordren riktig på plass.

### 6. `app/api/webhooks/nexi/route.ts`

Nexi sender webhooks som POST. Auth-mekanismen Nexi tilbyr er en **shared bearer token** som vi setter når vi konfigurerer webhook-en. Plugin-en bruker WP-nonce; vi gjør det skikkelig:

- Lagre `NEXI_WEBHOOK_AUTH` env-var (fast hemmelighet, ikke roterende).
- Sett denne som `authorization`-felt i `notifications.webHooks[].authorization` ved payment-create.
- Nexi sender den tilbake som `Authorization`-header på webhook-callbacken.
- Vi sammenligner med `timingSafeEqual`.

**NB om webhook + plugin-koeksistens:**

Krokedil-plugin-en har sin egen webhook-receiver på `/wc-api/DIBS_Api_Callbacks/` som lytter på `payment.checkout.completed`. Vår webhook-receiver lytter på samme event på `/api/webhooks/nexi`.

Alternativ A: Vi konfigurerer Nexi til å sende **bare** til vår URL. Plugin-en mottar aldri webhook men kjører fortsatt capture/cancel-logikken på `woocommerce_order_status_*`-actions. Dette er det rene mønsteret.

Alternativ B: Begge URL-er motar samme events. Da må vår handler være helt no-op for events plugin-en allerede prosesserer (eller bare logge til debugging).

**Anbefaling: A.** I `notifications.webHooks` ved `POST /payments` peker vi kun på vår URL. Plugin-en's webhook-listener forblir registrert men får ingen trafikk — det er null-cost.

Webhook-flyt:
1. Verifiser `Authorization`-header mot `NEXI_WEBHOOK_AUTH`. 401 hvis mismatch.
2. Parse JSON-body. Hent `event` og `data.paymentId`.
3. Slå opp Woo-ordren via meta `_dibs_payment_id`.
4. Switch på event:
   - `payment.created` — logg, ingen status-endring.
   - `payment.checkout.completed` — kunden har bekreftet betaling i Nexi-vinduet. Sett Woo-status til `processing` via `updateWooOrderStatus(id, 'processing')`. Skriv `_dibs_date_paid`, `dibs_payment_type` (CARD/A2A/INVOICE), `dibs_payment_method`, `dibs_customer_card` for masked PAN. Verifiser `summary.reservedAmount` matcher Woo-total (toleranse 30 øre).
   - `payment.charge.created.v2` — pengene faktisk trukket (utløst av plugin-en på `completed`-overgangen). Skriv `_dibs_charge_id`. Sjekk `summary.chargedAmount` mot Woo-total.
   - `payment.charge.failed` — capture feilet. Sett ordre til `on-hold`, log som error, fyr alarm.
   - `payment.refund.created.v2` — refund OK, oppdater Woo-ordrens `_dibs_refunded_amount`-meta.
   - `payment.refund.failed` — log error.
   - `payment.cancel.created.v2` — Nexi-reservasjonen kansellert. Sett Woo til `cancelled` hvis ikke allerede.
   - `payment.cancel.failed` — log error, fyr alarm.
5. Apply gift-card-reservasjonen ved `payment.checkout.completed` (atomisk Supabase-transaksjon). Release reservasjonen ved `payment.cancel.created.v2`.
6. Returner `200 OK` raskt — Nexi retry-er ved 5xx.

Idempotens på webhooken: Nexi sender en `eventId` per delivery. Vi cacher behandlede `eventId`-er i Redis (`processed_events:nexi:<id>`, TTL 7 dager). Hvis vi ser samme event to ganger, no-op.

### 7. Capture-flyt (manual, på `completed`-overgang)

Bekreftet 2026-05-06: **manual capture**. Pengene reserveres på `pending → processing`-overgangen (av `payment.checkout.completed`-webhook), men trekkes først fra kortet når admin flytter ordren til `completed` (typisk når varen pakkes).

I skarpekniverv3-arkitekturen er status-overganger til `completed` trigget enten av:
- Admin i wp-admin
- Tripletex-integrasjonen
- Vår egen `PATCH /api/wc/orders/[id]/status`

Selve capture-API-kallet skjer **i WP-prosessen**, ikke i vår Next.js-app:

- Krokedil-plugin-en har en `woocommerce_order_status_completed`-action-handler (`Nets_Easy_Order_Management::dibs_order_completed`) som:
  - Sjekker at payment_method er en av Nexi-gateways (`dibs_easy`, `nets_easy_card`, osv.)
  - Sjekker at `_dibs_payment_id` er satt og `_dibs_charge_id` ikke er satt
  - Kaller `POST /v1/payments/{id}/charges`
  - Skriver `_dibs_charge_id` på ordren
- **Forutsetning for at dette virker:** vi MÅ skrive plugin-ens forventede meta-keys, IKKE våre egne navn:
  - `_dibs_payment_id` (vår init-route)
  - `_dibs_date_paid` (vår webhook ved `payment.checkout.completed`)
  - `dibs_payment_type` (vår webhook)
  - `dibs_payment_method` (vår webhook)
  - `dibs_customer_card` (vår webhook for CARD-type)
  - Sett ordrens `payment_method` til `dibs_easy` (eller `nets_easy_card`) ved init.

Dermed: **vi gjør ingen separat capture-implementasjon i Next.js**. Plugin-en gjør jobben på Woo-siden så lenge meta-feltene matcher. Vi observerer resultatet via Nexi sin `payment.charge.created.v2`-webhook som lander hos oss og oppdaterer Supabase-mirror.

Hvis capture feiler:
- Plugin-en setter Woo-ordren til `on-hold` automatisk
- Vi mottar `payment.charge.failed`-webhook → fyrer Slack-alarm via `alertSlack('payments-errors', ...)`

### 8. Refund-flyt

**Policy (besluttet 2026-05-06):** Vi refunderer kun via Nexi tilbake til kort. Gavekort-andelen restitueres aldri automatisk. Hvis kunden skal kompenseres for gavekort-andelen, utsteder admin et nytt gavekort manuelt — det er en bevisst beslutning, ikke en automatisk hendelse.

Konsekvens: refund-flyten blir trivielt enkel.

```
Refund-cap = breakdown.card (fra _payment_accepted_per_payement_type)
nexiRefund = min(refundAmount, refund-cap)
```

Når admin refunderer i wp-admin:
1. Woo trigger `order.refunded`.
2. Vi clamp-er beløpet til `min(refundAmount, breakdown.card)` via filter-hooken `dibs_easy_refund_amount` (plugin-en eksponerer denne).
3. Krokedil-plugin-en kaller `POST /v1/charges/{chargeId}/refunds` med det clamped beløpet.
4. Vi oppdaterer `_payment_accepted_per_payement_type` så `card`-entry-en reduceres tilsvarende; `giftcard`-entry-en rører vi IKKE.
5. Hvis admin har bedt om refund > Nexi-kapasitet, logger vi en order-note: `"Refund-beløp overstiger Nexi-charge. Refunderte X kr til kort. Resterende Y kr må evt. håndteres som nytt gavekort."` Admin gjør det selv via gavekort-admin-UI senere.

Ingen splittlogikk, ingen prosent, ingen `gift_cards.balance += ...`-skriving fra refund-banen. Gavekort-tabellen er decrement-only fra ordre-flyten — dette gjør også sikkerhetsmodellen enklere (ikke noe rom for "refund-loopback"-misbruk).

Refund er fase 3 — ingen ny kode trengs i fase 1/2 utover at vi setter filter-hooken riktig.

## Anti-mønstre fra chef-storefront vi IKKE skal arve

Chef-storefront-kodebasen ble bygget av en billig kinesisk modell og har flere bugger som er maskert av at Krokedil-pluginen tar over noe av jobben. Vi skal være eksplisitte om hva vi gjør annerledes:

| Chef-storefront | Vår tilnærming |
|---|---|
| `Authorization: Bearer ${token}` mot Nexi REST | `Authorization: ${secret}` (raw, ingen prefix) — matcher offisielle Nexi-docs og plugin-en's implementasjon. Bearer er feil. |
| Webhook-handler returnerer alltid HTTP 200 ("for å unngå retries") | Vi returnerer 200 på vellykket prosessering, 401 på auth-feil, 500 på interne feil. Nexi MÅ retrye på 500 — det er hele poenget med deres webhook-retry-policy. Vi vil at en feil skal kunne reprosesseres, ikke svelges. |
| Webhook-secret sammenlignet med `signature !== webhookSecret` | `timingSafeEqual()` fra `node:crypto`. Forhindrer timing-attacks på secret-en. Vi har allerede dette mønsteret i `lib/woo/webhook.ts > verifyWooSignature`. |
| Ingen idempotency på webhook-events | `eventId` cachet i Redis 7 dager. Duplicate → no-op. |
| Bygger Nexi line-items manuelt fra `order.line_items` på init-tidspunkt | Hentes fra `order` ved init, men payload-bygger er en pure function (`buildNexiPaymentRequest`) som kan testes uten Woo-fetch. |
| `console.log`-er sensitive felter (item-priser, full payload) | Strukturert `logger.info` med whitelisting av hva som logges. PAN, secret-keys, hele payloads logges aldri. |
| Hardkoder `https://skarpekniver.com` i `termsUrl` | Bruker `clientEnv.NEXI_PUBLIC_SITE_URL`. |
| Webhook subscriber kun på 2 events (`payment.created`, `payment.charge.created`) | Vi subscriber på alle relevante: `payment.checkout.completed`, `payment.charge.created.v2`, `payment.charge.failed`, `payment.refund.created.v2`, `payment.refund.failed`, `payment.cancel.created.v2`, `payment.cancel.failed`. Hver enkelt mappes eksplisitt. |
| `is_vat_exempt`-meta ikke satt | Vi setter `is_vat_exempt: 'no'` eksplisitt. Hindrer at en plugin/cron senere antar fritak. |
| `_dibs_charge_id` skrives BÅDE av webhook OG plugin-en — race condition | Vi lar **kun plugin-en** skrive `_dibs_charge_id` (ved `woocommerce_order_status_completed`-action). Webhook-handler leser den men skriver ikke. |
| Ingen `_payment_accepted_per_payement_type` på orders med kun ett betalingsmiddel | Vi setter den ALLTID — selv for ren-kort `{"card": 1675.00}` — for konsistens. Refund-logikken trenger ikke spesialcase. |

## Sikkerhet

| Trussel | Mitigering |
|---|---|
| Klient manipulerer `paymentId` for å hijacke andres betaling | `paymentId` lagres som `_nexi_payment_id` på Woo-ordren. Init-route verifiserer at klientens `orderKey` matcher Woos `order_key`. Webhook-handler stoler kun på meta-mapping, ikke på request-body. |
| Webhook fra angriper (ikke Nexi) flipper ordrer til `processing` | `Authorization`-header på webhook verifiseres med `timingSafeEqual` mot `NEXI_WEBHOOK_AUTH`. 401 ved mismatch. |
| Replay av tidligere webhook (Nexi retry-er) | `eventId` cacheres i Redis (7 dager). Duplicate eventId → no-op. |
| Klient sender feil `expectedTotal` for å snike i lavere pris | Vi recomputer prisen fullstendig server-side i `/api/checkout/order` allerede. Init-routen leser kun fra Woo-ordren — den stoler ikke på klient-input for beløp. |
| Gavekort dobbelt-brukt | Reservasjon-tabellen + `gift_cards FOR UPDATE` lock + idempotency-key på `/api/giftcard/reserve` hindrer dobbel reservasjon. Apply-trinnet er en atomisk Supabase-transaksjon. |
| Gavekort-saldo lekker via timing-attacks | Validate-routen returnerer balanse kun ved suksessful match. Feil kode returnerer generic 404 på samme tid som suksess (konstant-tid). |
| Secret-keys lekker | `NEXI_SECRET_KEY` og `NEXI_WEBHOOK_AUTH` er server-only — `lib/env.ts` har allerede tripwire mot client-import. Aldri prefix med `NEXI_PUBLIC_`. |
| Kunde dobbeltklikker → dobbelt-charge | Idempotens på `/api/checkout/order` (allerede implementert) sørger for at samme cart → samme Woo-ordre → samme `paymentId`. Selve Nexi-charge-en er idempotent på `paymentId`. |
| Modal lukkes midt-i-betaling, kunde tror ingenting skjedde | Webhook flytter ordren til `processing` uavhengig av klient-tilstand. Bruker kan logge inn på `/konto/ordrer` og se ordren. |
| Lekkasje av PAN-data i frontend-state eller logger | Nexi sin embedded-iframe kjører i Nexi-domene, kortdata når aldri vår frontend. Webhook-payload inneholder kun `maskedPan` (siste 4 sifre) — det er trygt å logge. |

## Logging og observability

Best practice fra dibs-easy-pluginen er en `Nets_Easy_Logger` som dumper alt til WC-loggene. Vi gjør det bedre:

### 1. Strukturerte logger på alle vesentlige stadier

Bruker eksisterende `logger.info/warn/error` fra `lib/logger.ts`. Hvert stadium logges med `nexi_stage`-felt:

```ts
logger.info('nexi: payment session created', {
  nexi_stage: 'init',
  paymentId,
  orderId,
  amountOre,
  giftCardCode: maskCode(giftCard?.code),
  duration_ms: Date.now() - started,
});
```

Stages som logges:
- `init` — payment session opprettet (info)
- `init_failed` — `POST /v1/payments` feilet (error, fyr Slack)
- `webhook_received` — webhook arrived (info, med eventId)
- `webhook_unauthorized` — auth-header mismatch (error, fyr Slack — kan være angrep)
- `webhook_idempotent` — vi har sett denne event-en før (info)
- `status_transition` — Woo-ordrens status flyttet (info, før+etter)
- `capture_attempted` — vi ringer `POST /charges` (info)
- `capture_failed` — Nexi avviste capture (error, fyr Slack)
- `giftcard_reserved` — reservasjon opprettet (info)
- `giftcard_apply_failed` — webhook prøvde å apply, men reservasjon var release-d (error, fyr Slack — race condition)
- `total_mismatch` — Nexi-total avviker fra Woo-total > 0.30 NOK (warn, fyr Slack)

### 2. Slack-alarm for `error`-nivå nexi-stages

Vi har allerede en pattern for Slack-notifications i analytics-pipelinen. Lag en helper:

```ts
// lib/observability/alert.ts
export async function alertSlack(channel: 'orders' | 'payments-errors', message: string, context: Record<string, unknown>): Promise<void>
```

For all `logger.error` med `nexi_stage` settes alert til `payments-errors`-kanalen.

### 3. Health-dashboard metric

Telleverk i Redis:
- `nexi:metrics:init:success` (counter)
- `nexi:metrics:init:failed` (counter)
- `nexi:metrics:webhook:received` (counter)
- `nexi:metrics:webhook:auth_failed` (counter)
- `nexi:metrics:capture:success` (counter)
- `nexi:metrics:capture:failed` (counter)

`/api/admin/payment-health` server-component viser disse + tidsstempel for siste vellykkede betaling. Hvis `init:failed`-count øker uten at `init:success` følger med, kan vi pinge oss selv.

### 4. Order-trace via `nexi_payment_id`

For en gitt ordre kan support si `nexi_payment_id = ...` og vi kan filtrere alle logger på den paymentId-en. Lager helper-script:

```bash
# scripts/nexi-trace.ts
npx tsx scripts/nexi-trace.ts <paymentId>
# Skriver ut alle logger som har den paymentId-en, sortert tidspunkt.
```

### 5. Sentry / Vercel Logs integration

Alle `logger.error` og `logger.warn` går automatisk til Vercel Logs (gjennom stdout). Vi kobler Vercel-logs til Sentry hvis vi vil ha alerting på errore. Dette er et fase-2-spørsmål.

## Faser

### Fase 1: Kjernen — kun kort, ingen gavekort

1. `lib/nexi/client.ts` — REST-klient.
2. `lib/nexi/build-payment-request.ts` — payload-bygger uten gavekort.
3. `app/api/payments/nexi/init/route.ts` — init.
4. `app/api/webhooks/nexi/route.ts` — håndterer `payment.checkout.completed`, `payment.charge.failed`, `payment.cancel.created.v2`.
5. `<CardPaymentModal>` — Nexi embedded JS-mount.
6. Wire CheckoutClient: etter `/api/checkout/order` succeeds, kall `/api/payments/nexi/init` i stedet for å redirecte.
7. `lib/nexi/capture.ts` + hook i Woo `order.updated`-webhook for status `completed`.
8. `lib/nexi/cancel.ts` + hook for status `cancelled`.

Acceptance: en testordre fullfører hele løpet — opprettet, Nexi-iframe, payment-completed-event, webhook flipper til `processing`, admin flipper til `completed`, capture trigges, kunde belastes.

### Fase 2: Gavekort

1. Supabase-tabeller `gift_cards` + `gift_card_reservations` + RLS.
2. `lib/giftcard/*` — validering, reserve, release, apply.
3. `/api/giftcard/{validate,reserve,release}` endpoints.
4. CheckoutClient-UI: gavekort-modal som verifiserer kode, skriver reservasjon, oppdaterer total i state.
5. `/api/checkout/order` aksepterer `giftCardReservationId` i payload, legger til `fee_lines` med negativ amount.
6. `build-payment-request.ts` legger til negative line-item for gavekort.
7. Nexi-success-webhook gjør `apply` på reservasjon.
8. Cron `expire-reservations` hver 5. minutt.

### Fase 3: Refunds + edge cases

1. Filter-hook `dibs_easy_refund_amount` — clamp refund til Nexi-charge-cap.
2. Order-note-handler som flagger "refund > cap" så admin manuelt vurderer nytt gavekort.
3. Update av `_payment_accepted_per_payement_type` på refund (decrement `card`-entry).
4. Rapport-dashboard: failed payments siste 7 dager + summary av refund-volum.

## Avklaringer (2026-05-06)

| Spørsmål | Beslutning | Konsekvens |
|---|---|---|
| Auto-capture eller manual? | **Manual.** | Vi sender IKKE `checkout.charge: true` ved `POST /payments`. Capture skjer først når Woo-ordren flyttes til `completed` (admin pakker varen). Plugin-en's eksisterende `dibs_order_completed`-hook tar seg av selve API-kallet. |
| B2B-faktura støttet? | **Nei.** | Payload-bygger hardkoder `consumerType: { supportedTypes: ['B2C'] }`. Vi bygger ikke `company`-grenen i `consumer`-objektet. Ingen organisasjonsnummer-felter. Drop alle `allowed_customer_types`-branching. |
| Skal `payment.checkout.completed` trigge kunde-e-post? | **Ja, via Woo's standard.** | Woo sender ordrebekreftelse automatisk på `pending → processing`-overgangen. Vi trenger ikke gjøre noe ekstra; vår webhook-handler trigger overgangen via `updateWooOrderStatus(id, 'processing')` og Woo håndterer mailen. |
| Gavekort-admin? | **Brukeren bygger UI senere.** | Out-of-scope for fase 2. Vi leverer datamodell + API-endepoints + checkout-integrasjon. Admin oppretter gavekort manuelt via Supabase Studio inntil videre. Vi inkluderer en `customer_email`-kolonne på `gift_cards` slik at fremtidig admin-UI kan filtrere per kunde. |
| Sandbox-testruns før prod? | **Minst 5 fullstendige end-to-end.** | Test-script i `scripts/nexi-smoke.ts` bør automatisere: (a) ren kortbetaling, (b) cancel før capture, (c) refund etter capture, (d) gavekort + kort split, (e) failed payment. Logg alle 5 i `docs/plans/nexi-go-live-checklist.md` (lages som del av fase 1). |

## Estimert størrelse

Fase 1: ~1200–1500 LOC (klient + 4 routes + payload-bygger + 2 nye UI-komponenter + tests).
Fase 2: ~800–1000 LOC + 1 ny Supabase-tabell + 4 routes.
Fase 3: ~600–800 LOC.

## Avhengigheter

- Sjekk at vår eksisterende `/api/checkout/order` faktisk skriver `_nexi_payment_id` etter init — den gjør IKKE det i dag, så vi må enten utvide den eller akseptere et to-trinns klient-flow (først `/api/checkout/order` → så `/api/payments/nexi/init`). To-trinns-flow er det jeg har designet over fordi det matcher dibs-easy-pluginens mønster.
- `notifications.webHooks` på payment-create må peke på `https://skarpekniver.no/api/webhooks/nexi` — vi må sørge for at preview-deploys ikke pinger live Nexi (Nexi-webhooks bør være registrert kun fra production-deploys).
- `NEXI_CHECKOUT_KEY` (klient-side, public OK) og `NEXI_SECRET_KEY` (server-only) må hentes fra Nexi-portal og legges i Vercel-env.

---

_Sist oppdatert: 2026-05-06 — Alexander + Claude. Implementasjon ikke startet._
