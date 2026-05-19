@AGENTS.md

# Skarpekniver.no — Webshop Project Memory

**Dette er prosjekt-hukommelsen til AI-agenter (inkludert meg selv) i fremtidige sesjoner.** Den beskriver hva prosjektet er, hvordan koden og forretningslogikken henger sammen, og hvor mer detaljert dokumentasjon finnes.

---

## TL;DR

Ny headless webshop for Skarpekniver AS — en norsk spesialistbutikk for kokkekniver, slipeutstyr og kniv-tilbehør. Målet er én ting: **en lynrask, SEO-optimal butikk som erstatter den eksisterende skarpekniver.no**.

WooCommerce er backend og admin. Next.js 16 (App Router) er frontend. En egen Supabase-instans speiler produktkatalogen fra Woo. Frontend kaller aldri Woo direkte på request-tidspunkt.

## For fremtidige Claude-sesjoner — LES DETTE FØRST

Før du gjør noe som helst — les den relevante fila i `docs/`. Denne CLAUDE.md er kun inngangen.

| Hva du skal gjøre | Hvor du leser først |
|---|---|
| Endre arkitektur, datastrøm, infra | `docs/architecture.md` |
| Endre produkt-, pris-, lager-, ordre-regler | `docs/business-logic.md` |
| Endre rabatt-logikk (bulk, kupong, gavekort) | `docs/discount-engine.md` |
| Legge til / endre Supabase-tabell | `docs/data-model.md` |
| Endre farge, font, spacing, komponent-stil | `docs/design-system.md` |
| Skrive tekst (UI-copy, e-post, produktbeskrivelser) | `docs/brandbook.md` |
| Lage / endre React-komponent | `docs/components.md` |
| Endre URL, metadata, sitemap, strukturerte data | `docs/seo.md` |
| Integrasjon mot Woo, Supabase, Redis, Vipps, Stripe, Vercel | `docs/integrations.md` |
| Legge til/endre analytics-events (GA4/Meta/TikTok/CAPI) | `docs/integrations.md` > Analytics + `lib/analytics/` |
| Kode-stil, navngiving, commit-meldinger | `docs/conventions.md` |
| Ta en beslutning som er dyr å reversere | Skriv en ny ADR i `docs/adr/` |

## Dokumentasjonsprinsipper — hvordan dette prosjektet vedlikeholdes

Vi vedlikeholder dette prosjektet som et profesjonelt IT-team ville gjort. Det betyr fem ting:

**1. Dokumentasjon er kode.** Alle vesentlige endringer krever oppdatering av relevant `.md`-fil i samme commit. Er det uklart hvilken fil — velg en og oppdater `docs/README.md`-indeksen.

**2. Ingen udokumentert magi.** Hvis det finnes en konvensjon i koden, må den stå i `docs/conventions.md`. Hvis en flyt er kompleks (f.eks. "hvordan lager fra Woo synker til Supabase"), må den beskrives i `docs/business-logic.md`. Hvis noen lurer på "hvorfor gjør vi det sånn?" og ikke finner svaret i docs — det er en bug i dokumentasjonen.

**3. ADRs for irreversible beslutninger.** Database-valg, sync-mønster, URL-struktur, tredjepart-integrasjoner — alt som vil være dyrt å endre senere, skrives som en ADR i `docs/adr/` med dato, kontekst, beslutning og konsekvenser. Eksisterende ADRs er nummerert 0001-NNNN.

**4. Ikke gjett — spør eller slå opp.** Hvis en fremtidig sesjon gjør noe uten dekning i docs, flagg det til Alexander framfor å finne på noe. Stille antagelser blir til teknisk gjeld.

**5. Hold denne CLAUDE.md oppdatert.** Dette er inngangen. Når en beslutning tas eller noe sentralt endres, reflekter det her — ikke bare i detaljdokumentet.

## UI- og designregler — ikke-forhandlingsbare

