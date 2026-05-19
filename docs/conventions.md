# Konvensjoner

Navngiving, kodestil, commit-meldinger og branch-strategi. Hvis en regel ikke står her, er den ikke en regel.

## Språk

- **Kode, kommentarer, commit-meldinger, variabelnavn, filnavn:** engelsk.
- **Bruker-vendt tekst, produktbeskrivelser, e-post, UI-copy:** norsk (bokmål). Se `brandbook.md`.
- **Dokumentasjon (denne mappen):** norsk. Unntak: kode-eksempler og engelske tekniske termer som `cache`, `cron`, `webhook` — skrives som normalt engelske ord uten kursiv.

## Navngiving

### Filer og mapper

- **Komponenter**: `PascalCase.tsx` — `ProductCard.tsx`, `CheckoutForm.tsx`.
- **Helpers / utilities**: `kebab-case.ts` — `format-price.ts`, `build-slug.ts`.
- **Next.js App Router**: `kebab-case` for segmenter — `/kokkekniver`, `/min-side`. URL er norsk. Tekniske segmenter (API, groups) kan være engelsk — `/api/checkout/create-order`, `(auth)/login/page.tsx`.
- **Typer**: `PascalCase.ts` eller samlet i `types/product.ts`. Type-navn `PascalCase`, f.eks. `Product`, `CartItem`, `OrderStatus`.
- **Database-kolonner**: `snake_case` (Postgres-konvensjon, matcher Woo).
- **Env-variabler**: `SCREAMING_SNAKE_CASE`, prefix `NEXT_PUBLIC_` for klient-eksponerte.

### Variabler og funksjoner

- **Variabler og funksjoner**: `camelCase` — `orderTotal`, `formatNok()`.
- **Konstanter som er "ekte" konstanter** (env-driven, unreassignable config): `SCREAMING_SNAKE_CASE` — `MAX_CART_ITEMS`, `DEFAULT_LOCALE`.
- **React hooks**: prefix `use` — `useCart()`, `useCheckout()`.
- **Bool-variabler**: prefix `is`, `has`, `should` — `isInStock`, `hasVariants`, `shouldRevalidate`.

### Tabeller og kolonner i Supabase

- **Tabeller**: entall eller flertall? **Flertall** — `products`, `categories`, `cron_job_runs`. Konsistent med internal-web og Woo.
- **Primærnøkkel**: `id` (bigint for speilede entiteter fra Woo, bigserial for våre egne).
- **Foreign keys**: `{tabell_entall}_id` — `product_id`, `category_id`.
- **Tidsstempler**: `created_at`, `updated_at`, `synced_at` — alltid `timestamptz`, default `now()`.

## TypeScript

### Generelle regler

- `strict: true` i `tsconfig.json` — ingen `any`, ingen implisitte returverdier.
- Ingen `@ts-ignore` eller `@ts-expect-error` uten inline-kommentar som forklarer hvorfor.
- Foretrekk `type` over `interface` unntatt når du vil ha declaration merging (sjelden).
- `readonly` på arrays og objekter som ikke skal muteres.
- Ingen `enum` — bruk `const { ... } as const` og `type X = typeof X[keyof typeof X]` for type-safety uten runtime-overhead.

### Import-rekkefølge

1. Node / React core (`import React from 'react'`).
2. Tredjeparts (`import { z } from 'zod'`).
3. Interne moduler med path alias (`import { supabase } from '@/lib/supabase/server'`).
4. Relative imports (`import { Price } from './price'`).
5. Typer (`import type { Product } from '@/types/product'`) — kan blandes eller være siste, konsistent.

Ikke blandet — grupper med tom linje.

### Path aliases

