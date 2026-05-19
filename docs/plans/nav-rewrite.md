# Plan — Rewrite av nav-komponentene

**Status:** utkast, skrevet 2026-04-22 av Claude. Må godkjennes av Alexander før kode skrives.
**Kontekst:** den første implementasjonen (commit `c3de35d`) bruker hardkodede verdier (`text-[14px]`, `h-18`, `#EEEDE9`), bryter `docs/conventions.md` > UI, og blir beskrevet som "AI slop" av stakeholder. Denne planen beskriver hvordan vi rewriter mot de nye UI-reglene i `CLAUDE.md` og de nye tokenene i `app/globals.css`.

Kilde-spec for alle tall: `docs/components.md` > Layout > Header (oppdatert 2026-04-22 med Paper-extrakerte node-IDer).

---

## 1. Mål

1. **Ingen arbitrary Tailwind-verdier** i nav-komponentene. Alt matcher en token definert i `@theme`-blokken i `globals.css`.
2. **Ingen ugyldige Tailwind-klasser** (`h-18`, `h-13`, `h-15`, `py-2.75` — disse finnes ikke og render som ingenting).
3. **Visuell paritet med Paper** — bruk screenshot-sammenligning for verifikasjon før PR merges.
4. **Rettet sort cart-pill** (var aka-rød, skal være Kuro med rød badge).
5. **Mega-menu-panel på hvit bakgrunn** (var unohana-grå, skal være Shiro med box-shadow).
6. **Ingen regression** på theme-toggle eller mobile-drawer context.

Ut av scope (egne tasks senere):

- Animasjoner utover `transition-opacity duration-150` — mega-menu enter/exit polish tas i Fase 3.
- Radix Primitives-migrasjon — nav fungerer fint med vanilla buttons til da.
- Søk-overlay-funksjonalitet — Fase 3.
- Logo-asset — venter på at Alexander laster opp SVG. Komponent tar en `<Logo />`-barn, byttes inn når fila er klar.

---

## 2. Komponent-arkitektur

Uendret fra nåværende filstruktur, men flere filer får nye props og redusert interne valg (ingen business-logikk i stil-valg):

```
components/layout/
├─ Header.tsx            # Server — uendret (henter nav-data, wrapper provider)
├─ HeaderDesktop.tsx     # Server — omskrives (token-bruk)
├─ HeaderMobile.tsx      # Client — omskrives (60px høyde, 84×40 actions)
├─ PrimaryNav.tsx        # Client — omskrives (14/700 tekst, active-border-b 2px aka)
├─ MegaMenu.tsx          # Server — omskrives (shiro-bg + shadow-mega, 4-col layout)
├─ MobileDrawer.tsx      # Client — omskrives (shiro-bg, unohana-footer, search-field)
├─ UtilityBar.tsx        # Server — omskrives (utility-bar-bg token, text-utility)
├─ ThemeToggle.tsx       # uendret
└─ icons.tsx             # uendret
```

Data-flyt uendret: `Header.tsx` kaller `getPrimaryNav()` og sender `nav.items` + `nav.utility` ned.

---

## 3. Token-mapping (hardkodet → token)

Dette er den definitive oversettelsen. Alle andre verdier må skrives som `text-[…]` / `bg-[…]` **forbys** av lint-rule som etableres i task #27.

| Hardkodet i dag | Ny token | Hvor brukes |
|---|---|---|
| `text-[10px]` | `text-utility` / `text-label-sm` | UtilityBar / drawer-label |
| `text-[11px]` | `text-label` | mega-menu-label |
| `text-[12px]` | `text-muted-sm` | subtekst, CTA-rad, footer-link |
| `text-[13px]` | `text-body-xs` | mega-menu-lenker, kurv-pill-tekst |
| `text-[14px]` | `text-body-sm` | primary-nav, drawer-link, drawer-CTA |
| `text-[15px]` | `text-body-sm` + `font-bold` (midlertidig — vi legger `--text-body-md: 15/18` hvis flere cases dukker opp; se åpent spørsmål 1) |
| `text-[18px]`, `text-[22px]` | erstatt med `text-h3` eller eksisterende logo-komponent | logo tekst-fallback |
| `h-18` (ugyldig) | `h-header` | primary-nav, header-bar |
| `h-13` (ugyldig) | `h-13` finnes ikke; bruk `h-[52px]` … nei, nei — legg `--spacing-mobile-row: 52px` hvis nødvendig, eller bruk direkte px via `min-h-[52px]`? Nei — vi legger `h-13` som Tailwind-utility via `--height-mobile-row: 52px` hvis dette dukker opp flere steder. Ellers bruk eksplisitt komponent-intern variable. |
| `h-15` (ugyldig) | `h-mobile-header` (60px) |
| `bg-[#EEEDE9]` | `bg-utility-bar-bg` | UtilityBar |
| `text-[#C8C8C4]` | ingen — fjerne: utility-bar separatoren har samme farge som teksten (Haiiro), ikke en egen farge |
| `bg-aka` (på MobileDrawer CTA) | behold `bg-aka` (spec bekrefter aka-rød J9-0) |
| `bg-aka` (på desktop kurv-pill) | **endre til `bg-kuro`** — pillen er sort, badge er aka |
| `bg-unohana` (på mega-menu-panel) | **endre til `bg-shiro`** + `shadow-mega` |
| `bg-unohana` (på mobile drawer) | **endre til `bg-shiro`** (unntak: drawer-footer `J8-0` er unohana) |
| `border-b-2 border-aka` (primary-nav aktiv) | behold, men på `[aria-current=page]` eller route-match-logikk |
| `tracking-[0.1em]` | eksponert via `--text-label--letter-spacing` — ikke nødvendig som egen klasse |
| `tracking-[0.04em]` | eksponert via `--text-utility--letter-spacing` |
| `px-5` (20px i drawer) | `px-sp-4`-aktig? nei: sp-4 = 24. 20 er spesifikk — bruk `px-5` (Tailwind default spacing, 5×4=20). Tillat Tailwind default spacing der det matcher Paper sp (× 4px-skala). Vi dokumenterer dette i conventions. |
| `py-2.5` (10px drawer row) | `py-2.5` i Tailwind er 10px (2.5×4) — OK som default spacing |

