# 0008 — Lys/mørk tema via to-lags token-system

**Status:** Vedtatt
**Dato:** 2026-04-23
**Forfattere:** Alexander + Claude

## Kontekst

Tailwind 4 `@theme`-blokken i `app/globals.css` definerte opprinnelig kun
brand-farger fra Paper-paletten (`unohana`, `shiro`, `kuro`, `sumi`, `haiiro`,
`sakai`, `aka`). Disse er build-tid-frosne: `bg-shiro` genereres som
`background-color: #FFFFFF` og kan ikke flippe.

Mellom ADR-0007 og denne var tema-håndteringen minimal: kun `--background` og
`--foreground` flippet på `body`-nivået. Da brukeren slo på dark mode var
Kurv-pill, header, mega-menu, mobil-drawer og produkt-kortene fortsatt låst
til light-verdier — resultatet var uleselige hvite bokser på mørk bakgrunn.

Vi trenger et system som:

1. Lar det store flertallet av UI-komponenter flippe automatisk ved
   `data-theme="dark"` uten å endre klasselisten per komponent.
2. Bevarer brand-tokens for tilfeller der fargen er essens (aka-CTA,
   editorial-kolonne som alltid skal være mørk, logo-sirkel).
3. Passer med den eksisterende ESLint-regelen (`no-arbitrary-tailwind`) — altså
   navngitte Tailwind-utilities, ikke arbitrary-verdier.
4. Beholder rolle-fargene (hva er "primær tekst", hva er "divider") fremfor å
   tvinge hver komponent til å ta stilling til hver farge i hver modus.

## Beslutning

Vi introduserer et **to-lags token-system** i `app/globals.css`.

### Lag 1 — Brand tokens (fast, flipper aldri)

Paper-paletten blir stående i `@theme`-blokken med originale verdier:

```
--color-unohana      #F5F5F3   (primær BG i light)
--color-shiro        #FFFFFF   (surface i light)
--color-kuro         #1A1A1A   (primær tekst i light, BG i dark)
--color-sumi         #2A2A2A   (dark surface hero)
--color-sumi-deep    #242424   (ny — dark-mode card surface)
--color-sumi-raised  #333333   (ny — dark-mode hover/divider)
--color-haiiro       #6B6B65   (muted i light)
--color-haiiro-light #9A9A95   (ny — muted i dark)
--color-sakai        #E0E0DC   (divider i light)
--color-aka          #FF3333   (accent / CTA)
--color-aka-dark     #CC2929   (accent hover)
--color-muted-label  #888880   (subtile labels)
--color-label-dim    #555550   (label på always-dark surface)
--color-utility-bar-bg #EEEDE9 (legacy — erstattet av surface-muted)
```

Disse brukes kun når fargen er **brand-essens**:

- `bg-aka` / `text-aka` — alltid rød accent, uansett mode.
- Editorial-kolonnen i MegaMenu (`bg-kuro`, `bg-sumi`, `text-shiro`,
  `text-label-dim`, `text-muted-label`) — alltid mørk sidebar, matcher
  Paper FE-0.
- Overlay bak MobileDrawer (`bg-kuro/50`) — mørk tint over siden.
- Logo-sirkel (hardkodet `#ea5532`).
- Kurv-badge-tall (`text-shiro` på `bg-aka` — hvit på rød er brand-fast).

### Lag 2 — Semantiske tokens (rolle-baserte, flipper)

Disse er **runtime CSS-vars** på `:root`, og eksponeres via `@theme inline`
som Tailwind-utilities. Verdien flipper automatisk basert på
`prefers-color-scheme` og/eller `data-theme`.

