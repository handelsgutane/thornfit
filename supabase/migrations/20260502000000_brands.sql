-- =============================================================================
-- 20260502000000_brands.sql
-- =============================================================================
-- Speiler WooCommerce product_brand-taksonomien til en egen `brands`-tabell, og
-- knytter produkter til en brand via `products.brand_id` + `products.brand_slug`.
--
-- Bakgrunn: Tidligere har vi parset <h4>Om smeden</h4>-blokker ut av produkt-
-- beskrivelser. Det er duplisert tekst og umulig å gjenbruke (egne brand-sider,
-- schema.org Brand, lister "alle kniver fra denne smeden"). Med en speiltabell
-- er brand source of truth i WP, og frontend trenger bare ett oppslag.
--
-- Custom term-meta (skn_brand_region/founded/stats/video_url/hero_image)
-- registreres via mu-plugin (docs/wp-snippets/skn-brand-meta.php) og leses av
-- mapper'en på samme form som product_cat sin section_tag_slugs-meta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id              bigint primary key,                                 -- Woo term ID
  slug            text unique not null,
  name            text not null,
  description     text,
  image           jsonb,                                              -- Woo `image`-feltet (thumbnail)
  region          text,                                               -- skn_brand_region
  founded         text,                                               -- skn_brand_founded
  stats           jsonb,                                              -- skn_brand_stats (array av {num,label})
  video_url       text,                                               -- skn_brand_video_url
  hero_image_url  text,                                               -- skn_brand_hero_image
  source_payload  jsonb not null,
  synced_at       timestamptz not null default now()
);

comment on table public.brands is
  'WooCommerce product_brand-taksonomien speilet fra Woo REST API. '
  'Innebygde felt + custom term-meta (region/founded/stats/video/hero_image).';

create index if not exists idx_brands_slug on public.brands(slug);

alter table public.brands enable row level security;

drop policy if exists "Anyone can read brands" on public.brands;
create policy "Anyone can read brands"
  on public.brands
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- products.brand_id + products.brand_slug
-- ---------------------------------------------------------------------------
-- Et produkt kan teoretisk ha flere brands i Woo, men i praksis bruker vi den
-- første. brand_slug er denormalisert for raske lookup-er og for å unngå join
-- i kategoriliste-spørringer.
alter table public.products
  add column if not exists brand_id bigint references public.brands(id) on delete set null,
  add column if not exists brand_slug text;

comment on column public.products.brand_id is
  'FK til brands.id. Settes av sync fra woo.brands[0]. NULL hvis produktet '
  'ikke har en brand assignet i Woo.';

comment on column public.products.brand_slug is
  'Denormalisert kopi av brands.slug. Finnes for å unngå join på liste-sider.';

create index if not exists idx_products_brand_id   on public.products(brand_id);
create index if not exists idx_products_brand_slug on public.products(brand_slug);
