# Data-modell

> ⚠️ WIP — skjemaet bygges i Fase 2 (datalag). Dette er skissen basert på samtalen så langt. Oppdater når migrasjoner skrives.

## Prinsipper

- **Supabase speiler Woo** — alle feltnavn og typer i Supabase-tabellene er valgt for å mappe enkelt til/fra Woo REST-responser.
- **Snake_case** for kolonner (Postgres-konvensjon, matcher Woo).
- **UUID-er** brukes ikke for speilede entiteter — vi bruker Woo's ID (`int`) som primærnøkkel slik at sync er deterministisk.
- **`source_*`-kolonner** lagrer hele Woo-responsen som JSONB for feilsøking og re-mapping uten re-sync.
- **`synced_at`** på hver rad — siste gang vi mottok oppdatering fra Woo.

## Skisse av tabeller

### `products`

```sql
CREATE TABLE products (
  id            bigint PRIMARY KEY,              -- Woo product ID
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  short_description text,
  sku           text,
  type          text NOT NULL,                   -- simple | variable | grouped
  status        text NOT NULL,                   -- published | private | draft
  price         numeric(10,2),                   -- for simple products; varianter har egen pris
  regular_price numeric(10,2),
  sale_price    numeric(10,2),
  stock_quantity int,
  stock_status  text,                            -- in_stock | out_of_stock | on_backorder
  weight_g      int,
  categories    bigint[] NOT NULL DEFAULT '{}',  -- FK-array til categories.id
  images        jsonb NOT NULL DEFAULT '[]',     -- [{url, alt, width, height}, ...]
  attributes    jsonb NOT NULL DEFAULT '[]',
  seo_title     text,
  seo_description text,
  source_payload jsonb NOT NULL,                 -- full Woo-respons
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_categories ON products USING GIN (categories);
CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('norwegian', name || ' ' || coalesce(description, '')));
```

### `product_variations`

```sql
CREATE TABLE product_variations (
  id            bigint PRIMARY KEY,              -- Woo variation ID
  parent_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku           text,
  price         numeric(10,2),
  regular_price numeric(10,2),
  sale_price    numeric(10,2),
  stock_quantity int,
  stock_status  text,
  weight_g      int,
  attributes    jsonb NOT NULL DEFAULT '{}',     -- {"lengde": "20cm", "farge": "svart"}
  image         jsonb,                           -- {url, alt, ...}
  source_payload jsonb NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_variations_parent ON product_variations(parent_id);
```

### `categories`

```sql
CREATE TABLE categories (
  id            bigint PRIMARY KEY,              -- Woo category ID
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  parent_id     bigint REFERENCES categories(id) ON DELETE SET NULL,
  image         jsonb,
  seo_title     text,
  seo_description text,
  display_order int,
  source_payload jsonb NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
```

### `reviews` (hvis vi speiler, se business-logic)

```sql
CREATE TABLE reviews (
  id            bigint PRIMARY KEY,              -- Woo review ID
  product_id    bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  rating        int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content       text,
  verified      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL,
  source_payload jsonb NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_product ON reviews(product_id);
```

### `product_associations` (relaterte / kjøpt-sammen)

Forhåndsberegnet via nattlig cron fra Woo-ordredata.

```sql
CREATE TABLE product_associations (
  source_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind          text NOT NULL,                   -- 'bought_together' | 'similar' | 'cross_sell'
  score         numeric(5,4) NOT NULL,           -- 0..1
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, target_id, kind)
);
```

### `cron_job_runs`

Samme mønster som internal-web (se `lib/cron-logger.ts`).

```sql
CREATE TABLE cron_job_runs (
  id            bigserial PRIMARY KEY,
  job_name      text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  duration_ms   int,
  status        text NOT NULL,                   -- running | success | error
  http_status   int,
  result        jsonb,
  error_message text,
  trigger_source text NOT NULL DEFAULT 'vercel'  -- vercel | manual | webhook
);

CREATE INDEX idx_cron_runs_job ON cron_job_runs(job_name, started_at DESC);
```

### `site_config`

Nøkkel/verdi-tabell for redaksjonell site-wide konfig som ikke passer inn i katalog-mirroren. Førstebruker: primær-navigasjon (header + mega-menu + mobile drawer).

```sql
CREATE TABLE site_config (
  key         text PRIMARY KEY,               -- snake_case, f.eks. "nav_primary"
  value       jsonb NOT NULL,                 -- schema dokumentert i TS (Zod)
  description text,                           -- fri-tekst for Studio-editor
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

RLS: public read (ingen hemmeligheter i menyen), skrive-tilgang via service-role.

Frontend leser via `lib/nav/fetch.ts` med to-lags cache: Upstash Redis → resolver over `wp_menus`-snapshot + `site_config.nav_primary`-overlay. Overlay-blobben valideres med Zod (`lib/nav/schema.ts`); feiler validering faller vi tilbake til `DEFAULT_NAV_OVERLAY` (editorial default). Katalog-delen har bevisst ingen hardkodet fallback — hvis `wp_menus` er tom returnerer `getPrimaryNav()` `null` og headeren rendres uten nav-items (med synlig dev-warning). Tidligere hadde vi en `DEFAULT_NAV_PRIMARY`-fallback som ble fjernet fordi den maskerte sync-feil.

### `webhook_events`

Loggføring av alle webhooks fra Woo, Vipps, Stripe for feilsøking og replay.

```sql
CREATE TABLE webhook_events (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL,                   -- woo | vipps | stripe
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending', -- pending | success | error
  error_message text
);

CREATE INDEX idx_webhook_events_source ON webhook_events(source, received_at DESC);
```

## TypeScript-typer

Typene lever i `types/` og speiler skjemaet. Bruk Supabase CLI til å generere typer:

```bash
npx supabase gen types typescript --project-id <prosjekt-id> > types/supabase.ts
```

Derivat-typer (f.eks. `ProductWithVariations`) skrives manuelt i `types/product.ts`.

## Migrasjonsstrategi

- Migrasjoner ligger i `supabase/migrations/` (Supabase CLI-konvensjon).
- Alle migrasjoner er idempotente og kan rulles fremover (ikke backwards).
- Navngiving: `YYYYMMDDHHMMSS_kort_beskrivelse.sql`.
- Branching: hver PR får egen Supabase-branch med migrasjoner anvendt (via Supabase branching).

## Backup og restore

- Supabase tar daglig backup automatisk (pro-plan).
- Point-in-time recovery: 7 dager (pro-plan).
- Vi skal aldri bulk-slette fra Woo uten å sjekke backup først, for sikkerhets skyld.
