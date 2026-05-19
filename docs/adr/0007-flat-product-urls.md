# 0007 — Produkt- og kategori-URLer på rot

**Status:** Vedtatt
**Dato:** 2026-04-22 (oppdatert samme dag)
**Forfattere:** Alexander + Claude

## Kontekst

ADR-0006 skisserte URL-strukturen `/{kategori}/{produkt}` som en naturlig
hierarki-speiling av katalogen og som forenkling av breadcrumb-generering.

Ved implementasjon av første RSC-sider bestemte Alexander å flytte produkter
til rot: `/{produkt-slug}`. Begrunnelse:

- **Kortere URLer** — bedre for deling, trykk-annonser, offline-materiell.
- **SEO-motstandsdyktighet** — produktet beholder samme URL når det flyttes
  mellom kategorier, eller når et produkt ligger i flere kategorier samtidig.
  Dette er standard for større norske e-handelsaktører (Elkjøp, Clas Ohlson).
- **Matching med eksisterende skarpekniver.no** — eksisterende butikk har
  produkter på rot (WooCommerce default er `/product/{slug}/`, men Skarpekniver
  har konfigurert permalinks til `/{slug}/`). 301-kartet blir trivielt: same
  slug, same path.

Ved samme anledning ble kategori flyttet opp fra `/kategori/{slug}` til rot
`/{slug}`, slik at både produkter og kategorier deler rot-namespace.

## Beslutning

- **Produkt-URL:** `/{produkt-slug}` — f.eks. `/kokkekniv-global-g2`.
- **Kategori-URL:** `/{kategori-slug}` — f.eks. `/kokkekniver`. Kategori vinner
  ved slug-kollisjon (se "Kollisjonshåndtering" under).
- **Kategori-oversikt:** `/kategori` (konkret path, ikke kategori-slug).
- **Reserverte rot-paths:** `/produkter` (liste), `/kategori` (oversikt),
  `/handlekurv`, `/kasse`, `/konto`, `/guider`, `/api/*`, `/sitemap.xml`,
  `/robots.txt`. Next.js matcher konkrete paths før dynamic `[slug]`, så disse
  har automatisk forrang.
- **Reserverte slugs:** hvis en kategori eller et produkt i Woo får en slug som
  matcher et reservert path (f.eks. slug `handlekurv`), rendres fortsatt det
  reserverte path-et. Entiteten blir utilgjengelig på URL. Håndteres som
  kuratorregel i Woo, ikke som kode-sjekk.

## Kollisjonshåndtering

Samme slug kan teknisk eksistere i både `categories` og `products` (ulike
tabeller, separate unique-constraints). Ved kollisjon gjelder:

1. **Kategori vinner.** Resolveren i `app/[slug]/page.tsx` sjekker kategori
   først. Dette følger SEO-praksis der kategorier typisk har høyere
   informasjonsverdi (lister flere produkter) og tyngre lenke-profil.
2. **Oppdage kollisjoner tidlig.** Reconciliation-cronen bør logge en warn
   når en produkt-slug matcher en eksisterende kategori-slug (TBD, ikke
   implementert).
3. **Løsning ved konflikt:** endre slug i Woo — produktet blir da utilgjengelig
   på URL til slug er endret.

## Performance

Resolveren kjører `getCategoryBySlug` og `getProductBySlug` i parallell via
`Promise.all`. Begrunnelse:

- Begge oppslag er `eq('slug', ...).maybeSingle()` mot unique-indekser → O(1).
- Dominerende kost er nettverks-RTT til Supabase (EU-region, typisk 10–30 ms).
- Sekvensiell sjekk ville doblet latensen for den tapende tabellen.
- React `cache()` dedupliserer mellom `generateMetadata` og `Page` innenfor
  samme request.

Når Redis-caching kommer (TBD), kan vi cache `slug → { kind, id }` ved edge
for å unngå Supabase-rundtur på varme slugs helt.

## Konsekvenser

**Positivt:**
- Korte, delbare URLer for både produkter og kategorier.
- 301-kartet fra gammel butikk blir trivielt for produkter (sannsynligvis
  også for kategorier; må verifiseres mot gammel permalink-struktur).
- Produkt-flytting mellom kategorier endrer ikke URL → ingen redirects.

**Negativt:**
- Brødsmuler på produktside kan ikke utledes direkte fra URL — må hentes
  fra produktets `categories`-array.
- Dobbelt DB-lookup på hver rot-side (én for kategori, én for produkt). Avhjelpes
  av parallellisering og senere av Redis-cache.
- Navnekollisjon mellom kategori og produkt må håndteres eksplisitt i
  reconciliation-cronen.

## 2026-04-23 — ⚠️ Revurdert: nested paths beholdes

Første forsøk ("flat URL på rot") ble overstyrt i produksjons-testing. WP-menyen
leverer full hierarkisk path (`/bryner-og-knivsliping/slipekurs/`), og Alexander
vil beholde den strukturen 1:1 mot Woo. Konsekvenser:

- Rute-struktur: `app/[slug]/page.tsx` → `app/[...slug]/page.tsx` (catch-all).
- Resolver: tar siste segment fra `slug[]` og slår opp i `categories`/`products`.
  Vi validerer IKKE foreldre-kjeden mot path-segmentene i første iterasjon —
  det betyr at en kategori er teknisk tilgjengelig via flere URL-er (kun den
  Woo-matchende er canonical). Canonical settes i metadata.
- WP-menyens path lagres uendret i `wp_menus.items[].path` — ingen kollapsering.
- 301-kartet fra gammel butikk blir identitets-mapping for katalog-URLer.

### Sitemap + intern-lenker (2026-04-23, senere på dagen)

Sitemap og interne lenker emittet fortsatt flate URL-er etter catch-all-
konverteringen. Rettet ved å introdusere `fetchCategoryPathMap()` i
`lib/supabase/catalog.ts` — én batch-query henter alle kategorier og bygger
`id → { slug, path }`-map ved å gå `parent_id`-kjeden. Map-en brukes av
`listCategoryUrls`, `listPublishedProductUrls`, `listPublishedProducts`,
`listProductsByCategory` og `getProductBySlug`.

Eksterne data-kontrakter utvidet:

- `CatalogCategoryUrl`: `{ slug, path, updatedAt }` (lagt til `path`).
- `CatalogProductUrl`: `{ slug, categoryPath, updatedAt }` (renamet fra
  `categorySlug`).
- `CatalogListItem`: la til `primaryCategoryPath`.
- `CatalogProductDetail`: la til `primaryCategoryPath` og `categoryPaths`.

Konsumenter som bygger href-er nå: `app/sitemap.ts`, `ProductGrid` (kort-link),
`app/[...slug]/page.tsx` (kategori-chips på PDP). Fallback-regel: hvis et
produkt mangler primær-kategori, emitter vi flat `/{slug}` — defensiv mot
data-drift, skal ikke trigge for publiserte produkter.

Redis-cache-nøklene bumpet `v1 → v2` i `lib/cache/catalog.ts` fordi
`CatalogProductDetail`-shapen endret seg. Gamle v1-entries utløper naturlig.

Den opprinnelige "flat på rot"-beslutningen gjelder fortsatt for reserverte
paths (`/kategori`, `/produkter`, `/handlekurv`, …) siden Next.js matcher
statiske ruter først.

## Oppdateringer til eksisterende ADR

ADR-0006 (relaunch) viste til `/{kategori}/{produkt}` som hierarki —
dette erstattes av beslutningen her. ADR-0006 forblir gyldig for selve
relansering-strategien; kun URL-strukturen endres.