**Prinsipp:** Tailwind default spacing (4px grid: `p-1`=4, `p-2`=8, `p-3`=12, `p-4`=16, `p-5`=20, `p-6`=24, `p-8`=32, `p-12`=48, `p-16`=64) dekker alle Paper sp-1..sp-8 via direkte klasser. `--spacing-sp-*` eksponeres i tillegg for eksplisitt intensjon (f.eks. `p-sp-3` når vi mener "component internal padding"). Bruk Paper-tokens når rollen er semantisk; bruk Tailwind-default når det er ren numerisk spacing som tilfeldigvis matcher.

Åpent spørsmål 1: *Skal vi legge `--text-body-md: 15px/18` som eget token?* Den brukes kun to steder (drawer nav-label H2-0, overview lead-tittel CX-0). Alternativet er `text-body-sm font-bold tracking-[-0.01em]` for lead-tittel — men da må vi ha en utility for -0.01em. Anbefaling: JA, legg til `--text-body-md: 15px/18/-0.01em` slik at vi unngår nye tracking-arbitraries.

---

## 4. Per-komponent rewrite

Hver underseksjon lister: **før → etter** for de konkrete klassene, pluss andre endringer (props, struktur).

### 4.1 `UtilityBar.tsx`

Før:
```tsx
<div className="h-7 bg-[#EEEDE9] border-b border-sakai flex items-center justify-center gap-5 px-8">
  ...msgs.map: <span className="text-[10px] tracking-[0.04em] text-haiiro">{msg}</span>
  ...sep:       <span className="text-[#C8C8C4]">·</span>
```

Etter:
```tsx
<div className="h-utility-bar bg-utility-bar-bg border-b border-sakai flex items-center justify-center gap-5 px-sp-7">
  ...msgs.map: <span className="text-utility text-haiiro">{msg}</span>
  ...sep:       <span aria-hidden className="text-utility text-haiiro">·</span>
```

Endringer:
- `h-7` → `h-utility-bar`
- `bg-[#EEEDE9]` → `bg-utility-bar-bg`
- `text-[10px] tracking-[0.04em]` → `text-utility` (inkluderer letter-spacing)
- Separator-fargen justeres til samme Haiiro — fjerner det falske `#C8C8C4`.
- `px-8` → `px-sp-7` (64px matcher Paper — sjekk om mobile trenger mindre; hvis ja, bruk `px-sp-3 md:px-sp-7`).

### 4.2 `HeaderDesktop.tsx`

Før: inneholder placeholder `<span className="font-serif text-[22px] font-bold text-kuro">Skarpekniver</span>`, `h-18`, `gap-12`, osv.

Etter:

```tsx
<div className="hidden md:flex h-header items-center bg-shiro border-b border-sakai px-sp-7 gap-sp-6">
  <Link href="/" aria-label="Skarpekniver — forside" className="flex items-center h-9">
    <Logo className="h-9 w-auto" />
  </Link>
  <PrimaryNav items={items} />
  <HeaderActions cartCount={cartCount} />
</div>
```

Hvor `<Logo>` er en ny komponent i `components/brand/Logo.tsx` — inline SVG som settes inn når Alexander laster opp fila. Inntil da: fallback `<span className="font-sans text-body-sm font-bold text-kuro">Skarpekniver</span>` (eksplisitt markert som placeholder i koden).

