# Discount-engine

**Single source of truth** for hvordan rabatter og prisreduksjon håndteres i butikken — fra cart-display til Woo-ordre-create.

> **Konsoliderer:** Erstatter `docs/discount-engine-spec.md` (historisk planning-doc, beholdes for arkiv) og overlappende seksjoner i `docs/business-logic.md` (Kuponger, Volum-rabatt). Når denne fila er etablert som canonical, krymper de andre to til å peke hit.

---

## TL;DR

Tre uavhengige rabatt-spor:

| Spor | Trigger | Datakilde | Status |
|---|---|---|---|
| **Bulk-rabatter** | Auto (cart-content matcher regel) | Studio Wombat-plugin → synket til Supabase `discount_rules` | ✅ Implementert (kun `bulk`-typen, ikke andre 6 typer) |
| **Kupongkoder** | Manuell — kunde taster kode i checkout | WC core (`/wc/v3/coupons`) | 🟡 Server-skall klart, UI + orchestrator-applisering ikke wired |
| **Gavekort** | Manuell — kunde taster kode i checkout-modal | Egen Supabase-tabell (planlagt) | ⏳ Planlagt — se [`nexi-integration-plan.md`](./plans/nexi-integration-plan.md) Fase 2 |

Ingen av sporene fungerer fullt ende-til-ende på Woo i dag (kun bulk-rabatter vises i cart-UI, men sendes ikke som rabatt på Woo-ordren — det er et åpent punkt under).

---

## Tre rabatt-spor — overordnet

### 1. Bulk-rabatter (auto)

**Hva:** Mengderabatter ("kjøp 3, få 10 % avslag"). Konfigureres av admin i Studio Wombat-pluginen i wp-admin.

**Sync:** Cron-jobb leser `wp_wdp_discounts` (kun `enabled = true` og `type = bulk`) og upserter til Supabase `discount_rules`. Kjøres som del av `parts=discounts` i reconciliation-cronen. **Status:** wired (sjekk `/api/cron/woo-reconciliation`).

**Evaluator:** [`lib/cart/discounts/bulk.ts`](../lib/cart/discounts/bulk.ts) — pure function. Tar regler + cart-items, returnerer per-linje rabatt-prosent.

**Hook:** [`lib/cart/discounts/hook.ts`](../lib/cart/discounts/hook.ts) — klient-side hook som leser regler (server-injected som prop) og kjører evaluator mot live cart-state.

**Vises i UI:** Cart-summary, cart-row (per-linje "Du sparer X kr"), produktkort på kategori-side ("−20 % ved 2+").

**Server-side ved checkout-orchestrator:** [`lib/checkout/order.ts > applyDiscounts`](../lib/checkout/order.ts) henter rules på nytt og kjører evaluator → reduserer line-items.total før Woo-create.

### 2. Kupongkoder (manuell)

**Hva:** Engangs- eller kampanje-koder kunden taster inn (BLACKFRIDAY10, SOMMER25, osv.). Konfigureres i WC core admin (Marketing → Coupons).

**Sync:** **Ikke synket.** Kupong-logikk er for kompleks å speile (smart_coupon-type, individual_use-kombos, email_restrictions, etc.) — vi henter on-demand når kunde taster en kode.

**Validering:** [`/api/cart/coupon/validate`](../app/api/cart/coupon/validate/route.ts) — POST { code, items, subtotalInclVat }. Server kaller `GET /wc/v3/coupons?code=X`, kjører [`applyCoupon`](../lib/cart/coupons.ts) for valideringer (expiry, usage_limit, minimum_amount) + beregning, returnerer `AppliedCoupon` eller error.

**Vises i UI:** ⏳ Ikke implementert. Plan: input-felt + "Bruk"-knapp i checkout-form, applied-chip med X for å fjerne.

**Server-side ved checkout-orchestrator:** ⏳ Ikke wired. Plan: orchestrator henter kupong via `fetchCouponByCode`, kjører `applyCoupon`, reduserer `orderTotal`, sender pre-discount `subtotal` + post-discount `total` per linje til Woo (samme mønster som bulk).

### 3. Gavekort (manuell, separat domenemodell)

**Hva:** Skarpekniver utsteder gavekort med saldo. Kunden taster kode i checkout, beløpet trekkes fra cart-total. Restbeløp betales med kort (Nexi).

**Status:** Planlagt — datamodell + flyt detaljert i [`docs/plans/nexi-integration-plan.md`](./plans/nexi-integration-plan.md) > "Gavekort".

