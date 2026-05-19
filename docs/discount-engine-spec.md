# Discount-engine — fra WC-plugin til vår Next.js

> **⚠️ HISTORISK ARKIV.** Denne fila var planning-doc fra design-fasen
> (Valg A/B/C, faser). Den er IKKE oppdatert med faktisk implementert
> kode. **Canonical doc nå:** [`discount-engine.md`](./discount-engine.md)
>
> Behold denne for forensikk: sammenligne hva vi planla mot hva vi faktisk
> bygget. Alt nytt arbeid skal referere til den nye fila.

---

## Hva plugin'en gjør i dag

`WooCommerce Discounts` (Studio Wombat, v1.2.1) lever som en standard WC-plugin og lagrer regler i en egen DB-tabell:

```sql
wp_wdp_discounts (
  id, enabled, type, name, sort, settings (JSON),
  start_date, end_date, created_at, updated_at
)
```

**Sju regel-typer:**

| Type | Hva den gjør |
|---|---|
| `simple` | Klassisk rabatt — % eller kr av subtotal eller spesifikke produkter |
| `bulk` | Mengderabatter — kjøp 3, få 10 % avslag; kjøp 5, få 15 % |
| `buyx-gety` | Kjøp X, få Y gratis eller rabattert |
| `fixed-price` | Sett pris til fast beløp uavhengig av ordinærpris |
| `free-product` | Et gratis produkt når kurven oppfyller vilkår |
| `shipping` | Rabatt på frakt (inkl. gratis frakt) |
| `idiscount` | "Incentive" — bruk X mer for Y avslag (UI-pinger ved cart-progress) |

**Cirka 14 condition-typer** kombineres for å gate hver regel:

- Cart-baserte: `cart_total`, `cart_sub`, `cart_qty`, `cart_eligible_qty`
- Produkt-baserte: `products`, `cats`, `tags`, `vars`, `vatts`
- Bruker-baserte: `auth`, `roles`, `users`, `type`

Hver condition har varianter for `>`, `<`, `!` (ikke-er), så reell kombinasjons-rom er ~50 regler.

## Problemet på vår frontend

Plugin'en kjører i Woo's runtime-cart. Men checkout'en vår er **custom** (per ADR-0004) — vi pusher ferdige ordre til Woo, men cart'en lever i Next.js på klient-siden. Det betyr:

- Plugin-regler aktiveres ikke automatisk på vår frontend.
- Hvis vi viser "kr 1 199" i kurven, men Woo's plugin ville gitt "kr 999" på checkout, har vi en bug — og en juridisk problem (prisopplysning).

## Tre arkitektur-valg

### Valg A — Re-implementer alle reglene i TypeScript

Bygg vår egen rule-engine i `lib/cart/discounts/`. Definer regel-typer som DB-skjema. Lag admin-UI i Next.js for opprettelse. Plugin'en avinstalleres i WP.

**Pro:** Ren arkitektur. Én kilde til sannhet. Ingen WP-runtime-avhengighet i checkout-flyten. Vi kan utvide regler uten plugin-versjoner.

**Kontra:** Stort byggprosjekt — admin-UI, datamodell, evaluator for alle 7 typer × 14 conditions. Migrere eksisterende regler manuelt. Redaktørene må lære nytt UI.

### Valg B — Speil regler fra plugin, evaluer i TS (anbefalt)

Plugin'en blir igjen i WP som rule-editor (admin-UI). Vi syncer `wp_wdp_discounts`-tabellen til Supabase som `discount_rules`. Bygger TS-evaluator som forstår plugin'ens setting-format. Anvender rabattene når kurven beregnes.

**Pro:** Plugin-admin er fortsatt source-of-truth — redaktørene jobber som før. Ingen ny admin-UI å bygge. Evaluator kan utvides gradvis (start med `simple`, legg til `bulk`/`buyx-gety` etter behov).

**Kontra:** Plugin'ens datastruktur er ikke offentlig API — endringer i v1.3 kan brekke evaluator. Må holdes i sync. Risiko for divergens hvis evaluator har bugs.

### Valg C — Server-side validering via WP

Frontend POSTer kurv-innholdet til en custom WP REST-endepunkt vi lager. WP runner plugin'ens evaluator mot kurven (ved å bygge en virtuell `WC_Cart`), returnerer line-by-line priser med rabatter. Frontend rendrer det WP returnerte.

**Pro:** Plugin er literal source-of-truth — null risiko for divergens. Ingen evaluator å bygge.

**Kontra:** Hvert kurv-bytte = WP-rundtur (~200–500 ms). WP må være oppe. Komplisert i SSR. Må håndtere offline-fallback. Kan ikke vise pris på produktkort før WP-kall.

