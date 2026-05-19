# Komponenter

Inventar over React-komponenter, prinsipper for når hvilken brukes, og hvor de lever i kodebasen.

> ⚠️ WIP — konkrete komponenter bygges i Fase 3. Denne filen definerer struktur og navngiving. Oppdater listene når komponenter faktisk finnes.

## Prinsipper

1. **Server by default.** Komponent er server-component med mindre den trenger interaktivitet.
2. **Én komponent, én ansvar.** Hvis den trenger `Props.variant === "A" ? ... : ...` på mer enn 3 steder — del opp.
3. **Primitiver er dumme.** `ui/Button` bryr seg ikke om handlekurv, produkt eller rute — bare styling og standard props.
4. **Business-komponenter eier flow.** `AddToCartButton` vet om cart-state, variant-valg, lager.
5. **Ingen prop drilling 3+ nivåer.** Bruk context eller flytt state opp.

## Mappestruktur

```
components/
├─ ui/              # Primitiver, rent stil
│   ├─ Button.tsx
│   ├─ Input.tsx
│   ├─ Badge.tsx
│   ├─ Dialog.tsx
│   ├─ Toast.tsx
│   └─ Skeleton.tsx
├─ layout/
│   ├─ Header.tsx
│   ├─ Footer.tsx
│   ├─ Container.tsx
│   └─ Navigation.tsx
├─ product/
│   ├─ ProductCard.tsx
│   ├─ ProductGrid.tsx
│   ├─ ProductGallery.tsx      # Bilder + zoom
│   ├─ ProductPrice.tsx        # Pris m/ kampanjepris-visning
│   ├─ ProductStockBadge.tsx   # "På lager" / "Få igjen (n)" / "Utsolgt"
│   ├─ VariantSelector.tsx     # Size/length/color-valg
│   ├─ AddToCartButton.tsx     # Client — trigger cart-update
│   └─ RelatedProducts.tsx
├─ category/
│   ├─ CategoryGrid.tsx
│   ├─ CategoryHero.tsx
│   ├─ FacetFilter.tsx         # Kategori-filtrering
│   └─ SortDropdown.tsx
├─ cart/
│   ├─ CartDrawer.tsx          # Slide-in fra høyre
│   ├─ CartItem.tsx
│   ├─ CartSummary.tsx
│   └─ MiniCartBadge.tsx       # Antall-indikator i header
├─ checkout/
│   ├─ CheckoutForm.tsx
│   ├─ AddressForm.tsx
│   ├─ ShippingSelector.tsx
│   ├─ PaymentSelector.tsx     # Vipps / Stripe
│   └─ OrderSummary.tsx
├─ account/
│   ├─ ProfileForm.tsx
│   ├─ OrderList.tsx
│   ├─ OrderDetail.tsx
│   └─ AddressCard.tsx
├─ common/
│   ├─ Breadcrumbs.tsx
│   ├─ SearchBar.tsx
│   ├─ Pagination.tsx
│   ├─ NewsletterSignup.tsx
│   ├─ LanguageFallback.tsx    # Feilmelding når ting er på feil språk
│   └─ LoadingSpinner.tsx
└─ seo/
    ├─ JsonLd.tsx              # Structured data injection
    └─ Breadcrumbs.tsx          # Semantisk HTML + JSON-LD
```

## Primitiver (`ui/`)

### Button

- Varianter: `primary | secondary | ghost | disabled`. (`outline` ikke i Paper — bruk `secondary`.)
- Størrelser: `sm | md | lg` (kun primary har alle tre; secondary og ghost har kun md).
- Props: alle HTML button-attributter + `loading`, `icon`, `fullWidth`.
- Brukes aldri for navigasjon (bruk `Link`).

Eksakte størrelser fra Paper:

| Variant | Størrelse | Høyde | PaddingInline | Bakgrunn | Border | Tekst |
|---|---|---|---|---|---|---|
| primary | lg | 52px | 32px | `bg-aka` | — | hvit, 14px/700/0.02em |
| primary | md | 44px | 24px | `bg-aka` | — | hvit, 14px/700/0.02em |
| primary | sm | 34px | 16px | `bg-aka` | — | hvit, 14px/700/0.02em |
| secondary | md | 44px | 24px | transparent | `border-kuro` 1px | kuro, 14px/700 |
| ghost | md | 44px | 24px | ingen | ingen | kuro, 14px/700 |
| disabled | md | 44px | 24px | `bg-sakai` | — | muted |

