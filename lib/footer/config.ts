/**
 * Footer-konfig — typed lenkestruktur for `<Footer />`.
 *
 * Hvorfor egen config-fil i stedet for hardkoding i komponenten:
 *   - Footer-lenker er forretningsdata, ikke layout. Når katalogen vokser
 *     (nye kategorier) eller legal-sider flyttes, skal vi kunne redigere her
 *     uten å røre komponenten.
 *   - Samme mønster som primary-nav (`site_config.nav`) — gjør det trivielt
 *     å senere flytte dette til Supabase (`site_config.footer`) og fetcher-
 *     laget, hvis vi vil at kundesupport kan redigere uten deploy.
 *   - TypeScript-strenget sikrer at alle kolonner har riktig form: label
 *     (string) + href (string | null | undefined for TODO-rader).
 *
 * Mapping mot skarpekniver.com:
 *   Lenker bruker live-URLs der de finnes (scraped 2026-04-24 fra
 *   https://skarpekniver.com). Manglende sider er merket med `href: '#'`
 *   og en TODO-kommentar — ikke slettet, fordi Paper-designet (2AJ-0)
 *   dikterer 5 kolonner og vi vil holde layouten stabil.
 *
 * Bemerk: alle URL-er er absolutte paths mot egen domene. Når butikken lanseres
 * på /kniver etc. (ikke /knivtyper som live), må disse oppdateres — evt. via
 * en alias-tabell i `lib/urls.ts`. For nå bruker vi live-paths 1:1.
 */

export interface FooterLink {
  label: string;
  /** Absolutt path (begynner med `/`). `#` = TODO — ikke publisert ennå. */
  href: string;
  /** Bare for TODO-lenker — rendres som `data-todo` i dev for synlighet. */
  todo?: string;
}

export interface FooterColumn {
  /** Kolonne-overskrift (uppercase label, Paper 2AX-0/2B4-0/2B9-0/2BF-0/2BL-0). */
  heading: string;
  links: FooterLink[];
}

export interface FooterSocial {
  label: string;
  href: string;
  /** Lucide-icon-navn eller inline-SVG-id. */
  icon: 'instagram' | 'facebook' | 'x';
  todo?: string;
}

/**
 * De 5 kolonnene fra Paper 2AJ-0 — rekkefølgen er signifikant (venstre → høyre).
 * Ikke re-arranger uten å justere Paper først.
 */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Kniver',
    links: [
      { label: 'Kokkekniver', href: '/knivtyper/kokkekniv' },
      { label: 'Santoku', href: '/knivtyper/santoku' },
      { label: 'Nakiri', href: '/knivtyper/nakiri' },
      // Live kaller dette "Universalkniv/Petty" — vi viser den Paper-labelen.
      { label: 'Petty', href: '/knivtyper/universalkniv' },
      // Ingen 1:1 kategori live. Filetkniv er nærmeste for sashimi-bruk.
      {
        label: 'Sashimi & sushi',
        href: '#',
        todo: 'Opprett /knivtyper/sashimi eller pek til /knivtyper/filetkniv',
      },
    ],
  },
  {
    heading: 'Bryner og sliping',
    links: [
      { label: 'Vannstein', href: '/bryner-og-knivsliping/slipestein' },
      { label: 'Pussestål', href: '/bryner-og-knivsliping/knivsliper/slipestal' },
      { label: 'Slipetjeneste', href: '/knivsliping-i-posten' },
    ],
  },
  {
    heading: 'Kjøkken',
    links: [
      // Ingen dedikert støpejern-kategori live. Stekepanner-og-gryter er
      // supersett. TODO: lag /kjokkenutstyr/stopejern hvis kategorien bygges ut.
      {
        label: 'Støpejern',
        href: '#',
        todo: 'Opprett /kjokkenutstyr/stopejern (pek til stekepanner-og-gryter inntil videre)',
      },
      { label: 'Japansk grill', href: '/japansk-grill' },
      { label: 'Serveringsutstyr', href: '/servering' },
      // Live kaller dette "Skjærefjøl".
      { label: 'Skjærebrett', href: '/kjokkenutstyr/skjaerefjol' },
    ],
  },
  {
    heading: 'Om oss',
    links: [
      {
        label: 'Vår historie',
        href: '#',
        todo: 'Skriv /om-oss eller /vaar-historie',
      },
      {
        label: 'Produsentene',
        href: '/knivmerker/lokale-smeder', // nærmeste live-ekvivalent
      },
      { label: 'Blogg', href: '/kniv-info' },
      {
        label: 'Presse',
        href: '#',
        todo: 'Skriv /presse (finnes ikke live)',
      },
    ],
  },
  {
    heading: 'Kundeservice',
    links: [
      // Ny dedikert kontakt-side (Paper 9WU-1). Erstatter live /mathallen
      // (som var en fysisk-butikk-side) — /kontakt-oss dekker både kanaler
      // og butikk-info i én, så vi samler trafikken der.
      { label: 'Kontakt oss', href: '/kontakt-oss' },
      { label: 'Frakt og levering', href: '/frakt' },
      // Live har ingen egen retur-side — /betingelser dekker det.
      { label: 'Retur og bytte', href: '/betingelser' },
      {
        label: 'FAQ',
        href: '#',
        todo: 'Skriv /faq eller pek til /kniv-info (blogg)',
      },
    ],
  },
];

/**
 * Bunn-rad legal-lenker. Paper 2BQ-0 → 2BT-0/2BU-0/2BV-0.
 *
 * Alle tre peker til samme konsoliderte side (`/vilkar-og-personvern`) med
 * anker-fragment til rett seksjon. Dette speiler den faktiske IA-en: vi har
 * én juridisk side med seks seksjoner (ikke tre separate sider). Anker-ID-ene
 * matcher `LEGAL_SECTIONS[].id` i `lib/legal/sections.ts`.
 */
export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { label: 'Personvern', href: '/vilkar-og-personvern#personvern' },
  { label: 'Vilkår', href: '/vilkar-og-personvern#kjopsbetingelser' },
  { label: 'Informasjonskapsler', href: '/vilkar-og-personvern#cookies' },
];

/**
 * Sosiale medier. URL-ene finnes ikke i Paper eller på live-footeren vi
 * scrapet — må bekreftes av Alexander før publisering.
 */
export const FOOTER_SOCIALS: FooterSocial[] = [
  {
    label: 'Instagram',
    icon: 'instagram',
    href: '#',
    todo: 'Legg inn Instagram-URL',
  },
  {
    label: 'X (Twitter)',
    icon: 'x',
    href: '#',
    todo: 'Legg inn X/Twitter-URL — vurder om vi faktisk bruker X',
  },
  {
    label: 'Facebook',
    icon: 'facebook',
    href: '#',
    todo: 'Legg inn Facebook-URL',
  },
];

/**
 * Bedriftsinfo — vist som tagline og copyright. Hentet fra live-footer
 * 2026-04-24. MVA-nummer er offentlig (Brønnøysund) og greit å vise.
 */
export const FOOTER_COMPANY = {
  /** Formell foretaksnavn fra Paper 2BR-0. */
  legalName: 'Handelsgutane AS',
  /** MVA fra live-footer — valgfri å vise, men god praksis per nb-NO e-handelslov. */
  vatNumber: '917 765 146',
  /** Tagline fra Paper 2AN-0. */
  tagline:
    'Høykvalitets treningsutstyr for hjemmegym og funksjonell trening — kettlebells, vektvester, hoppetau og mer.',
} as const;
