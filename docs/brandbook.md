# Brandbook

Språk, tone og copy-prinsipper for Skarpekniver.no.

> ⚠️ WIP — dette er Claudes tentative rammeverk basert på hvordan Skarpekniver fremstår i dag (spesialistbutikk, kvalitetsfokusert, norsk). Alexander må bekrefte og korrigere. Endringer i tone-of-voice og nøkkelord oppdateres her.

## Merkeidentitet (TBD — bekreftes)

Skarpekniver er en norsk spesialistbutikk for kokkekniver, slipeutstyr og kniv-tilbehør. Målgruppen er både profesjonelle kokker og hjemmekokker som tar matlaging seriøst.

Tre ord som beskriver merket (hypotese):

1. **Fagkunnskap** — vi vet hva vi selger, og kan forklare forskjellene.
2. **Kvalitet** — vi selger kniver og utstyr som varer.
3. **Tilgjengelighet** — vi hjelper hjemmekokken like mye som kokken.

## Tone of voice

### Hovedtone

- **Varm, men faglig.** Som en god kokkevenn som forklarer uten å være belærende.
- **Konkret, ikke svulstig.** "Dette bladet er herdet til HRC 62" — ikke "ytelse i verdensklasse".
- **Respekterer kundens tid.** Lange løfter uten data er støy.

### Hva vi unngår

- Salgs-hype: "Best i verden", "revolusjonerende", "game-changer".
- Engelsk-kalker: "top-notch", "next level", "unboxing experience". Bruk norske uttrykk.
- Unødvendige utropstegn!!! Og caps lock.
- Vage løfter: "fantastisk kvalitet" uten å si hva det betyr.
- Paternalistisk tone ("som nybegynner burde du...").

### Eksempler

**Ikke** "Denne fantastiske kniven vil revolusjonere matlagingen din! 🔥"

**Heller** "Global G-2 er en allrounder med lett, balansert grep. Passer hvis du lager mat ofte og ikke vil bytte mellom flere kniver."

**Ikke** "Få BESTE TILBUD på alle våre kniver!!!"

**Heller** "30 % på utvalgte japanske kniver ut oktober."

## Språkregler (norsk)

### Bokmål, moderate former

- "boken" (ikke "boka" utenom dialog-aktige sammenhenger).
- "dere"-form når vi snakker til flere, "du"-form ellers.
- Ikke nynorsk, ikke engelsk — én språkvariant konsistent.

### Tall og enheter

- Desimal-**komma**: `1 290,00 kr`, ikke `1,290.00`.
- Tusen-skilletegn: hardt mellomrom `1 290 kr` eller ingen skille for < 10 000 (`990 kr`).
- NOK/kr: vi bruker `kr` i UI, `NOK` kun i tekniske sammenhenger.
- Dato: `15. oktober 2026` i tekst, `2026-10-15` i tekniske visninger.
- Dimensjoner: `20 cm`, `1,2 kg`, `HRC 62` (ISO med mellomrom mellom tall og enhet).

### Store / små bokstaver

- Produktnavn med modell skrives som merket: `Global G-2`, `Wüsthof Classic`.
- Merkenavn: `WooCommerce` (ikke `Woocommerce`), `Tripletex` (ikke `TripleTex`).
- Overskrifter: "Kun første bokstav stor" — ikke Title Case.
  - Ikke: "Våre Mest Populære Kokkekniver"
  - Heller: "Våre mest populære kokkekniver"
- Unntak: egennavn og starten av setning.

### Tegn

- Apostrof: bruk `’` (typografisk) i UI-tekst, `'` (ASCII) i kode.
- Tankestrek: `—` for parenteser, `–` for intervall (`kl. 9–17`).
- Anførselstegn: `«norsk»` i UI, `"engelsk"` i kode.

## Navngiving og terminologi

### Forretningstermer (alltid samme uttrykk)

| Konsept | Alltid skriv | Aldri skriv |
|---|---|---|
| Handlekurv | "handlekurv" | "kurv", "cart", "bag" |
| Utsjekk-side | "kasse" | "checkout", "utsjekk" |
| Konto | "konto" eller "min side" | "account", "profil" |
| Ønskeliste | "ønskeliste" | "favoritter", "wishlist" |
| Produkt | "produkt" | "vare" (unntak: faglig kontekst) |
| Ordre | "ordre" | "bestilling" |
| MVA | "MVA" | "moms", "VAT" |
| Frakt | "frakt" | "levering", "porto", "shipping" |
| Kampanjepris | "kampanjepris" | "tilbud", "rabatt" |

### Statustekster

