-- =============================================================================
-- 20260505000000_upsell_columns.sql
-- =============================================================================
-- Konfigurerbar upsell på "Vil du ha med?"-boksen på produktdetaljen.
--
-- Lookup-rekkefølge (resolves i frontend):
--   1. products.upsell_product_id              — fra woo.upsell_ids[0]
--   2. categories.default_upsell_product_id    — fra skn_default_upsell_product_id-
--                                                 term-meta på første kategori
--   3. Global hardkodet fallback i app/[...slug]/page.tsx
--
-- Begge FK-er har ON DELETE SET NULL: hvis upsell-produktet slettes i Woo,
-- glemmes referansen stille i stedet for å kaskadere.
-- =============================================================================

alter table public.products
  add column if not exists upsell_product_id bigint
    references public.products(id) on delete set null;

comment on column public.products.upsell_product_id is
  'Foreslått tilleggs-produkt på "Vil du ha med?"-boksen. Speilet fra '
  'WooCommerce upsell_ids[0] (første oppføring). NULL = bruk kategoriens '
  'default eller global fallback.';

create index if not exists idx_products_upsell_product_id
  on public.products(upsell_product_id);


alter table public.categories
  add column if not exists default_upsell_product_id bigint
    references public.products(id) on delete set null;

comment on column public.categories.default_upsell_product_id is
  'Default upsell-produkt for produkter i denne kategorien. Settes via '
  'term-meta skn_default_upsell_product_id på product_cat-taksonomien. '
  'Brukes hvis produktet ikke har egen upsell_product_id satt.';

create index if not exists idx_categories_default_upsell_product_id
  on public.categories(default_upsell_product_id);