**Hovedforskjell fra kupong:** Gavekort er en **balanse-modell** (saldo trekkes fra ved bruk, ikke gjenfylles ved refund per Skarpekniver-policy). Kupong er en **regel** (gjelder uniformt mens den er aktiv).

> Resten av denne fila handler om bulk + kupong. Gavekort er sin egen verden i nexi-integration-plan.md.

---

## Bulk-rabatter — detaljer

### Data-modell

Supabase-tabellen `discount_rules` (kun `enabled = true` rader synkes):

```sql
create table discount_rules (
  id            bigint primary key,
  enabled       boolean not null,
  type          text not null,            -- per nå alltid 'bulk'
  name          text,
  apply_to      jsonb,                    -- { all, productIds, skus, categorySlugs, tagSlugs }
  count_mode    text,                     -- 'combined' | 'per-product'
  tiers         jsonb,                    -- [{ startingQuantity, discountPct }]
  start_date    timestamptz,
  end_date      timestamptz,
  source_payload jsonb,                   -- rå plugin-blob for forensics
  synced_at     timestamptz default now()
);
```

`source_payload` lagres rå (hele plugin-settings-objektet) slik at hvis evaluator brekker etter en plugin-oppdatering, har vi data å diff-e mot.

### Evaluator-kontrakt

```ts
// lib/cart/discounts/types.ts
interface DiscountRule {
  id: number; enabled: boolean; type: 'bulk' | string;
  name: string;
  applyTo: { all: boolean; productIds: number[]; skus: string[]; categorySlugs: string[]; tagSlugs: string[] };
  countMode: 'combined' | 'per-product';
  tiers: { startingQuantity: number; discountPct: number }[];
  startDate: string | null; endDate: string | null;
}

interface AppliedDiscount {
  itemKey: string;       // CartItem.key
  ruleId: number;
  ruleName: string;
  discountPct: number;   // 0–100
  discountAmount: number; // kr (positivt) — pre-beregnet
}

export function evaluateBulkRules(
  rules: DiscountRule[],
  items: DiscountCartItem[],
  options?: { now?: Date },
): AppliedDiscount[];
```

**Anvendt-rabatt-policy:** hvis flere regler matcher samme item, vinner høyest `discountPct` (ikke kumulativt — én rabatt per linje).

### Server-side ved order-create

I `lib/checkout/order.ts > applyDiscounts`:
1. `fetchActiveBulkRules()` henter fra Supabase
2. `evaluateBulkRules(rules, items)` returnerer per-linje rabatt
3. `buildLineItems` reduserer `totalInclVat` med `discountAmount`
4. Splitter til ex-MVA + tax (via `splitVat`)
5. Sender til Woo med `line_items[].subtotal = pre-discount`, `line_items[].total = post-discount` (Woo regner ut `discount_total` automatisk)

---

## Kupongkoder — detaljer

### Data-modell

**Ikke speilet** — vi henter on-demand fra Woo. Plan-A (lazy fetching) holder pga. lavt antall samtidige kupong-validations.

Cache-strategi (TBD): Hvis vi merker mye trafikk, kan vi cache kupong-definisjon i Redis med kort TTL (60s) på `code`-key. Sparer Woo-rundtur ved retries/dobbeltklikk.

### Evaluator-kontrakt

```ts
// lib/cart/coupons.ts (allerede skrevet)
interface AppliedCoupon {
  code: string;
  discountType: 'percent' | 'fixed_cart';   // MVP-scope
  rawAmount: number;                          // 10 (% off) eller 100 (kr off)
  discountInclVat: number;                    // beregnet for cart, NOK
  summary: string;                            // "10 % rabatt" / "100 kr avslag"
}

type CouponValidationError =
  | { code: 'NOT_FOUND' | 'EXPIRED' | 'USAGE_LIMIT_REACHED' | 'INVALID' }
  | { code: 'MIN_AMOUNT_NOT_MET'; required: number; current: number }
  | { code: 'MAX_AMOUNT_EXCEEDED'; maximum: number; current: number }
  | { code: 'UNSUPPORTED_TYPE'; type: string };

export function applyCoupon(input: ApplyCouponInput): AppliedCoupon | CouponValidationError;
```

### MVP-scope

**Støttede `discount_type`-er:**
- `percent` — % off subtotal (eller % off matchende produkter ved `product_ids`)
- `fixed_cart` — flat kr off cart-total

