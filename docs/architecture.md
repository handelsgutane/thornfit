# Arkitektur

## Én-setnings-oppsummering

WooCommerce er **kilde** for katalog, bruker-data og ordre. Supabase er et **speil** av katalogen. Next.js-frontend leser nesten alt fra Supabase ved request, og går direkte til Woo for bruker-spesifikke ting (profil, ordre, ønskeliste).

## Systemdiagram

```
┌─────────────────┐
│  Kunde (browser)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Next.js 16 på Vercel (Edge + serverless)   │
│  ┌─────────────────────────────────────┐    │
│  │ SSG/ISR: landingsside, kategori,    │    │
│  │ produkt (leser Supabase + Redis)    │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Dynamic: min side, handlekurv,      │    │
│  │ checkout (kaller Woo + Vipps/Stripe)│    │
│  └─────────────────────────────────────┘    │
└────┬──────────────┬──────────────┬──────────┘
     │              │              │
     ▼              ▼              ▼
┌─────────┐   ┌──────────┐   ┌──────────────┐
│Supabase │   │ Upstash  │   │ WooCommerce  │
│Postgres │   │  Redis   │   │  (backend)   │
│         │   │ (cache)  │   │              │
│ katalog │   │ priser   │   │ ordre, bruker│
│ kategori│   │ stock TTL│   │ admin, plugins│
│ bilder  │   │ sessions │   │              │
└────▲────┘   └──────────┘   └──────┬───────┘
     │                              │
     │ sync (webhooks + cron)       │
     └──────────────────────────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  Vipps / Stripe    │
         │  (checkout-betaling)│
         └────────────────────┘
```

## Data-grenser — hvem eier hva

| Data | Kilde (write) | Lest fra (read på request) |
|---|---|---|
| Produkter (navn, beskrivelse, bilder, SKU, attributter) | Woo | Supabase |
| Priser | Woo | Supabase (+ Redis TTL for volatile) |
| Lager | Woo | Supabase for display, Woo for checkout-reservasjon |
| Kategorier | Woo | Supabase |
| Anmeldelser (display) | Woo | Supabase (synket) |
| Anmeldelser (skriv) | — | Woo direkte |
| Kunder / profil / adresser | Woo | Woo direkte |
| Ordre / ordrehistorikk | Woo | Woo direkte |
| Ønskeliste | Woo (via plugin) | Woo direkte |
| Handlekurv (pre-login) | Klient (cookie) | — |
| Handlekurv (innlogget) | TBD — foreløpig cookie, evt. Woo senere | — |
| Kuponger | Woo | Woo (valideres ved checkout) |
| Frakt-satser (generelle) | Woo-admin eller Supabase config | Supabase |
| Frakt-kostnad på ordre | — | Woo (beregnes ved checkout) |

Se `business-logic.md` for detaljerte regler rundt grensetilfeller.

## Rendering-strategi per sidetype

| Side | Strategi | Revalidate | Hvorfor |
|---|---|---|---|
| Landingsside `/` | SSG + PPR | Ved webhook | Maks Lighthouse-score, LCP-kritisk |
| Kategoriside `/{kategori}` | ISR | 60-300s + on-demand | Produkt-listing endres sjelden |
| Produktside `/{kategori}/{produkt}` | ISR | 60s + on-demand via webhook | Pris/lager må være ferskt |
| Søkeresultater `/sok` | Dynamic | — | Query-avhengig |
| Handlekurv `/handlekurv` | Dynamic (noindex) | — | Bruker-spesifikk |
| Checkout `/kasse` | Dynamic (noindex) | — | Bruker- og transaksjons-spesifikk |
| Min side `/konto/*` | Dynamic (noindex, auth-gated) | — | Bruker-spesifikk |
| Blogg `/guider/{slug}` | SSG | Ved publish | Innhold, ikke dynamic |

## Sync-flyt: Woo → Supabase

**Webhook-drevet (primær):**
1. Endring skjer i Woo (produkt opprettet, oppdatert, slettet; pris endret; lager endret).
2. Woo sender webhook til `POST /api/webhooks/woo` i Next.js.
3. Endpoint verifiserer signatur, mapper data til Supabase-skjema, upserter.
4. Ved behov: `revalidateTag()` for å invalidere ISR-cache på relevante sider.

**Cron-basert reconciliation (sikkerhetsnett):**
1. Daglig cron kl. 03:00 UTC henter full produktliste fra Woo.
2. Sammenligner med Supabase, oppdaterer det som er ute av sync.
3. Sletter produkter i Supabase som ikke finnes i Woo.
4. Logger til `cron_job_runs`-tabell i Supabase (samme mønster som internal-web).

Se `integrations.md` for konkrete endpoint-paths og webhook-konfigurasjon.

## Checkout-flyt (forenklet)

1. Kunde fyller ut checkout-skjema (custom UI i Next.js).
2. Klient kaller `POST /api/checkout/create-order` med handlekurv + kundeinfo.
3. Server-side: valider lager mot Woo (lock). Opprett pending ordre i Woo via REST.
4. Server-side: initier betaling (Vipps eller Stripe), få payment URL / session.
5. Returner payment URL til klient, redirecter kunde.
6. Vipps/Stripe sender webhook ved vellykket/feilet betaling.
7. Next.js mottar webhook, oppdaterer Woo-ordre-status, sender bekreftelses-e-post.

Detaljer i `business-logic.md` under "Checkout".

## Miljøer

| Miljø | Formål | Databases |
|---|---|---|
| `prod` | skarpekniver.no live | Supabase prod-branch, Woo prod, Vipps/Stripe live |
| `staging` | Pre-release test | Supabase staging-branch, Woo staging (TBD), Vipps/Stripe test |
| `preview` | Per-PR preview | Supabase preview-branch per PR (TBD), Woo staging, Vipps/Stripe test |
| `local` | Utvikling | Lokal Supabase eller staging-branch, Woo staging |

Env-variabler dokumentert i `.env.example` og `integrations.md`.

## Ikke-mål (scope-kontroll)

For å hindre scope-creep, eksplisitt IKKE i førsteversjon:

- Flere språk enn norsk
- Flere land / multi-currency
- B2B-funksjonalitet (egne priser per kunde, faktura-på-innkjøp)
- Abonnement-produkter
- Brukergenerert innhold utenom anmeldelser
- Native mobile-app

Disse kan vurderes etter lansering.
