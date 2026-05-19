# Forside — spec for Skarpekniver.no

Dette er funksjonell + visuell spesifikasjon for forsiden, utgangspunkt for Paper-designet. Den skal balansere tre formål samtidig:

1. **Konvertering.** Få ny besøkende videre til en kategori, et produkt eller en bestselger innen 1–2 scrolls.
2. **Brand-storytelling.** Forklare hvorfor japanske kjøkkenkniver — og hvorfor kjøpe dem hos *oss* spesifikt. Skarpekniver er ikke en generell webshop; det er en spesialist.
3. **Trygghet og autoritet.** Vise at vi vet hva vi snakker om (smedrelasjoner, opplæring, sliping), og at det er trygt å handle (frakt, retur, betaling).

Brand-tonen er editorial japansk-butikk: Unohana-bakgrunn, generøs hvitspace, rolig typografi (Satoshi + Noto Serif JP), Aka-rød som aksent. Forsiden skal kjennes mer som en magazine-førsteside enn som en typisk e-commerce-hjemmeside.

---

## Section-by-section

### 1. Utility-bar (eksisterer, ingen endring)

Tre USPs over headeren: "Gratis frakt over 1 500 kr · Knivsliping i Oslo og per post · Rask levering 1–3 virkedager". Hjelper på tvers av sider — beholdes i bunn.

### 2. Hero — full-bleed editorial

**Visuelt:** Ett enkelt bilde, full-bleed, fyller minst 70 vh på desktop / 60 vh på mobil. Bildet er produktfoto i kontekst — ikke pakkshot. F.eks. en kniv på et skjærebrett med løk halvveis i snittet, eller en hånd som holder en kniv mot et bryne.

**Innhold:**
- Eyebrow (label, uppercase, hvit på mørk bakgrunn): "高 KOKKEKNIV" eller "新作 NYE KNIVER"
- H1 i Noto Serif JP, hvit, stor og rolig: maks ~7 ord
  - F.eks. "Smidd i Sakai. Slipt for ditt kjøkken."
- Underline-tekst (Satoshi, body-md, hvit/70%): én setning som fortsetter løftet
  - F.eks. "Japanske kjøkkenkniver fra håndplukkede smeder — levert til døra med fagkunnskap."
- To CTAs (vertical-stack på mobil, horizontal på desktop):
  - Primær (Aka-fylt): "Se kollektivet"
  - Sekundær (outline-hvit): "Slik velger du kniv"

**Variants:** På mobil er teksten venstrejustert, ikke sentrert (lettere å lese, mer editorial). Bilde fra venstre 1/3 til full-bleed med gradient-mørke nederst for tekstlesbarhet.

**Hvorfor:** En forsidehero som *ikke* prøver å sjonglere fem produkter kommuniserer kvalitet. Det Apple gjør, det Aesop gjør, det Le Creuset gjør. Setter brand-toleransen for resten av siden.

### 3. Knivtyper — visual grid (Paper 47B-0-stil)

**Tittel:** "Finn riktig kniv" (h2 Satoshi bold, evt. liten kanji-eyebrow "包丁")

**Innhold:** 4–6 kategori-kort i grid (4-kol desktop, 2-kol mobil). Hvert kort har:
- 1:1 produktfoto med subtil zoom-in på hover
- Norsk navn over kanji-undertittel: "Gyoto · 牛刀"
- Kort beskrivelse (1 linje): "Universalkniven. Lengde 21–24cm."
- Hover: "Se kniver →" fader inn

**Kategorier:** Gyoto, Santoku, Petty, Nakiri, Sujihiki, Kiritsuke. Velg de seks viktigste. Resten linker man til via "Alle knivtyper →" under.

**Hvorfor:** Forteller besøkende at vi er spesialister på *japanske* kniver, ikke en bred kniv-butikk. Kategoriseringen viser bredde uten å overvelde.

### 4. Drop-strip — "Nytt inn" eller "Ukens drop"

