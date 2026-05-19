# SEO

> **Prinsipp:** Best-in-class SEO. Core Web Vitals i grønt på alle viktige sidetyper. Strukturerte data på produkt- og kategorisider. Ingen tekniske fallgruver (stray noindex, feil canonical, duplicate content, broken redirects).

## Rangerings-kriterier vi optimerer for

| Område | Mål | Hvor |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.0s p75 | Landings, kategori, produkt |
| CLS (Cumulative Layout Shift) | < 0.05 p75 | Alle sider |
| INP (Interaction to Next Paint) | < 150 ms p75 | Alle sider |
| Lighthouse Performance | ≥ 95 | Produkt + kategori mobil |
| Lighthouse SEO | 100 | Alle sider |
| Lighthouse Accessibility | ≥ 95 | Alle sider |
| Indeksering | 100 % av kjerne-URLer | Kontroll via Search Console |

## URL-struktur

Flat, leselig, semantisk. Aldri query-params for kjerne-innhold.

| Sidetype | Mønster | Eksempel |
|---|---|---|
| Landingsside | `/` | `skarpekniver.no/` |
| Kategori | `/{kategori-slug}` | `/kokkekniver` |
| Under-kategori | `/{kategori}/{subkat}` | `/kokkekniver/japanske` |
| Produkt | `/{kategori}/{produkt-slug}` | `/kokkekniver/global-g2` |
| Blogg-indeks | `/guider` | `/guider` |
| Blogg-innlegg | `/guider/{slug}` | `/guider/velg-riktig-kokkekniv` |
| Søk | `/sok?q={query}` | `/sok?q=japansk` (noindex) |
| Kurv | `/handlekurv` | noindex |
| Checkout | `/kasse` | noindex |
| Konto | `/konto/*` | noindex |

Slugs er Woo-slug. Vi overstyrer i Supabase hvis Woo-slug er dårlig SEO (oppdateres tilbake til Woo).

## Metadata

Default i `app/layout.tsx` via `export const metadata`. Overstyres per side via `generateMetadata()`.

### Per sidetype

```ts
// Produktside
{
  title: `${produkt.name} – Skarpekniver`,
  description: `${produkt.short_description ?? produkt.description.slice(0, 155)}`,
  openGraph: {
    title: `${produkt.name}`,
    description: ...,
    images: [{ url: produkt.primary_image, width: 1200, height: 1200 }],
    type: 'product',
  },
  twitter: { card: 'summary_large_image', ... },
  alternates: {
    canonical: `https://skarpekniver.no/${kategori.slug}/${produkt.slug}`,
  },
}
```

### Tittel-konvensjoner

- Produkt: `{Produktnavn} – Skarpekniver`
- Kategori: `{Kategori} – Skarpekniver`
- Landing: `Skarpekniver – Kokkekniver og slipeutstyr`
- Blogg-artikkel: `{Tittel} – Skarpekniver Guider`

Maks 60 tegn der mulig for full visning i SERP.

### Description-konvensjoner

- 140-160 tegn, naturlig språk.
- Ikke keyword-stuffing.
- Inkluder "Fri frakt fra X kr" eller annet konkret value-prop hvis plass.

## Strukturerte data (JSON-LD)

Emittes som `<script type="application/ld+json">` i `<head>`.

### Produktside — `Product` + `Offer` + `AggregateRating`

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Global G-2 Kokkekniv 20 cm",
  "image": ["..."],
  "description": "...",
  "brand": { "@type": "Brand", "name": "Global" },
  "sku": "G-2",
  "gtin13": "1234567890123",
  "offers": {
    "@type": "Offer",
    "url": "https://skarpekniver.no/kokkekniver/global-g2",
    "priceCurrency": "NOK",
    "price": "1290.00",
    "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition"
  },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "reviewCount": "47" }
}
```

### Kategoriside — `ItemList` + `BreadcrumbList`

### Alle sider — `BreadcrumbList` + `Organization`

Valider med Google Rich Results Test + Schema.org validator. CI-steg som feiler build hvis validering feiler.

## Canonical & alternate

- Alle sider har explicit `canonical` til seg selv (ingen søppel-params).
- `hreflang`: kun `nb-NO` ved lansering (se `adr/0005`).

## Robots & indeksering

- `/robots.txt` (generert via `app/robots.ts`):
  - Allow: `/`, `/kokkekniver`, `/guider`, osv.
  - Disallow: `/sok`, `/handlekurv`, `/kasse`, `/konto`, `/api`.
  - Sitemap-pekere.
- `/sitemap.xml` (generert via `app/sitemap.ts`):
  - Alle produktsider (fra Supabase-spørring).
  - Alle kategorisider.
  - Alle blogg-artikler.
  - Landings- og statiske sider.
  - `lastmod` fra `updated_at` i Supabase.

## Bilde-SEO

- `alt` påkrevd på alle produktbilder (fra Woo, med fallback til produktnavn).
- `next/image` med eksplisitte dimensjoner (CLS-beskyttelse).
- Dominerende (LCP) bilde: `priority` + `fetchPriority="high"`.
- WebP/AVIF automatisk via `next/image`.

## Performance-garantier

### Landing, kategori, produkt

- **SSG eller ISR** (ikke dynamic) — se `architecture.md` > "Rendering-strategi".
- **Ingen client-side JS** for kjerneinnhold — produktliste, produktbeskrivelse, pris, bilder er i initial HTML.
- **LCP-bilde pre-loadet** via Next.js image-priority.
- **Minimalt CSS** — Tailwind 4 med JIT, kun klasser som brukes.
- **Skrifter**: `next/font` med `display: swap`, preload kritiske varianter.
- **Tredjeparts-scripts** lastes via `next/script` med `strategy="lazyOnload"` — aldri blokkerende.

### Lighthouse CI

Kjører på hver PR. Budget-fil setter minimum scores:

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 1.0 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }]
      }
    }
  }
}
```

## Migrering fra eksisterende butikk (301-kart)

Se `adr/0006`. Prosess:

1. **Hent sitemap** fra eksisterende skarpekniver.no (`/sitemap.xml` eller Screaming Frog).
2. **Bygg mapping** — hver gammel URL til ny URL (produkt → ny produkt-URL, kategori → ny kategori-URL).
3. **Lagre i `config/redirects.json`** — enkel key-value.
4. **Vercel-redirects** eller `next.config.ts` `redirects()`. Vurder volume — Vercel tillater flere tusen, men for 10k+ er egen middleware bedre.
5. **Pre-launch test** — script som curler hver gammel URL og asserter 301 → riktig ny URL.
6. **Post-launch** — monitor Search Console 404-rapporter, Vercel Analytics for trafikk-dropp.

## Analytics og overvåking

- **Google Search Console** — verifiser ny versjon, send ny sitemap, overvåk indekseringsstatus og 404-rapport.
- **GA4 eller Plausible** — TBD, se `integrations.md`.
- **Vercel Web Analytics** — Core Web Vitals real-user monitoring.
- **Lighthouse CI** — regresjonsfangst på hver PR.

## Vanlige fallgruver vi unngår

- ❌ Query-params som del av kanonisk URL.
- ❌ Duplicate content (samme produkt i flere kategorier uten canonical til én).
- ❌ `noindex` i staging som ved uhell deployes til prod (håndteres via env-variabel + CI-sjekk).
- ❌ 404 på eksisterende URL-er uten redirect.
- ❌ JS-avhengig hovedinnhold (skjuler innhold for Googlebot).
- ❌ Lazy-loaded LCP-bilde.
- ❌ Feil `lang`-attributt (`en` i stedet for `nb-NO`).
