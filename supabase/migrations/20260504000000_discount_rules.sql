-- =============================================================================
-- 20260504000000_discount_rules.sql
-- =============================================================================
-- Speil av wp_wdp_discounts (Studio Wombat WC Discounts plugin) til Supabase.
--
-- Vi støtter foreløpig kun `bulk`-typen (Quantity discounts) — det er det
-- Skarpekniver bruker. Andre typer (simple, buyx-gety, etc.) lagres som
-- source_payload men evalueres ikke. Skulle nye regel-typer tas i bruk,
-- utvider vi evaluator i lib/cart/discounts/ uten å røre denne tabellen.
--
-- RLS: public-read. Reglene er ikke hemmelige (de vises på frontend uansett).
-- =============================================================================

create table if not exists public.discount_rules (
  id              bigint primary key,                       -- wp_wdp_discounts.id
  enabled         boolean not null default true,
  type            text not null,                            -- 'bulk' | 'simple' | ...
  name            text not null,
  -- Hvilke produkter regelen gjelder. JSONB-shape:
  --   {
  --     all: boolean,                  // true = alle produkter
  --     product_ids: number[],          // Woo product IDs
  --     skus: string[],
  --     category_slugs: string[],
  --     tag_slugs: string[]
  --   }
  -- Et produkt er eligible hvis det matcher MINST én ikke-tom liste (OR).
  apply_to        jsonb not null default '{}'::jsonb,
  -- 'combined' = tell qty på tvers av eligible produkter
  -- 'per-product' = tell qty per produkt separat
  count_mode      text not null default 'combined' check (count_mode in ('combined', 'per-product')),
  -- Tier-array med [{ starting_quantity, discount_pct }]
  tiers           jsonb not null default '[]'::jsonb,
  start_date      timestamptz,
  end_date        timestamptz,
  source_payload  jsonb not null,                           -- hele plugin-rad'en, raw
  synced_at       timestamptz not null default now()
);

comment on table public.discount_rules is
  'Rabatt-regler speilet fra wp_wdp_discounts. MVP støtter kun type=bulk.';
comment on column public.discount_rules.apply_to is
  'JSON: { all, product_ids, skus, category_slugs, tag_slugs }. Et produkt er '
  'eligible hvis det matcher MINST én av listene (OR-semantikk).';
comment on column public.discount_rules.tiers is
  'Array av { starting_quantity: int, discount_pct: number }, sortert stigende.';

create index if not exists idx_discount_rules_enabled on public.discount_rules(enabled);

alter table public.discount_rules enable row level security;

drop policy if exists "Anyone can read discount_rules" on public.discount_rules;
create policy "Anyone can read discount_rules"
  on public.discount_rules
  for select
  to anon, authenticated
  using (true);
