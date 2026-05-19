# 0002 — Isolasjon fra internal-web (eget repo, Vercel-prosjekt, database)

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander + Claude

## Kontekst

`internal-web` (`/Users/alexanderaagreen/projects/internal-web`) er det interne admin-verktøyet for Skarpekniver: lager-plukking, packing-statistikk, Nexi-import, cron-jobber, Slack-integrasjoner. Det kjører allerede i produksjon på Vercel med RetoolDB som Postgres.

Vi må bestemme hvor den nye webshoppen lever:

1. **Monorepo (Turborepo/pnpm workspaces)** sammen med internal-web, delt deployment.
2. **Samme repo, forskjellige Vercel-prosjekter.**
3. **Eget repo, eget Vercel-prosjekt, egen database (valgt).**

## Beslutning

Webshoppen lever i et helt separat repo (`skarpekniverv3`) med eget Vercel-prosjekt og egen Supabase-instans. Ingen runtime-avhengighet mellom webshop og internal-web.

Hvis vi må dele kode (f.eks. typedefinisjoner for ordre): vurder npm-pakke eller kopier med kilde-referanse i kommentar.

## Konsekvenser

### Positive

- Ingen spillover-risiko: bug eller deployment i internal-web kan ikke ta ned butikken og omvendt.
- Separate CI-pipelines: butikken kan ha strengere Lighthouse-gate, internal-web kan ha løsere performance-krav.
- Separate databaser: RetoolDB har interne tabeller (lager, suppliers, pick_session), Supabase har kun katalog-speil + webhooks. Ingen sammenblanding.
- Ulike Vercel-planer mulig (butikken trenger evt. Enterprise for WAF, internal-web kan bli på Pro).
- Enklere adgangskontroll: butikken er åpen for alle, internal-web er Slack OAuth-gated.

### Negative / trade-offs

- To steder å oppdatere avhengigheter.
- Hvis delt forretningslogikk oppstår (unlikely) — må deles via pakke eller kopi.
- To sett secrets å vedlikeholde.

### Hvordan revidere

Vi revurderer hvis:

- Kodebaseneidentifiserer betydelig delt logikk (mer enn 3-4 moduler).
- Operasjonell overhead av to prosjekter blir påfallende (usannsynlig med 1 utvikler).
- Vi får behov for cross-project analytics der delt DB ville ha hjulpet.
