-- =============================================================================
-- 20260501000000_product_tags_and_sections.sql
-- =============================================================================
-- Legger til støtte for WooCommerce product tags som seksjoner på kategori-sider.
--
-- Endringer:
--   1. Ny tabell `product_tags` — speiler WooCommerce product_tag-taxonomien
--      med navn og beskrivelse.
--   2. `products.tag_slugs text[]` — hvilke tagger et produkt har (for
--      klient-side filtrering uten join).
--   3. `categories.section_tag_slugs text[]` — ordnet liste over tag-slugs
--      som brukes som seksjoner på kategori-landingssiden. Settes via
--      WooCommerce category custom meta (skn_section_tags).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- product_tags
-- ---------------------------------------------------------------------------
create table if not exists public.product_tags (
  id          bigint primary key,          -- Woo tag ID
  slug        text unique not null,
  name        text not null,
  description text,
  synced_at   timestamptz not null default now()
);

comment on table public.product_tags is
  'WooCommerce product_tag-taxonomien speilet fra Woo REST API. '
  'Beskrivelsen brukes som seksjonsbeskrivelse på kategori-landingssider.';

create index if not exists idx_product_tags_slug on public.product_tags(slug);

alter table public.product_tags enable row level security;

drop policy if exists "Anyone can read product_tags" on public.product_tags;
create policy "Anyone can read product_tags"
  on public.product_tags
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- products.tag_slugs
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists tag_slugs text[] not null default '{}';

comment on column public.products.tag_slugs is
  'Array av product_tags.slug — gjør det mulig å filtrere produkter per tag '
  'klient-side uten join. Synkes fra WooCommerce products.tags[].slug.';

create index if not exists idx_products_tag_slugs
  on public.products using gin (tag_slugs);


-- ---------------------------------------------------------------------------
-- categories.section_tag_slugs
-- ---------------------------------------------------------------------------
alter table public.categories
  add column if not exists section_tag_slugs text[] not null default '{}';

comment on column public.categories.section_tag_slugs is
  'Ordnet liste over tag-slugs som definerer seksjoner på kategori-landing. '
  'Settes i WooCommerce via custom meta "skn_section_tags" (kommaseparert). '
  'Synkes av woo-reconciliation-cronen. Tom = standard grid-visning.';