Disse reglene eksisterer fordi AI-output defaulter til generisk "Tailwind-admin"-estetikk hvis den ikke tvinges til noe annet. Brudd er en bug.

**1. Kun design-tokens — aldri hardkodede verdier.** Alle farger, font-størrelser, line-heights, radii, spacing og breakpoints kommer fra `@theme`-blokken i `app/globals.css`. Hvis en verdi trengs som ikke finnes der, legg den til som token først, commit den, så bruk den. Konkret: ikke `text-[14px]`, bruk `text-body`/`text-label`. Ikke `bg-[#EEEDE9]`, legg farge til som `--color-utility-bar` og bruk `bg-utility-bar`. Ikke `h-18` (finnes ikke i Tailwind), bruk `h-header` (definert som `--height-header: 72px`).

**1a. Semantic tokens er default for farger (ADR-0008).** Tema-system er to-lags: brand-tokens (`unohana`, `kuro`, `sumi`, osv.) er faste; semantic tokens (`canvas`, `surface`, `surface-muted`, `surface-hover`, `surface-contrast`, `ink`, `ink-muted`, `ink-subtle`, `ink-inverse`, `divider`) flipper automatisk med light/dark. Komponenter bruker semantic som default — `bg-surface` i stedet for `bg-shiro`, `text-ink` i stedet for `text-kuro`, `border-divider` i stedet for `border-sakai`. Brand-tokens kun der designet dikterer identisk utseende i begge moduser (editorial-kolonnen i MegaMenu, aka-CTAer, drawer-overlay, logo-sirkelen). Full tabell i `docs/design-system.md` > "Dark mode" og `docs/adr/0008-light-dark-theme-tokens.md`.

**2. Ingen Inter. Ingen Roboto. Ingen system-sans.** Paret er låst: Satoshi (sans, UI + body) + Noto Serif JP (serif, dekorativ hero + bransje-signatur). Kanji som 包丁 brukes bevisst som grafisk element. Hvis en framtidig agent foreslår å "legge til Inter for tekniske fordeler" — nei.

**3. Visuell retning: editorial japansk-butikk.** Rolig bakgrunn (Unohana `#F5F5F3`), presise typografiske kontraster, generøs hvitspace, aksent-rød (Aka `#FF3333`) sparsomt. Ikke neon-farger, ikke gradient-bakgrunner, ikke skygger utover `--shadow-sm`. Referansen er `docs/design-system.md` og Paper-artboards i `Friendly canyon`.

**4. Kun Tailwind-utility-klasser.** Ingen `<style>`-tags i komponenter, ingen CSS-moduler, ingen `styled-components`. Globale stiler kun i `app/globals.css`. Hvis en pattern gjentas, lag en komponent — ikke en CSS-klasse.

**5. Sjekk `components/ui/` FØR du lager noe nytt.** Før du skriver en knapp, pill/badge/tag, input, dialog, skeleton, eller annen visuell primitive: åpne `components/ui/` og se om det finnes fra før. Hvis det finnes — bruk det. Hvis det ikke finnes, men patternet vil gjentas (status-badge, ikon-knapp, form-felt, kort, modal): lag det som en delt primitive i `components/ui/Foo.tsx` med variants og tokens, og dokumenter det i `docs/components.md` > Primitiver. Ikke bygg en feature-spesifikk one-off (`OrderStatusPill`, `ProductBadge`, `CartCloseButton` osv.) når et generisk primitive løser samme behov. Sjekk-reuse-eller-lag er en del av "plan before code" (regel 6) og skal være eksplisitt i planen før kode skrives.

**Statusbadger — bruk `Tag`, ikke `Pill`.** Domene-statuser (ordre-status, betalings-status og tilsvarende) skal alltid rendres med `Tag`-komponenten (`components/ui/Tag.tsx`) — aldri med `Pill`. `Tag` er fastsatt til ordre-grid-designet (Paper 6B7-0): alltid bordered, rounded-1 (2px), mixed case. `Pill` er kun for inline metadata-kontekster uten fast status-semantikk (kupongkoder, produkt-flags). Se `docs/components.md` > Tag vs Pill for beslutningstre.