## Anbefaling: Valg B

For Skarpekniver — ~50 produkter, sjeldne regel-endringer, custom checkout — er Valg B riktig balanse. Plugin-admin'en er moden og redaktørvennlig, og evaluator-koden er overkommelig (vi trenger ikke å støtte alle 7 typer fra dag én).

Faseing:

### Fase 1: Speiling og minimum evaluator (~ 3 dager)

**Sync.** Ny tabell `discount_rules` i Supabase som speiler `wp_wdp_discounts`:

```sql
create table discount_rules (
  id bigint primary key,
  enabled boolean,
  type text,                          -- 'simple' | 'bulk' | ...
  name text,
  sort int,
  settings jsonb,                     -- Hele setting-blob'en, plugin-format
  start_date timestamptz,
  end_date timestamptz,
  source_payload jsonb,
  synced_at timestamptz default now()
);
```

**Hente til frontend.** Plugin har ingen REST-eksponering by default. Vi lager en mu-plugin (samme mønster som `skn-brand-meta.php`) som registrerer `/wp-json/skn/v1/discount-rules`:

```php
register_rest_route('skn/v1', '/discount-rules', [
    'methods' => 'GET',
    'callback' => function() {
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT * FROM {$wpdb->prefix}wdp_discounts WHERE enabled = 1"
        );
        return $rows;
    },
    'permission_callback' => function() {
        return current_user_can('manage_woocommerce') || apply_filters('skn_rest_allow_anonymous', false);
    },
]);
```

For sync brukes WC ck/cs-keys (passer i auth-pluggen). Eller mu-pluginen skipper auth (regler er ikke hemmelige).

**Cron-utvidelse.** Ny `parts=discounts` i reconciliation-cron'en. Henter `/wp-json/skn/v1/discount-rules`, upserter til Supabase.

**Evaluator — kun `simple` til å begynne med.** Det dekker ~70 % av reelle rabatt-tilfeller (kampanje-rabatt på subtotal, % avslag på en kategori). Modul-grense:

```ts
// lib/cart/discounts/types.ts
interface DiscountRule {
  id: number;
  type: 'simple' | 'bulk' | 'buyx-gety' | 'fixed-price' | 'free-product' | 'shipping' | 'idiscount';
  enabled: boolean;
  startDate: string | null;
  endDate: string | null;
  settings: unknown; // typed per evaluator
}

interface CartContext {
  items: CartItem[];
  subtotal: number;
  user: { id?: number; roles?: string[] } | null;
}

interface AppliedDiscount {
  ruleId: number;
  ruleName: string;
  amount: number;     // kr avslag (positiv tall)
  affectedItems: string[]; // CartItem.key[] som rabatten gjelder
}

// lib/cart/discounts/evaluator.ts
export function evaluateDiscounts(
  rules: DiscountRule[],
  cart: CartContext,
): AppliedDiscount[] {
  const now = new Date();
  return rules
    .filter((r) => r.enabled)
    .filter((r) => !r.startDate || new Date(r.startDate) <= now)
    .filter((r) => !r.endDate || new Date(r.endDate) >= now)
    .flatMap((r) => evaluateRule(r, cart));
}
```

**Hooke inn i cart-store.** Kurv-store'n (`lib/cart/store.ts`) kjører `evaluateDiscounts` etter hver endring og lagrer applied-array på cart-state. Subtotal/totals-utregning leser arrayet og dropper rabatten på subtotal eller markerer line-items.

**UI.** Cart-summary viser rabatt-linjer ("Sommerkampanje −kr 200"). Produktkort på kategori-side leser samme regler og kan vise badge ("−20 %") når regelen er en simple % off cats containing det produktet.

### Fase 2: Bulk og buyx-gety (~ 2 dager)

Nest mest brukte typer. `bulk` krever quantity-tier-evaluator. `buyx-gety` krever line-pairing (hvilken Y-vare gjelder rabatten).

### Fase 3: Resten (~ 2–3 dager)

`fixed-price`, `free-product`, `shipping`, `idiscount`. Bygges når faktiske rabatt-kampanjer trenger dem — ikke spekulativt.

### Fase 4: Order-push håndterer rabatter (~ 1 dag)

**Viktig kontekst:** WC-pluginen evaluerer aldri rabatter når vi POSTer en
ordre via REST. Den hooker på `woocommerce_before_calculate_totals` som kun
fyrer i WP storefront-rendering, ikke ved `POST /wc/v3/orders`. Det betyr
at hvis vi sender en ordre med ordinær pris, havner den i WP/regnskap som
om kunden betalte full pris — selv om Stripe/Vipps mottok det rabatterte
beløpet. Vi *må* sende rabatten med ordren.