**Validerte regler:**
- Existence (kode finnes)
- Expiry (`date_expires`)
- Total usage_limit (`usage_count >= usage_limit`)
- Minimum cart-total (`minimum_amount`)
- Maximum cart-total (`maximum_amount`)
- **Produktrestriksjoner** (besluttet 2026-05-06):
  - `product_ids` — koden gjelder kun listede produkter
  - `excluded_product_ids` — koden gjelder ikke listede produkter
  - `product_categories` — koden gjelder kun listede kategorier
  - `excluded_product_categories` — koden gjelder ikke listede kategorier
  - For `percent`: rabatt regnes kun på matchende items i cart, ikke hele subtotal
  - For `fixed_cart`: koden avvises hvis ingen matchende items i cart (eller flat-rabatten anvendes på cart-totalen så lenge minst én matchende vare finnes — TBD detalj)
- `individual_use` — respekter feltet (avvis kupongen hvis annen kupong allerede er aktiv og denne har individual_use)
- `usage_count` — auto-incrementeres etter vellykket order-create via best-effort `PUT /wc/v3/coupons/{id}` (ikke-blokkerende; logges hvis det feiler)
- **`exclude_sale_items`** (besluttet 2026-05-06): hvis flagget er satt, ekskluder salgsvarer fra kupong-base i tillegg til bulk-rabatterte items. En "salgsvare" er en linje hvor `unitPriceInclVat < regularPriceInclVat`. Default (flag false) → salgsvarer behandles likt som vanlige varer; sale + kupong stables.

**Eksplisitt DEFERRED i v1** (kupong med disse feltene avvises med `UNSUPPORTED_TYPE`):
- `free_shipping: true` — krever orchestrator-støtte (skipping_cost = 0)
- `smart_coupon` (Smart Coupons-plugin) — egen integrasjon, kommer med gavekort-fasen
- `usage_limit_per_user` — krever bruker-level usage-tracking, ikke wired
- `limit_usage_to_x_items` — krever per-item ranking
- `email_restrictions` — krever auth-state i validate-flow

Når admin oppretter en kupong med disse feltene satt, returnerer evaluator `UNSUPPORTED_TYPE` slik at admin merker begrensningen og kan vurdere alternativ konfigurasjon.

### Order-create-mønster

Når orchestratoren wires (TBD), to alternativer:

**Alternativ A — Send `coupon_lines` til Woo:** Lar Woo regne discount + auto-increment usage_count.
- Pro: Usage tracking gratis. Reports korrekte.
- Kontra: Woo kan modifisere våre eksplisitte line-totals → vi mister kontroll over per-linje pris.

