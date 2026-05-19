# ADR-0011 — Cart-state (Zustand + localStorage, ingen server-cart i MVP)

**Dato:** 2026-04-24
**Status:** Vedtatt
**Besluttet av:** Alexander + Claude

## Kontekst

Skarpekniver.no trenger en handlekurv som fungerer før brukeren er logget
inn (de fleste kjøp starter anonymt), som persisterer på tvers av side-
navigasjoner og reloads, som kan leses av både klient-komponenter (PDP
"Legg i kurv", header-badge, cart-siden) og server-komponenter (cart-sidens
summary før hydration, checkout-validering mot Woo), og som aldri skal
blokkere UI-render.

ADR-0004 låste at ordre opprettes i Woo først ved faktisk betaling — det er
`/api/checkout/create-order` som pusher ordren inn via Woo REST. Før det
punktet har frontend hele ansvaret for kurv-state. Woo vet ingenting, og
Supabase-speilet brukes bare for katalog-oppslag, ikke kurv.

Vi trenger også analytics-integrasjon (`add_to_cart`, `remove_from_cart`,
`view_cart`, `begin_checkout`) og Algolia Insights (`addedToCartObjectIDs`)
på hver mutation. Disse må fyre konsistent uansett hvor endringen kommer fra
— PDP, SearchOverlay, cart-siden, CartRecommendations — uten at hver
komponent må huske å kalle dem.

## Vurderte alternativer

1. **React Context + `useReducer`.** Null ekstra dependency. Men: ingen
   innebygd persistering, Provider må wrappe `app/layout.tsx` som tvinger
   hele treet til å være klient, og re-render-kaskader på hver mutation.
   Dessuten: server-komponenter kan ikke lese Context — vi måtte proppe
   sesjon-cookien med en parallell kopi for SSR.

2. **Server-cart i Supabase (egen `cart_sessions`-tabell).** Godt for
   cross-device continuity (anonym kurv følger sesjons-cookie). Men: hver
   mutation blir en round-trip, vi må orkesterere RLS + anon-sesjons-token,
   og vi duplikerer noe Woo senere kommer til å eie ved checkout. For mye
   infrastruktur for MVP.

3. **Server-cart i Woo direkte (Cart API).** Woo har en `wc/store/v1/cart`-
   endepunkt som tar cart-tokens. Innebygd, men: `/store/v1` krever Woo
   Blocks installert + Cart-tokens lagret i cookies, og vi har eksplisitt
   sagt i ADR-0004 at Woo ikke skal treffes på request-tid utenom katalog-
   webhooks og checkout-pushen. Dette bryter den grensen.

4. **Zustand + `persist`-middleware mot localStorage.** ~1 kB gzip, null
   Provider, trivielt å hydrere, innebygd versioning for breaking-changes.
   Kan importeres fra alle klient-komponenter uten wrapping. State er per-
   enhet (ikke cross-device), men det er helt greit for MVP — anonyme
   handlekurver følger tradisjonelt enheten uansett.

## Beslutning

**Valgt: alternativ 4 — Zustand + `persist`-middleware mot localStorage.**
Server-cart er eksplisitt ut av MVP og vil bli revurdert hvis vi ser behov
for cross-device continuity eller abandoned-cart-e-post med server-token.

Arkitekturen er tre-delt:

```
components/*  ─┐
               ├──► lib/cart/api.ts ──► lib/cart/store.ts (Zustand)
components/*  ─┘        │
                        ├──► lib/analytics (track() event)
                        └──► lib/search/insights.ts (Algolia Insights)
```

**`lib/cart/store.ts`** er "dum" state: `items`, `couponCodes`,
`hydrated`-flagg, og enkle mutations (addItem, removeItem, setQuantity,
clear). Ingen side-effekter, trivielt å snapshot-teste.

**`lib/cart/api.ts`** er fasaden komponentene bruker: `addToCart()`,
`removeFromCart()`, `setQuantity()`, `clearCart()`. Hver funksjon muterer
storen *og* fyrer analytics + Insights med samme kontrakt uansett hvilken
komponent som kalte den.

