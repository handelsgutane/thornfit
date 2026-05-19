-- =============================================================================
-- 20260422200000_site_config.sql
-- =============================================================================
-- `site_config` — nøkkel-verdi-tabell for redaksjonell site-wide konfig som
-- ikke passer inn i katalog-mirroren. Førstebruker: primær-navigasjon (header
-- + mega-menu + mobile drawer) som EDITORIAL OVERLAY (ikke selve menyen —
-- selve menyen kommer fra wp_menus, og resolveren slår overlay på toppen).
--
-- Hvorfor en egen tabell og ikke bare hardkode i repo:
--   - Editorial innhold (kort, utility-messages, overrides) må kunne
--     redigeres uten deploy.
--   - Supabase Studio gir en JSON-editor som Alexander kan bruke direkte.
--   - Frontend har en bundled default (lib/nav/default.ts) som fallback hvis
--     raden mangler eller Supabase er nede — så menyen er aldri "borte".
--
-- Strukturen er nøkkel/verdi med jsonb — bevisst fleksibel, validering gjøres
-- i TS med Zod (lib/nav/schema.ts). Hvis schema bumpes, oppdater både
-- lib/nav/schema.ts OG default-seedet i lib/nav/default.ts.
--
-- Idempotent — kan kjøres flere ganger i lokale/branch-miljøer uten feil.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: site_config
-- ---------------------------------------------------------------------------
create table if not exists public.site_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.site_config is
  'Nøkkel/verdi-konfig for redaksjonelt innhold (nav, banners, o.l.). Schema valideres i TS via Zod.';
comment on column public.site_config.key is
  'Logisk navn. Konvensjon: snake_case, stabilt over tid. F.eks. "nav_primary".';
comment on column public.site_config.value is
  'Innholdet. Schema dokumentert i lib/nav/schema.ts (eller tilsvarende per key).';
comment on column public.site_config.description is
  'Kort fri-tekst for editor i Supabase Studio. Ikke brukt av appen.';

drop trigger if exists trg_site_config_updated_at on public.site_config;
create trigger trg_site_config_updated_at
  before update on public.site_config
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Public read er OK — menyen er synlig for alle uansett, ingen hemmeligheter.
-- Skrive-tilgang går via service-role (frontend leser; intern editor skriver).
alter table public.site_config enable row level security;

drop policy if exists "Anyone can read site_config" on public.site_config;
create policy "Anyone can read site_config"
  on public.site_config
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Seed: nav_primary (v2 — editorial overlay)
-- ---------------------------------------------------------------------------
-- Denne JSON-blobben SKAL matche DEFAULT_NAV_OVERLAY i lib/nav/default.ts.
-- Hvis de divergerer, "vinner" Supabase-raden på runtime, men nye databaser
-- og fallback-siden vil ha default-verdien. Oppdater begge samtidig ved
-- schema-endringer.
--
-- v2-format: dette er en OVERLAY, ikke selve menyen. Selve item-listen
-- bygges fra wp_menus-snapshots av resolveren (lib/nav/resolve.ts).
--
-- on conflict do nothing: hvis raden allerede finnes (fordi Alexander har
-- redigert den i Studio), la den stå. Seed er bare en startverdi, ikke en
-- overstyring.
-- ---------------------------------------------------------------------------
insert into public.site_config (key, value, description) values (
  'nav_primary',
  $seed_json$
  {
    "version": 2,
    "utility": [
      "Gratis frakt over 1 500 kr",
      "Knivsliping i Oslo og per post",
      "Rask levering 1–3 virkedager"
    ],
    "itemOverrides": {
      "/knivtyper": {
        "label": "Kniver",
        "overview": {
          "title": "Oversikt",
          "lead": {
            "title": "Alle kjøkkenkniver",
            "sub": "Se alle våre japanske kniver",
            "href": "/knivtyper"
          },
          "links": [
            { "label": "Våre bestselgere", "href": "/bestselgere" },
            { "label": "Våre lokale japanske smeder", "href": "/smeder" },
            { "label": "Unike one-offs / custom kniver", "href": "/custom" },
            { "label": "Knivsett", "href": "/knivsett" }
          ]
        },
        "editorial": {
          "title": "Redaksjonelt",
          "card": {
            "decorative": "包丁",
            "title": "Hvilken kniv passer for deg?",
            "body": "Vår guide hjelper deg finne rett kniv til ditt nivå og bruk.",
            "cta": { "label": "Les vår knivguide →", "href": "/guide/hvilken-kniv" }
          },
          "services": {
            "title": "Tjenester",
            "links": [
              { "label": "Knivsliping i Oslo", "href": "/knivsliping/oslo" },
              { "label": "Knivsliping i posten", "href": "/knivsliping/posten" },
              { "label": "Slipekurs — se datoer", "href": "/slipekurs" }
            ]
          }
        }
      }
    },
    "virtualItems": [
      {
        "label": "Tilbud",
        "href": "/tilbud",
        "accent": true,
        "position": "end"
      }
    ]
  }
  $seed_json$::jsonb,
  'Primær-navigasjon (header desktop + mega menu + mobile drawer) — editorial overlay. Schema: lib/nav/schema.ts (NavOverlaySchema).'
)
on conflict (key) do nothing;