**6. Plan before code.** For enhver UI-oppgave som involverer mer enn én komponent: skriv en plan som lister ut (a) hvilke `components/ui/`-primitiver som allerede finnes og som skal gjenbrukes, (b) hvilke som mangler og må lages, (c) feature-spesifikk komponent-struktur, data-flow, state-eierskap, responsive-breakpoints, og tokens som mangler. Få planen godkjent før noe kode skrives. Dette er ikke overhead — det er forskjellen på "ser ut som et AI-bygg" og "ser ut som et ekte designet produkt".

**7. Tilgjengelighet er en del av design-regelen.** Alle interaktive elementer har `aria-label` (ikon-knapper) eller synlig label, fokus-outline, og tastatur-sti. Kontrast-ratio ≥4.5:1 for body, ≥3:1 for store tekster. Ikke disable :focus-visible.

**8. Tilbakemeldinger på handlinger — Toast, ikke alert/inline-banner.** Når en brukerhandling er fullført (lagre profil, legge i handlekurv, lagre til ønskeliste, slette noe, endre adresse), skal tilbakemeldingen vises som en **Toast** (`components/ui/Toast.tsx`) — ikke `window.alert()`, ikke en ny side, og ikke inline-banner i skjema (Banner er reservert for vedvarende valideringsfeil i pågående skjema-kontekst).

Implementert og klar til bruk. Bruk `useToast()`-hooken:

```tsx
const { toastProps, showToast } = useToast();

// Ved suksess:
showToast({ variant: 'success', message: 'Endringer lagret' });

// Ved feil:
showToast({ variant: 'error', message: body?.error ?? 'Noe gikk galt. Prøv igjen.' });

// Med handlingslenke:
showToast({ variant: 'success', message: 'Lagret til ønskelisten', action: { label: 'Se ønskeliste →', href: '/konto/onskeliste' } });

// Render Toast i JSX:
{toastProps && <Toast {...toastProps} />}
```

Tre varianter: `success` (grønn), `error` (rød), `info` (grå). Auto-dismiss etter 4 sekunder. Posisjon: `fixed bottom-4 right-4`. Full spec i `docs/components.md` > Toast.

Allerede implementert i: `PersonligInformasjonView` (lagre profil/passord), `AddressesView` (lagre adresse), `WishlistView` (fjern fra ønskeliste), `ProductGrid` (legg til ønskeliste).

Full utdypning og eksempler: `docs/design-system.md` > "Design-tokens og bruk" og `docs/conventions.md` > "UI-konvensjoner".

## Stack (kort)

- **Frontend**: Next.js 16.2 (App Router, Turbopack), React 19, TypeScript 5, Tailwind 4
- **Hosting**: Vercel (prosjekt: `skarpekniver/skarpekniverv3`)
- **Database**: Supabase (Postgres, EU-region), egen instans separert fra internal-web
- **Cache**: Upstash Redis for katalog-cache, rate limiting, pris-lookups
- **Backend**: WooCommerce (kilde for katalog + ordre-mottaker), REST og webhooks
- **Betaling**: Vipps + Stripe, custom checkout (ikke Woo-checkout)
- **Søk**: Algolia — `algoliasearch/lite` i overlay, `react-instantsearch` på fremtidig `/sok`-side. Sync fra Supabase-speilet via `/api/cron/sync-algolia`. Se ADR-0009.
- **Bilder**: TBD — sannsynligvis Bunny CDN eller Cloudflare R2 (ikke WordPress)

## Arkitektur i én setning

**WooCommerce er kilde, Supabase er speil, Next.js leser fra Supabase.** Ordre opprettes i Woo ved checkout. Bruker-data (profil, adresser, ordrehistorikk, ønskeliste) leses direkte fra Woo. Produktkatalog, kategorier, beskrivelser og bilder leses fra Supabase (synket via webhooks + daglig reconciliation-cron).