**Visuelt:** Horizontal-scroll-stripe (mobil) / 5-kol grid (desktop) med små produktkort. Bruker samme `ProductGrid`-komponent som på kategori-siden.

**Innhold:** 5–8 ferskeste produkter. Kort har bilde, brand-label (uppercase), navn, pris.

**Header:**
- "NYHETER" (eyebrow)
- "Ukens drop" (h2)
- "Se alle nyheter →" (lenke høyre)

**Hvorfor:** For repeat-besøkende — de som allerede vet at Skarpekniver finnes — er "hva er nytt" hovedgrunnen til å besøke forsiden. Lavere barriere enn en hero-CTA.

### 5. Brand spotlight — editorial story

**Visuelt:** To-kolonne-blokk, full-bleed bakgrunn (sort eller mørk-rød — `--color-kuro`), 50/50 split. Venstre: stort portrettfoto av smed (eller smedeverkstedet). Høyre: prosa.

**Innhold:**
- Eyebrow (Aka): "MØT SMEDEN"
- H2 i Noto Serif JP: "Yoshimi Kato — Takefu Knife Village"
- 2–3 paragrafer: "Yoshimi har smidd kniver siden 1994 i en av Japans mest respekterte smedebydeler. Hver klinge han lager går gjennom 17 separate steg — fra varmebehandling av Aogami #2-stål til håndhamring og kurouchi-finish."
- 3 stat-kort: "1979 Grunnlagt", "30+ Smeder", "700+ Års tradisjon"
- CTA (outline hvit): "Se alle kniver fra Yoshimi →"

**Roterer.** Enten cron-roteres månedlig fra de 4–6 viktigste leverandørene (Yoshimi Kato, Yoshihide Masuda, Tojiro, Naniwa, Yaxell, Shiun) — eller markedsplukk-styres fra `brands.featured_until`-kolonne.

**Hvorfor:** Dette er der Skarpekniver vinner mot Amazon/Cervera/Tilbords. Ingen andre forteller storyen bak knivene. Det rettferdiggjør prisen.

### 6. Slipeutstyr-panel — "Skarpe kniver krever vedlikehold"

**Visuelt:** Lysere blokk (Unohana-canvas), rolig editorial. To produktkort + en CTA-blokk i midten, eller én stor produkt-feature.