Border-radius på alle varianter: `rounded-sm` (2px). Hover på primary: `bg-aka-dark`.

### Input

- Varianter: `default | focus | error`.
- Alltid label — bruk `<label>` eksternt eller `aria-label`.
- Error-melding rendres under med `role="alert"`.

Eksakte verdier fra Paper: høyde 44px, `rounded-sm` (2px), `px-4` (16px), `bg-shiro`.

| Tilstand | Border |
|---|---|
| Default | `border border-sakai` (1px #E0E0DC) |
| Filled / Focus | `border border-kuro` (1px #1A1A1A) |
| Error | `border border-aka` (1px #FF3333) |

### IconButton

- Rund ikonknapp. Brukes der en handling er kompakt nok til å stå alene som ikon (lukk, neste, tilbake). Aldri for navigasjon alene — bruk `Link` med synlig label.
- Importeres fra `@/components/ui/IconButton`.

Varianter (alltid `rounded-full`, uavhengig av `rounded-sm`-regelen for firkantede knapper):

| Variant | Default | Hover |
|---|---|---|
| `default` | `border-divider bg-surface text-ink` | `border-aka bg-aka text-shiro` |
| `ghost` | ingen ramme, `text-ink-muted` | `bg-surface-muted text-ink` |

Størrelser: `sm` = 32px (h-8 w-8), `md` = 36px (h-9 w-9). Alltid `focus-visible:ring-2 ring-aka` for tastatur-fokus.

Relatert: `IconButtonCircle` — samme visuelle sirkel som `default`, men rendered som `<span>` (ikke `<button>`). Brukes når hele raden er en `<Link>` og sirkelen bare er en visuell "neste"-indikator. Legg `group` på foreldre-Linken så sirkelen reagerer på row-hover.

### Dialog

- Wrapper rundt Radix UI Dialog (TBD — bekrefte bibliotek).
- Focus trap, ESC-lukking, scroll-lock.
- Brukes for bekreftelser og mini-modaler, ikke for handlekurv (der bruker vi CartDrawer).

### Tag

- **Statusbadge med border** — brukes overalt der en domene-status skal kommuniseres: ordre-status i grid og ordredetalj-header, betalings-status i Betalingsinformasjon.
- Importeres fra `@/components/ui/Tag`.
- Designreferanse: ordre-grid (Paper 6B7-0) — dette er fasiten.

Én form-faktor (alltid bordered, alltid mixed case):
- `rounded-1` (2px), padding 3px×8px (`py-0.75 px-sp-2`), `text-pill` (12px / 15px), `font-bold`, border alltid på.

Varianter (mappet til `--color-status-{variant}-{bg|fg|border}` i `app/globals.css`):

| Variant | Brukseksempel |
|---|---|
| `success` | "Levert" |
| `warning` | "Sendt", "Behandles" |
| `neutral` | "På vent", default |
| `danger` | "Kansellert", "Refundert" |

Mapping fra domene-status til variant gjøres i feature-laget (`getOrderStatus()` i `lib/account/info.ts`) — Tag er ren visuell primitiv.

```tsx
const status = getOrderStatus(order.status);
<Tag variant={status.variant}>{status.label}</Tag>
```

### Pill

- **Inline metadata-badge uten fast border** — brukes for ikke-status kontekster: kupongkoder i ordreoppsummering, produkt-flags, m.m.
- Importeres fra `@/components/ui/Pill`.
- `bordered`-prop finnes men brukes kun unntaksvis — for status-brukstilfeller, bruk `Tag` i stedet.

```tsx
<Pill variant="success" bordered>{couponCode}</Pill>   {/* kupongkode */}
<Pill variant="danger">Kansellert</Pill>               {/* flat, inline kontekst */}
```

Hvis du er usikker på om du skal bruke `Tag` eller `Pill`: er det en domene-status som kommuniseres i et grid eller en header → `Tag`. Alt annet → `Pill`.

### Toast

**Kilde:** Paper `Friendly canyon`, artboard `BW3-0` — "Components — Feedback & Notifications".

Toast er den **eneste** mekanismen for kortvarige tilbakemeldinger på brukerhandlinger. Brukes når en handling er fullført og brukeren trenger en bekreftelse som ikke blokkerer flyten. Auto-dismiss etter 4 sekunder. Brukeren kan også lukke manuelt via ×-knappen.

**Ikke forveksle med Banner** (`components/account/PersonligInformasjonView.tsx`): Banner er inline i skjema og vedvarer til brukeren retter feilen. Toast er transient og flyter over innholdet.

#### Tre varianter

| Variant | Ikon-bg | Brukes for |
|---|---|---|
| `success` | `#16A34A` grønn | Handling fullført: "Endringer lagret", "Lagret til ønskelisten" |
| `error` | `#FF3333` rød (aka) | Noe feilet: "Noe gikk galt — prøv igjen" |
| `info` | `#6B6B65` grå (ink-muted) | Nøytral bekreftelse: "Lagt i handlekurv" |

#### Paper-spec (BW3-0) — hentet med get_computed_styles

**Container:**
```
bg-surface border border-divider rounded-1
py-3.5 px-4 gap-3
shadow: 0px 2px 12px rgba(0,0,0,0.08)
min-width: 260px
```

**Ikon-sirkel:** 20×20px, `rounded-full`, farge per variant (se tabell over), hvit SVG-ikon inni.

**Meldings-tekst:** 14px / 18px, `font-medium` (500), `text-ink`, `flex-grow`.

**Handlings-lenke** (valgfri — "Se ønskeliste →", "Se kurv →"):
```
text-body-xs font-medium text-aka
margin-right: 8px (mr-2), flex-shrink: 0
```

**Lukk-knapp:** 14×14px ×-ikon, `flex-shrink: 0`.

#### Posisjon

- **Desktop:** `fixed bottom-4 right-4` — nedre høyre hjørne.
- **Mobil:** full-bredde bunn (TBD ved implementasjon).
- Desktop-varianten bruker litt kompaktere padding: `py-3 px-3.5 gap-2.5` (12px/14px/10px per Paper BYU-0).

#### Eksempler på meldingstekster

```
success: "Endringer lagret"
success: "Lagret til ønskelisten"  +  action: "Se ønskeliste →"
error:   "Noe gikk galt — prøv igjen"
info:    "Lagt i handlekurv"        +  action: "Se kurv →"
```

#### Implementasjon

Komponenten er bygget i `components/ui/Toast.tsx` med `useToast`-hook. Ingen externe avhengigheter.

```tsx
import { Toast, useToast } from '@/components/ui/Toast';

// I en komponent (client):
const { toastProps, showToast } = useToast();

showToast({ variant: 'success', message: 'Endringer lagret' });
showToast({ variant: 'error', message: 'Noe gikk galt. Prøv igjen.' });
showToast({
  variant: 'info',
  message: 'Lagt i handlekurv',
  action: { label: 'Se kurv →', href: '/handlekurv' },
});

// Render i JSX:
{toastProps && <Toast {...toastProps} />}
```

Allerede tatt i bruk i: `PersonligInformasjonView`, `AddressesView`, `WishlistView`, `ProductGrid`.

### Skeleton

- Placeholder mens innhold lastes.
- Brukes kun på client-komponenter — server-komponenter viser ekte innhold direkte.

## Layout (`layout/`)

### Header

**Kilde:** Paper `Friendly canyon`, side `components`, artboards `9P-0` (Header Desktop 1440×100), `BB-0` (Mega Menu Kniver 1440×638), `G2-0` (Mobile Header + Drawer 390×1196). Design-tokens: `31-0` (Typography), `1J-0` (Colors), `4B-0` (Spacing & Layout).

Alle verdier under er hentet direkte fra Paper via `get_computed_styles` og `get_tree_summary`. Hver rad oppgir node-ID slik at spec kan re-verifiseres — ikke gjett eller juster disse verdiene uten å først oppdatere Paper-designet.

**Struktur:**

```
components/layout/
├─ Header.tsx            # Server — henter nav-data, wrapper MobileDrawerProvider, rendrer shell
├─ HeaderDesktop.tsx     # Server — utility bar + logo + primary nav + actions (md+)
├─ HeaderMobile.tsx      # Client — mobilheader (hamburger + logo + søk/kurv)
├─ PrimaryNav.tsx        # Client — hover/focus-styrt nav med mega-menu panel
├─ MegaMenu.tsx          # Server — 4-kolonne panel, rendres inne i PrimaryNav
├─ MobileDrawer.tsx      # Client — slide-in fra venstre, accordion-nav, body-scroll-lock
├─ UtilityBar.tsx        # Server — 28px topp-bånd med fri-frakt/knivsliping-meldinger
├─ ThemeToggle.tsx       # Client — lys/mørk-bryter
└─ icons.tsx             # Felles inline SVG-ikoner
```

Toppnivå-data (kategori-tre, bestselgere, smeder, knivmerker, utility-meldinger) hentes i `Header.tsx` via `lib/cache/nav.ts` med Upstash-cache → Supabase `site_config` → bundled default. Client-komponenter mottar data som props — ingen klient-side fetch.

**Responsive:** `md:` (≥768px) viser desktop, under 768px viser mobile. Begge rendres i SSR (vi kan ikke vite viewport fra server), men kun én er synlig via `hidden md:flex` / `md:hidden`.

---

#### Utility bar — `9Q-0`

| Property | Verdi | Token (se `docs/design-system.md`) |
|---|---|---|
| Height | 28px | `--height-utility-bar: 28px` |
| Background | `#EEEDE9` | `--color-utility-bar-bg` |
| Border-bottom | 1px `#E0E0DC` | `border-sakai` |
| Layout | `flex row justify-center items-center` | — |
| Padding-inline | 64px | `px-sp-7` (64px) |
| Gap | 20px | inline (nearest token: `gap-sp-4` 24, men 20 er spesifikk — bruk `gap-5` i Tailwind) |
| Tekst | 10px / 400 / tracking 0.04em, color `#6B6B65` (Haiiro), line-height 12px | `text-utility` token |
| Separator "·" | samme farge som teksten | — |

Innhold-mønster (3 meldinger):

```
Gratis frakt over 1 500 kr · Knivsliping i Oslo og per post · Rask levering 1–3 virkedager
```

(Meldingene kommer fra `site_config.nav.utility` — ikke hardkode.)

---

#### Header bar — `9W-0`

| Property | Verdi | Token |
|---|---|---|
| Height | 72px | `--height-header: 72px` |
| Background | `#FFFFFF` | `bg-shiro` |
| Border-bottom | 1px `#E0E0DC` | `border-sakai` |
| Layout | `flex row items-center` | — |
| Padding-inline | 64px | `px-sp-7` |
| Gap | 48px (mellom logo / nav / actions) | `gap-sp-6` |

**Logo** — slot 160×36. SVG fra `public/brand/logo.svg` (plasseres når Alexander laster opp). `<Link href="/">` wrapper, `aria-label="Skarpekniver — forside"`.

**Primary-nav** (`A3-0`) — 849×72 flex-row, 7 items fra kategori-tre. Rekkefølge og bredder (fra design, skal matche `site_config.nav.items`):

| Label | Bredde | Har mega-menu |
|---|---|---|
| Kniver | 91 | ja |
| Bryner og sliping | 157 | ja |
| Kjøkkenutstyr | 135 | ja |
| Japansk grill | 129 | ja |
| Verktøy | 97 | ja |
| Servering | 110 | ja |
| Tilbud | 73 | nei — direkte lenke med aka-farge |

Nav-item (`A4-0`):

| Property | Verdi |
|---|---|
| Height | 72px (`--height-header`) |
| Padding-inline | 16px (`px-sp-3`) |
| Gap (label ↔ chevron) | 5px |
| Active state | `border-b-2 border-aka` (hele 72px-høyden) |
| Text (default, aktiv, hover) | 14 / 700 Satoshi Bold, Kuro, line-height 18 |
| Tilbud-variant | 14 / 700 Aka — ingen border-b, alltid rød |
| Chevron | 12×12 SVG, stroke 1.5, roteres 180° når mega-menu er åpen |

**Header-actions** (`AU-0`) — 207×40 total:

| Slot | Størrelse | Innhold |
|---|---|---|
| Søk | 40×40 | 18×18 forstørrelsesglass-SVG, `aria-label="Søk"`, åpner søk-overlay (Fase 3) |
| Konto | 40×40 | 18×18 person-SVG, `<Link href="/konto">`, `aria-label="Min konto"` |
| Kurv-pill (`B3-0`) | 111×40 | se under |

Gap mellom slots: 8px (`gap-sp-2`).

Kurv-pill:

| Property | Verdi |
|---|---|
| Height | 40px |
| Padding-inline | 16px |
| Gap | 8px |
| Border-radius | 2px (`rounded-r-1`) |
| Background | `#1A1A1A` (`bg-kuro`) |
| Cart-ikon | 16×16 SVG, stroke `#FFFFFF` |
| Tekst "Kurv" | 13 / 700 Satoshi Bold `#FFFFFF`, line-height 16 |
| Badge | 18×18 circle (`rounded-full`), `bg-aka`, inneholder `BA-0` |
| Badge-tall | 10 / 700 `#FFFFFF`, line-height 12, sentrert |

Badge skjules (`hidden`) når `cartCount === 0`.

---

#### MegaMenu — `BB-0` → `CT-0`

Utløser: hover eller keyboard-focus på primary-nav-item som har undermeny. Lukkes ved ESC, click-outside, eller navigasjon til ny rute.

**Panel** (`CT-0`):

| Property | Verdi | Token |
|---|---|---|
| Layout | `flex row` — 4 kolonner | — |
| Bredde | 100% (matcher viewport-bredde, innhold begrenses av `max-w-content` 1312px når relevant) | — |
| Background | `#FFFFFF` | `bg-shiro` |
| Border-bottom | 1px `#E0E0DC` | `border-sakai` |
| Box-shadow | `0 8px 32px rgba(0,0,0,0.08)` | `--shadow-mega` |

Kolonne-bredder (totalt 1440 i design):

| Kolonne | Bredde | Flex-basis |
|---|---|---|
| col-overview (`CU-0`) | 300 | ~300/1440 |
| col-knivtyper (`DF-0`) | 430 | ~430/1440 |
| col-smeder (`E4-0`) | 430 | ~430/1440 |
| col-editorial (`FE-0`) | 280 | ~280/1440 |

Kolonne-separator: `border-r border-sakai` på de tre første. Indre padding per kolonne: `py-sp-6 px-sp-5` (48 vertikalt, 32 horisontalt) — justeres når layout verifiseres i screenshot.

**Felles tekst-stiler i mega-menu** (verifisert via `get_computed_styles`):

| Rolle | Stil | Eksempel-node |
|---|---|---|
| Kolonne-label (UPPERCASE) | 11 / 700 / tracking 0.1em, color `#888880`, lineHeight 14, `margin-bottom: 20px`, `uppercase` | `CV-0`, `DG-0`, `E5-0`, `EW-0`, `FF-0`, `FP-0` |
| Lead-tittel (overview) | 15 / 700 / tracking -0.01em, Kuro, lineHeight 18 | `CX-0` |
| Lead-subtekst | 12 / 400, color `#888880`, lineHeight 16 | `CY-0` |
| Lenke-rad (knivtyper, smeder, merker) | 13 / 500 Satoshi Medium, Kuro, lineHeight 16 | `D2-0` |
| "Se alle N …" CTA | 12 / 700 / tracking 0.02em, Aka, lineHeight 16 | `E3-0`, `EU-0`, `FN-0` |
| Editorial-tittel | 15 / 700 / tracking -0.01em, lineHeight 20 (farge — se under) | `FK-0` |
| Editorial-brødtekst | 12 / 400, color `#888880`, lineHeight 18 | `FL-0` |
| Tjenester-lenke | 13 / 500 Satoshi Medium, color `#888880`, lineHeight 16 | `FT-0` |

Kolonne-spesifikk struktur:

- **col-overview (`CU-0` 300×529)** — label + lead-frame (`CW-0` 235×62: flex-col `py-sp-2` 12, gap 3, border-bottom 1px Sakai, inneholder lead-tittel + subtekst) + 4 lenke-rader (`CZ-0` 235×39: flex-row align-center, `py-[11px]`, gap 8, border-bottom 1px Sakai — 14×14 ikon + tekst).
- **col-knivtyper (`DF-0` 430×529)** — label + 2-kolonne 9-item grid (items `DJ-0` 183×32 med `py-sp-2` 8, tekst 13/500 Kuro) + `E3-0` "Se oversikt over alle 25 knivtyper →" CTA.
- **col-smeder (`E4-0` 430×529)** — label + 2-kolonne 10-item grid + `EU-0` "Se alle 45 smeder →" CTA + sub-seksjon "Kjente knivmerker" (label `EW-0` + 2-kolonne 7-item grid).
- **col-editorial (`FE-0` 280×529)** — label + card (`FG-0` 216×222, flex-col gap 12):
  - Hero (`FH-0` 216×120): `bg-sumi` (`#2A2A2A`), `rounded-r-1` (2px), flex center, inneholder `FI-0` "包丁" 32 / 300 Noto Serif JP, color `#333333` (bevisst subtil mot dark bg).
  - Tekst-frame (`FJ-0` 216×62): tittel `FK-0` + brødtekst `FL-0`. **Merk:** `FK-0` er computed som `color: #FFFFFF` — dette fungerer kun hvis kortet har en mørk bakgrunn eller teksten sitter oppå `FH-0`. Verifiser i screenshot før implementasjon; hvis hele kortet skal være lyst, overstyr til `text-kuro`.
  - CTA `FM-0` 216×16: "Les vår knivguide →" 12/700 Aka.
  - Sub-seksjon "Tjenester" (`FO-0` 216×113): label `FP-0` + 3 lenke-rader (hver `216×16`, flex-row gap 8, 12×12 ikon + tekst 13/500 `#888880`).

**Tilgjengelighet:**

- Mega-menu-trigger er `<button aria-haspopup="true" aria-expanded>` — ikke `<Link>` med fake button.
- Lenkene i panelet er `<Link>`. Panelet har `role="menu"` og lenkene `role="menuitem"` (når Radix trekkes inn i Fase 3, migrer til `NavigationMenu`).
- Tab-fokus går inn i panelet og ruller tilbake til trigger når siste element passeres.

**Implementasjon-tips:**

- Ingen animasjons-bibliotek. `data-state=open` + `transition-opacity duration-150` er nok.
- Hover-intent: 120ms delay før `close` på `mouseleave` for å tåle korte mus-utflukter.
- Del mega-menu-innholdet per trigger: `MegaMenuKniver`, `MegaMenuBryner` ... Hver er en server-komponent som mottar data som props.

---

#### MobileHeader — `G3-0`

| Property | Verdi | Token |
|---|---|---|
| Width | 390px (design — i prod `w-full`) | — |
| Height | 60px | `--height-mobile-header: 60px` |
| Layout | `flex row items-center justify-between` | — |
| Padding-inline | `px-sp-3` 16 (antas — å verifisere mot `G3-0` computed styles) | — |
| Hamburger-slot | 40×40, inneholder 20×14 3-linjers SVG (`G5-0`) | — |
| Logo-slot | 130×20 (mobil-variant) | — |
| Actions-slot | 84×40: [søk 40×40] + [kurv 40×40 med 18×18 ikon + 14×14 badge `GR-0` "2" 8/700 hvit] | — |

Mobil-header har **ikke** konto-ikon (kun søk + kurv). Kontoen er i drawer-footeren.

---

#### MobileDrawer — `GS-0`

Slide-in fra venstre, 100% høyde, 390px bred (`--width-drawer: 390px` — på smale viewports `min(390px, 90vw)`). Overlay: `bg-kuro/50` semi-transparent på resten av siden.

Drawer-bakgrunn: `#FFFFFF` (`bg-shiro`). **Ikke Unohana** — kun footer-sonen er Unohana.

**Søk-seksjon** (`GT-0` 390×77):

| Property | Verdi |
|---|---|
| Container padding | `py-sp-3` 16 / `px-sp-4` 20 (computed: 16/20) |
| Border-bottom | 1px Sakai |
| Søkefelt (`GU-0`) | 350×44, `rounded-r-1` 2px, `bg-unohana` (`#F5F5F3`), border 1px Sakai, `px-[14px]`, `gap-[10px]` |
| Ikon | 16×16 forstørrelsesglass |
| Placeholder-tekst (`GY-0`) | 14 / 400 Satoshi Regular, color `#888880`, lineHeight 18 |

**Nav-sektor** (`GZ-0` 390×946) — flat liste av primary-nav-items, noen expandable:

Nav-rad kollapset (`H1-0`, `IM-0`, `IQ-0`, …):

| Property | Verdi |
|---|---|
| Height | 52px |
| Layout | `flex row items-center justify-between` |
| Padding-inline | 20px |
| Border-bottom | 1px Sakai |
| Label (`H2-0`) | 15 / 700 Satoshi Bold, Kuro, lineHeight 18 |
| Chevron | 16×16 SVG, roteres 180° når åpen |
| "Tilbud" (`J6-0`) | samme layout, uten chevron; tekst 15/700 Aka |

Nav-rad ekspandert innhold (eksempel `H0-0` under "Kniver"):

Inneholder én eller flere gruppe-seksjoner:

- **Section-label (`H6-0`, `HP-0`, `IA-0`)**: frame 390×24, inneholder tekst (`H7-0`) 10 / 700 / tracking 0.1em uppercase, color `#888880`, lineHeight 12. Padding: `pt-sp-2 pb-sp-1 px-sp-4` (antas — verifiser mot `H6-0`).
- **Lenke-rad (`H8-0`, `HC-0`, …)**: `flex justify-between items-center`, `py-[10px] px-[20px]`, tekst (`H9-0`) 14 / 700 Satoshi Bold Kuro lineHeight 18, høyre 14×14 chevron-right.
- **Gruppe-CTA (`I7-0`, `IK-0`)**: `py-[10px] px-[20px]`, tekst (`I8-0`) 12 / 700 Aka, lineHeight 16.

Kun én gruppe åpen om gangen (radio-accordion).

**Footer** (`J8-0` 390×113):

| Property | Verdi |
|---|---|
| Background | `#F5F5F3` (`bg-unohana`) |
| Padding | `py-sp-4 px-sp-4` (20/20) |
| Gap | 12px (`gap-sp-2`-ish; computed 12 — bruk `gap-3` i Tailwind) |
| Border-top | 1px Sakai |
| Kurv-CTA (`J9-0`) | 350×44, `rounded-r-1` 2px, `bg-aka`, tekst (`JA-0`) 14 / 700 / tracking 0.02em `#FFFFFF` lineHeight 18 |
| Link-rad (`JB-0`) | 350×16, flex-row, inneholder 3 lenker med `|`-separatorer |
| Link-tekst (`JC-0`) | 12 / 500 Satoshi Medium, color `#6B6B65` (Haiiro), lineHeight 16 |
| Separator `|` (`JD-0`, `JF-0`) | samme stil som lenkene |

Lenke-rekkefølge: `Min konto · Knivsliping · Hjelp`.

**Drawer-adferd:**

- Lukk ved ruteendring (`usePathname`-effekt).
- Body-scroll-lock når åpen (`document.body.style.overflow = 'hidden'`).
- ESC lukker.
- Overlay-klikk lukker.
- Fokus-trap (TODO — Fase 3: bruk Radix `Dialog` eller `focus-trap-react`).

### Footer

- Lenker, nyhetsbrev, sosiale medier, copyright.
- Rendres statisk — ingen dynamiske data.

### Container

- Wrapper med maks-bredde og responsive padding. Unngå å duplisere `max-w-7xl mx-auto px-4` overalt.

## Produkt-komponenter

### ProductCard

- Brukes i kategoriside-grid, relaterte produkter, søkeresultater.
- Viser: bilde, navn, pris (m/ kampanjepris), kort lager-status.
- Server-komponent (ingen client-JS på kortet).
- "Legg i handlekurv" er ikke på kortet — flytter kunde til produktside for variant-valg.

Eksakte verdier fra Paper:

- **Kortcontainer**: `bg-shiro rounded-sm overflow-clip` (2px radius)
- **Bilde**: `aspect-square w-full object-cover` (1:1 ratio)
- **Tekstseksjon**: `pt-[14px] px-4 pb-[18px] flex flex-col gap-[3px]`
- **Brand**: `text-[10px] font-bold uppercase tracking-[0.1em] text-haiiro`
- **Produktnavn**: `text-[14px] font-bold leading-[1.3] tracking-[-0.01em] text-kuro`
- **Spesifikasjoner**: `text-[11px] text-haiiro`
- **Pris normal**: `text-[16px] font-bold text-kuro`
- **Pris rabatt**: `text-[16px] font-bold text-aka` + strykepris `text-[16px] text-haiiro line-through`
- **Ønskeliste-knapp**: `absolute top-[10px] right-[10px] w-8 h-8 rounded-full bg-shiro shadow-sm flex items-center justify-center`
- **Rabatt-badge** (-14%): `absolute top-3 left-3 rounded-sm py-[3px] px-2 bg-aka text-shiro text-[11px] font-bold`
- **Utsolgt-badge**: `absolute top-3 left-3 rounded-sm py-[3px] px-2 bg-kuro text-shiro text-[11px] font-bold uppercase tracking-[0.1em]`

Fire tilstander: rest, hover (viser frakt-info under pris), rabatt·hover, utsolgt.

### ProductGallery

- Hovedbilde + thumbnails.
- LCP-kandidat — `priority` + `fetchPriority="high"` på hovedbilde.
- Zoom ved klikk — client-komponent for zoom-modalen, resten server.

### VariantSelector

- Client-komponent.
- Dropdown eller chip-selector avhengig av attributt-type.
- Oppdaterer `ProductPrice` og `AddToCartButton` via context eller props.

### AddToCartButton

- Client-komponent — kaller cart-action.
- Loading-state under tilleggelse.
- Success-feedback (toast eller CartDrawer-åpning — TBD).

## Cart-komponenter

### CartDrawer

- Slide-in fra høyre, dekker ikke hele skjermen.
- Mini-cart: liste med varer, totaler, "Til kassen"-knapp.
- Focus trap.

### MiniCartBadge

- Viser antall varer i cart-ikon i header.
- Hydrerer på klient fra cookie/store.

## Checkout-komponenter

### CheckoutForm

- Komposisjon av AddressForm, ShippingSelector, PaymentSelector, OrderSummary.
- State lever i custom hook `useCheckout()`.
- Valideres med Zod før submit.

### PaymentSelector

- Radio-gruppe: Vipps, Kort (Stripe).
- Vipps-knapp har egen ikon og styling.

## SEO-komponenter

### JsonLd

- Generisk wrapper som emitter `<script type="application/ld+json">`.
- Brukes i server-komponenter for `Product`, `BreadcrumbList`, `Organization`, `ItemList` osv.

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "Product",
  ...
}} />
```

Se `seo.md` for skjema-details.

## Konvensjoner for nye komponenter

### Filnavn og eksport

- Én komponent per fil.
- Named export, ikke default — konsistent med tree-shaking og import-autokomplett.

```tsx
// components/product/ProductCard.tsx
export function ProductCard({ product }: ProductCardProps) { ... }

export interface ProductCardProps {
  product: Product;
  // ...
}
```

### Props-typing

- Props-interface eksporteres hvis relevant for konsumering.
- Boolean-props som toggler funksjonalitet bør defaulte til `false` (opt-in).

### Composition over variants

Hvis en komponent trenger mange varianter: del opp.

```tsx
// Hellre ikke
<ProductCard variant="compact" size="large" withPrice={true} />

// Foretrekk
<ProductCardCompact product={...} />
<ProductCardDetailed product={...} />
```

### Tilstand og effekter

- State lever så nært bruken som mulig.
- Kontekst brukes for "globale" ting: cart, auth, theme.
- `useEffect` kun for side-effekter mot eksterne systemer. Ikke for afledt tilstand — bruk i stedet avledning under render eller `useMemo`.

### Tilgjengelighet

Hver komponent må passere:

- Tastatur-navigasjon (Tab, Enter, Escape).
- Screen reader-labels (`aria-label`, `aria-describedby`).
- Fokus-indikator synlig.
- Minimum AA-kontrast.

## Storybook (TBD)

Planlagt for Fase 3. Hver UI-primitiv får en `.stories.tsx`-fil. Visuell regresjonstest via Chromatic eller tilsvarende.

## Ikke-mål

- **Ingen egen komponent-bibliotek-pakke.** Vi trenger ikke publisere dette til npm.
- **Ingen Shadow DOM / Web Components.** Bare React.
- **Ingen CSS-in-JS runtime-løsninger** (styled-components, Emotion). Tailwind er nok.