Se `docs/architecture.md` for systemdiagram og dataflyt.

## Låste beslutninger (per 2026-04-24)

| Område | Valgt | ADR |
|---|---|---|
| Dataflyt | Shadow-DB (Woo → Supabase → frontend) | `adr/0001` |
| Isolasjon | Eget repo, eget Vercel-prosjekt, egen Supabase-instans | `adr/0002` |
| Kundekontoer | WooCommerce (ikke Supabase Auth) | `adr/0003` |
| Checkout | Custom UI mot Vipps/Stripe, ordre pushes til Woo | `adr/0004` |
| Marked/språk | Kun Norge (nb-NO, NOK) | `adr/0005` |
| Relansering | Ja, erstatter eksisterende butikk (krever 301-kart) | `adr/0006` |
| Produkt-URL | Nested paths 1:1 mot Woo (`/foreldre/barn/slug`). Terminal-segment resolves. | `adr/0007` |
| Kategori-URL | Nested paths. Kategori vinner ved terminal-slug-kollisjon. `/kategori` = oversikt. | `adr/0007` |
| Lys/mørk tema | To-lags token-system: brand (fast) + semantic (flipper). | `adr/0008` |
| Søk | Algolia (frontend + Supabase→Algolia sync-cron) | `adr/0009` |
| Analytics | Intern event-abstraksjon + adapters (GA4/Meta/TikTok) + CAPI server-side | `adr/0010` |
| Pakke-manager | npm | — |

## Åpne spørsmål (må avklares)

1. **Domene**: Alexander skrev "skarpekniver.com" — men eksisterende butikk er `skarpekniver.no`. Hvilket domene er primært? Redirecter det ene til det andre?
2. **Paper UI-tokens**: Fargepalett, typografi, spacing og radius-tokens fra Paper UI-designet må hentes inn før Tailwind-config er komplett.
3. **Tripletex-kobling**: Hvordan kobles ordre fra Woo til regnskap i Tripletex? Eksisterer det allerede, eller skal det bygges?
4. **Eksisterende URLer**: Trenger fullt sitemap av dagens butikk for å lage 301-kart.
5. **Søke-motor**: Meilisearch, Typesense, eller Supabase full-text — avgjørelse tas i Fase 2.
6. **Bilde-CDN**: Bunny vs R2 vs Cloudinary — vurderes når vi starter bilde-pipeline.

## Nøkkelfiler (vil vokse)

- `app/` — Next.js App Router-sider
- `components/` — gjenbrukbare React-komponenter (se `docs/components.md`)
- `lib/` — klienter og helpers (Woo, Supabase, Redis, pris-beregning)
- `types/` — delte TypeScript-typer (Product, Category, Order, User)
- `styles/` — globale stiler, Tailwind-overrides
- `docs/` — all arkitektur- og forretningsdokumentasjon
- `public/` — statiske assets som ikke optimaliseres

## Sikkerhetsregler (ikke-forhandlingsbare)

Disse reglene er harde — brudd er en bug, ikke en judgment call.

1. **Service-role-nøkkelen (`SUPABASE_SERVICE_ROLE_KEY`) forlater aldri serveren.** Den bypasser RLS og gir full DB-tilgang. Konsekvenser ved lekkasje: hele katalogen kan slettes av en anonym klient.
   - Den brukes kun via `createServiceRoleClient()` i `lib/supabase/server.ts`.
   - `lib/supabase/server.ts` har `import 'server-only'` som compile-time tripwire.
   - `lib/env.ts` kaster runtime-feil hvis `serverEnv` importeres på klient-siden.
   - Returner aldri nøkkelen i response-body, header, cookie, URL-param, eller log-output. Aldri prefix den med `NEXT_PUBLIC_`.
   - Hvis du noen gang ser den i en klient-fetch eller en response — **roter nøkkelen umiddelbart** i Supabase-dashboardet (Settings → API → Reset service_role key).

