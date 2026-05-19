# 0005 — Kun Norge ved lansering (nb-NO, NOK)

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander

## Kontekst

Skarpekniver selger primært i Norge. Spørsmålet er: skal butikken være multi-språk/multi-valuta fra dag én, eller fokusere på ett marked og gjøre det perfekt?

## Beslutning

Butikken lanseres kun for det norske markedet:

- Språk: bokmål (`nb-NO`), ingen nynorsk- eller engelsk-variant.
- Valuta: kun NOK, priser vises inkl. MVA.
- Leveranse: kun til norske adresser.
- Kundesupport: kun norsk.

Multi-country / multi-currency / multi-språk kan vurderes senere, men krever egen ADR og sannsynligvis arkitektur-endring (f.eks. subdomener, hreflang-strategi, prisberegning i checkout).

## Konsekvenser

### Positive

- Unngår hreflang-kompleksitet og SEO-fallgruver ved multi-locale ved lansering.
- Enkelere checkout (fast MVA 25 %, faste fraktregler).
- Enkelere katalog (ingen oversatt copy å vedlikeholde).
- Fokus på det markedet som faktisk driver omsetning.

### Negative / trade-offs

- Internasjonale kunder avvises ved checkout (eller blokkeres av frakt-regler).
- Må bygges om hvis vi vil ekspandere — men bedre å fokusere nå enn å ha halvferdig multi-språk-støtte.
- SEO-bytte til multi-market senere krever URL-strategi fra dag én (se `seo.md` for hvordan vi unngår å male oss inn i hjørnet).

### Hvordan revidere

Vi revurderer hvis:

- Klar etterspørsel og tydelig forretnings-case for Sverige/Danmark/EU.
- Skarpekniver får B2B-kunder utenfor Norge.
- Strategisk beslutning om internasjonal vekst.

Da skriver vi ny ADR med valg av URL-strategi (subdir vs subdomain vs separate domener), oversettelses-pipeline og pris-/MVA-håndtering.
