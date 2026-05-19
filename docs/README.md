# Skarpekniver Webshop — Dokumentasjon

Denne mappen inneholder all teknisk og forretningsmessig dokumentasjon for webshop-prosjektet. Alle AI-agenter og utviklere som jobber på prosjektet skal lese relevante dokumenter _før_ de gjør endringer.

## Innholdsfortegnelse

### Kjerne-dokumenter

| Fil | Hva det dekker |
|---|---|
| [`architecture.md`](./architecture.md) | Systemdiagram, dataflyt, service-grenser |
| [`business-logic.md`](./business-logic.md) | Lager, pris, ordre, sync-regler, grensetilfeller |
| [`data-model.md`](./data-model.md) | Supabase-skjema, TypeScript-typer, migrasjoner |
| [`design-system.md`](./design-system.md) | Tailwind-tokens, farger, typografi, spacing, radius |
| [`paper-token-map.md`](./paper-token-map.md) | **Faktiske Paper computed styles → Tailwind. Slå opp her FØR du skriver radius/padding/border.** |
| [`brandbook.md`](./brandbook.md) | Tone of voice, copy-prinsipper, norsk språkguide |
| [`components.md`](./components.md) | Komponent-inventar, når-bruke-hva, Storybook-pekere |
| [`seo.md`](./seo.md) | URL-struktur, metadata, strukturerte data, sitemap |
| [`integrations.md`](./integrations.md) | WooCommerce, Supabase, Redis, Vipps, Stripe, Vercel, analytics |
| [`conventions.md`](./conventions.md) | Navngiving, kodestil, commit-meldinger, branch-strategi |

### Architecture Decision Records (ADRs)

Irreversible eller dyre-å-reversere beslutninger dokumenteres som ADR-er. Se [`adr/README.md`](./adr/README.md) for format.

Gjeldende ADRs:

1. [`0001-shadow-database-pattern.md`](./adr/0001-shadow-database-pattern.md) — Hvorfor Supabase speiler Woo
2. [`0002-isolate-from-internal-web.md`](./adr/0002-isolate-from-internal-web.md) — Eget repo, Vercel, DB
3. [`0003-customer-accounts-in-woo.md`](./adr/0003-customer-accounts-in-woo.md) — Ikke Supabase Auth
4. [`0004-custom-checkout.md`](./adr/0004-custom-checkout.md) — Vipps/Stripe direkte, ikke Woo-checkout
5. [`0005-market-norway-only.md`](./adr/0005-market-norway-only.md) — Kun NO ved lansering
6. [`0006-relaunch-with-301-map.md`](./adr/0006-relaunch-with-301-map.md) — SEO-migrering fra gammel butikk

### Runbooks (kommer)

Operasjonelle prosedyrer (f.eks. "hvordan kjøre reconciliation manuelt", "hva gjør du hvis Woo-webhooks faller ut") vil legges i `runbooks/` når vi bygger dem.

## Prinsipper for denne dokumentasjonen

- **Kort, konkret, oppdatert.** Lange prosa-seksjoner som ikke leses vedlikeholdes ikke. Foretrekk tabeller, lister og kode-eksempler.
- **"Hvorfor" over "hva".** Koden viser hva. Docs skal forklare hvorfor det er sånn.
- **Flagg usikkerhet.** Hvis en seksjon er antagelser eller WIP — merk det tydelig med `> ⚠️ WIP` eller `> 🔍 Antagelse:`.
- **Versjoner når det er kritisk.** Hvis en avhengighet har breaking changes mellom versjoner, nevn hvilken versjon regelen gjelder.

## Hvordan holde docs oppdatert

Når du endrer noe:

1. Hvis endringen påvirker en eksisterende doc — oppdater docen i samme PR.
2. Hvis endringen innfører et nytt mønster som ikke finnes i noen doc — opprett eller utvid relevant fil.
3. Hvis beslutningen er dyr å reversere — skriv en ADR.
4. Oppdater `CLAUDE.md` i rota hvis endringen påvirker hvordan agenter skal navigere prosjektet.
