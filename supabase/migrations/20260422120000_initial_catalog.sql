-- =============================================================================
-- 20260422120000_initial_catalog.sql
-- =============================================================================
-- Første skjema-migrasjon for katalog-speilet:
--   - categories
--   - products
--   - product_variations
-- + updated_at-trigger, indekser, RLS med public read-policies.
--
-- Kilde: docs/data-model.md. Hvis du endrer her, oppdater også data-model.md.
-- Migrasjonen er idempotent (IF NOT EXISTS / OR REPLACE) slik at vi kan kjøre
-- den flere ganger uten feil i lokale/branch-miljøer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generisk trigger — setter updated_at = now() på BEFORE UPDATE.';


-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id               bigint primary key,                                  -- Woo category ID
  slug             text unique not null,
  name             text not null,
  description      text,
  parent_id        bigint references public.categories(id) on delete set null,
  image            jsonb,
  seo_title        text,
  seo_description  text,
  display_order    int,
  source_payload   jsonb not null,                                      -- full Woo-respons
  synced_at        timestamptz not null default now()
);

comment on table public.categories is
  'Produktkategorier speilet fra WooCommerce. Primærnøkkel = Woo ID.';

create index if not exists idx_categories_parent on public.categories(parent_id);
create index if not exists idx_categories_slug   on public.categories(slug);

alter table public.categories enable row level security;

drop policy if exists "Anyone can read categories" on public.categories;
create policy "Anyone can read categories"
  on public.categories
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                 bigint primary key,                                -- Woo product ID
  slug               text unique not null,
  name               text not null,
  description        text,
  short_description  text,
  sku                text,
  type               text not null check (type in ('simple', 'variable', 'grouped')),
  status             text not null check (status in ('published', 'private', 'draft')),
  price              numeric(10, 2),
  regular_price      numeric(10, 2),
  sale_price         numeric(10, 2),
  stock_quantity     int,
  stock_status       text check (stock_status in ('in_stock', 'out_of_stock', 'on_backorder')),
  weight_g           int,
  -- bigint[] i stedet for M2M-tabell: Woo returnerer kategori-IDer som array,
  -- og vi slipper en join for enkle lookups. Ingen FK-constraint er mulig på
  -- array, så vi stoler på at sync holder arrayet i sync med categories-tabellen.
  categories         bigint[] not null default '{}',
  images             jsonb not null default '[]'::jsonb,                -- [{url, alt, width, height}]
  attributes         jsonb not null default '[]'::jsonb,
  seo_title          text,
  seo_description    text,
  source_payload     jsonb not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  synced_at          timestamptz not null default now()
);

comment on table public.products is
  'Produkter speilet fra WooCommerce. Primærnøkkel = Woo ID.';
comment on column public.products.categories is
  'Array av categories.id — ingen FK siden Postgres ikke støtter FK på array.';
comment on column public.products.synced_at is
  'Siste gang denne raden ble synket fra Woo. updated_at oppdateres ved enhver endring, synced_at settes av sync-jobben.';

create index if not exists idx_products_slug        on public.products(slug);
create index if not exists idx_products_status      on public.products(status);
create index if not exists idx_products_categories  on public.products using gin (categories);
-- Full-text søk over name + description med norsk stemming. Brukes av
-- søk-endepunktet (/sok) og eventuelt av related-products cron.
create index if not exists idx_products_search      on public.products
  using gin (to_tsvector('norwegian', name || ' ' || coalesce(description, '')));

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

alter table public.products enable row level security;

-- Publikum ser kun publiserte produkter. Service-role (sync-jobber,
-- internal-admin) går utenom RLS og ser alle statuser.
drop policy if exists "Anyone can read published products" on public.products;
create policy "Anyone can read published products"
  on public.products
  for select
  to anon, authenticated
  using (status = 'published');


-- ---------------------------------------------------------------------------
-- product_variations
-- ---------------------------------------------------------------------------
create table if not exists public.product_variations (
  id                bigint primary key,                                 -- Woo variation ID
  parent_id         bigint not null references public.products(id) on delete cascade,
  sku               text,
  price             numeric(10, 2),
  regular_price     numeric(10, 2),
  sale_price        numeric(10, 2),
  stock_quantity    int,
  stock_status      text check (stock_status in ('in_stock', 'out_of_stock', 'on_backorder')),
  weight_g          int,
  attributes        jsonb not null default '{}'::jsonb,                 -- {"lengde": "20cm", "farge": "svart"}
  image             jsonb,
  source_payload    jsonb not null,
  synced_at         timestamptz not null default now()
);

comment on table public.product_variations is
  'Varianter (f.eks. farge, størrelse) av et produkt. Primærnøkkel = Woo variation ID.';

create index if not exists idx_variations_parent on public.product_variations(parent_id);

alter table public.product_variations enable row level security;

-- Varianter er kun synlige hvis forelder er publisert. EXISTS-subquery mot
-- products.id (PK) er billig — Postgres caches planen.
drop policy if exists "Anyone can read variations of published products"
  on public.product_variations;
create policy "Anyone can read variations of published products"
  on public.product_variations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = parent_id
        and p.status = 'published'
    )
  );