**Anbefalt: per-line `subtotal` ≠ `total`.**

WC's order-API støtter to forskjellige felter per line_item:

```ts
{
  line_items: [
    {
      product_id: 408237,
      quantity: 1,
      subtotal: '11999.00',   // ordinær × qty
      total:    '9999.00',    // rabattert × qty
      // total_tax beregnes automatisk basert på `total` (rabattert)
      // subtotal_tax beregnes på subtotal (ordinær)
      meta_data: [
        { key: '_skn_applied_discount_rule', value: rule.id },
        { key: '_skn_applied_discount_name', value: rule.name },
      ],
    },
  ],
}
```

WC tar `discount_total = sum(subtotal − total)` automatisk. Reports under
"Bestillinger → Rabatt" plukker det opp uten kupong-rad. Mva-fordeling
fungerer riktig fordi `total_tax` beregnes på rabattert pris.

Lagre regel-id og navn som line-item-meta så admin kan slå opp hvilken
regel som ga linjen sin pris (og rapporter / Tripletex-eksport kan filtrere
på det).

**Hvorfor ikke andre tilnærminger:**

- *Coupon_lines* — pent for reports, men hver checkout = en `WC_Coupon`-rad i
  WP. Tusenvis av engangs-koder over tid. Ikke nødvendig når subtotal/total
  gir samme rapport-resultat.
- *Fee_lines med negativt beløp* — fungerer, men reports viser det som "fee"
  i stedet for "rabatt". Forstyrrer regnskap.
- *Direkte sette `total = rabattert` uten å touche subtotal* — Woo regner
  da subtotal til samme som total. Reports viser ingen rabatt overhodet
  (ordinær-pris er borte). Bare nyttig hvis vi vil skjule at rabatten fantes.

**Frakt-rabatt** (regel-type `shipping`) håndteres som egen `shipping_lines`-
entry: `total: '0.00'` for gratis frakt, eller redusert beløp ellers.

## Forhold til kuponger (WC coupons)

Plugin'en og WC-kuponger er separate systemer. Plugin'en gir automatiske rabatter (uten kupong-kode). Vi må fortsatt støtte vanlige WC-kuponger (`/wc/v3/coupons`) i tillegg — det blir et eget evaluator-spor som leser kupong-koden brukeren skrev inn og gjør oppslag i WC.

I praksis: cart-store har to felter:
- `appliedRuleDiscounts: AppliedDiscount[]` — fra discount_rules-evaluator (auto)
- `appliedCoupons: AppliedCoupon[]` — fra brukerinput pluss `/wc/v3/coupons`-validering (manuell)

Begge bidrar til subtotal-trekk.

## Hva vi *ikke* støtter i Fase 1

- Live admin-UI i vår Next.js-app (redaktører jobber i WP).
- Plugin-spesifikke advanced features ("APF" — Advanced Product Fields-integrasjon nevnt i changelog).
- "Eligible product quantity"-condition (egen logikk per produkt). Krever produkt-meta lookup; legges til når vi støter på en regel som bruker det.

## Risiko og mitigering

- **Plugin-format endres.** Mitigering: lagre `source_payload` som-er i `discount_rules`. Hvis evaluator brekker etter en plugin-oppdatering, har vi rådata for å diff-e og fikse.
- **Evaluator-bug betyr feil pris.** Mitigering: skriv eval-tester per regel-type. CI-job som kjører cart-snapshots gjennom evaluator og sjekker mot kjente expected-outputs.
- **Race mellom evaluator og display.** Hvis frontend viser "−20 %" på produktkort men evaluator finner ut at regelen ikke gjelder pga. en condition, ser brukeren feil pris til de legger i kurv. Mitigering: kort-prising må kjøre samme evaluator som cart-prising, ikke duplisere logikk.

## Neste steg

1. Verifiser at plugin'en lagrer regler i `wp_wdp_discounts` på live (sjekk én rad — er settings JSON som forventet?).
2. Skriv mu-plugin med REST-endepunktet over.
3. Migrasjon for `discount_rules`.
4. Sync-helper i `lib/wp/discount-rules.ts`.
5. Cron-utvidelse `parts=discounts`.
6. Evaluator-skall med `simple`-type implementert.
7. Hook inn i cart-store og test mot én faktisk regel fra produksjon.

Si fra hvilke regel-typer som faktisk er aktive i Skarpekniver-WP nå — så prioriterer vi de først.