**Innhold:**
- Eyebrow: "VEDLIKEHOLD"
- H2: "Hold knivene skarpe"
- Tekst: "En sløv japansk kniv er en farlig kniv. Vi anbefaler bryning hver 2.–3. uke for hjemmebruk."
- 2 produktkort: én slipestein (f.eks. Naniwa Dbl Bryne #1.000/3.000), ett slipesett
- CTA: "Hele slipe-utvalget →"

**Hvorfor:** Krysser over til den andre store produktkategorien (slipeutstyr). Utdanner kunden om at en god kniv krever vedlikehold — samtidig som vi selger vedlikeholds-produktet. To fluer.

### 7. Quiz / hjelp-blokk — "Usikker på hvilken kniv du trenger?"

**Visuelt:** Stor sentrert blokk, kanji 包丁 som watermark-grafikk i bakgrunnen, lett skygge. CTA-knapp i Aka.

**Innhold:**
- Tittel (h2 Noto Serif JP): "Hvilken kniv passer ditt kjøkken?"
- Underline: "Svar på 5 spørsmål — vi anbefaler den rette."
- CTA Aka-fylt: "Start quizen →"

**Hvorfor:** Dette er gull for SEO (lang-form interaksjons-side med interne lenker), gull for retention (folk husker quizer), og fjerner kjøps-friksjon for nybegynnere som ikke vet om de trenger Gyoto eller Santoku.

(Quizen er en separat side — `/finn-kniv` — som bygges senere. Forsiden trenger bare CTA'en.)

### 8. Anmeldelser / sosial bevis

**Visuelt:** Tre 5-stjerners anmeldelser i kort, gull-stjerner (`--color-kin`), kursiv prosa, produktnavn under.

**Innhold per kort:**
- ★★★★★ (gull-stjerner)
- "Kjøpte Yaxell Ran Gyoto for to år siden. Holder fortsatt skarp som ny — etter 100+ middager. Beste kjøkkenkniven jeg har eid." (kursiv)
- "Anders M. · Kjøpte Yaxell Ran Gyoto"
- Subtil "Verifisert kjøp"-badge

**Header:**
- "VÅRE KUNDER" (eyebrow)
- H2: "Det skarpeste valget"

**Datakilde:** Tre håndplukkede anmeldelser fra Woo (de beste, ikke automatisk-roterende). Også vis aggregert score: "4.8 / 5 fra 1 247 anmeldelser" som sub-tekst.

**Hvorfor:** Sosial bevis er den mest effektive konverterings-bryteren. Folk stoler på folk de gjenkjenner ("Anders M.") mer enn på influencere — særlig på kjøkken-utstyr.

### 9. Blogg-teaser

**Visuelt:** 3-kort grid, samme stil som blogg-oversikten. Header viser bare "Knivkunnskap" + "Se alle artikler →".

**Innhold:** 3 nyeste blogg-artikler. Hvert kort har: hero-bilde, kategori-badge, tittel, dato + lesetid.

**Hvorfor:** Forsiden viser at vi er en kunnskaps-destinasjon, ikke bare en butikk. Driver bruker til blogg → bygger sesjons-tid (SEO) + retention.

### 10. Nyhetsbrev — bred, editorial

**Visuelt:** Full-bleed Aka-rød eller mørk Kuro-bakgrunn (Paper-design avgjør), generøs padding, ingen distraksjon. Sentrert.

**Innhold:**
- Eyebrow (hvit): "NYHETSBREV"
- H2 (Noto Serif JP, hvit): "Få nye drops og guider"
- Body: "Vi sender ett brev i måneden — aldri spam. Nyheter fra smedene, sliping-tips, og tidlig tilgang til nye drops."
- E-post-input + CTA-knapp ("Meld meg på")
- Privacy-link i liten skrift: "Vi deler aldri din e-post. Personvern →"

**Hvorfor:** Newsletter er det mest verdifulle verktøyet for en spesialist-butikk. Ny besøkende konverterer ikke første besøk — men kan fanges som abonnent.

### 11. Trygghets-rad rett før footer

**Visuelt:** 4 ikoner i en rad, små, monokrome. Like Paper EQM-1 men på forsiden.

**Innhold:** "Gratis frakt over 1 500 kr" · "30 dagers åpent kjøp" · "Knivsliping i Oslo og per post" · "Vipps · Klarna · Stripe"

**Hvorfor:** Siste-sjanse trygghets-signal før brukeren bouncer eller scroller til footer. Beroliger lurerne.

### 12. Footer (eksisterer, ingen endring)

---

## Funksjonelle krav (oppsummert)

**Datakilder:**
- Hero — markedsplukket. Manuelt felt i admin (eller Sanity/Strapi-CMS senere). Tre felt: bilde, headline, CTA-link.
- Knivtyper — kuratert i kode (med kategori-mapping). Stabilt nok at det ikke trenger CMS.
- Drop-strip — Supabase: `select * from products where status='published' order by created_at desc limit 8`.
- Brand spotlight — `brands.featured_at desc limit 1` (krever ny boolean-kolonne) eller manuell pick i admin.
- Slipeutstyr-panel — kategori-id hardkodet (kategori "bryner-og-knivsliping" id 289), velg 2 bestselgere derfra.
- Anmeldelser — håndplukket (3 verbose `<blockquote>`-felter i admin) eller automatisk fra Woo "best reviews"-endpoint.
- Blogg-teaser — 3 nyeste artikler (når blogg-systemet er på plass).

**SEO/strukturert data:**
- `<title>` + `<meta description>` — manuelt eller fra Yoast hvis vi mirrorer
- `Organization`-schema (én gang per site, kan være i layout, men forsiden er primær)
- `WebSite` med `potentialAction: SearchAction` (gir Google sitelinks-search-box)
- `BreadcrumbList` ikke nødvendig på root-side
- `ItemList` på drop-strip og featured-kategorier
- Open Graph + Twitter cards (hero-bilde brukes som og:image)

**Performance:**
- Hero-bilde må være LCP-element. Preload + priority + WebP/AVIF format.
- Drop-strip og featured-grid kan lazy-load.
- Brand spotlight-bildet: lazy.
- Newsletter-input: ikke client-component med mindre nødvendig — bruk form action.

**Tilgjengelighet:**
- Hero har skip-link mulighet, og overskrifter må være semantisk h1 → h2 → h3 i riktig rekkefølge.
- Alt-tekster på alle bilder (særlig brand spotlight og hero — beskrivende, ikke "image of knife").
- Alle CTAs er buttons eller links med tydelig label.
- Color-contrast 4.5:1 minimum for body, 3:1 for store overskrifter.

**Mobil-tilpasning:**
- Hero stack vertikalt: bilde øverst (60vh), tekst under
- Knivtyper grid 2-kol
- Drop-strip horisontal scroll med snap (en kolonne synlig + 1/4 av neste — peeking)
- Brand spotlight stacker: bilde øverst, tekst under
- Slipeutstyr stacker
- Quiz-CTA full-bredde
- Anmeldelser carousel (1 kort synlig + 1/4 peek)
- Blogg-teaser 1-kol
- Nyhetsbrev: input + knapp stacked

**Animasjon (Paper kan vise statisk, men spec):**
- Hero: fade-in på initial load, ingen movement
- Knivtyper: kort fader inn ved scroll-into-view (subtilt, ikke parallax-greier)
- Brand spotlight: bilde har subtil ken burns-zoom hvis vi gidder
- Quiz-CTA: knappen har Aka-pulse-aksent ved hover
- Generelt: rolig, aldri "look at me"-animasjoner. Vi er en seriøs butikk.

---

## Hva som *ikke* skal med (og hvorfor)

- **Karusell hero med 5 slides.** Pollution. CTR per slide stuper etter slide 1. En statisk hero som forteller én ting godt vinner alltid.
- **Pop-up "tilbud!"** Kjeder bryter brand-tonen. Hvis vi vil push tilbud, gjør det subtilt i drop-strip eller en eyebrow på hero.
- **Live chat-widget i nedre hjørne.** Distraksjon på en editorial side. Kan vurderes på produktside, ikke forsiden.
- **Lange feature-lister.** Forsiden er ikke "om-oss"-siden. La produktsiden gjøre tunge løft på spec.
- **Trustpilot-widget med live-anmeldelser.** Bruk verbose, kuraterte sitater. Trustpilot-widget'en ser teknisk og skitten ut — den passer ikke estetikken.

---

## Innholdsmengde — hva trengs før lansering

1. **1 hero-bilde** + headline + 1 setning underline + 2 CTAs
2. **6 kategori-bilder** (1:1, samme estetikk — produkt på et skjærebrett, ikke pakkshot)
3. **1 brand-spotlight-bilde** (portrett av smed eller verksted, kvadratisk eller liggende 4:3)
4. **3 håndplukkede anmeldelser** (45–80 ord hver) + kunde-fornavn + initial
5. **3 blogg-artikler** (når blogg-systemet er klart)
6. **1 quiz** (`/finn-kniv` — 5 spørsmål, leverer kategorier som svar)

---

## Neste steg

1. Du tegner forsiden i Paper basert på spec'en.
2. Vi gjennomgår sammen, juster det Paper avdekker (kanji som watermark virker eller ikke, hero-tekst-lengde, etc.).
3. Jeg implementerer i Next.js — ny rute `app/page.tsx` (erstatter den nåværende root-siden).
4. Først statiske komponenter med dummy-data, så kobles datakildene inn etterhvert.
