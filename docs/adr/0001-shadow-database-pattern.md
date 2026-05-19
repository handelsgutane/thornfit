# 0001 — Shadow-database pattern (Woo → Supabase → frontend)

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander + Claude

## Kontekst

Den eksisterende skarpekniver.no kjører på WooCommerce. Vi ønsker en ny, lynrask headless frontend i Next.js med topp Lighthouse-score og best-in-class SEO. Frontenden må:

- Rendre statisk (SSG/ISR) på katalog-sider for å være rask nok
- Aldri være avhengig av Woo-oppetid for produktvisning
- Kunne skaleres uten å hamre WP-databasen

Alternativene vi vurderte:

1. **Kall Woo REST direkte** fra Next.js server-komponenter med caching.
   - Enkelt. Men: Woo-REST er treg, fragile under last, og cache-invalidering blir vanskelig å resonere om.
2. **Webhook-dreven cache i Redis/KV** uten egen database.
   - Raskt. Men: ingen strukturert spørring, ingen search, vanskelig å debugge feil-sync.
3. **Shadow-DB (valgt):** Woo → Supabase via webhooks + cron, Next.js leser Supabase.
   - Beste kombinasjon av fart, strukturert spørring, debug-barhet og frakobling.
4. **Migrere bort fra Woo helt.**
   - For stor endring. Woo brukes også av internal-web, regnskap, eksisterende admins.

## Beslutning

Vi bygger en shadow-database i Supabase som speiler produktkatalogen fra Woo. Next.js-frontenden leser nesten alt fra Supabase ved request-tid. Woo forblir "kilde for sannhet" og admin-grensesnitt.

Detaljer:

- **Sync-primær:** Woo webhooks → `POST /api/webhooks/woo` → upsert i Supabase → `revalidateTag()` for ISR.
- **Sync-sikkerhetsnett:** Daglig cron kl. 03:00 UTC som gjør full reconciliation (legger til/fjerner/oppdaterer det webhooks har bommet på).
- **Speilede entiteter:** products, product_variations, categories, reviews, product_associations. Se `data-model.md`.
- **Ikke speilet:** ordre, kunder, kuponger, ønskelister — disse leses direkte fra Woo når nødvendig.

## Konsekvenser

### Positive

- Frontend er lynrask: Postgres-spørring + Vercel edge cache, ingen WP-kall på request.
- Frontend overlever Woo-nedetid for alt som ikke er checkout.
- Vi kan bygge søk, filtre og aggregeringer på egen Postgres uten å røre Woo.
- Debug-barhet: `source_payload` JSONB per rad gir full Woo-respons for feilsøking og re-mapping uten re-sync.

### Negative / trade-offs

- Dobbel datastrøm å vedlikeholde (webhooks + cron).
- Eventual consistency: Supabase kan ligge sekunder-til-minutter bak Woo. Akseptert; se `business-logic.md` > "Grensetilfeller".
- Produktendringer må ha robust invalidering (`revalidateTag`) — ellers viser vi stale data.
- Supabase-skjema må oppdateres når Woo-plugins legger til nye felt.

### Hvordan revidere

Vi revurderer hvis:

- Sync-overhead blir en kilde til dyrt vedlikehold (mer enn 1-2 incidents/måned)
- Woo blir erstattet som admin-system (stor endring — egen ADR)
- Ny Supabase-funksjon lar oss få samme fart uten speiling
