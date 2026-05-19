-- =============================================================================
-- 20260506000000_category_mega_editorial.sql
-- =============================================================================
-- Editorial-innhold for mega-meny per kategori. Erstatter hardkodet config i
-- lib/nav/default.ts med data fra WooCommerce / WP, slik at redaktører kan
-- endre hovedartikkel og mega-meny-knapper uten kode-deploy.
--
-- Datamodell:
--   - mega_post_id   → FK til blog_posts. Kategoriens redaksjonelle hoved-
--                      artikkel. Tittel/excerpt/slug brukes til editorial-kort.
--                      ON DELETE SET NULL: hvis posten slettes i WP, glemmes
--                      referansen i stedet for å kaskadere.
--   - mega_buttons   → jsonb-array `[{label, url}, ...]`. 0–N knapper rendres
--                      som services-lenker i mega-menyen. Default tom array.
--
-- Konvensjoner: WP mu-plugin lagrer per-knapp-felter
--   skn_mega_button_<n>_label / skn_mega_button_<n>_url, og mapperen bygger
--   jsonb-arrayet ved sync.
-- =============================================================================

alter table public.categories
  add column if not exists mega_post_id bigint
    references public.blog_posts(id) on delete set null;

comment on column public.categories.mega_post_id is
  'WP post-ID som skal vises som hovedartikkel i mega-menyen for denne '
  'kategorien. Settes via term-meta skn_mega_post_id på product_cat. NULL '
  'betyr: bruk hardkodet default fra lib/nav/default.ts.';

create index if not exists idx_categories_mega_post_id
  on public.categories(mega_post_id);


alter table public.categories
  add column if not exists mega_buttons jsonb not null default '[]'::jsonb;

comment on column public.categories.mega_buttons is
  'Knapper som rendres som services-lenker i mega-menyen. Shape: '
  '[{label: string, url: string}, ...]. Default tom array — da brukes '
  'default-config fra lib/nav/default.ts.';
