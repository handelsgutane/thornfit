# 0004 — Custom checkout mot Vipps/Stripe (ikke Woo-checkout)

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander + Claude

## Kontekst

Kunden må betale ved utsjekk. To hovedalternativer:

1. **Redirect til Woo's innebygde checkout** — kunde forlater vårt domene eller vises i iframe.
   - Fordel: ingen integrasjon, alt virker out-of-the-box.
   - Ulempe: stygg UX, dårlig branding, mister kontroll over konvertering, Lighthouse-score på checkout er ikke vårt å påvirke.
2. **Custom checkout i Next.js med direkte integrasjon mot Vipps og Stripe (valgt).**
   - Fordel: full kontroll på UX, steg-for-steg optimalisering, raskere flyt, konsistent branding.
   - Ulempe: mer kode å vedlikeholde, må håndtere webhooks, PCI-scoping må tenkes på.

## Beslutning

Vi bygger en custom checkout i Next.js. Kunden fyller ut leveringsadresse + fraktvalg + betalingsmetode i vår UI. Ved "Betal":

1. Server oppretter pending ordre i Woo via REST.
2. Server initierer betaling i Vipps eller Stripe, får payment URL / session ID.
3. Klient redirecter til Vipps eller Stripe for selve betalingen (PCI-scope forblir hos provider).
4. Provider sender webhook til vårt endpoint ved suksess/feil.
5. Vi oppdaterer Woo-ordre til `processing` og sender bekreftelse.

Vi bruker **aldri** Woo-checkout-URLer i produksjon.

## Konsekvenser

### Positive

- Fullt kontrollert konverteringsflyt — kan A/B-teste, optimalisere, branding.
- PCI-scope begrenset til Vipps/Stripe (vi ser aldri kortnummer).
- Bedre mobile UX enn stock Woo.
- Kan tilby Vipps hurtig-checkout (lokal preferanse i Norge).

### Negative / trade-offs

- Betalings-webhooks er kritisk infrastruktur — må overvåkes.
- Kuponger, frakt-beregning, moms må kobles riktig mellom vår UI og Woo.
- Refunds må håndteres i Woo admin + Stripe/Vipps — ikke automatisk.
- Hver ny betalingsmetode er vår jobb å integrere.

### Hvordan revidere

Vi revurderer hvis:

- Konverteringsraten på custom checkout er dårligere enn Woo-checkout etter realistisk testing.
- Vedlikeholdsbyrden på payment-webhooks blir for stor.
- En ny Woo-plugin (f.eks. Woo Blocks Checkout) gir samme UX-nivå uten custom kode.