| Token                 | Light                 | Dark                    | Rolle                                    |
| --------------------- | --------------------- | ----------------------- | ---------------------------------------- |
| `canvas`              | `unohana` (#F5F5F3)   | `kuro` (#1A1A1A)        | App-bakgrunn (body)                      |
| `surface`             | `shiro` (#FFFFFF)     | `sumi-deep` (#242424)   | Kort, paneler, header-baggrunn           |
| `surface-muted`       | `#EEEDE9`             | `sumi` (#2A2A2A)        | Subdued panel (utility-bar, search-box)  |
| `surface-hover`       | `unohana` (#F5F5F3)   | `sumi-raised` (#333333) | Hover på `surface`                       |
| `surface-contrast`    | `kuro` (#1A1A1A)      | `shiro` (#FFFFFF)       | Invertert CTA-pill (Kurv-knapp, Utsolgt) |
| `surface-contrast-hover` | `sumi` (#2A2A2A)   | `unohana` (#F5F5F3)     | Hover på contrast                        |
| `ink`                 | `kuro` (#1A1A1A)      | `shiro` (#FFFFFF)       | Primær tekst                             |
| `ink-muted`           | `haiiro` (#6B6B65)    | `haiiro-light` (#9A9A95)| Sekundær tekst, line-through             |
| `ink-subtle`          | `muted-label` (#888880)| `haiiro` (#6B6B65)     | Labels, tertiær tekst                    |
| `ink-inverse`         | `shiro` (#FFFFFF)     | `kuro` (#1A1A1A)        | Tekst på `surface-contrast`              |
| `divider`             | `sakai` (#E0E0DC)     | `sumi-raised` (#333333) | Border / divider                         |

Det gir Tailwind-utilities: `bg-canvas`, `bg-surface`, `bg-surface-muted`,
`bg-surface-hover`, `bg-surface-contrast`, `bg-surface-contrast-hover`,
`text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-ink-inverse`,
`border-divider`.

`body` bruker `var(--canvas)` og `var(--ink)` direkte så rot-bakgrunnen
flipper før klient-script kjører.

## Hvordan komponenter velger lag

**Default: semantic.** Alt UI bruker semantic tokens — det er 90% av tilfellene.

```tsx
// Før:
<div className="bg-shiro border border-sakai text-kuro">
// Etter:
<div className="bg-surface border border-divider text-ink">
```

**Brand-fixed: kun når komponenten skal være identisk i begge moduser.**

- Editorial-kolonnen i MegaMenu (alltid mørk — designmotiv).
- MobileDrawer overlay (alltid mørk tint — konvensjonell UX).
- Aka-CTA (alltid rød).
- Rabatt-badge `bg-aka text-shiro` (alltid hvit på rød).

Hvis en komponent blander — f.eks. Kurv-pill som skal være **invertert** mot
surface (mørk i light, lys i dark) — bruk `surface-contrast` + `ink-inverse`.

## Konsekvenser

**Positivt:**
- Ny komponent = null ekstra arbeid for dark mode. Bruk semantic tokens, ferdig.
- Refactor er lokal: bytt klassenavn, ingen komponent-logikk endres.
- Paper-referanser er fortsatt intakte via brand-token-kommentarer (FE-0,
  CT-0, 47B-0).
- ESLint `no-arbitrary-tailwind` fanger regress siden alle semantic tokens er
  navngitte.

**Negativt:**
- Dobbel listning av farger i `globals.css` (brand + semantic). Nødvendig ondt
  — alternativet er at design-referansene til Paper forsvinner.
- Designers som leser Paper må mentalt mappe "Paper-token → semantic-token".
  Mitigert av tabellen over + docstrings på hver komponent.
- `surface-contrast` inverterer: en svart pill blir hvit i dark mode. Ikke
  alle "dark pill on light" mønstre skal invertere. For eksempel er
  editorial-hero `bg-sumi` (alltid mørk), ikke `bg-surface-contrast`.

## Åpne punkter (TBD)

- **Overlay-alpha:** `bg-kuro/50` blir `rgba(26,26,26,0.5)` også i dark mode —
  litt utydelig over en mørk side. Vurder `bg-canvas/70` eller eget
  `--overlay` token hvis brukere rapporterer dårlig kontrast.
- **Prose-stiler:** `dangerouslySetInnerHTML` med `prose`-klasser arver ikke
  automatisk `ink`-farger. Vi legger en `@plugin "@tailwindcss/typography"`
  eller custom prose-CSS når vi har HTML-rik produktbeskrivelse i dark mode.
- **Søke-input:** placeholder-tekst er `text-ink-muted` — fungerer i begge
  moduser, men kan være for lav kontrast mot `surface-muted` i dark. Re-sjekk
  når faktisk søkefelt implementeres.

## Referanser

- `app/globals.css` — token-definisjoner + `@theme inline`-wiring.
- `docs/design-system.md` — "Tema og semantiske tokens"-seksjonen.
- `docs/conventions.md` — UI-konvensjon: "default semantic, brand kun når
  identisk i begge moduser".
- `components/layout/ThemeToggle.tsx` — `data-theme`-styring og
  localStorage-persistering (`skn-theme`).
- Paper: FE-0 (editorial, always-dark), 47B-0 (product card), CT-0 (mega-menu).
