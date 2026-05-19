-- =============================================================================
-- 20260423100000_wp_menus.sql
-- =============================================================================
-- `wp_menus` — speilet av WordPress sine `/wp/v2/menu-items`-responser, én rad
-- per WP-meny (desktop-primary, mobile-drawer, topbar, osv.).
--
-- Arkitektur:
--   - Sync-cron (/api/cron/sync-wp-menus) puller `/wp/v2/menu-items?menus=<id>`
--     daglig og upserter hele snapshot-et som JSON blob.
--   - Nav-resolver (lib/nav/resolve.ts) leser disse snapshot-ene + overlay
--     fra site_config, bygger NavPrimary, cacher i Redis.
--   - En hel meny lagres som én rad med `items` som jsonb. Vi trenger aldri
--     joine på enkelt-items fra SQL — alltid hele menyen sammen.
--
-- Hvorfor ikke en relasjonell items-tabell:
--   - WP-menuen er iboende en hierarkisk liste som brukes ATOMISK. Det er
--     ingen query-nytte i å splitte den i normaliserte rader.
--   - JSONB gir gratis versjonsrobusthet: hvis WP legger til nye felt, trenger
--     vi ikke migrasjon.
--
-- Idempotent: `create table if not exists`, `on conflict do update`.
-- =============================================================================

create table if not exists public.wp_menus (
  menu_id    integer primary key,         -- WP menu ID (f.eks. 536 = main menu)
  name       text,                         -- Menu name fra WP (cache — ikke autoritativ)
  items      jsonb not null default '[]'::jsonb,
  synced_at  timestamptz not null default now()
);

comment on table public.wp_menus is
  'Speilet av WordPress sine menyer (fra /wp/v2/menu-items). Én rad per meny. `items` er en flat JSONB-array av MenuItem (se lib/wp/menus.ts).';
comment on column public.wp_menus.menu_id is
  'WP menu ID. Skarpekniver: 536=main menu (desktop), 589=Mobilmeny (mobile), 539=topbar meny.';
comment on column public.wp_menus.items is
  'Normaliserte menu-items. Schema dokumentert i lib/wp/menus.ts (MenuItem-typen).';

-- --------------------------------------------------------------------------
-- RLS — public read OK (menyen er synlig for alle uansett). Skrive-tilgang
-- kun via service-role (cron + webhook-handlere).
-- --------------------------------------------------------------------------
alter table public.wp_menus enable row level security;

drop policy if exists "Anyone can read wp_menus" on public.wp_menus;
create policy "Anyone can read wp_menus"
  on public.wp_menus
  for select
  to anon, authenticated
  using (true);
