# Design-system

_Sist synket fra Paper: 2026-04-22_

## Kilde: Paper UI

Designet er ferdigstilt i Paper UI (fil "Friendly canyon", side "components"). Tailwind-config og komponent-stiler skal matche 1:1.

Tokens lever i `app/globals.css` under `@theme`-blokken som Tailwind 4 leser.

---

## Colors

Paper bruker semantiske japanske navn, ikke en numerisk skala (50–900).

### Light mode — Primary theme

| CSS-variabel | Hex | Tailwind | Rolle |
|---|---|---|---|
| `--color-unohana` | `#F5F5F3` | `bg-unohana` | Primary bg / light section bg |
| `--color-shiro` | `#FFFFFF` | `bg-shiro` | Surface / card |
| `--color-aka` | `#FF3333` | `bg-aka` | Accent / CTA |
| `--color-aka-dark` | `#CC2929` | `bg-aka-dark` | Accent hover |
| `--color-kuro` | `#1A1A1A` | `text-kuro` | Primary text |
| `--color-haiiro` | `#6B6B65` | `text-haiiro` | Muted text |
| `--color-sakai` | `#E0E0DC` | `border-sakai` | Border / divider |
| `--color-sumi` | `#2A2A2A` | `bg-sumi` | Dark surface |

### Dark mode — Alternate theme

Samme token-navn, men to verdier endrer seg:

| CSS-variabel | Hex (dark) | Rolle (dark) |
|---|---|---|
| `--color-kuro` | `#1A1A1A` | Primary bg |
| `--color-sumi` | `#2A2A2A` | Secondary bg |
| `--color-haiiro` | `#888880` | Muted text _(endret fra #6B6B65)_ |
| `--color-sakai` | `#333333` | Border / divider _(endret fra #E0E0DC)_ |
| `--color-shiro` | `#FFFFFF` | Primary text |
| `--color-unohana` | `#F5F5F3` | Light section bg |

Dark mode CSS-variabel-override implementeres via `prefers-color-scheme: dark` i `:root` og `@theme inline` — se `globals.css`.

---

## Typography

Primærfont: **Satoshi**. Dekorativfont: **Noto Serif JP**.

**Nåværende oppsett** (`app/layout.tsx`):
- Satoshi lastes fra [Fontshare](https://www.fontshare.com/fonts/satoshi) sin CDN via `<link rel="stylesheet">` med `preconnect`. Vekt 400 og 700.
- Noto Serif JP lastes self-hosted via `next/font/google` (vekt 300, 400, 700, latin-subset). CSS-variabelen `--font-noto-serif-jp` injiseres og leses fra `--font-serif` i `globals.css`.

**Fase 3:** Last ned Satoshi variable woff2 til `public/fonts/` og bytt til `next/font/local` for å eliminere tredjeparts-DNS-roundtrip og få full CSP-kontroll.

### Type scale

| Token | Størrelse | Line-height | Vekt | Letter-spacing | Tailwind |
|---|---|---|---|---|---|
| `--text-display` | 56px | 59px | 700 | −0.03em | `text-display` |
| `--text-h1` | 40px | 44px | 700 | −0.02em | `text-h1` |
| `--text-h2` | 28px | 34px | 700 | −0.02em | `text-h2` |
| `--text-h3` | 20px | 26px | 700 | −0.01em | `text-h3` |
| `--text-body` | 16px | 26px | 400 | 0 | `text-body` |
| body muted | 16px | 26px | 400 | 0 | `text-body text-haiiro` |
| `--text-label` | 11px | 16px | 700 | 0.1em | `text-label uppercase tracking-[0.1em]` |
| decorative | 28px | ~140% | 300 | — | `font-serif font-light text-[28px]` |

> **Merk:** Paper annoterer H3 og Label som vekt 600, men Satoshi har ingen 600-variant — computed styles returnerer 700. Vi bruker 700.

Font-family-tokens:

```css
--font-sans:  "Satoshi", system-ui, sans-serif;   /* → font-sans */
--font-serif: "Noto Serif JP", system-ui, serif;  /* → font-serif */
```

---

## Spacing & Layout

8px base unit · 12-kolonners grid · **1312px** maks innholdsbredde (`--width-content`).

Paper sin sp-skala mapper direkte til Tailwinds 4px-standardskala — ingen egendefinerte spacing-tokens nødvendig:

| Paper | px | Tailwind | Bruksområde |
|---|---|---|---|
| sp-1 | 4px | `p-1` / `gap-1` | Ikon-gap, tett inline |
| sp-2 | 8px | `p-2` / `gap-2` | Element-gap, label–verdi-par |
| sp-3 | 16px | `p-4` / `gap-4` | Komponent-intern padding, grupperte elementer |
| sp-4 | 24px | `p-6` / `gap-6` | Kort-padding, rad-gaps |
| sp-5 | 32px | `p-8` / `gap-8` | Seksjon sub-gruppe gap |
| sp-6 | 48px | `p-12` / `gap-12` | Mellom komponenter på en side |
| sp-7 | 64px | `p-16` / `gap-16` | Seksjons-padding (topp/bunn) |
| sp-8 | 96px | `p-24` / `gap-24` | Hero / side-nivå pusterom |

---

## Border Radius

| CSS-variabel | px | Paper-navn | Tailwind |
|---|---|---|---|
| `--radius-sm` | 2px | r-1 | `rounded-sm` |
| `--radius-md` | 4px | r-2 | `rounded-md` |
| `--radius-lg` | 8px | r-3 | `rounded-lg` |
| `--radius-xl` | 12px | r-4 | `rounded-xl` |
| `--radius-full` | 9999px | r-full | `rounded-full` |

**Viktig:** Knapper, kort og input-felt bruker `rounded-sm` (2px) — ikke standardverdien fra Tailwind.

---

## Border

Tre faste varianter (ikke egne tokens — bruk Tailwind-klasser direkte):

| Navn | Verdi | Tailwind |
|---|---|---|
| border-default | 1px solid `#E0E0DC` | `border border-sakai` |
| border-strong | 2px solid `#1A1A1A` | `border-2 border-kuro` |
| border-accent | 1px solid `#FF3333` | `border border-aka` |

---

## Shadow / Elevation

> ⚠️ Mangler i Paper: Ingen dedikert shadow-skala i design-system-artboardet. Kun ett implisitt nivå funnet i komponent-bruk (ønskeliste-knapp på Product Card):

```css
--shadow-sm: 0px 1px 4px rgba(0, 0, 0, 0.12);
```

Avklar med designer om det finnes flere elevations (card hover, modal, dropdown) og legg til i Paper.

---

## Komponent-tokens

### Buttons

Fire varianter, tre størrelser (lg/md/sm) der relevante.

**btn-primary**

```
Bakgrunn:     bg-aka (#FF3333)
Tekst:        text-shiro (#FFFFFF), 14px / 700 / tracking-[0.02em]
Hover:        bg-aka-dark (#CC2929)
Border-radius: rounded-sm (2px)

lg:  h-[52px] px-8
md:  h-[44px] px-6
sm:  h-[34px] px-4
```

**btn-secondary**

```
Bakgrunn:     transparent
Border:       border border-kuro (1px solid #1A1A1A)
Tekst:        text-kuro, 14px / 700
Border-radius: rounded-sm (2px)
Størrelse:    h-[44px] px-6  (kun md)
```

**btn-ghost**

```
Bakgrunn:     ingen
Border:       ingen
Tekst:        text-kuro, 14px / 700
Border-radius: rounded-sm (2px)
Størrelse:    h-[44px] px-6  (kun md)
```

**btn-disabled**

```
Bakgrunn:     bg-sakai (#E0E0DC)
Tekst:        muted
Border-radius: rounded-sm (2px)
Størrelse:    h-[44px] px-6
```

Eksempel Tailwind-klasser for primary md:

```tsx
<button className="flex items-center justify-center h-[44px] px-6 bg-aka hover:bg-aka-dark text-shiro text-[14px] font-bold tracking-[0.02em] rounded-sm transition-colors">
  Kjøp nå
</button>
```

---

### Input

```
Height:       h-[44px]
Padding:      px-4 (16px)
Border-radius: rounded-sm (2px)
Bakgrunn:     bg-shiro

Default:      border border-sakai
Filled/Focus: border border-kuro
Error:        border border-aka
```

---

### Product Card

**Struktur og dimensjoner**

Kortbredde: 305px i 4-kolonners grid med `max-w-content` (1312px). Fire kort per rad med 24px gap mellom.

```
Bakgrunn:     bg-shiro (#FFFFFF)
Border-radius: rounded-sm (2px)
Overflow:     clip
```

**Bilde**

```
Aspektforhold: aspect-square (1:1)
Bredde:        100% av kortbredden
Object-fit:    cover
```

**Tekstseksjon** (under bildet)

```
Padding:   pt-[14px] px-4 pb-[18px]
Gap:       gap-[3px] mellom rader
```

| Element | Størrelse | Vekt | Farge | Klasser |
|---|---|---|---|---|
| Brand (YOSHIMI KATO) | 10px | 700 | haiiro | `text-[10px] font-bold uppercase tracking-[0.1em] text-haiiro` |
| Produktnavn | 14px | 700 | kuro | `text-[14px] font-bold leading-[1.3] tracking-[-0.01em] text-kuro` |
| Spesifikasjoner (210mm · VG10) | 11px | 400 | haiiro | `text-[11px] text-haiiro` |
| Pris (normal) | 16px | 700 | kuro | `text-[16px] font-bold text-kuro` |
| Pris (rabatt) | 16px | 700 | aka | `text-[16px] font-bold text-aka` |
| Pris (strykepris) | 16px | 400 | haiiro | `text-[16px] text-haiiro line-through` |

**Overlays** (absolut over bildet)

```
Ønskeliste-knapp:
  Posisjon:     absolute top-[10px] right-[10px]
  Størrelse:    32×32px, rounded-full
  Bakgrunn:     bg-shiro
  Skygge:       shadow-sm

Rabatt-badge (f.eks. "-14%"):
  Posisjon:     absolute top-3 left-3
  Padding:      py-[3px] px-2
  Bakgrunn:     bg-aka, text-shiro
  Border-radius: rounded-sm

Utsolgt-badge:
  Posisjon:     absolute top-3 left-3
  Padding:      py-[3px] px-2
  Bakgrunn:     bg-kuro, text-shiro
  Border-radius: rounded-sm
```

---

## Badges & Tags

| Variant | Høyde | Padding | Bakgrunn | Border | Bruk |
|---|---|---|---|---|---|
| stock (På lager) | 24px | px-[10px] | bg-kuro | — | Lagerstatus positiv |
| promo (Tilbud) | 24px | px-[10px] | bg-aka | — | Salgskampanje |
| neutral (Utsolgt, Ny) | 24px | px-[10px] | — | border-sakai | Nøytral status |
| subtle | 24px | px-[10px] | bg-unohana | border-sakai | Filterkategori |
| filter-tag (aktiv) | 32px | px-[10px] | bg-shiro | border-kuro | Aktiv filter med × |

Tekst i alle badges: 10px / 700 / uppercase / tracking-[0.1em].

---

## Konvensjoner (uavhengig av Paper UI)

### Bruk kun Tailwind-klasser

- **Ikke** skriv custom CSS uten gode grunner.
- Hvis en stil gjentas 3+ ganger — lag en komponent eller en `@layer components`-klasse.
- Gradient og animasjoner — tailwind-plugin eller utility, ikke custom CSS.

### Responsive-strategi

- **Mobile-first.** Alle `className`-strenger starter med mobil-størrelse, så `sm:`, `md:`, `lg:` som bygger opp.
- Bryt-punkter: bruk Tailwind-defaults (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`).

### Dark mode — to-lags token-system (ADR-0008)

Shoppen støtter lys og mørk modus helt fra første lansering. Default følger
`prefers-color-scheme`; brukeren kan overstyre via `<ThemeToggle>` som cycler
light → dark → system. `data-theme="light|dark"` på `<html>` + localStorage
`skn-theme` eier state. Pre-hydrerings-script i `app/layout.tsx` setter
attributtet før første paint for å unngå flash.

**Arkitektur:** to lag med tokens.

**Lag 1 — Brand tokens.** Paper-paletten (`unohana`, `shiro`, `kuro`, `sumi`,
`haiiro`, `sakai`, `aka`, pluss nye `sumi-deep`, `sumi-raised`, `haiiro-light`)
er fastfrosne i `@theme`. Brukes kun når fargen er *essens* — f.eks. editorial-
kolonnen i MegaMenu som alltid skal være mørk, aka-CTA, mobile-drawer-overlay,
logo-sirkelen.

**Lag 2 — Semantiske tokens.** Runtime CSS-vars på `:root` som flipper med
mode. Eksponeres via `@theme inline` som Tailwind-utilities:

| Utility                           | Rolle                                      |
| --------------------------------- | ------------------------------------------ |
| `bg-canvas`                       | App-bakgrunn (body)                        |
| `bg-surface`                      | Kort, paneler, header-bakgrunn             |
| `bg-surface-muted`                | Subdued panel (utility-bar, search-box)    |
| `bg-surface-hover`                | Hover på `surface`                         |
| `bg-surface-contrast` + `text-ink-inverse` | Invertert CTA (Kurv-pill)         |
| `bg-surface-contrast-hover`       | Hover på contrast                          |
| `text-ink`                        | Primær tekst                               |
| `text-ink-muted`                  | Sekundær tekst, line-through               |
| `text-ink-subtle`                 | Labels, tertiær tekst                      |
| `border-divider`                  | Border / divider                           |

**Regel:** Default bruker alle komponenter semantic tokens. Brand-tokens kun
der designet dikterer identisk utseende i begge moduser (editorial-kolonne,
aka-CTA, rabatt-badge, drawer-overlay). Se ADR-0008 for beslutningslogg og
full tabell med light/dark-verdier.

**Ikke gjør:** `dark:`-modifiers (Tailwind 4 class-strategi). All tema-logikk
ligger i CSS-var-laget — komponent-klassene er identiske i begge moduser.

### Animasjon

- Bruk Tailwind-transitions (`transition`, `duration-*`, `ease-*`).
- For mer komplekse animasjoner: `framer-motion` eller `motion-one` — TBD, ikke installer før nødvendig.

### Accessibility

- Kontrast **minimum AA** (4.5:1 for normal tekst, 3:1 for stor). Verifiser med axe/Lighthouse.
- Fokus-indikatorer alltid synlige — aldri `outline-none` uten erstatning.
- Alle ikoner med betydning har `aria-label`. Dekorative ikoner har `aria-hidden`.
- Formfelter har synlig label (ikke placeholder som eneste beskrivelse).

## Font-strategi

- `next/font` med `display: 'swap'`, latin-subset.
- Selv-hostet fra Google Fonts via `next/font/google` — ingen eksterne font-requests på runtime.
- Fonten defineres i `app/layout.tsx` og legges som CSS-variabel.

## Ikon-bibliotek

- `lucide-react` (samme som internal-web, konsistent).
- Installer kun når trengs — `npm install lucide-react`.
- Inline SVG for custom-ikoner som ikke finnes i Lucide.

## Bilde-strategi

Se også `architecture.md` > bilde-CDN.

- `next/image` alltid — aldri rå `<img>`.
- LCP-bilde på landingsside og produktside: `priority` + `fetchPriority="high"`.
- Placeholder: `blur` med base64 blurhash (genereres i sync-pipeline).
- Alt-tekst påkrevd (unntak: rent dekorative bilder — bruk `alt=""`).

## Komponent-hierarki (konvensjon)

Se `components.md` for full inventar.

```
components/
  ui/              # Primitiver (Button, Input, Badge) — rent stil, ingen forretningslogikk
  layout/          # Header, Footer, Container, Navigation
  product/         # ProductCard, ProductGallery, VariantSelector, AddToCart
  category/        # CategoryGrid, CategoryHero, FacetFilter
  cart/            # CartItem, CartDrawer, CartSummary
  checkout/        # CheckoutForm, ShippingSelector, PaymentSelector
  account/         # ProfileForm, OrderList, AddressCard
  common/          # SearchBar, Breadcrumbs, Newsletter, Pagination
```

## Copy og typografi

Se `brandbook.md` for språklige retningslinjer.
