-- =============================================================================
-- 20260424120000_add_product_ratings.sql
-- =============================================================================
-- Legger til rating-kolonner på products for å drive stjerne-raden i
-- produktkortet (Paper 47Q-0 / 48E-0). Woo leverer feltene `average_rating`
-- (string "0.00"–"5.00") og `rating_count` (int) per produkt — vi speiler
-- dem som egne kolonner i stedet for å hale dem ut av `source_payload` ved
-- hver listing (JSONB-ekstrahering i listings er dyrt og umulig å indeksere
-- billig).
--
-- Ingen check-constraint på verdi-range her — vi stoler på at
-- `lib/woo/mappers.ts` normaliserer input, og lax-skjema lar oss unngå
-- uplanlagte insert-feil hvis Woo noen gang leverer utenfor 0–5.
--
-- Migrasjonen er idempotent og backfiller fra source_payload slik at
-- eksisterende rader får verdier uten å trigge full re-sync av katalogen.
-- =============================================================================

alter table public.products
  add column if not exists average_rating numeric(4, 2),
  add column if not exists rating_count   int;

comment on column public.products.average_rating is
  'Gjennomsnittlig vurdering 0–5 (Woo `average_rating`). 0 når produktet ikke har noen reviews — sjekk `rating_count > 0` i UI før render.';
comment on column public.products.rating_count is
  'Antall reviews (Woo `rating_count`). 0 = ingen reviews enda.';

-- Backfill fra source_payload. NULLIF håndterer tom streng fra Woo (nye
-- produkter uten rating-felt); ::numeric/::int caster trygt når verdien
-- finnes. Begrenset til rader som faktisk har feltet i payload så vi ikke
-- overskriver eventuelt allerede satte verdier fra webhooks under rollout.
update public.products
set
  average_rating = nullif(source_payload->>'average_rating', '')::numeric,
  rating_count   = nullif(source_payload->>'rating_count', '')::int
where source_payload ? 'rating_count';