2. **Ingen `NEXT_PUBLIC_`-prefix på server-hemmeligheter.** Alt med den prefixen inlines i klient-bundlen av Next.js på build-tid. Hvis du er i tvil — det er server-only.

3. **HMAC-verifisering på alle webhooks** (Woo, Vipps, Stripe) før noen side-effekt. Se `lib/woo/webhook.ts` som referanse-implementasjon.

Full liste av sikkerhetsregler: `docs/conventions.md` > Sikkerhet og `docs/integrations.md` > Supabase.

## Vanlige gotchas (oppdateres etter hvert som vi lærer)

- **Next.js 16 er ny** — se `AGENTS.md`. Mange ting er endret fra Next 14/15, inkludert caching-defaults og `params`/`searchParams` som nå er Promise. Slå opp i `node_modules/next/dist/docs/` før du bruker nye API-er.
- **Supabase og WooCommerce snakker ikke sammen direkte** — all koordinering skjer via våre sync-jobber og webhooks. Ikke introduser cross-calls.
- **Frontend skal ALDRI kalle Woo på request-tid for katalogdata**. Hvis du ser det i en PR, det er en feil.

## Hvordan utvide MEGA-MENYENS redaksjonelle innhold

Mega-menyens redaksjonelle innhold (kort, services-lister, kanji-grafikk, virtuelle items som "Tilbud") styres av en `NavOverlay` som lever to steder samtidig:

1. **`lib/nav/default.ts`** — kode-default. Sjekkes inn i git, deploys med Vercel.
2. **`site_config.nav_primary` i Supabase** — kan settes redaksjonelt i Studio.

`lib/nav/fetch.ts > mergeOverlay()` slår dem sammen per `itemOverrides`-path: DB vinner ved konflikt på samme path, men paths som BARE finnes i default beholdes. Dette er det som lar oss utvide `default.ts` uten å oppdatere DB-raden.

**For å legge til editorial på en kategori:**

1. Finn kategoriens path (f.eks. `/bryner-og-knivsliping` — den må matche WP-meny-href'en eksakt).
2. Legg en ny entry i `DEFAULT_NAV_OVERLAY.itemOverrides` i `lib/nav/default.ts`. Bruk samme shape som `/knivtyper` — `editorial.card` (decorative kanji + tittel + body + CTA) + `editorial.services` (3-5 lenker).
3. **Bump `KEY_VERSION` i `lib/nav/fetch.ts`** med ett tall — uten dette serveres gammel Redis-blob i opp til 24 timer etter deploy.
4. Push og verifiser at editorial-blokken vises i den respektive mega-menyen.

**Tre fallgruver verdt å huske:**

- Hvis path-en din ikke matcher noen WP-meny-href, blir overstyringen stille ignorert (ingen feil, ingen rendering).
- Hvis du legger samme path-key i både `default.ts` og `site_config.nav_primary`, vinner DB. Slett raden i Studio hvis du vil flytte tilbake til kode.
- Cache-invalidering: enten bump `KEY_VERSION`, eller kall `invalidateNavPrimary()` fra et endpoint. Aldri bare vent — 24t TTL er smertefullt langt under iterasjon.

## Relaterte prosjekter

- `internal-web` (`/Users/alexanderaagreen/projects/internal-web`) — internt admin-verktøy, egen Postgres (RetoolDB). Ingen runtime-kobling til denne butikken. Hvis du må dele kode senere, bruk npm-pakke eller kopier med kilde-referanse.

## Utviklings-workflow

- Alle endringer via pull request mot `main`.
- CI kjører: ESLint, TypeScript-sjekk, Lighthouse CI, strukturerte-data-validering.
- Preview-deploy per PR via Vercel. Supabase-branching gir egen DB per preview (TBD oppsett).
- Commit-meldinger: konvensjonell (feat/fix/chore/docs/refactor) — se `docs/conventions.md`.

---

_Sist oppdatert: 2026-05-03 av Alexander + Claude — la til mega-meny-overlay-mønster._
