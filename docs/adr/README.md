# Architecture Decision Records (ADR)

En ADR dokumenterer en beslutning som er **dyr eller umulig å reversere senere**. Når du tar en slik beslutning, skriver du en kort fil her med kontekst, beslutning, konsekvenser.

## Når skal jeg skrive en ADR?

Skriv en ADR når beslutningen:

- Endrer databasestruktur på tvers av mange tabeller
- Legger til eller fjerner en tredjepartsintegrasjon
- Endrer URL-struktur eller SEO-strategi
- Endrer hvordan bruker-data håndteres
- Velger mellom to eller flere rimelige stacker / biblioteker / mønstre der alle har reelle trade-offs

Skriv **ikke** en ADR for:

- Navn på en variabel
- Valg mellom to implementasjoner som gjør samme ting (bare velg en)
- Ting som er ren trivia

Tommelfingerregel: **Hvis noen om 12 måneder kommer til å spørre "hvorfor gjorde vi det sånn?" — skriv en ADR.**

## Format

Hver ADR er én markdown-fil med navn `NNNN-kort-tittel.md` der `NNNN` er neste nummer i sekvens (4 sifre, padded).

Strukturen:

```md
# NNNN — Tittel

**Status:** foreslått | godtatt | avvist | erstattet av NNNN
**Dato:** YYYY-MM-DD
**Besluttet av:** Alexander (+ evt. andre)

## Kontekst

Hva er bakgrunnen? Hvilket problem prøver vi å løse? Hvilke alternativer vurderte vi?

## Beslutning

Hva ble valgt? I klartekst.

## Konsekvenser

### Positive

- ...

### Negative / trade-offs

- ...

### Hvordan revidere

Hva skal til for at vi vurderer denne beslutningen på nytt?
```

## Indeks

| Nr | Tittel | Status |
|---|---|---|
| 0001 | [Shadow-database pattern](./0001-shadow-database-pattern.md) | Godtatt |
| 0002 | [Isolasjon fra internal-web](./0002-isolate-from-internal-web.md) | Godtatt |
| 0003 | [Kundekontoer i WooCommerce](./0003-customer-accounts-in-woo.md) | Godtatt |
| 0004 | [Custom checkout mot Vipps/Stripe](./0004-custom-checkout.md) | Godtatt |
| 0005 | [Kun Norge ved lansering](./0005-market-norway-only.md) | Godtatt |
| 0006 | [Relansering med 301-kart](./0006-relaunch-with-301-map.md) | Godtatt |
| 0007 | [Produkt-URLer på rot](./0007-flat-product-urls.md) | Godtatt |
| 0008 | [Light/dark tema-tokens (to-lags)](./0008-light-dark-theme-tokens.md) | Godtatt |
| 0009 | [Algolia som søke-backend](./0009-algolia-search.md) | Godtatt |
| 0010 | [Analytics event layer (intern vokabular + adaptere)](./0010-analytics-event-layer.md) | Godtatt |
| 0011 | [Cart-state (Zustand + localStorage)](./0011-cart-state.md) | Godtatt |