Endringer:
- `h-18` → `h-header`
- `gap-12` → `gap-sp-6`
- `px-16` → `px-sp-7`

### 4.3 `PrimaryNav.tsx`

Per nav-item:

Før:
```tsx
<button className="h-18 px-4 flex items-center gap-1 text-[14px] font-medium text-haiiro hover:text-kuro">
  {label}
  <IconChevronDown size={12} />
</button>
```

Etter:
```tsx
<button
  className={cn(
    "h-header px-sp-3 flex items-center gap-[5px] text-body-sm font-bold text-kuro border-b-2 border-transparent",
    isActive && "border-aka",
    item.accent && "text-aka",
  )}
  aria-haspopup={item.mega ? "true" : undefined}
  aria-expanded={item.mega ? isOpen : undefined}
>
  {label}
  {item.mega && <IconChevronDown size={12} />}
</button>
```

Endringer:
- `h-18` → `h-header`
- `text-[14px] font-medium` → `text-body-sm font-bold` (design bekrefter 700, ikke 500)
- Default-farge er Kuro (ikke Haiiro) — design viser bold Kuro for alle items
- `gap-1` (4px) → `gap-[5px]` (5px er paper-verdien). 5px er spesifikk; legg `--spacing-gap-nav-item: 5px` hvis purist, ellers `gap-[5px]` er akseptabelt for single-use (åpent spørsmål 2)
- Active-state: `border-b-2 border-aka` vs. `border-b-2 border-transparent` default (unngår CLS når state toggler)

Åpent spørsmål 2: *Er `gap-[5px]` akseptabelt som single-use arbitrary, eller skal vi legge et token?* Anbefaling: aksept som arbitrary **kun** når verdien er ≤ 3 steder og dokumentert i komponenten. Lint-regelen i task #27 kan hviteliste ved inline-kommentar `/* paper-exact: A4-0 */`.

Hover-intent og ESC/outside-click-logikk beholdes uendret.

### 4.4 `MegaMenu.tsx`

Panel-wrapper:

Før:
```tsx
<div className="absolute left-0 top-full w-full bg-unohana border-t border-sakai py-10">
  <div className="max-w-content mx-auto grid grid-cols-12 gap-6 px-8">
```

Etter:
```tsx
<div className="absolute left-0 top-full w-full bg-shiro border-b border-sakai shadow-mega">
  <div className="mx-auto flex" style={{ maxWidth: "var(--width-content)" }}>
    <OverviewColumn /> {/* 300/1440 */}
    <KnivtyperColumn /> {/* 430/1440 */}
    <SmederColumn /> {/* 430/1440 */}
    <EditorialColumn /> {/* 280/1440 */}
  </div>
```

Endringer:
- `bg-unohana` → `bg-shiro`
- `border-t` → `border-b` (panel grenser mot sidebar-content, ikke header)
- Add `shadow-mega`
- Erstatt 12-col grid med 4-col flex (Paper-matchet proporsjoner)

Typografi per rad bruker nye tokens:

| Rolle | Før | Etter |
|---|---|---|
| Kolonne-label | `text-[11px] font-bold uppercase tracking-[0.1em] text-haiiro mb-5` | `text-label font-bold uppercase text-muted-label mb-5` |
| Lead-tittel | `text-[15px] font-bold text-kuro` | `text-body-md font-bold text-kuro` (etter at body-md legges til) |
| Lead-subtekst | `text-[12px] text-haiiro` | `text-muted-sm text-muted-label` |
| Lenke-rad | `text-[13px] font-medium text-kuro py-2.75` | `text-body-xs font-medium text-kuro py-[11px]` (11px er paper-eksakt; 2.75 finnes ikke i Tailwind) |
| CTA | `text-[12px] font-bold text-aka` | `text-muted-sm font-bold tracking-[0.02em] text-aka` (eller legg `--text-cta: 12/16/0.02em` hvis purist) |

Editorial-kort:

```tsx
<div className="flex flex-col gap-3">
  <div className="h-[120px] bg-sumi rounded-r-1 flex items-center justify-center">
    <span className="text-[32px] font-serif font-light text-[#333333]">包丁</span>
  </div>
  <div>
    <h4 className="text-body-md font-bold text-kuro">Hvilken kniv passer for deg?</h4>
    <p className="text-muted-sm text-muted-label mt-2">…</p>
  </div>
  <a className="text-muted-sm font-bold tracking-[0.02em] text-aka">Les vår knivguide →</a>
</div>
```

Merk: FK-0 er computed som hvit, men vi tolker det som at designet har byttet farge på tekst-frame; implementasjonen bruker Kuro på lys bakgrunn. Bekreft med Alexander før merge.

### 4.5 `MobileHeader` (`HeaderMobile.tsx`)