**Alternativ B — Vi appliserer selv, sender pre-discount `subtotal` + post-discount `total`:** Samme mønster som bulk-rabatter.
- Pro: Pris-kontroll bevart. Bulk + kupong kan stables konsistent. WC's `discount_total` regnes automatisk fra `subtotal − total`.
- Kontra: usage_count ikke auto-incrementert (manuell intervention i wp-admin om nødvendig, eller vi POST'er separat).

**Anbefaling:** Alternativ B. Konsistent med bulk-mønsteret, beholder pris-determinisme. usage_count kan oppdateres via en best-effort `PUT /wc/v3/coupons/{id}` etter vellykket order-create — det blokkerer ikke checkout om det feiler.

---

## Kombinasjons- og rekkefølge-regler

### Stable rabatter (besluttet)

**Policy: Eksklusiv stabling (besluttet 2026-05-06).**

Hver linje får MAKS én rabatt. Hvis en linje allerede har fått bulk-rabatt, ekskluderes den fra kupong-beregningens base. Dette gir maks margin-kontroll og forutsigbar prising — ingen "double-dipping".

```
For hver cart-line:
  bulk-anvendt? ──ja──> linjen er "klaimet" av bulk
                        ─ kupong-discount: 0 på denne linjen
                        ─ gavekort: trekker fra rest-cart-total

  bulk-anvendt? ──nei─> kupong evalueres
                        ─ percent: rabatt på denne linjens total
                        ─ fixed_cart: bidrar til kuponaffekterte cart-andel
                        ─ gavekort: trekker fra rest-cart-total
```

| Kombinasjon | Tillatt? | Hvordan |
|---|---|---|
| Bulk + kupong | ✅ | Bulk-rabatterte items utelukkes fra kupong-base. Kupongen anvendes kun på resten. |
| Bulk + gavekort | ✅ | Bulk applieres på line-totals → gavekort trekker fra remaining cart-total |
| Kupong + gavekort | ✅ | Kupong applieres på line-totals → gavekort trekker fra remaining cart-total |
| Bulk + kupong + gavekort | ✅ | Bulk på matchende items → kupong på resten → gavekort siste lag |
| To kuponger samtidig | ⚠️ | Respekter Woos `individual_use`-felt — hvis settet, kun én av gangen. Hvis ikke: kan kombineres, men begge er underlagt eksklusiv-stabling-regelen vs bulk |

**Eksempel: cart 5 varer á 1000 kr (5 000 kr). 3 matcher bulk 20 %. Kupong: 10 %.**

```
Bulk-andel:  3 × 1000 = 3000  →  3000 × 0.80 = 2400  (linje-totals reduseres)
Kupong-andel: 2 × 1000 = 2000  →  2000 × 0.90 = 1800  (kun ikke-bulk-items)

Cart-total etter alt: 2400 + 1800 = 4200
```

For `fixed_cart`-kupong: rabatten capes til summen av ikke-bulk-items.

```
Bulk-andel:    2400 (uberørt)
Kupong-andel:  ikke-bulk-items: 2000. Kupong "500 kr off" → discount = min(500, 2000) = 500
Cart-total:    2400 + 1500 = 3900
```

**Eksempel med sale-eksklusjon: cart 4 varer á 1000 kr regular. 2 har sale-pris 800. Kupong: 10 % med `exclude_sale_items: true`.**

```
Sale-andel:   2 × 800 = 1600  (uberørt — ekskludert fra kupong)
Eligible:     2 × 1000 = 2000  →  2000 × 0.90 = 1800
Cart-total:   1600 + 1800 = 3400
```

Hvis kupongen IKKE har `exclude_sale_items` (default), regnes den på alle items inkludert salgsvarene:

```
Alle items:   sale 1600 + regular 2000 = 3600
Kupong-base:  3600 × 0.90 = 3240
Cart-total:   3240
```

**Implementasjons-konsekvens:**
- `lib/cart/coupons.ts > applyCoupon` må ta et nytt parameter: `bulkAppliedItemKeys: Set<string>`
- Når den kalles, ekskluderer den disse keys fra `subtotalInclVat`-beregningen og fra item-listen
- For `percent`: discount = `nonBulkSubtotalInclVat × amount / 100`
- For `fixed_cart`: discount = `min(amount, nonBulkSubtotalInclVat)`
- Hvis `nonBulkSubtotalInclVat == 0` (alle items bulk-rabattert): kupongen returnerer `INVALID` med en bruker-vennlig melding ("Kupongen kan ikke kombineres med pågående mengderabatt-kampanje").

### Negativ-clamping

Hvis rabattene tilsammen blir > cart-total: clamp til 0. Aldri negativ ordre.

### Free-shipping-kuponger — DEFERRED

`free_shipping: true` på en kupong betyr "denne koden gjør frakt gratis". Krever spesialhandling — orchestratoren må sette `shippingCost = 0` når en slik kupong er aktiv.

**Beslutning 2026-05-06: Defer til senere fase.** Kuponger med `free_shipping: true` avvises foreløpig med `UNSUPPORTED_TYPE` slik at admin merker det og kan migrere til en ren `percent`/`fixed_cart`-kupong, eller vente til vi bygger støtten.

`// TODO(free-shipping): når vi støtter dette, må evaluator returnere et ekstra freeShipping-flagg, og orchestrator må sette shippingCost = 0 når flagget er satt. Krever også at vi unngår å sende shipping_lines med non-zero total til Woo.`

---

## Server vs klient — ansvar

| Funksjon | Klient | Server |
|---|---|---|
| Vise rabatt i cart-UI | ✅ (live, fra cart-store + bulk-evaluator) | — |
| Validere kupong-kode | ❌ | ✅ (`/api/cart/coupon/validate`) |
| Beregne endelig pris | Display-only (kan være litt off) | ✅ (orchestrator authoritative) |
| Drift-check | Sender `expectedTotal` | Sammenligner mot recompute |
| Lagrer rabatt på Woo-ordre | — | ✅ (line-totals + meta) |

**Klient-side beregning er kun for display.** Server overstyrer alltid ved order-create. Vi kan tolerere små fluktuasjoner siden drift-checken kun avviser hvis server-total er HØYERE enn klient-vist (kunde betaler aldri mer enn forventet).

---

## Hvordan rabatter lander på Woo-ordren

Konsistent mønster på tvers av alle spor:

```
line_items[]:
  product_id, quantity
  subtotal       — full pris ex MVA × qty (PRE-rabatt)
  subtotal_tax   — MVA på subtotal
  total          — rabattert pris ex MVA × qty (POST alle rabatter)
  total_tax      — MVA på total

WC computer automatisk:
  order.discount_total = sum(line.subtotal - line.total)
  order.total          = sum(line.total + line.total_tax) + shipping_total + shipping_tax
```

**Per-linje meta** for sporbarhet:

```ts
meta_data: [
  { key: '_skn_applied_bulk_rule', value: ruleId },        // hvis bulk-rabattert
  { key: '_skn_applied_bulk_pct', value: discountPct },
  { key: '_skn_applied_coupon_codes', value: 'BLACKFRIDAY,SOMMER25' },  // join hvis flere
]
```

Top-level meta på ordren:

```ts
{ key: '_payment_accepted_per_payement_type',
  value: '{"card":1500,"giftcard":500}' }                   // splittsporing for refund
```

---

## Refund-policy

Per [`nexi-integration-plan.md`](./plans/nexi-integration-plan.md) > Refund:

- **Refund går alltid via Nexi til kort.** Beløpet clamp-es til `breakdown.card`-andelen i `_payment_accepted_per_payement_type`.
- **Bulk-rabatt** påvirker ikke refund-flyt — rabatten var allerede applisert på line-totals, så refund-amount basert på line.total er riktig.
- **Kupong** påvirker heller ikke — samme grunn.
- **Gavekort-andel** restitueres aldri automatisk; admin utsteder evt. nytt gavekort manuelt.

---

## Implementasjons-status (per dato)

| Komponent | Status |
|---|---|
| Bulk-evaluator (klient + server) | ✅ Wired ende-til-ende |
| Bulk-regel-sync (cron) | ✅ |
| `/api/cart/coupon/validate` | ✅ Endpoint klart |
| `lib/woo/coupons.ts` (fetcher) | ✅ |
| `lib/cart/coupons.ts` (evaluator — basis) | ✅ MVP-basis |
| Kupong-UI i checkout | ❌ |
| Kupong-applisering i orchestrator | ❌ |
| Produktrestriksjoner (`product_ids`/kategorier) | ❌ Må bygges (besluttet) |
| `individual_use`-håndtering | ❌ Må bygges (default-policy) |
| Kupong usage_count-oppdatering (PUT etter create) | ❌ Må bygges (besluttet) |
| Kombinasjons-regler implementert | ❌ |
| `exclude_sale_items` (sale-eksklusjon når flagget settes) | ❌ Må bygges (besluttet) |
| Free-shipping-kuponger | ⏸️ Deferred — avvises med UNSUPPORTED |
| Smart Coupons-plugin-integrasjon | ⏸️ Deferred — egen integrasjon med gavekort |
| `email_restrictions` / `usage_limit_per_user` / `limit_usage_to_x_items` | ⏸️ Deferred — avvises med UNSUPPORTED |
| Andre regel-typer (`simple`, `buyx-gety`, ...) | ❌ Bygges når kampanje krever det |
| Gavekort | ❌ Plan i `nexi-integration-plan.md` |

---

## Beslutninger

| # | Spørsmål | Beslutning | Dato |
|---|---|---|---|
| 1 | Kombinasjons-policy (bulk + kupong + gavekort?) | **Eksklusiv stabling** — varer med bulk-rabatt utelukkes fra kupong-base. Hver linje får maks én rabatt. Gavekort siste lag på cart-total. | 2026-05-06 |
| 2 | Rekkefølge | Bulk på matchende items → kupong på ikke-bulk-items → gavekort trekker fra rest-cart-total | 2026-05-06 |
| 3 | `individual_use`-kuponger | Respekter Woo-feltet — én kupong om gangen hvis flagget er satt | 2026-05-06 (default antatt) |
| 4 | Free-shipping-kuponger | **Deferred.** Avvises med `UNSUPPORTED_TYPE`. TODO-kommentar i kode. | 2026-05-06 |
| 5 | Produktrestriksjoner (`product_ids`, kategorier) | **Må håndteres** i evaluator. Rabatt beregnes kun på matchende items. | 2026-05-06 |
| 6 | Smart Coupons-plugin | Defer til gavekort-fase | 2026-05-06 (default antatt) |
| 7 | `usage_count`-oppdatering | **Må håndteres** — best-effort PUT etter order-create | 2026-05-06 |
| 8 | Caching | **Alltid live** — ingen Redis-cache av kupong-definisjon | 2026-05-06 |
| 9 | Salgsvarer + kupong | **Følg `exclude_sale_items`-flagget per kupong.** Default (flag false): sale + kupong stables. Med flag true: salgsvarer ekskluderes fra kupong-base, samme som bulk. | 2026-05-06 |

Beslutningene markert "default antatt" er ikke eksplisitt godkjent ennå — flagg her hvis du vil endre dem.

---

## Faseplan for fremover

### Fase A — Kupong-evaluator utvidet (2 dager)

Bygges først siden den utvider eksisterende `lib/cart/coupons.ts` til å støtte produkt-restriksjoner, individual_use, bulk-eksklusjon og sale-eksklusjon.

1. **Bulk-eksklusjon (kjerne-policy):** `applyCoupon` tar nytt parameter `bulkAppliedItemKeys: Set<string>`. Items med disse keys ekskluderes fra discount-base.
2. **Sale-eksklusjon (følger kupongens flagg):** hvis `coupon.excludeSaleItems === true`, items hvor `unitPriceInclVat < regularPriceInclVat` ekskluderes også. `CartItemForCoupon` utvides med `regularPriceInclVat` så vi kan sjekke per item.
3. **Produkt-restriksjoner:** `product_ids`, `excluded_product_ids`, `product_categories`, `excluded_product_categories`. Rabatt regnes kun på items som matcher restriksjonene OG ikke er bulk-rabattert OG ikke er ekskludert pga. sale (hvis flagget).
4. For `percent`: discount = `eligibleSubtotal × amount / 100`. (`eligibleSubtotal` = sum av items som passerer alle filterne.)
5. For `fixed_cart`: discount = `min(amount, eligibleSubtotal)`. Avvis (`INVALID`) hvis `eligibleSubtotal == 0`.
6. **`individual_use`-håndtering:** input til evaluator inkluderer `existingActiveCouponCodes`. Reject hvis ny kupong har individual_use OG cart har andre kuponger; eller hvis ny kupong er ikke-individual og cart har en eksisterende individual_use-kupong.
7. **DEFERRED-rejections:** avvis med `UNSUPPORTED_TYPE` for `free_shipping`/`smart_coupon`/`email_restrictions`/`usage_limit_per_user`/`limit_usage_to_x_items`.
8. Tester for hver branch + spesifikke tester for bulk × sale × kupong-kombinasjoner.

### Fase B — Kupong-flyt UI + orchestrator (2 dager)

1. UI-komponent `CouponField` i checkout (input + Bruk-knapp + applied-chip)
2. State-hook i CheckoutClient for `appliedCoupon: AppliedCoupon | null`
3. Kall `/api/cart/coupon/validate` ved Bruk (sender items + subtotal — server kjører evaluator)
4. Vis discount-linje i cart-summary
5. Send `couponCodes` i `/api/checkout/order`-body
6. Orchestrator henter via `fetchCouponByCode`, kjører `applyCoupon`, applierer som linje-discount (Alternativ B fra spec — pre-discount `subtotal` + post-discount `total` per linje)
7. Drift-check inkluderer kupong-discount

### Fase C — usage_count tracking (0.5 dag)

1. Etter vellykket order-create, fyr en best-effort `PUT /wc/v3/coupons/{id}` med `usage_count: previous + 1`
2. Logg failures uten å blokkere ordre-flyten
3. Lagrer `_skn_applied_coupon_codes` på line-meta for tracebackcc

### Fase D — Gavekort (egen plan)

Se `nexi-integration-plan.md` Fase 2. Implementeres etter at kupong er live, fordi gavekort-flyten gjenbruker mye av samme infra (validate-endpoint-mønsteret, applied-state i CheckoutClient).

### Senere

- **Free-shipping-kuponger** — trigges av `// TODO(free-shipping)`-kommentaren. Implementeres når en aktuell kampanje krever det.
- **`simple`/`buyx-gety`/`fixed-price`/`free-product`/`shipping`/`idiscount` regel-typer** i Studio Wombat-plugin — bygges når en faktisk kampanje krever det. Ikke spekulativt.
- **`exclude_sale_items`** — krever sale-status-sjekk per item.
- **`usage_limit_per_user`** — krever bruker-level usage-tracking (Supabase-tabell + auth-state i validate).

---

_Sist oppdatert: 2026-05-06 — konsoliderte bulk + kupong + gavekort i én canonical doc._
