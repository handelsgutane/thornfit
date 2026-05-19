# Supabase

Denne mappa holder skjema-migrasjoner og Supabase CLI-konfig for Skarpekniver-butikken.

All dokumentasjon om datamodellen bor i `docs/data-model.md`. Denne README-en beskriver kun _workflow_ — hvordan du kjører migrasjoner.

## Engangs-oppsett

1. Installer Supabase CLI (binary, ikke npm):
   ```bash
   brew install supabase/tap/supabase
   ```
2. Logg inn:
   ```bash
   supabase login
   ```
3. Initialiser lokal config (lager `supabase/config.toml` hvis den ikke finnes):
   ```bash
   supabase init
   ```
4. Koble mot remote-prosjektet:
   ```bash
   supabase link --project-ref <din-project-ref>
   ```
   `<project-ref>` er den korte strengen i Supabase-URL-en (`https://<ref>.supabase.co`).

## Kjøre migrasjoner

### Mot remote (staging/prod)

```bash
supabase db push
```

Dette kjører alle migrasjoner i `migrations/` som ikke er registrert i remote `supabase_migrations.schema_migrations`-tabellen.

### Lokalt (via Docker)

```bash
supabase start         # starter Postgres + Studio lokalt
supabase db reset      # dropper og re-kjører alle migrasjoner
supabase stop
```

## Lage ny migrasjon

```bash
supabase migration new <kort_beskrivelse>
```

Det lager en fil `migrations/<timestamp>_<beskrivelse>.sql`. Skriv SQL idempotent (`if not exists`, `or replace`) så den tåler re-kjøring.

## Generere TypeScript-typer

Etter at migrasjoner er pushet, regenerer `types/supabase.ts`:

```bash
supabase gen types typescript --project-id <project-ref> > types/supabase.ts
```

## Konvensjoner

- Filnavn: `YYYYMMDDHHMMSS_<snake_case>.sql` (CLI-default).
- Snake_case for kolonner.
- Kommentarer på alle tabeller og ikke-åpenbare kolonner via `comment on ...`.
- RLS er _alltid_ skrudd på. Standard: `select` tillatt for `anon, authenticated`; `insert/update/delete` kun via `service_role` (som bypasser RLS).
- Migrasjoner er forward-only — vi ruller aldri tilbake. Feil fikses med en ny migrasjon.
