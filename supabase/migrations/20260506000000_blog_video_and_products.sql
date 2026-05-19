-- =============================================================================
-- 20260506000000_blog_video_and_products.sql
-- =============================================================================
-- "Video"-varianten av artikkel-siden (Paper ERU-0/EZ7-0):
--   - Pinned video-sidebar (desktop) / inline video (mobile)
--   - Innholdsfortegnelse generert fra h2-er i content
--   - Inline "Relaterte produkter"-blokk
--
-- video_url:           Direkte YouTube-URL (eller annen kilde) — vises i sidebar.
--                      NULL = artikkelen er en standard tekst-artikkel uten video.
-- related_product_ids: Array av Woo product IDs som vises i "Relaterte produkter"-
--                      boksen i artikkelen. Tom = ingen blokk vises.
--
-- Begge populeres via post-meta i WP (skn_video_url, skn_related_product_ids)
-- og synkes i blog-cron.
-- =============================================================================

alter table public.blog_posts
  add column if not exists video_url text,
  add column if not exists related_product_ids bigint[] not null default '{}';

comment on column public.blog_posts.video_url is
  'Valgfri video-URL (YouTube/Vimeo) som vises som pinned sidebar på artikkelsiden. '
  'Settes via post-meta skn_video_url i WP.';

comment on column public.blog_posts.related_product_ids is
  'Array av Woo product IDs som vises i "Relaterte produkter"-blokken i artikkelen. '
  'Settes via post-meta skn_related_product_ids (kommaseparert) i WP.';

create index if not exists idx_blog_posts_related_product_ids
  on public.blog_posts using gin (related_product_ids);
