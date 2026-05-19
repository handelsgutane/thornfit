# ADR-0009 — Algolia som søke-backend

**Dato:** 2026-04-23
**Status:** Vedtatt
**Forrige beslutning:** CLAUDE.md ≥ Stack sa "TBD — sannsynligvis Meilisearch eller Typesense mot Supabase-speilet"

## Kontekst

Søk er en førsteordens konvertering-driver i en spesialist-butikk: kunder
søker etter merker ("Global"), størrelser ("21cm kokkekniv"), typer ("santoku"),
og stålkvaliteter ("VG10"). Rask feedback (<100ms), robust typo-tolerance,
og nordisk språk-håndtering er ikke-forhandlingsbart.

Før denne ADR-en lå søk som TBD i CLAUDE.md. Nå som vi bygger
`Søk — Overlay Desktop (Alt. 1)` og `Søk — Overlay (Mobile)` fra Paper-designet
må backend låses, ellers blir komponentene bygget mot en placeholder som senere
må skrives om.

## Vurderte alternativer

1. **Algolia** — SaaS, `algoliasearch`-klient + `react-instantsearch` på
   frontend. Søkerespons <50ms globalt via edge-CDN. Pay-per-operation. Admin-
   og search-nøkler separert, search-keyen er trygg i browser-bundle.

2. **Meilisearch** — Open-source, self-hosted eller Meilisearch Cloud.
   Tilsvarende DX som Algolia, billigere ved volum, men vi må drifte
   (selv-host) eller låse oss på Meilisearch Cloud (nyere, mindre moden).

3. **Typesense** — Open-source, self-hosted. God performance, norsk
   stemmer tilgjengelig, men driftskostnad + færre ferdige integrasjoner.

4. **Supabase full-text** — `ts_rank` mot `products`-speilet, ingen ekstern
   tjeneste. Billigst, enklest å starte, men: tunet for engelsk som default,
   typo-tolerance krever `pg_trgm`-indeks på hver kolonne, ingen
   built-in facets, ingen analytics. Resultat: fungerer for PoC, bryter
   ved katalog-vekst + norske sammensatte ord.

## Beslutning

**Algolia.** Prosjekt-internt kalt `skarpekniverv3_products` index.

Hovedgrunner:

1. **Eksisterende kompetanse.** Chef-storefront (`/Users/alexanderaagreen/chef-storefront`)
   kjører Algolia i produksjon med react-instantsearch, sync-cron, og
   Insights-tracking. Vi gjenbruker arkitektur-mønsteret direkte uten
   research-tid.

2. **Norsk queryLanguage.** Algolia `queryLanguages: ["nb"]` gir
   ordklasse-stripping og stemming på norsk ut av esken. Meilisearch +
   Typesense krever custom-oppsett; Supabase FTS trenger egen
   `norwegian`-config på hver indeks.

3. **Facets for kategori + merke.** Paper-design krever "KATEGORIER"-kolonne
   med tellinger per kategori. Algolia leverer dette via `attributesForFaceting`
   i én request. Egen implementering i Postgres krever sub-query per facet.

4. **Ytelse og drift.** Vercel-edge + Algolia-edge gir <50ms P95 globalt
   uten egen infrastruktur. Å drifte Meilisearch/Typesense betyr
   container-ops vi ikke vil eie.

5. **Insights / analytics.** `search-insights` gir click/conversion-tracking
   som feeder tilbake til ranking. Krever null ekstra infrastruktur og gir
   ranking som forbedrer seg over tid.

**Trade-off vi godtar:** SaaS-låsinn og månedlige kostnader (estimert
~$50–150/måned basert på chef-storefront sin bruk ved sammenlignbar katalog-
størrelse). Ved eksponentiell vekst vurderer vi Meilisearch Cloud eller
self-hosted — index-shape er plattform-agnostisk så migrering er mulig
uten frontend-endring.

## Konsekvenser

**Positive:**

- `/komponenter/search/*` kan bygges direkte på `algoliasearch/lite` +
  `search-insights` uten abstraksjonslag.
- `react-instantsearch` står klar for `/sok`-siden når vi utvider fra
  overlay-only til full results-page.
- Index-sync gjenbruker chef-storefront sitt pattern (fire-and-forget via
  Next.js `after()`, JobTracker, paginated fetches) men kilden er Supabase-
  speilet (ikke Woo-REST direkte) — raskere og mindre belastning på Woo.

**Negative / krav:**

- `NEXT_PUBLIC_ALGOLIA_APP_ID`, `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY`,
  `NEXT_PUBLIC_ALGOLIA_INDEX_NAME`, `ALGOLIA_ADMIN_API_KEY` må være satt i
  `.env.local` og Vercel før søk fungerer. Uten nøkler rendres
  overlay-UI-et, men `search()`-kall returnerer 0 hits.
- Admin-key går bare til serveren (sync-cron). Spec-check i
  `lib/search/client.ts` skiller browser-trygge `liteClient` fra server-side
  admin-klient, tilsvarende `createServiceRoleClient` i Supabase-laget.
- `/api/cron/sync-algolia` må ligge bak `CRON_SECRET` (se internal-web sin
  `withCronLogging`-pattern).

## Referanser

- chef-storefront implementering: `/Users/alexanderaagreen/chef-storefront/chef-storefront`
  - `components/SearchOverlay.tsx` — overlay-pattern vi porter
  - `app/api/sync/algolia/route.ts` — sync-pipeline
  - `app/search/search-client.tsx` — full-page (fremtidig)
- Paper-artboards: `8TL-0` (Desktop Alt.1), `8Q9-0` (Mobile)
- Oppdatert `CLAUDE.md` > "Stack (kort)" fra TBD → Algolia.