Før: 64/72px høyde, aka-rød CTA, mangler search/cart-layout.

Etter:

```tsx
<div className="md:hidden flex h-mobile-header items-center justify-between px-sp-3 bg-shiro border-b border-sakai">
  <button onClick={openDrawer} aria-label="Åpne meny" className="h-10 w-10 flex items-center justify-center">
    <IconMenu size={20} />
  </button>
  <Link href="/" aria-label="Skarpekniver — forside">
    <Logo className="h-5 w-auto" /> {/* 130×20 matching Paper mobile */}
  </Link>
  <div className="flex items-center gap-sp-1">
    <button aria-label="Søk" className="h-10 w-10 flex items-center justify-center"><IconSearch size={18} /></button>
    <CartIconButton count={cartCount} />
  </div>
</div>
```

### 4.6 `MobileDrawer.tsx`

Kritiske endringer:

- Wrapper `<aside>`: `bg-shiro` (ikke unohana).
- Search-seksjon: matche `GU-0` — 44px høy, unohana-bakgrunn, Sakai-border, forstørrelsesglass-ikon.
- Nav-rader: `h-13` (ugyldig) → `h-[52px]` eller eksplisitt `min-h-[52px]`. Vurder å legge `--height-drawer-row: 52px` hvis dette resirkuleres i andre listings (åpent spørsmål 3).
- Footer-seksjon: `bg-unohana`, `border-t border-sakai`, `p-5 gap-3`, CTA er aka-rød (uendret).
- Footer-links: `text-muted-sm text-haiiro` (ikke `text-haiiro` med ukjent size).

Åpent spørsmål 3: *52px er brukt 8+ ganger i drawer-en. Lag token eller la arbitrary stå i én komponent?* Anbefaling: Token — `--height-drawer-row: 52px` → `h-drawer-row`.

---

## 5. Verifikasjon

Før PR merges:

1. **Type-sjekk + lint:** `npm run lint && tsc --noEmit` må være grønn.
2. **Build:** `npm run build` — forventet: klarer seg med bundled default hvis Supabase-env mangler (fallback allerede testet).
3. **Paper-sammenligning:** ta screenshot av `http://localhost:3000/` (desktop + mobile) og sammenlign side-ved-side med `get_screenshot` fra Paper for `9P-0`, `BB-0` (hover på "Kniver"), `G2-0` (med drawer åpen).
4. **Tastatur-sti:** tab gjennom utility → logo → primary-nav (åpne mega-menu med Enter/Space) → actions → kurv. ESC lukker mega-menu.
5. **Theme-toggle:** bekrefte at lys/mørk/system fortsatt cycler uten hydration-mismatch.
6. **Mobile drawer:** hamburger → drawer åpner, body-scroll låses, ESC lukker, click-outside lukker, navigasjon til ny rute lukker.
7. **Cart-badge:** `cartCount=0` skjuler badge; `cartCount=42` viser pill med aka-sirkel og "42" hvit.
8. **Accessibility audit:** kjør axe-core-plugin i Chrome devtools, 0 kritiske feil på `/`.

---

## 6. Rekkefølge

Gjennomføres som én PR — men commits deles opp for reviewer-ergonomi:

1. `design(nav): add body-md token + drawer-row height` (hvis åpent spørsmål 1/3 besvares ja).
2. `feat(nav): rewrite UtilityBar with token-based styling`
3. `feat(nav): rewrite HeaderDesktop with Logo slot + tokens`
4. `feat(nav): rewrite PrimaryNav with correct weight + active border`
5. `feat(nav): rewrite MegaMenu panel — shiro bg + shadow-mega + proper columns`
6. `feat(nav): rewrite HeaderMobile + MobileDrawer to match Paper G2-0`
7. `test(nav): add visual regression via @playwright/test + Paper screenshot compare` (kan hoppes til task #27 sammen med lint-regelen).

---

## 7. Åpne spørsmål (til Alexander)

1. Legge `--text-body-md: 15/18/-0.01em` som eget token? **Anbefaling: ja.**
2. Tillate `gap-[5px]` som dokumentert single-use arbitrary, eller krev token for alle spacings? **Anbefaling: tillat med inline-kommentar `/* paper-exact: <node-id> */`, håndheves av lint-regelen (se task #27).**
3. Legge `--height-drawer-row: 52px`? **Anbefaling: ja, resirkuleres.**
4. Editorial-card (`FK-0`) white vs. kuro-på-lys — hvilken tolkning er korrekt? Trenger ny Paper-screenshot.
5. Logo-SVG — hvilken viewport-størrelse er master (160×36 desktop, 130×20 mobile)? Eller én viewBox som skalerer?

Ikke start rewrite før spørsmålene er besvart eller Alexander eksplisitt sier "ok, dine anbefalinger — kjør."