**`lib/cart/totals.ts`** er pure — `computeCartTotals()` regner
`subtotal`, `subtotalExVat`, `vat`, `savings`, `total` fra items-array-en.
Kan brukes både i klient (Zustand selector) og server (checkout-route,
ordre-bekreftelse).

**`lib/cart/hooks.ts`** wrapper Zustand-selectors så komponenter aldri
trenger å vite at vi bruker Zustand: `useCartItems`, `useCartCount`,
`useCartTotals`, `useCartHydrated`, `useCartItemQuantity`.

**Recommendations (`lib/search/recommendations.ts`)** er separat fra cart-
laget fordi det er Algolia-territorium. Cart-siden konsumerer den via en
`CartRecommendations`-komponent som tar seed fra første cart-item.

## Konsekvenser

**Positive:**

- Null Provider i layout-treet → cart-state er tilgjengelig i hver klient-
  komponent uten koblingsoverhead.
- Bundle-tap er minimal (~1 kB gz for Zustand, ~4 kB gz for `search-insights`,
  ~9 kB gz for `@algolia/recommend`).
- Analytics og Insights fyrer konsistent fordi de er wrapper-ansvar, ikke
  komponentansvar.
- Totals er pure og gjenbrukbare server-side — samme kode for display og
  bekreftelses-e-post.
- `persist`-middleware gir oss versjonsnøkkel (`STORAGE_VERSION`) og
  `onRehydrateStorage`-callback som vi bruker til å marker `hydrated`-
  flagget. Komponenter som kan flashe (Header-badge, sticky checkout-bar)
  sjekker flagget og viser skeleton før det blir `true`.

**Negative / risiko:**

- Cross-device handlekurv finnes ikke. Hvis bruker begynner på mobil og
  går til desktop, starter de på null. Akseptabelt for MVP — en fremtidig
  "server-cart v2" kan skrive localStorage-kurven til Supabase keyet på
  anonym sesjons-cookie.
- localStorage har ~5 MB kvote per origin. Kurv-items er små (<500 B
  hver), så selv 200 varer er langt fra kvoten — ikke en praktisk grense.
- Hvis bruker tømmer browser-storage midt i flyten, forsvinner kurven.
  Samme problem som enhver anonym kurv — dokumenter i FAQ.
- Pris-drift: hvis et produkt går på salg mellom "legg i kurv" og
  checkout, beholder vi opprinnelig `unitPrice` i localStorage. Woo
  re-validerer ved checkout og overstyrer — kurven kan derfor vise en
  pris som ikke matcher checkout i sjeldne edge-cases. Vi lar Woo vinne
  og viser en endring-banner i checkout (ikke bygget enda).

## Valuta/MVA-konvensjon

Alle priser i Woo/Supabase er lagret **inkl. MVA** (norsk retail-standard).
Paper-designet viser "Delsum (eks. MVA)" — `computeCartTotals()` bryter den
ut via `subtotal / (1 + VAT_RATE)` og rapporterer differansen som `vat`.
Konstanten `VAT_RATE = 0.25` bor i `types/cart.ts`. Ved multi-market-utvidelse
flyttes den til `lib/tax/rates.ts` keyed på region.

## Uløste spørsmål / oppfølging

- **Abandoned cart e-post:** Krever enten server-cart eller at vi flusher
  localStorage-innholdet til en anonym server-sesjons-record ved hver
  mutation. Ikke bygget — åpen til vi har trafikk som gjør det verdt det.
- **Multi-device sync etter login:** Etter Woo-login kan vi fusjonere
  localStorage-kurven med en eventuell lagret Woo-kurv. Løst når login-
  flyten bygges (ikke bygget i MVP).
- **Coupon-applikasjon:** `setCouponCodes()` eksisterer men validerer ikke
  mot Woo. Server-action for dette kommer i checkout-arbeidet.
