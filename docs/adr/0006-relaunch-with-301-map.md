# 0006 — Relansering av skarpekniver.no med 301-kart

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander + Claude

## Kontekst

Den eksisterende skarpekniver.no er en WooCommerce-butikk med opparbeidet SEO-autoritet (lenker, rankings, indekserte URL-er). Vi skal erstatte denne med ny Next.js-frontend.

Risikoen ved enhver relansering er SEO-tap: hvis URL-strukturen endres og vi ikke setter opp 301-redirects, mister vi rankings og lenke-equity.

## Beslutning

Vi gjennomfører en kontrollert relansering:

1. **URL-struktur** på ny butikk matcher eksisterende så tett som mulig. Der den må endres, lages 301 permanent redirect fra gammel til ny URL.
2. **Full sitemap** av eksisterende butikk hentes før cut-over. Lagres som kilde for 301-kartet.
3. **301-kart** lever som JSON/CSV i `config/redirects.json`, deployes via `next.config.ts`-redirects eller Vercel-level redirects.
4. **Pre-launch QA:** kjør en scraper som sjekker at hver gammel URL returnerer 301 til forventet ny URL, med riktig produkt/kategori-match.
5. **Post-launch overvåking:** Search Console + Vercel Analytics i 90 dager for å fange 404-spikes eller ranking-tap.

Se `seo.md` > "Migrering" for konkret prosess.

## Konsekvenser

### Positive

- Bevarer SEO-autoritet fra eksisterende butikk.
- Eksisterende eksterne lenker (til produkter, guider, kategorier) fortsetter å fungere.
- Brukere med bokmerker / delings-lenker lander på riktig innhold.
- Dokumentert prosess gjør det mulig å debugge tap hvis noe glipper.

### Negative / trade-offs

- Ekstra arbeid før launch (kartlegging og QA).
- Redirect-tabellen må vedlikeholdes — hvis produkter slås sammen eller avvikles må kartet oppdateres.
- Noen mismatch er uunngåelig (gamle bloggposter, tag-arkiver) — må håndteres case-by-case.
- Kan ikke bare "flippe DNS" — krever koordinert launch-dag.

### Hvordan revidere

Dette er en engangs-migrering — ADR markeres som "historisk" etter vellykket launch + 90 dagers overvåking. Hvis vi gjør større URL-endringer i fremtiden, skriv ny ADR.
