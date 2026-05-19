-- =============================================================================
-- 20260503000000_blog.sql
-- =============================================================================
-- Speiler WordPress blogg-innhold til Supabase. Bygger på samme arkitektur
-- som products/categories/brands: WordPress er kilde, vi har et speil i
-- Supabase, frontend leser kun fra Supabase.
--
-- Tabeller:
--   - blog_authors      — WP-brukere som har publisert poster
--   - blog_categories   — WP `category`-taxonomy
--   - blog_tags         — WP `post_tag`-taxonomy
--   - blog_posts        — WP `post_type='post'` med status='publish'
--
-- RLS: alle tabellene er public-read. Service-role bypass'er RLS for sync.
-- Se docs/blogg-sync-arkitektur.md for full kontekst.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- blog_authors
-- ---------------------------------------------------------------------------
create table if not exists public.blog_authors (
  id              bigint primary key,                       -- WP user ID
  slug            text unique not null,
  name            text not null,
  description     text,                                     -- Bio fra WP
  avatar_url      text,                                     -- Gravatar eller egen
  role            text,                                     -- editor/author/contributor
  -- Custom meta (skn_author_*) settes via mu-plugin og fylles inn etter behov.
  -- Disse er "kjente" felter vi vet vi vil ha; andre kan legges til senere.
  instagram_url   text,
  linkedin_url    text,
  credentials     text,                                     -- Sertifiseringer/utdannelse
  source_payload  jsonb not null,
  synced_at       timestamptz not null default now()
);

comment on table public.blog_authors is
  'WP-brukere som har publisert blog-poster. Speilet via /wp/v2/users.';

create index if not exists idx_blog_authors_slug on public.blog_authors(slug);

alter table public.blog_authors enable row level security;

drop policy if exists "Anyone can read blog_authors" on public.blog_authors;
create policy "Anyone can read blog_authors"
  on public.blog_authors
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- blog_categories
-- ---------------------------------------------------------------------------
create table if not exists public.blog_categories (
  id              bigint primary key,                       -- WP term ID
  slug            text unique not null,
  name            text not null,
  description     text,
  parent_id       bigint references public.blog_categories(id) on delete set null,
  count           int not null default 0,                   -- Antall poster i kategorien (cached)
  source_payload  jsonb not null,
  synced_at       timestamptz not null default now()
);

comment on table public.blog_categories is
  'WP `category`-taxonomy speilet. Brukes til filter-tabs på /blogg.';

create index if not exists idx_blog_categories_slug on public.blog_categories(slug);
create index if not exists idx_blog_categories_parent on public.blog_categories(parent_id);

alter table public.blog_categories enable row level security;

drop policy if exists "Anyone can read blog_categories" on public.blog_categories;
create policy "Anyone can read blog_categories"
  on public.blog_categories
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- blog_tags
-- ---------------------------------------------------------------------------
create table if not exists public.blog_tags (
  id              bigint primary key,                       -- WP term ID
  slug            text unique not null,
  name            text not null,
  description     text,
  count           int not null default 0,
  source_payload  jsonb not null,
  synced_at       timestamptz not null default now()
);

comment on table public.blog_tags is
  'WP `post_tag`-taxonomy speilet. Brukes til relatering og tag-clouds.';

create index if not exists idx_blog_tags_slug on public.blog_tags(slug);

alter table public.blog_tags enable row level security;

drop policy if exists "Anyone can read blog_tags" on public.blog_tags;
create policy "Anyone can read blog_tags"
  on public.blog_tags
  for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------
create table if not exists public.blog_posts (
  id                bigint primary key,                     -- WP post ID
  slug              text unique not null,
  title             text not null,
  excerpt           text,
  content           text,                                   -- HTML — saniteres ved render-tid
  published_at      timestamptz not null,
  modified_at       timestamptz not null,
  author_id         bigint references public.blog_authors(id) on delete set null,
  -- Featured image som JSONB: { src, alt, width, height }
  featured_image    jsonb,
  -- Array av FK-IDer. Postgres støtter ikke FK på array, men sync holder
  -- arrayet i sync med blog_categories/blog_tags.
  category_ids      bigint[] not null default '{}',
  tag_ids           bigint[] not null default '{}',
  reading_time_min  int not null default 1,                 -- Beregnet i mapper (200 ord/min)
  -- Yoast SEO-felter (samme som products/categories)
  seo_title         text,
  seo_description   text,
  og_image_url      text,
  source_payload    jsonb not null,
  synced_at         timestamptz not null default now()
);

comment on table public.blog_posts is
  'WP-poster (post_type=post, status=publish) speilet fra /wp/v2/posts.';
comment on column public.blog_posts.category_ids is
  'Array av blog_categories.id. Ingen FK siden Postgres ikke støtter FK på array.';
comment on column public.blog_posts.reading_time_min is
  'Beregnet i mapper basert på ord-telling i content (200 ord/min, min 1).';

create index if not exists idx_blog_posts_slug on public.blog_posts(slug);
create index if not exists idx_blog_posts_published_at on public.blog_posts(published_at desc);
create index if not exists idx_blog_posts_author_id on public.blog_posts(author_id);
create index if not exists idx_blog_posts_categories on public.blog_posts using gin (category_ids);
create index if not exists idx_blog_posts_tags on public.blog_posts using gin (tag_ids);

alter table public.blog_posts enable row level security;

drop policy if exists "Anyone can read blog_posts" on public.blog_posts;
create policy "Anyone can read blog_posts"
  on public.blog_posts
  for select
  to anon, authenticated
  using (true);