- "På lager"
- "Få igjen ({n})" — n = antall
- "Utsolgt"
- "Leveres på forespørsel"
- "Forhåndsbestill" (hvis relevant)

### Call-to-action-knapper

| Kontekst | Tekst |
|---|---|
| Legge i kurv | "Legg i handlekurv" |
| Kjøp nå (hurtig) | "Kjøp nå" |
| Gå til kassen | "Til kassen" |
| Bekreft kjøp | "Fullfør kjøp" |
| Fortsett shopping | "Fortsett å handle" |
| Registrer konto | "Opprett konto" |
| Logg inn | "Logg inn" |
| Legg til i ønskeliste | "Lagre i ønskeliste" |

Vær konsistent. Ikke "Legg i kurven" ett sted og "Legg til i kurv" et annet.

## Produktbeskrivelser

### Struktur (mal)

1. **Én innledning** (1-2 setninger): hva er dette og hvem er det for.
2. **Stikkord-liste** med konkrete spek — ikke markedsspråk.
3. **Anbefalt bruk**: kjøtt, grønnsaker, allroundt, spesial.
4. **Vedlikehold**: hvordan ta vare på kniven.
5. **Leveringsinfo** (autogenerert): vekt, dimensjoner, opprinnelse.

### Tone i produktbeskrivelser

- Skriv som om kunden spurte "Bør jeg kjøpe denne?"
- Si når den passer, og når den ikke passer.
- Ikke prøv å selge alle produkter til alle — henvis til andre produkter når relevant.

### Eksempel

> Global G-2 er en klassisk japansk allrounder på 20 cm. Lett, balansert, og enkel å vedlikeholde.
>
> - Rustfritt stål, herdet til HRC 56-58
> - Hul håndtak med sanddekor for godt grep
> - Blad på 20 cm — god til de fleste oppgaver
>
> Passer deg som vil ha én kniv for det meste. Hvis du skjærer mye rått kjøtt, vurder G-55 med mer blad-lengde.
>
> Vask for hånd. Slip jevnlig med et japansk vannstein (vi anbefaler [Naniwa Chosera 800]).

## Feilmeldinger

### Prinsipper

- **Si hva som skjedde**, ikke "noe gikk galt".
- **Si hva kunden kan gjøre**, ikke bare at det er en feil.
- **Ingen teknisk jargong** i bruker-vendte meldinger.
- **Ikke skyld på kunden** — "Skriv inn gyldig e-post" er bedre enn "Du skrev inn feil e-post".

### Eksempler

| Situasjon | Dårlig | Bra |
|---|---|---|
| Nettverk feilet | "Error 500" | "Vi klarte ikke å lagre akkurat nå. Prøv igjen om et øyeblikk." |
| Ugyldig e-post | "Invalid email format" | "Skriv inn en gyldig e-postadresse, f.eks. navn@eksempel.no" |
| Ingen lager | "Out of stock" | "Dessverre utsolgt. Vil du ha beskjed når den er inne igjen?" |
| Betaling feilet | "Payment failed" | "Betalingen gikk ikke gjennom. Prøv en annen betalingsmetode eller sjekk kortet ditt." |

## E-post-maler

> ⚠️ WIP — maler for ordrebekreftelse, utsending, abandoned cart osv. skrives i Fase 4.

Prinsipper:

- Samme tone som UI.
- Brukerens fornavn hvis mulig.
- Tydelig CTA (én per e-post).
- Alle transaksjonelle e-poster har klar avsender (`post@skarpekniver.no`) og mulighet til å svare.

## Søkeord / SEO-fraser (TBD)

Alexander / SEO-ansvarlig må definere prioriterte søkeord per kategori. Forslag til utgangspunkt:

- "kokkekniv"
- "japanske kniver"
- "slipe kniv"
- "vannstein"
- "Global knivsett"

Søkeord-strategi utdypes i `seo.md` og egen keyword-matrise (TBD).

## Tilgjengelighet i språk

- Ikke bruk "klikk her" — beskrivende linktekst er bedre SEO og tilgjengelighet.
- Overskrifter er hierarkiske (`h1` → `h2` → `h3`), ikke skrevet bare for visuell effekt.
- Alt-tekst på bilder er beskrivende, ikke "bilde av kniv".

## Endringshåndtering

Når en copy-konvensjon endres:

1. Oppdater denne filen.
2. Søk i kodebasen etter gammelt uttrykk (f.eks. `rg "kurv"` hvis vi bytter "kurv" til "handlekurv").
3. Oppdater også e-post-maler, eventuelle Woo-produktbeskrivelser hvis de bruker det gamle begrepet.
4. Notér i PR hvilken konvensjon som er endret.