Konfigurert i `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

Bruk `@/lib/...`, `@/components/...`, aldri `../../../lib/...`.

## React / Next.js

### Server vs Client components

- **Default: server component.** Du får ikke bruke `useState`, `useEffect`, event handlers.
- **`"use client"` kun når nødvendig** — interaktivitet, browser-APIer, context.
- Hold client components lokale: `AddToCartButton` er client, ikke hele `ProductCard`.

### Data fetching

- **Server component**: direkte `fetch()` eller Supabase-client.
- **Client component**: bruk server action eller API-route, ikke direkte database-kall.
- **Ingen Woo REST-kall på server component for katalog-data** — alt går gjennom Supabase. (Se `CLAUDE.md` > gotchas.)

### Next.js 16-spesifikt

- `params` og `searchParams` er `Promise` — `const { slug } = await params;`.
- Caching er opt-in. Bruk eksplisitt `fetch(url, { next: { revalidate: 60, tags: ['product'] } })`.
- Slå opp i `node_modules/next/dist/docs/` før du bruker nye API-er — se `AGENTS.md`.

### Error boundaries

- Hver segment i App Router kan ha `error.tsx` og `not-found.tsx`.
- Kritiske flyt (checkout, betaling) har egen error boundary som rapporterer til Sentry (TBD) og viser brukervennlig feilmelding.

## CSS / Tailwind

Se `design-system.md` for tokens og visuelle prinsipper. Denne seksjonen dekker hvordan man skriver UI-kode i repo-et.

### Grunnprinsipper

- Kun Tailwind utility-klasser. Ingen custom CSS, ingen `<style>`-tags, ingen CSS-moduler, ingen `styled-components`.
- Mobile-first, ikke desktop-first.
- Ingen inline-styles (`style={{ ... }}`).
- Ikke bland `className`-ordre — `prettier-plugin-tailwindcss` holder sortering konsistent.

### UI-konvensjoner — ikke-forhandlingsbare

Disse reglene er speilet fra `CLAUDE.md` med eksempler. Brudd er en bug, ikke en stil-preferanse.

**1. Kun design-tokens.** Alle dimensjoner, farger, typografi og effekter kommer fra `@theme`-blokken i `app/globals.css`. Hvis en verdi mangler — legg den til som token først, commit, så bruk den. Aldri hardkod.

| ❌ ikke skriv | ✅ skriv |
|---|---|
| `text-[14px]` | `text-body-sm` (eller nærmeste token) |
| `bg-[#EEEDE9]` | `bg-utility-bar` (legg til token hvis den mangler) |
| `h-18` (virker ikke) | `h-header` (definert som `--height-header: 72px`) |
| `py-2.75` (virker ikke) | `py-3` eller legg til spacing-token |
| `w-[390px]` | `w-drawer` (`--width-drawer: 390px`) |
| `text-[#6B6B65]` | `text-haiiro` |
| `rounded-[2px]` | `rounded-sm` (matcher `--radius-sm: 2px`) |

Enkleste test: `rg "\[#|text-\[|h-\[|w-\[|p[xy]?-\[" components/ app/ --glob '*.tsx'` skal returnere null treff i produksjonskode. Eneste godkjente unntak: dynamiske verdier basert på props (f.eks. `style={{ width: progress + '%' }}` i en progress bar — og selv da heller en CSS-variabel enn arbitrary Tailwind).

**2. Tilpass ikke kjente Tailwind-utility-klasser som ikke finnes.** `h-13`, `h-15`, `h-18`, `py-2.75`, `gap-2.5` (finnes), `gap-2.75` (finnes ikke) — hvis du er usikker, slå opp i Tailwind docs eller definer tokenet eksplisitt.

**3. Typografi er låst.** Kun Satoshi (sans) og Noto Serif JP (serif, dekorativt). Ikke legg til `font-mono` for kode-blokker utenfor `docs/`-renderen. Ikke hent Inter, Roboto, system-sans eller andre "neutrale" fallbacks. Hvis en komponent må bruke serif, bruk `font-serif`-klassen (som peker til Noto Serif JP).

**4. Farge-paletten er låst.** Brand-tokens: Unohana, Shiro, Aka, Aka-dark, Kuro, Haiiro, Sakai, Sumi, Sumi-deep, Sumi-raised, Haiiro-light, Muted-label, Label-dim. Ingen ekstra farger uten at det blir en ADR eller et skjerm-review med Alexander.

**4a. Default-bruk er semantisk, ikke brand (ADR-0008).** Komponenter velger fra semantic token-utilities som flipper med light/dark mode: `bg-canvas`, `bg-surface`, `bg-surface-muted`, `bg-surface-hover`, `bg-surface-contrast` (invertert CTA), `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-ink-inverse`, `border-divider`. Bruk brand-tokens (`bg-kuro`, `text-shiro`, osv.) **kun** når utseendet skal være identisk i begge moduser — typisk editorial-kolonnen i MegaMenu, aka-CTAer, drawer-overlay, logo-sirkelen. Regel for usikkerhet: hvis du må spørre "hva skjer her i dark mode?", velg semantic.

| ❌ ikke skriv  | ✅ skriv          | Hvorfor                                        |
|----------------|-------------------|------------------------------------------------|
| `bg-shiro`     | `bg-surface`      | Kort-bakgrunn skal flippe i dark mode          |
| `text-kuro`    | `text-ink`        | Primær tekst skal flippe                        |
| `text-haiiro`  | `text-ink-muted`  | Muted tekst skal flippe                         |
| `text-muted-label` | `text-ink-subtle` | Label-tekst skal flippe                     |
| `border-sakai` | `border-divider`  | Divider-linje skal flippe                       |
| `bg-kuro text-shiro` (CTA-pill) | `bg-surface-contrast text-ink-inverse` | CTA skal invertere mellom moduser |

Brand-unntak som består: `bg-aka` + `text-shiro` (brand-red badges/CTAs), `bg-kuro/50` (drawer overlay — alltid mørk tint), hele editorial-kolonnen i MegaMenu (`bg-kuro`, `bg-sumi`, `text-shiro`, `text-label-dim`, `text-muted-label` — alltid mørk sidebar per Paper FE-0).

**5. Komponent-førstholdning.** Hvis en className-kombinasjon gjentar seg 2+ ganger, ekstraher til en komponent. Ikke lag en CSS-klasse. Ikke lag en mixin. Komponent eller `clsx`-helper.

**6. Plan før kode.** For UI-oppgaver med 2+ komponenter: skriv først en kort plan som dekker (a) komponent-struktur og fil-navn, (b) data-flow og prop-kontrakter, (c) state-eierskap (server vs client), (d) responsive-strategi per breakpoint, (e) hvilke tokens som mangler og må legges til. Få planen godkjent før kode skrives. Dette er ikke bureaukrati — det er forskjellen på AI-template og et designet produkt.

**7. Tilgjengelighet er en del av akseptansekriteriene.**

- Alle interaktive elementer har synlig label eller `aria-label` (for ikon-only-knapper).
- Tastatur-sti fungerer uten mus: Tab, Enter, Space, Escape, Arrow keys der relevant.
- `:focus-visible` har synlig outline — aldri `outline-none` uten en erstatnings-style.
- Kontrast-ratio: ≥4.5:1 for body text, ≥3:1 for store tekster (≥18px bold eller ≥24px regular).
- `aria-hidden` på dekorative SVGer, `role="dialog"` + `aria-modal="true"` på modaler/drawers.

**8. Responsive-tilnærming.** Mobil først, bruk `md:`-prefikset for ≥768px. Unngå `lg:`/`xl:`/`2xl:` med mindre det faktisk trengs (designet kollapser ofte til to breakpoints: mobile vs desktop). Test alltid på ≤390px (iPhone SE), ~768px (iPad portrait), og 1440px (desktop).

### ESLint-håndheving (TBD)

Vi vil legge til en custom ESLint-regel som flagger:
- Arbitrary Tailwind values (`bg-[#...]`, `text-[Npx]`, `h-[Npx]`, `w-[Npx]`, `p[xy]?-[Npx]`).
- Imports av andre fonter enn de låste.
- Bruk av hex-koder utenfor `globals.css`.

Frem til regelen finnes, sjekk manuelt før commit.

## Git

### Branch-navn

- `feat/kort-beskrivelse` — nytt feature.
- `fix/kort-beskrivelse` — bugfix.
- `chore/kort-beskrivelse` — refactor, deps, infra uten feature-impact.
- `docs/kort-beskrivelse` — kun docs-endringer.
- `adr/NNNN-tittel` — ny ADR.

Kebab-case, engelsk, kort.

### Commit-meldinger

Konvensjonell commit-format:

```
<type>(<scope>): <emne>

<body (optional)>

<footer (optional)>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `style`, `ci`.

Eksempler:

- `feat(checkout): add Vipps hurtig-checkout button`
- `fix(product): correct price formatting for sale items`
- `docs(architecture): clarify Supabase sync flow`
- `chore(deps): bump next to 16.2.5`
- `refactor(lib/woo): extract retry logic to shared helper`

### PR-prosess

1. Branch fra `main`.
2. Commit ofte, ikke squash før review.
3. Push og åpne PR mot `main`.
4. CI må være grønn (ESLint, TypeScript, Lighthouse CI, type-gen check).
5. Claude eller annen reviewer leser diff + verifiserer docs er oppdatert.
6. **Squash merge** til `main` med konvensjonell melding som PR-tittel.

### PR-beskrivelse (template)

```md
## Hva
Kort beskrivelse av endringen.

## Hvorfor
Business rationale / link til issue.

## Docs oppdatert
- [ ] Ja, endret docs er listet under
- [ ] N/A, endring påvirker ingen dokumentert konvensjon

## Test
Hvordan verifiserte du endringen? Screenshots hvis UI.
```

## Formatering

- **Prettier** for alle `.ts`, `.tsx`, `.js`, `.jsx`, `.md`, `.json`, `.yml`.
- **ESLint** med `eslint-config-next` + custom regler i `eslint.config.mjs`.
- Kjør `npm run lint` og `npm run format` før commit. Pre-commit-hook via Husky (TBD).

Prettier-konfigurasjon (rot av repo, `.prettierrc.json`):

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

## Feilhåndtering

- **Server-side**: kast typede feil (`class WooError extends Error`), fang i route-handler, returner strukturert JSON + korrekt HTTP-status.
- **Client-side**: toasts eller inline-feilmeldinger. Aldri blank skjerm uten fallback.
- **Logging**: `console.error` for lokale fell, `lib/logger.ts` for struktureret logging til Vercel Logs + evt. Sentry.
- **Aldri svelge feil** — hver `catch` skal enten handle feilen eller kaste videre.

## Sikkerhet

### Secrets og env-variabler

- **Ingen secrets i klient-bundle.** Variabler uten `NEXT_PUBLIC_`-prefix er server-only.
- **`NEXT_PUBLIC_`-prefix inlines på build-tid** — alt med den prefixen havner i browser-bundlen. Reverse: hvis du aldri har prefixet en variabel, er den trygg. Hvis du er i tvil — dropp prefixet.
- **Env-validering**: all env går gjennom `lib/env.ts` (Zod). Ikke les `process.env.X` direkte i app-kode.
- **`serverEnv` er server-only** — `lib/env.ts` kaster runtime-feil hvis den importeres fra klienten.

### Supabase service-role-nøkkelen

Denne nøkkelen bypasser RLS. Lekkasje = hele katalogen kan slettes av en anonym bruker.

- Brukes kun via `createServiceRoleClient()` i `lib/supabase/server.ts`.
- `lib/supabase/server.ts` har `import 'server-only'` som compile-time tripwire — hvis en klient-komponent importerer den (direkte eller transitivt), feiler bygget.
- Skal aldri returneres i response-body, header, cookie, URL-param eller log-output.
- Skal aldri prefixes med `NEXT_PUBLIC_`.
- Ved mistanke om lekkasje: roter i Supabase-dashboardet (Settings → API → Reset service_role key) og oppdater `.env.local` + Vercel-env før noe annet.

### Input og webhooks

- **Alle API-routes validerer input** med Zod før bruk. Ingen `as any`-kast rundt `req.body`.
- **HMAC-verifisering på alle webhooks** (Woo, Vipps, Stripe) før noen side-effekt. Bruk `timingSafeEqual` for signatursammenligning — ikke `===` (timing-attack).
- **CSRF**: Next.js er server-action-safe by default, men egne `/api`-endpoints må sjekke `Origin` eller bruke anti-CSRF token.
- **Rate limiting** på auth- og checkout-endpoints via Upstash Redis (`@upstash/ratelimit`).

### Logging

- Aldri logg `Authorization`-headere, JWT-er, service-role-nøkkelen, kundepassord, kortnumre, eller full cookie-string.
- `lib/logger.ts` sin `serializeError()` maskerer ikke automatisk — vær eksplisitt på hva som går inn.

## Testing

> ⚠️ WIP — test-stack avklares i Fase 3. Forventet:
> - `vitest` for unit tests
> - `playwright` for E2E
> - `@testing-library/react` for komponent-tester

## Avhengigheter

### Policy

- **Ingen blinde oppgraderinger.** Major-versjon-bumps krever egen PR og regresjons-test.
- **Minimer antall deps.** Hvis en utility kan skrives på 10 linjer, gjør det i stedet for å installere `lodash.foo`.
- **Sjekk bundle size** før store deps. `npm run build` viser ruter-størrelser.

### Pakke-manager

npm (låst via `package-lock.json`). Ikke yarn, ikke pnpm (konsistens med internal-web).

## Linting-regler som alltid står

- `no-unused-vars`: error.
- `no-console`: warning (tillatt i dev, blokkert av `no-console` i prod-bygg).
- `no-explicit-any`: error.
- `react-hooks/exhaustive-deps`: error.
- Import-order: håndheves via `eslint-plugin-import`.

## Usikker? Spør.

Hvis en konvensjon mangler, **legg den til her** i samme PR som introduserer behovet. Ikke sett en stille presedens — dokumenter eksplisitt.
